-- =============================================================================
-- 0012 · Silence permission-change audit during provisioning
-- =============================================================================
-- provision_organization() seeds ~190 role_permission rows from the preset. Each
-- fired the audit trigger, so a brand-new workspace opened with ~190 "permission
-- granted" entries — noise that buries the real history and makes the audit log
-- less useful on day one.
--
-- These seed rows are system setup, not a user editing permissions, so they
-- should not be audited. We set a transaction-local flag during provisioning and
-- have the audit trigger honour it. The flag cannot outlive the transaction, so
-- ordinary permission edits are always audited.
-- =============================================================================

-- Trigger: skip when provisioning is in progress.
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
  -- Seed inserts during provision_organization() are setup, not user edits.
  if coalesce(current_setting('app.provisioning', true), '') = 'on' then
    return coalesce(new, old);
  end if;

  select r.organization_id, r.name into v_org, v_role
  from public.roles r
  where r.id = coalesce(new.role_id, old.role_id);

  if v_org is null then
    return coalesce(new, old);
  end if;

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

-- provision_organization(): raise the flag around the grant copy.
create or replace function public.provision_organization(
  p_company_name text,
  p_preset_key   text default 'standard',
  p_full_name    text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user      uuid := auth.uid();
  v_org       uuid;
  v_slug      citext;
  v_base_slug text;
  v_suffix    int := 0;
  v_role      record;
  v_owner_role_id uuid;
  v_role_ids  jsonb := '{}'::jsonb;
  v_new_role_id uuid;
begin
  if v_user is null then
    raise exception 'provision_organization must be called by an authenticated user.'
      using errcode = 'insufficient_privilege';
  end if;

  if length(trim(coalesce(p_company_name, ''))) = 0 then
    raise exception 'Company name is required.' using errcode = 'check_violation';
  end if;

  if exists (select 1 from public.memberships where user_id = v_user and is_owner) then
    raise exception 'This account already owns an organisation.'
      using errcode = 'unique_violation';
  end if;

  if not exists (select 1 from public.permission_presets where key = p_preset_key) then
    raise exception 'Unknown permission preset "%".', p_preset_key
      using errcode = 'foreign_key_violation';
  end if;

  -- Seed grants below are system setup; don't audit them (see 0012).
  perform set_config('app.provisioning', 'on', true);

  v_base_slug := trim(both '-' from regexp_replace(lower(p_company_name), '[^a-z0-9]+', '-', 'g'));
  if v_base_slug = '' then
    v_base_slug := 'company';
  end if;
  v_base_slug := left(v_base_slug, 50);
  v_slug := v_base_slug;

  while exists (select 1 from public.organizations o where o.slug = v_slug) loop
    v_suffix := v_suffix + 1;
    v_slug := v_base_slug || '-' || v_suffix;
  end loop;

  insert into public.organizations (name, slug)
  values (trim(p_company_name), v_slug)
  returning id into v_org;

  for v_role in
    select * from public.permission_preset_roles
    where preset_key = p_preset_key
    order by sort_order
  loop
    insert into public.roles (organization_id, key, name, description, is_owner_role, is_system, sort_order)
    values (v_org, v_role.role_key, v_role.role_name, v_role.description,
            v_role.is_owner_role, true, v_role.sort_order)
    returning id into v_new_role_id;

    v_role_ids := v_role_ids || jsonb_build_object(v_role.role_key, v_new_role_id::text);

    if v_role.is_owner_role then
      v_owner_role_id := v_new_role_id;
    end if;
  end loop;

  if v_owner_role_id is null then
    raise exception 'Preset "%" defines no owner role.', p_preset_key;
  end if;

  insert into public.role_permissions (role_id, permission_key, allowed, scope)
  select (v_role_ids ->> g.role_key)::uuid, g.permission_key, g.allowed, g.scope
  from public.permission_preset_grants g
  where g.preset_key = p_preset_key
    and v_role_ids ? g.role_key
  on conflict (role_id, permission_key) do nothing;

  insert into public.memberships (organization_id, user_id, role_id, status, is_owner)
  values (v_org, v_user, v_owner_role_id, 'active', true);

  if p_full_name is not null and length(trim(p_full_name)) > 0 then
    update public.profiles set full_name = trim(p_full_name) where id = v_user;
  end if;

  -- Done seeding; re-enable audit for the rest of the transaction.
  perform set_config('app.provisioning', 'off', true);

  insert into public.audit_log (
    organization_id, actor_membership_id, actor_email, actor_name,
    action, entity_type, entity_id, summary, after_state
  )
  select
    v_org,
    m.id,
    p.email,
    p.full_name,
    'organization.created',
    'organization',
    v_org::text,
    format('Workspace "%s" created with the %s permission preset.', trim(p_company_name), p_preset_key),
    jsonb_build_object('name', trim(p_company_name), 'slug', v_slug::text, 'preset', p_preset_key)
  from public.memberships m
  join public.profiles p on p.id = m.user_id
  where m.organization_id = v_org and m.user_id = v_user;

  return v_org;
end;
$$;
