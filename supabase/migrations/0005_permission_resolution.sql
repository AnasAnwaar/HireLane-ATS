-- =============================================================================
-- 0005 · Permission resolution
-- =============================================================================
-- Spec §UC-0 "Per-User Overrides":
--   effective permission = role permission
--                          → per-user override
--                          → scope restriction (most restrictive wins)
--
-- The Owner short-circuits everything (spec §UC-0 R2).
--
-- These functions are the single source of truth. RLS policies call them, and
-- the application calls them through the same path — so the UI cannot drift
-- from what the database actually enforces.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- has_permission — does the caller hold this capability in the active org?
-- -----------------------------------------------------------------------------
create or replace function public.has_permission(p_key text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_org      uuid := public.current_org_id();
  v_override boolean;
  v_role     boolean;
begin
  if v_org is null then
    return false;
  end if;

  -- Owner holds everything, always, and cannot be locked out.
  if public.is_org_owner() then
    return true;
  end if;

  -- Per-user override wins over the role, unless it has expired.
  select o.allowed into v_override
  from public.user_permission_overrides o
  join public.memberships m on m.id = o.membership_id
  where m.user_id = auth.uid()
    and m.organization_id = v_org
    and m.status = 'active'
    and o.permission_key = p_key
    and (o.expires_at is null or o.expires_at > now())
  limit 1;

  if v_override is not null then
    return v_override;
  end if;

  select rp.allowed into v_role
  from public.memberships m
  join public.role_permissions rp on rp.role_id = m.role_id
  where m.user_id = auth.uid()
    and m.organization_id = v_org
    and m.status = 'active'
    and rp.permission_key = p_key
  limit 1;

  return coalesce(v_role, false);
end;
$$;

comment on function public.has_permission is
  'Effective permission check: owner → per-user override → role grant. Returns false when unauthenticated.';

-- -----------------------------------------------------------------------------
-- permission_scope_of — how wide is the grant?
-- Returns null when the permission is not held at all.
-- "Most restrictive wins": if an override narrows the scope, the narrower one
-- applies; the override never widens beyond what it explicitly states.
-- -----------------------------------------------------------------------------
create or replace function public.permission_scope_of(p_key text)
returns permission_scope
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_org            uuid := public.current_org_id();
  v_role_scope     permission_scope;
  v_role_allowed   boolean;
  v_override_scope permission_scope;
  v_override_allow boolean;
begin
  if v_org is null then
    return null;
  end if;

  if public.is_org_owner() then
    return 'all'::permission_scope;
  end if;

  select rp.allowed, rp.scope into v_role_allowed, v_role_scope
  from public.memberships m
  join public.role_permissions rp on rp.role_id = m.role_id
  where m.user_id = auth.uid()
    and m.organization_id = v_org
    and m.status = 'active'
    and rp.permission_key = p_key
  limit 1;

  select o.allowed, o.scope into v_override_allow, v_override_scope
  from public.user_permission_overrides o
  join public.memberships m on m.id = o.membership_id
  where m.user_id = auth.uid()
    and m.organization_id = v_org
    and m.status = 'active'
    and o.permission_key = p_key
    and (o.expires_at is null or o.expires_at > now())
  limit 1;

  if v_override_allow is not null then
    if not v_override_allow then
      return null;
    end if;
    -- A null override scope means "inherit the role's scope".
    return coalesce(v_override_scope, v_role_scope, 'own'::permission_scope);
  end if;

  if coalesce(v_role_allowed, false) then
    return coalesce(v_role_scope, 'own'::permission_scope);
  end if;

  return null;
end;
$$;

-- -----------------------------------------------------------------------------
-- can_access_record — applies a resolved scope to one row.
--
-- Feature tables (job openings, candidates…) call this from their RLS policies
-- so scope logic lives in exactly one place. `p_owner_membership_id` is the
-- record's creator; `p_assignee_ids` are the memberships explicitly assigned to
-- it; `p_department_id` is the record's department.
-- -----------------------------------------------------------------------------
create or replace function public.can_access_record(
  p_key                 text,
  p_owner_membership_id uuid default null,
  p_department_id       uuid default null,
  p_assignee_ids        uuid[] default '{}'
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_scope     permission_scope := public.permission_scope_of(p_key);
  v_member    uuid := public.current_membership_id();
  v_dept      uuid;
begin
  if v_scope is null then
    return false;
  end if;

  if v_scope = 'all' then
    return true;
  end if;

  if v_member is null then
    return false;
  end if;

  if v_scope = 'own' then
    return p_owner_membership_id = v_member;
  end if;

  if v_scope = 'assigned' then
    return v_member = any(p_assignee_ids) or p_owner_membership_id = v_member;
  end if;

  if v_scope = 'department' then
    select m.department_id into v_dept
    from public.memberships m
    where m.id = v_member;

    return v_dept is not null and v_dept = p_department_id;
  end if;

  return false;
end;
$$;

-- -----------------------------------------------------------------------------
-- my_permissions — the caller's full effective permission set.
-- One round trip for the app to hydrate its client-side permission cache
-- (spec §UC-0: cache with immediate invalidation).
-- -----------------------------------------------------------------------------
create or replace function public.my_permissions()
returns table (permission_key text, scope permission_scope)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_org uuid := public.current_org_id();
begin
  if v_org is null then
    return;
  end if;

  -- Owner: everything in the catalogue, unrestricted.
  if public.is_org_owner() then
    return query
      select p.key, 'all'::permission_scope from public.permissions p;
    return;
  end if;

  return query
  with role_grants as (
    select rp.permission_key, rp.allowed, rp.scope
    from public.memberships m
    join public.role_permissions rp on rp.role_id = m.role_id
    where m.user_id = auth.uid()
      and m.organization_id = v_org
      and m.status = 'active'
  ),
  overrides as (
    select o.permission_key, o.allowed, o.scope
    from public.user_permission_overrides o
    join public.memberships m on m.id = o.membership_id
    where m.user_id = auth.uid()
      and m.organization_id = v_org
      and m.status = 'active'
      and (o.expires_at is null or o.expires_at > now())
  )
  select
    coalesce(ov.permission_key, rg.permission_key),
    coalesce(ov.scope, rg.scope, 'own'::permission_scope)
  from role_grants rg
  full outer join overrides ov on ov.permission_key = rg.permission_key
  where coalesce(ov.allowed, rg.allowed, false);
end;
$$;
