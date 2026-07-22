-- =============================================================================
-- 0009 · Organisation provisioning
-- =============================================================================
-- Spec §UC-0 main flow 2: signing up creates an isolated workspace and assigns
-- the signing-up user the Owner role.
--
-- This runs as SECURITY DEFINER because at the moment of sign-up the caller has
-- no membership yet, so RLS would (correctly) block every insert. It is the one
-- sanctioned path that creates a tenant — there is no direct insert policy on
-- `organizations`.
-- =============================================================================

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

  -- One organisation per signing-up user via this path. Joining an additional
  -- organisation happens through an invitation, not by provisioning.
  if exists (select 1 from public.memberships where user_id = v_user and is_owner) then
    raise exception 'This account already owns an organisation.'
      using errcode = 'unique_violation';
  end if;

  if not exists (select 1 from public.permission_presets where key = p_preset_key) then
    raise exception 'Unknown permission preset "%".', p_preset_key
      using errcode = 'foreign_key_violation';
  end if;

  -- Slug: lowercase, non-alphanumerics collapsed to hyphens, de-duplicated.
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

  -- Copy the preset's roles into the organisation. From here they are the
  -- company's own — editing them never touches the preset.
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

  -- Copy the preset's grants.
  insert into public.role_permissions (role_id, permission_key, allowed, scope)
  select (v_role_ids ->> g.role_key)::uuid, g.permission_key, g.allowed, g.scope
  from public.permission_preset_grants g
  where g.preset_key = p_preset_key
    and v_role_ids ? g.role_key
  on conflict (role_id, permission_key) do nothing;

  -- Make the caller the Owner.
  insert into public.memberships (organization_id, user_id, role_id, status, is_owner)
  values (v_org, v_user, v_owner_role_id, 'active', true);

  if p_full_name is not null and length(trim(p_full_name)) > 0 then
    update public.profiles set full_name = trim(p_full_name) where id = v_user;
  end if;

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

revoke all on function public.provision_organization(text, text, text) from public;
grant execute on function public.provision_organization(text, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Ownership transfer (spec §UC-0 A3). Both the single-owner index and the
-- last-owner guard make the order of operations matter, so it is wrapped here.
-- -----------------------------------------------------------------------------
create or replace function public.transfer_ownership(p_to_membership_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org       uuid := public.current_org_id();
  v_current   uuid := public.current_membership_id();
  v_target    public.memberships;
  v_owner_role uuid;
begin
  if not public.is_org_owner() then
    raise exception 'Only the current owner can transfer ownership.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_target from public.memberships
  where id = p_to_membership_id and organization_id = v_org and status = 'active';

  if not found then
    raise exception 'Target member not found in this organisation.'
      using errcode = 'no_data_found';
  end if;

  select id into v_owner_role from public.roles
  where organization_id = v_org and is_owner_role;

  -- Drop the old owner flag first: the partial unique index permits only one
  -- active owner per organisation at a time. That briefly leaves zero owners,
  -- which the last-owner guard would reject — so suppress it for this
  -- transaction only (the third argument makes set_config transaction-local).
  perform set_config('app.ownership_transfer', 'on', true);

  update public.memberships set is_owner = false where id = v_current;
  update public.memberships set is_owner = true, role_id = v_owner_role
  where id = p_to_membership_id;

  perform set_config('app.ownership_transfer', 'off', true);

  perform public.write_audit(
    'organization.ownership_transferred',
    'membership',
    p_to_membership_id::text,
    'Ownership transferred.',
    jsonb_build_object('from_membership', v_current),
    jsonb_build_object('to_membership', p_to_membership_id)
  );
end;
$$;

revoke all on function public.transfer_ownership(uuid) from public;
grant execute on function public.transfer_ownership(uuid) to authenticated;
