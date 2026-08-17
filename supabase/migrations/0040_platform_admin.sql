-- =============================================================================
-- 0040 · Platform super-admin identity + audit log (CP-28)
-- =============================================================================
-- Cross-tenant super-admin is NOT an org role — the whole RBAC layer is scoped
-- to current_org_id(), which is null for a platform operator acting across
-- tenants. Model it as a flag on the (org-independent) profile, with a
-- SECURITY DEFINER helper that does not depend on current_org_id(), plus an
-- append-only audit log for every privileged action.
-- =============================================================================

alter table public.profiles
  add column if not exists is_platform_admin boolean not null default false;

-- Non-org-scoped authority check, parallel to has_permission() (which is
-- org-scoped). SECURITY DEFINER so it can read profiles regardless of the
-- caller's RLS view.
create or replace function public.is_platform_admin(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid and p.is_platform_admin
  );
$$;

-- Append-only record of privileged platform actions (plan edits, org
-- suspensions, impersonation, …). Written via the service role.
create table if not exists public.platform_audit_log (
  id            uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_email   text,
  action        text not null,
  target_type   text,
  target_id     text,
  detail        jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists platform_audit_log_created_idx
  on public.platform_audit_log (created_at desc);

alter table public.platform_audit_log enable row level security;
alter table public.platform_audit_log force row level security;

-- Only platform admins may read the log; inserts happen through the service role.
drop policy if exists platform_audit_select on public.platform_audit_log;
create policy platform_audit_select on public.platform_audit_log
  for select to authenticated
  using (public.is_platform_admin());
