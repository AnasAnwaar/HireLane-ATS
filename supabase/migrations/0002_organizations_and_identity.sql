-- =============================================================================
-- 0002 · Organisations, profiles, memberships, departments, invitations
-- =============================================================================
-- Spec §UC-0: company sign-up creates an isolated workspace whose signing-up
-- user is the Owner.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- organizations — the tenant boundary. Every other table hangs off this.
-- -----------------------------------------------------------------------------
create table public.organizations (
  id                     uuid primary key default gen_random_uuid(),
  name                   text        not null check (length(trim(name)) between 1 and 120),
  slug                   citext      not null unique
                                     check (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,60}[a-z0-9])?$'),
  logo_url               text,
  industry               text,
  website                text,
  -- Locale defaults; per spec NFR "per-region date, currency and salary formats".
  timezone               text        not null default 'UTC',
  currency               char(3)     not null default 'USD',
  locale                 text        not null default 'en',
  -- Onboarding wizard is skippable and resumable (spec §UC-0 main flow 4).
  onboarding_completed_at timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- profiles — application-side mirror of auth.users.
-- Deliberately NOT org-scoped: one human, one profile, potentially several
-- memberships (e.g. a consultant working with two client companies).
-- -----------------------------------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      citext      not null,
  full_name  text        not null default '',
  avatar_url text,
  phone      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Keep profiles in step with auth.users automatically.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- -----------------------------------------------------------------------------
-- departments — used by the `department` permission scope.
-- -----------------------------------------------------------------------------
create table public.departments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  name            text        not null check (length(trim(name)) between 1 and 100),
  description     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, name)
);

create index departments_org_idx on public.departments (organization_id);

create trigger departments_set_updated_at
  before update on public.departments
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- memberships — a user's seat in one organisation, carrying their role.
-- roles is created in 0003, so the FK is added there.
-- -----------------------------------------------------------------------------
create table public.memberships (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid              not null references public.organizations(id) on delete cascade,
  user_id         uuid              not null references public.profiles(id) on delete cascade,
  role_id         uuid,
  department_id   uuid              references public.departments(id) on delete set null,
  job_title       text,
  status          membership_status not null default 'active',
  -- Tenant owner. Immutable permission set; cannot be locked out (spec §UC-0 R2).
  is_owner        boolean           not null default false,
  deactivated_at  timestamptz,
  created_at      timestamptz       not null default now(),
  updated_at      timestamptz       not null default now(),
  unique (organization_id, user_id)
);

create index memberships_org_idx        on public.memberships (organization_id);
create index memberships_user_idx       on public.memberships (user_id);
create index memberships_role_idx       on public.memberships (role_id);
create index memberships_department_idx on public.memberships (department_id);

-- Spec §UC-0 R2 / A1: at least one active Owner must always exist.
create unique index memberships_one_owner_per_org
  on public.memberships (organization_id, is_owner)
  where is_owner and status = 'active';

create trigger memberships_set_updated_at
  before update on public.memberships
  for each row execute function public.set_updated_at();

-- Guard the "never fewer than one Owner" invariant on the way out.
create or replace function public.guard_last_owner()
returns trigger
language plpgsql
as $$
declare
  remaining int;
begin
  -- transfer_ownership() (0009) must momentarily leave the org with no owner:
  -- the partial unique index forbids two active owners, so the old flag has to
  -- drop before the new one is set. That function sets this transaction-local
  -- flag; nothing else may, and it cannot outlive the transaction.
  if coalesce(current_setting('app.ownership_transfer', true), '') = 'on' then
    return coalesce(new, old);
  end if;

  -- Only relevant when an active Owner stops being one.
  if tg_op = 'UPDATE'
     and old.is_owner and old.status = 'active'
     and (not new.is_owner or new.status <> 'active')
  then
    select count(*) into remaining
    from public.memberships
    where organization_id = old.organization_id
      and is_owner
      and status = 'active'
      and id <> old.id;

    if remaining = 0 then
      raise exception
        'Cannot remove the last owner of an organisation. Transfer ownership first.'
        using errcode = 'check_violation';
    end if;
  end if;

  if tg_op = 'DELETE' and old.is_owner and old.status = 'active' then
    select count(*) into remaining
    from public.memberships
    where organization_id = old.organization_id
      and is_owner
      and status = 'active'
      and id <> old.id;

    if remaining = 0 then
      raise exception
        'Cannot delete the last owner of an organisation. Transfer ownership first.'
        using errcode = 'check_violation';
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

create trigger memberships_guard_last_owner
  before update or delete on public.memberships
  for each row execute function public.guard_last_owner();

-- Departments gain their head only now that memberships exists.
alter table public.departments
  add column head_membership_id uuid references public.memberships(id) on delete set null;

-- -----------------------------------------------------------------------------
-- invitations — tokenised, expiring (spec §UC-0, §UC-3 R2)
-- -----------------------------------------------------------------------------
create table public.invitations (
  id              uuid              primary key default gen_random_uuid(),
  organization_id uuid              not null references public.organizations(id) on delete cascade,
  email           citext            not null,
  role_id         uuid,
  department_id   uuid              references public.departments(id) on delete set null,
  -- Only the hash is stored; the raw token exists solely in the emailed link.
  token_hash      text              not null unique,
  status          invitation_status not null default 'pending',
  expires_at      timestamptz       not null,
  invited_by      uuid              references public.memberships(id) on delete set null,
  accepted_at     timestamptz,
  accepted_by     uuid              references public.profiles(id) on delete set null,
  created_at      timestamptz       not null default now(),
  updated_at      timestamptz       not null default now(),
  check (expires_at > created_at)
);

create index invitations_org_idx   on public.invitations (organization_id);
create index invitations_email_idx on public.invitations (email);

-- One live invitation per email per organisation.
create unique index invitations_one_pending_per_email
  on public.invitations (organization_id, email)
  where status = 'pending';

create trigger invitations_set_updated_at
  before update on public.invitations
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Session helpers that depend on `memberships`
--
-- These are `language sql`, whose bodies Postgres resolves against the catalog
-- at creation time, so they must come after the table exists. (Their sibling
-- `current_org_id()` is PL/pgSQL and could live in 0001.)
-- -----------------------------------------------------------------------------

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
