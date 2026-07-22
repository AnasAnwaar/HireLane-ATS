-- =============================================================================
-- 0004 · Audit log — append-only
-- =============================================================================
-- Spec §9.3 guardrail 2 and §UC-6 R1: "The timeline is append-only. Nothing in
-- it can be edited or deleted." This is one of the four non-configurable
-- guardrails, so it is enforced in the database rather than the application.
-- =============================================================================

create table public.audit_log (
  id              bigint generated always as identity primary key,
  organization_id uuid        not null references public.organizations(id) on delete cascade,

  -- Actor is denormalised as well as referenced: the membership may later be
  -- deleted, but the audit record must stay readable for its full 7-year life.
  actor_membership_id uuid    references public.memberships(id) on delete set null,
  actor_email         citext,
  actor_name          text,

  action      text not null,          -- e.g. 'role.permission_changed'
  entity_type text not null,          -- e.g. 'role'
  entity_id   text,
  summary     text not null default '',

  -- Before/after snapshots power the permission-change diff and the
  -- "rollback to a previous snapshot" requirement (spec §UC-0 A5).
  before_state jsonb,
  after_state  jsonb,

  ip_address inet,
  user_agent text,

  created_at timestamptz not null default now()
);

create index audit_log_org_created_idx  on public.audit_log (organization_id, created_at desc);
create index audit_log_entity_idx       on public.audit_log (organization_id, entity_type, entity_id);
create index audit_log_actor_idx        on public.audit_log (actor_membership_id);
create index audit_log_action_idx       on public.audit_log (organization_id, action);

-- -----------------------------------------------------------------------------
-- Immutability. Two layers, because either alone is insufficient:
--   1. Revoked privileges stop ordinary roles.
--   2. The trigger stops everyone else, including the service role and any
--      future migration that forgets. Only a superuser could bypass it.
-- -----------------------------------------------------------------------------
create or replace function public.reject_audit_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'audit_log is append-only: % is not permitted on this table.', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger audit_log_no_update
  before update on public.audit_log
  for each row execute function public.reject_audit_mutation();

create trigger audit_log_no_delete
  before delete on public.audit_log
  for each row execute function public.reject_audit_mutation();

revoke update, delete, truncate on public.audit_log from authenticated, anon, service_role;

-- -----------------------------------------------------------------------------
-- Convenience writer. SECURITY DEFINER so callers need no direct table grant,
-- but the organisation is always taken from the session — never from the
-- caller — so a client cannot forge an entry against another tenant.
-- -----------------------------------------------------------------------------
create or replace function public.write_audit(
  p_action       text,
  p_entity_type  text,
  p_entity_id    text default null,
  p_summary      text default '',
  p_before       jsonb default null,
  p_after        jsonb default null
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org       uuid := public.current_org_id();
  v_member    uuid := public.current_membership_id();
  v_email     citext;
  v_name      text;
  v_id        bigint;
begin
  if v_org is null then
    raise exception 'write_audit called without an active organisation context.';
  end if;

  select p.email, p.full_name into v_email, v_name
  from public.profiles p
  where p.id = auth.uid();

  insert into public.audit_log (
    organization_id, actor_membership_id, actor_email, actor_name,
    action, entity_type, entity_id, summary, before_state, after_state
  )
  values (
    v_org, v_member, v_email, v_name,
    p_action, p_entity_type, p_entity_id, p_summary, p_before, p_after
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Automatic audit of permission changes. Spec §UC-0 R4: "Every permission
-- change records who changed what, from what to what, and when."
-- -----------------------------------------------------------------------------
create or replace function public.audit_role_permission_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org    uuid;
  v_role   text;
  v_email  citext;
  v_name   text;
begin
  select r.organization_id, r.name into v_org, v_role
  from public.roles r
  where r.id = coalesce(new.role_id, old.role_id);

  -- The role may already be gone on cascade delete; nothing to attribute then.
  if v_org is null then
    return coalesce(new, old);
  end if;

  -- Left as null for system/seed writes that run without a session.
  select p.email, p.full_name into v_email, v_name
  from public.profiles p
  where p.id = auth.uid();

  insert into public.audit_log (
    organization_id, actor_membership_id, actor_email, actor_name,
    action, entity_type, entity_id, summary, before_state, after_state
  )
  values (
    v_org,
    public.current_membership_id(),
    v_email,
    v_name,
    'role.permission_' || lower(tg_op),
    'role',
    coalesce(new.role_id, old.role_id)::text,
    format('%s on role "%s"', coalesce(new.permission_key, old.permission_key), v_role),
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );

  return coalesce(new, old);
end;
$$;

create trigger role_permissions_audit
  after insert or update or delete on public.role_permissions
  for each row execute function public.audit_role_permission_change();
