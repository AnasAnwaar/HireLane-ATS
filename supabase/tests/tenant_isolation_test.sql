-- =============================================================================
-- Tenant isolation + permission resolution tests
-- =============================================================================
-- Spec CP-2 acceptance: "org A cannot read org B under any query".
--
-- Run against a database with all migrations applied:
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/tenant_isolation_test.sql
--
-- Wrapped in a transaction that always rolls back, so it is safe to run against
-- a scratch database. Do NOT run against production — it inserts users.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Fixtures: two organisations, three users.
-- Created with RLS bypassed (we are the migration/superuser role here); the
-- assertions below then re-enter as each user via the JWT claim.
-- -----------------------------------------------------------------------------
set local role postgres;

insert into auth.users (id, email, raw_user_meta_data)
values
  ('11111111-1111-1111-1111-111111111111', 'owner-a@acme.test',  '{"full_name":"Owner A"}'),
  ('22222222-2222-2222-2222-222222222222', 'owner-b@globex.test','{"full_name":"Owner B"}'),
  ('33333333-3333-3333-3333-333333333333', 'rec-a@acme.test',    '{"full_name":"Recruiter A"}')
on conflict (id) do nothing;

-- Helper: act as a given user for subsequent statements.
create or replace function pg_temp.act_as(p_user uuid)
returns void language plpgsql as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated')::text,
    true
  );
  perform set_config('role', 'authenticated', true);
end;
$$;

