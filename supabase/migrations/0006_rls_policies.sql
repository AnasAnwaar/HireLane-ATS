-- =============================================================================
-- 0006 · Row-Level Security
-- =============================================================================
-- Spec §9.3 guardrail 4 (workspace isolation) and §UC-0 R3 ("permission checks
-- are enforced server-side on every request — hiding UI is never the security
-- boundary").
--
-- Every tenant table is filtered by `organization_id = current_org_id()`. That
-- predicate is the isolation boundary; the has_permission() checks layered on
-- top are the authorisation boundary. Both are required.
-- =============================================================================

alter table public.organizations             enable row level security;
alter table public.profiles                  enable row level security;
alter table public.departments               enable row level security;
alter table public.memberships               enable row level security;
alter table public.invitations               enable row level security;
alter table public.roles                     enable row level security;
alter table public.permissions               enable row level security;
alter table public.role_permissions          enable row level security;
alter table public.user_permission_overrides enable row level security;
alter table public.approval_rules            enable row level security;
alter table public.audit_log                 enable row level security;
alter table public.permission_presets        enable row level security;
alter table public.permission_preset_roles   enable row level security;
alter table public.permission_preset_grants  enable row level security;

-- Force RLS even for the table owner, so a misconfigured connection cannot
-- quietly read across tenants. The service role still bypasses via BYPASSRLS.
alter table public.organizations             force row level security;
alter table public.departments               force row level security;
alter table public.memberships               force row level security;
alter table public.invitations               force row level security;
alter table public.roles                     force row level security;
alter table public.role_permissions          force row level security;
alter table public.user_permission_overrides force row level security;
alter table public.approval_rules            force row level security;
alter table public.audit_log                 force row level security;

-- -----------------------------------------------------------------------------
-- organizations
-- -----------------------------------------------------------------------------
create policy organizations_select on public.organizations
  for select to authenticated
  using (id = public.current_org_id());

create policy organizations_update on public.organizations
  for update to authenticated
  using (id = public.current_org_id()
         and public.has_permission('administration.manage_company_profile'))
  with check (id = public.current_org_id());

-- Insert happens only through provision_organization() (0009), which is
-- SECURITY DEFINER. No direct client insert path exists, and there is
-- deliberately no delete policy — deleting a tenant is an out-of-band operation.

-- -----------------------------------------------------------------------------
-- profiles — a user always sees their own; colleagues are visible to members of
-- the same organisation.
-- -----------------------------------------------------------------------------
create policy profiles_select_self on public.profiles
  for select to authenticated
  using (id = auth.uid());

create policy profiles_select_colleagues on public.profiles
  for select to authenticated
  using (
    exists (
      select 1 from public.memberships m
      where m.user_id = public.profiles.id
        and m.organization_id = public.current_org_id()
    )
  );

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- -----------------------------------------------------------------------------
-- departments
-- -----------------------------------------------------------------------------
create policy departments_select on public.departments
  for select to authenticated
  using (organization_id = public.current_org_id());

create policy departments_write on public.departments
  for all to authenticated
  using (organization_id = public.current_org_id()
         and public.has_permission('administration.manage_departments'))
  with check (organization_id = public.current_org_id()
              and public.has_permission('administration.manage_departments'));

-- -----------------------------------------------------------------------------
-- memberships
-- -----------------------------------------------------------------------------
create policy memberships_select_own on public.memberships
  for select to authenticated
  using (user_id = auth.uid());

create policy memberships_select_org on public.memberships
  for select to authenticated
  using (organization_id = public.current_org_id());

create policy memberships_write on public.memberships
  for all to authenticated
  using (organization_id = public.current_org_id()
         and public.has_permission('administration.manage_users'))
  with check (organization_id = public.current_org_id()
              and public.has_permission('administration.manage_users'));

-- -----------------------------------------------------------------------------
-- invitations
-- -----------------------------------------------------------------------------
create policy invitations_select on public.invitations
  for select to authenticated
  using (organization_id = public.current_org_id()
         and public.has_permission('administration.manage_users'));

create policy invitations_write on public.invitations
  for all to authenticated
  using (organization_id = public.current_org_id()
         and public.has_permission('administration.manage_users'))
  with check (organization_id = public.current_org_id()
              and public.has_permission('administration.manage_users'));

-- -----------------------------------------------------------------------------
-- roles — readable by every member (the UI shows role names widely); writable
-- only with the permission-management capability.
-- -----------------------------------------------------------------------------
create policy roles_select on public.roles
  for select to authenticated
  using (organization_id = public.current_org_id());

create policy roles_write on public.roles
  for all to authenticated
  using (organization_id = public.current_org_id()
         and public.has_permission('administration.manage_roles')
         -- Spec §UC-0 R2: the Owner role's grants are immutable.
         and not is_owner_role)
  with check (organization_id = public.current_org_id()
              and public.has_permission('administration.manage_roles')
              and not is_owner_role);

-- -----------------------------------------------------------------------------
-- permissions — the global catalogue is readable by any authenticated user and
-- writable by nobody (vendor-defined, changed only by migration).
-- -----------------------------------------------------------------------------
create policy permissions_select on public.permissions
  for select to authenticated
  using (true);

create policy presets_select on public.permission_presets
  for select to authenticated using (true);
create policy preset_roles_select on public.permission_preset_roles
  for select to authenticated using (true);
create policy preset_grants_select on public.permission_preset_grants
  for select to authenticated using (true);

-- -----------------------------------------------------------------------------
-- role_permissions — the grant matrix. Reachable only via a role in the caller's
-- own organisation.
-- -----------------------------------------------------------------------------
create policy role_permissions_select on public.role_permissions
  for select to authenticated
  using (
    exists (
      select 1 from public.roles r
      where r.id = role_permissions.role_id
        and r.organization_id = public.current_org_id()
    )
  );

create policy role_permissions_write on public.role_permissions
  for all to authenticated
  using (
    public.has_permission('administration.manage_roles')
    and exists (
      select 1 from public.roles r
      where r.id = role_permissions.role_id
        and r.organization_id = public.current_org_id()
        and not r.is_owner_role
    )
  )
  with check (
    public.has_permission('administration.manage_roles')
    and exists (
      select 1 from public.roles r
      where r.id = role_permissions.role_id
        and r.organization_id = public.current_org_id()
        and not r.is_owner_role
    )
  );

-- -----------------------------------------------------------------------------
-- user_permission_overrides
-- -----------------------------------------------------------------------------
create policy overrides_select_own on public.user_permission_overrides
  for select to authenticated
  using (
    exists (
      select 1 from public.memberships m
      where m.id = user_permission_overrides.membership_id
        and m.user_id = auth.uid()
    )
  );

create policy overrides_select_admin on public.user_permission_overrides
  for select to authenticated
  using (organization_id = public.current_org_id()
         and public.has_permission('administration.manage_roles'));

create policy overrides_write on public.user_permission_overrides
  for all to authenticated
  using (organization_id = public.current_org_id()
         and public.has_permission('administration.manage_roles'))
  with check (organization_id = public.current_org_id()
              and public.has_permission('administration.manage_roles'));

-- -----------------------------------------------------------------------------
-- approval_rules
-- -----------------------------------------------------------------------------
create policy approval_rules_select on public.approval_rules
  for select to authenticated
  using (organization_id = public.current_org_id());

create policy approval_rules_write on public.approval_rules
  for all to authenticated
  using (organization_id = public.current_org_id()
         and public.has_permission('administration.configure_workflow'))
  with check (organization_id = public.current_org_id()
              and public.has_permission('administration.configure_workflow'));

-- -----------------------------------------------------------------------------
-- audit_log — select only. Insert flows through write_audit() and triggers,
-- both SECURITY DEFINER; update and delete are blocked by trigger regardless.
-- -----------------------------------------------------------------------------
create policy audit_log_select on public.audit_log
  for select to authenticated
  using (organization_id = public.current_org_id()
         and public.has_permission('administration.view_audit_log'));
