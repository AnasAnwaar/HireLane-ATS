-- =============================================================================
-- 0003 · Roles, permission catalogue, grants, overrides, approval rules
-- =============================================================================
-- Implements spec §9: "No permission in this platform is hard-coded. Every
-- capability is a configurable toggle in the Admin Portal."
--
-- Shape:
--   permissions              global catalogue of capability keys (vendor-defined)
--   roles                    per-organisation, fully editable
--   role_permissions         the grant matrix: role × permission → allowed + scope
--   user_permission_overrides per-user exceptions, optionally expiring
--   permission_presets       shipped starting points (Standard / Strict / Custom)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- permissions — the catalogue from spec §9.1. Global, not org-scoped: these are
-- the capabilities the software has. What each company DOES with them is
-- expressed in role_permissions.
-- -----------------------------------------------------------------------------
create table public.permissions (
  key               text primary key
                    check (key ~ '^[a-z_]+\.[a-z0-9_]+$'),   -- module.action
  module            text            not null,
  label             text            not null,
  description       text            not null default '',
  -- Whether this permission can be narrowed to a data scope (spec §9.1 "⊞").
  supports_scope    boolean         not null default false,
  -- Field-level visibility permissions (salary, contact, evidence, recordings…).
  is_field_level    boolean         not null default false,
  -- Drives confirmation prompts in the admin UI (spec §10 mitigation).
  risk              permission_risk not null default 'low',
  sort_order        int             not null default 0
);

create index permissions_module_idx on public.permissions (module, sort_order);

-- -----------------------------------------------------------------------------
-- roles — per organisation. Admins may create, clone, rename and delete any
-- role except the Owner role (spec §UC-0 "Configuring Permissions" 2).
-- -----------------------------------------------------------------------------
create table public.roles (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  key             text        not null check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  name            text        not null check (length(trim(name)) between 1 and 60),
  description     text        not null default '',
  -- Owner role: immutable permission set, always retains permission management.
  is_owner_role   boolean     not null default false,
  -- Shipped with the preset (vs. author-created). Can still be edited/renamed;
  -- this only drives "restore to default" and UI labelling.
  is_system       boolean     not null default false,
  sort_order      int         not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, key)
);

create index roles_org_idx on public.roles (organization_id);

create unique index roles_one_owner_role_per_org
  on public.roles (organization_id)
  where is_owner_role;

create trigger roles_set_updated_at
  before update on public.roles
  for each row execute function public.set_updated_at();

-- Deferred from 0002 — memberships.role_id now has a target.
alter table public.memberships
  add constraint memberships_role_id_fkey
  foreign key (role_id) references public.roles(id) on delete restrict;

alter table public.invitations
  add constraint invitations_role_id_fkey
  foreign key (role_id) references public.roles(id) on delete set null;

-- Spec §UC-0 A2: a role cannot be deleted while it is still assigned.
-- `on delete restrict` above enforces it; this gives a readable message.
create or replace function public.guard_role_in_use()
returns trigger
language plpgsql
as $$
declare
  in_use int;
begin
  if old.is_owner_role then
    raise exception 'The Owner role cannot be deleted.'
      using errcode = 'check_violation';
  end if;

  select count(*) into in_use
  from public.memberships
  where role_id = old.id and status <> 'deactivated';

  if in_use > 0 then
    raise exception
      'Role "%" is still assigned to % member(s). Reassign them before deleting.',
      old.name, in_use
      using errcode = 'check_violation';
  end if;

  return old;
end;
$$;

create trigger roles_guard_in_use
  before delete on public.roles
  for each row execute function public.guard_role_in_use();

-- -----------------------------------------------------------------------------
-- role_permissions — the grant matrix.
-- Absence of a row means "not granted"; an explicit row with allowed = false is
-- equivalent but records a deliberate decision (useful for diffing presets).
-- -----------------------------------------------------------------------------
create table public.role_permissions (
  role_id        uuid             not null references public.roles(id) on delete cascade,
  permission_key text             not null references public.permissions(key) on delete cascade,
  allowed        boolean          not null default true,
  scope          permission_scope not null default 'all',
  updated_at     timestamptz      not null default now(),
  primary key (role_id, permission_key)
);

create index role_permissions_role_idx on public.role_permissions (role_id);

-- -----------------------------------------------------------------------------
-- user_permission_overrides — grant or revoke a single permission for a single
-- user without changing their role (spec §UC-0 "Per-User Overrides").
-- -----------------------------------------------------------------------------
create table public.user_permission_overrides (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  membership_id   uuid        not null references public.memberships(id) on delete cascade,
  permission_key  text        not null references public.permissions(key) on delete cascade,
  allowed         boolean     not null,
  -- Null scope means "inherit the role's scope".
  scope           permission_scope,
  reason          text,
  expires_at      timestamptz,
  granted_by      uuid        references public.memberships(id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (membership_id, permission_key)
);

create index user_permission_overrides_org_idx        on public.user_permission_overrides (organization_id);
create index user_permission_overrides_membership_idx on public.user_permission_overrides (membership_id);

-- -----------------------------------------------------------------------------
-- permission_presets — shipped starting points. Seeded in 0007/0008 and applied
-- at sign-up; editing a role afterwards never touches these rows.
-- -----------------------------------------------------------------------------
create table public.permission_presets (
  key         text primary key,
  name        text not null,
  description text not null default '',
  sort_order  int  not null default 0
);

create table public.permission_preset_roles (
  preset_key    text    not null references public.permission_presets(key) on delete cascade,
  role_key      text    not null,
  role_name     text    not null,
  description   text    not null default '',
  is_owner_role boolean not null default false,
  sort_order    int     not null default 0,
  primary key (preset_key, role_key)
);

create table public.permission_preset_grants (
  preset_key     text             not null,
  role_key       text             not null,
  permission_key text             not null references public.permissions(key) on delete cascade,
  allowed        boolean          not null default true,
  scope          permission_scope not null default 'all',
  primary key (preset_key, role_key, permission_key),
  foreign key (preset_key, role_key)
    references public.permission_preset_roles(preset_key, role_key) on delete cascade
);

-- -----------------------------------------------------------------------------
-- approval_rules — spec §UC-0 step 6: any action can be made approval-gated.
-- -----------------------------------------------------------------------------
create table public.approval_rules (
  id                 uuid        primary key default gen_random_uuid(),
  organization_id    uuid        not null references public.organizations(id) on delete cascade,
  -- The permission key whose exercise requires approval, e.g. 'job_openings.publish'.
  action_key         text        not null references public.permissions(key) on delete cascade,
  approvals_required int         not null default 1 check (approvals_required between 1 and 5),
  -- Roles whose members may approve. Empty means "any role holding the permission".
  approver_role_ids  uuid[]      not null default '{}',
  is_active          boolean     not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (organization_id, action_key)
);

create index approval_rules_org_idx on public.approval_rules (organization_id);

create trigger approval_rules_set_updated_at
  before update on public.approval_rules
  for each row execute function public.set_updated_at();
