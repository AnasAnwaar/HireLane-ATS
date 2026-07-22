-- =============================================================================
-- 0001 · Extensions, enum types, and session helpers
-- =============================================================================
-- Foundation for the multi-tenant permission model described in
-- ATS-Portal-UseCase.md §UC-0 and §9.
-- =============================================================================

create extension if not exists "pgcrypto";      -- gen_random_uuid(), digest()
create extension if not exists "citext";        -- case-insensitive email

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------

-- Data scope for a granted permission. Spec §UC-0 "Configuring Permissions" 4.
create type permission_scope as enum ('all', 'department', 'assigned', 'own');

create type membership_status as enum ('invited', 'active', 'deactivated');

-- Drives the "warning prompt on high-risk toggles" requirement (spec §10).
create type permission_risk as enum ('low', 'medium', 'high');

create type invitation_status as enum ('pending', 'accepted', 'revoked', 'expired');

-- -----------------------------------------------------------------------------
-- Session helpers
-- -----------------------------------------------------------------------------

-- The organisation the current request is acting within.
--
-- Resolution order:
--   1. `app_metadata.organization_id` on the JWT — set at sign-in when a user
--      belongs to more than one organisation and has picked an active one.
--   2. Their single active membership.
--
-- SECURITY DEFINER because it reads `memberships`, which is itself RLS-protected
-- by this function — without it the policy would recurse.
create or replace function public.current_org_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  claim_org text;
  resolved  uuid;
begin
  if auth.uid() is null then
    return null;
  end if;

  claim_org := nullif(
    current_setting('request.jwt.claims', true)::jsonb
      -> 'app_metadata' ->> 'organization_id',
    ''
  );

  if claim_org is not null then
    -- Never trust the claim on its own: confirm the membership still exists
    -- and is active. A stale JWT must not grant access to a left organisation.
    select m.organization_id into resolved
    from public.memberships m
    where m.user_id = auth.uid()
      and m.organization_id = claim_org::uuid
      and m.status = 'active'
    limit 1;

    return resolved;
  end if;

  select m.organization_id into resolved
  from public.memberships m
  where m.user_id = auth.uid()
    and m.status = 'active'
  order by m.created_at
  limit 1;

  return resolved;
end;
$$;

comment on function public.current_org_id is
  'Active organisation for the current request. Returns null when unauthenticated or with no active membership.';

-- The caller's membership row in the active organisation.
create or replace function public.current_membership_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.id
  from public.memberships m
  where m.user_id = auth.uid()
    and m.organization_id = public.current_org_id()
    and m.status = 'active'
  limit 1;
$$;

-- Owner check. The Owner permission set is immutable and always retains
-- permission-management rights (spec §UC-0 R2), so it short-circuits every
-- permission lookup.
create or replace function public.is_org_owner()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select m.is_owner
     from public.memberships m
     where m.user_id = auth.uid()
       and m.organization_id = public.current_org_id()
       and m.status = 'active'
     limit 1),
    false
  );
$$;

-- -----------------------------------------------------------------------------
-- Shared trigger: maintain updated_at
-- -----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