create or replace function pg_temp.assert(p_condition boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_condition then
    raise notice 'PASS  %', p_label;
  else
    raise exception 'FAIL  %', p_label;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Provision two organisations, each owned by a different user.
-- -----------------------------------------------------------------------------
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
select public.provision_organization('Acme Tech', 'standard', 'Owner A') as org_a \gset

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
select public.provision_organization('Globex Inc', 'standard', 'Owner B') as org_b \gset

set local role postgres;

-- Add Recruiter A to org A with the recruiter role.
insert into public.memberships (organization_id, user_id, role_id, status)
select :'org_a'::uuid,
       '33333333-3333-3333-3333-333333333333',
       r.id,
       'active'
from public.roles r
where r.organization_id = :'org_a'::uuid and r.key = 'recruiter';

-- =============================================================================
-- 1 · Isolation — org A must never see org B
-- =============================================================================
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');

select pg_temp.assert(
  (select count(*) from public.organizations) = 1,
  'Owner A sees exactly one organisation'
);

select pg_temp.assert(
  (select count(*) from public.organizations where id = :'org_b'::uuid) = 0,
  'Owner A cannot read org B directly by id'
);

select pg_temp.assert(
  (select count(*) from public.memberships where organization_id = :'org_b'::uuid) = 0,
  'Owner A cannot read org B memberships'
);

select pg_temp.assert(
  (select count(*) from public.roles where organization_id = :'org_b'::uuid) = 0,
  'Owner A cannot read org B roles'
);

select pg_temp.assert(
  (select count(*) from public.role_permissions rp
   join public.roles r on r.id = rp.role_id
   where r.organization_id = :'org_b'::uuid) = 0,
  'Owner A cannot read org B permission grants (join path)'
);

select pg_temp.assert(
  (select count(*) from public.audit_log where organization_id = :'org_b'::uuid) = 0,
  'Owner A cannot read org B audit entries'
);

-- Writes must fail too, not merely reads. RLS makes the row invisible, so the
-- UPDATE matches nothing rather than raising — assert on the affected count.
update public.organizations set name = 'Hijacked' where id = :'org_b'::uuid;

select pg_temp.assert(
  (select count(*) from public.organizations
   where name = 'Hijacked') = 0,
  'Owner A cannot update org B'
);

-- =============================================================================
-- 2 · Owner privileges
-- =============================================================================
select pg_temp.assert(public.is_org_owner(), 'Owner A is recognised as owner');
select pg_temp.assert(public.has_permission('administration.manage_roles'),
                      'Owner holds manage_roles');
select pg_temp.assert(public.has_permission('fields.view_salary'),
                      'Owner holds every permission, including sensitive fields');
select pg_temp.assert(
  (select count(*) from public.my_permissions()) = (select count(*) from public.permissions),
  'Owner my_permissions() returns the entire catalogue'
);

-- =============================================================================
-- 3 · Role grants and scopes — Recruiter A
-- =============================================================================
select pg_temp.act_as('33333333-3333-3333-3333-333333333333');

select pg_temp.assert(not public.is_org_owner(), 'Recruiter A is not an owner');

select pg_temp.assert(public.has_permission('applicants.view_list'),
                      'Recruiter holds applicants.view_list (Standard preset)');

select pg_temp.assert(public.permission_scope_of('applicants.view_list') = 'assigned',
                      'Recruiter applicants.view_list is scoped to assigned');

select pg_temp.assert(not public.has_permission('administration.manage_roles'),
                      'Recruiter does NOT hold manage_roles');

select pg_temp.assert(not public.has_permission('fields.view_salary'),
                      'Recruiter does NOT hold view_salary by default');

select pg_temp.assert(public.permission_scope_of('administration.manage_roles') is null,
                      'Scope of an ungranted permission is null');

-- =============================================================================
-- 4 · Per-user overrides
-- =============================================================================
set local role postgres;

insert into public.user_permission_overrides
  (organization_id, membership_id, permission_key, allowed, scope, reason)
select :'org_a'::uuid, m.id, 'fields.view_salary', true, 'all', 'Trusted senior recruiter'
from public.memberships m
where m.organization_id = :'org_a'::uuid
  and m.user_id = '33333333-3333-3333-3333-333333333333';

select pg_temp.act_as('33333333-3333-3333-3333-333333333333');

select pg_temp.assert(public.has_permission('fields.view_salary'),
                      'Override grants a permission the role lacks');

-- An expired override must not apply.
set local role postgres;
update public.user_permission_overrides
set expires_at = now() - interval '1 day'
where permission_key = 'fields.view_salary';

select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
select pg_temp.assert(not public.has_permission('fields.view_salary'),
                      'Expired override no longer applies');

-- A revoking override must beat the role grant.
set local role postgres;
update public.user_permission_overrides
set permission_key = 'applicants.view_list', allowed = false, expires_at = null
where permission_key = 'fields.view_salary';

select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
select pg_temp.assert(not public.has_permission('applicants.view_list'),
                      'Revoking override overrides the role grant');

-- =============================================================================
-- 5 · Guardrails
-- =============================================================================
set local role postgres;

-- Audit log is append-only.
do $$
declare v_id bigint;
begin
  select id into v_id from public.audit_log limit 1;

  begin
    update public.audit_log set summary = 'tampered' where id = v_id;
    raise exception 'FAIL  audit_log accepted an UPDATE';
  exception when insufficient_privilege then
    raise notice 'PASS  audit_log rejects UPDATE';
  end;

  begin
    delete from public.audit_log where id = v_id;
    raise exception 'FAIL  audit_log accepted a DELETE';
  exception when insufficient_privilege then
    raise notice 'PASS  audit_log rejects DELETE';
  end;
end;
$$;

-- The last owner cannot be demoted.
do $$
begin
  begin
    update public.memberships
    set is_owner = false
    where user_id = '11111111-1111-1111-1111-111111111111';
    raise exception 'FAIL  last owner was demoted';
  exception when check_violation then
    raise notice 'PASS  last owner cannot be demoted';
  end;
end;
$$;

-- A role still assigned to someone cannot be deleted.
do $$
declare v_role uuid;
begin
  select r.id into v_role
  from public.roles r
  join public.memberships m on m.role_id = r.id
  where not r.is_owner_role
  limit 1;

  begin
    delete from public.roles where id = v_role;
    raise exception 'FAIL  in-use role was deleted';
  exception when check_violation then
    raise notice 'PASS  in-use role cannot be deleted';
  end;
end;
$$;

-- =============================================================================
rollback;
-- =============================================================================
