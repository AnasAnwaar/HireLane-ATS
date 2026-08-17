-- =============================================================================
-- 0041 · Organization suspension (CP-28, platform org admin)
-- =============================================================================
-- Lets a platform super-admin suspend a tenant (e.g. abuse, non-payment). When
-- set, the app shell blocks the org's members with a suspended notice. Null =
-- active. Set/cleared only via the service role from the super-admin portal.
-- =============================================================================

alter table public.organizations
  add column if not exists suspended_at timestamptz;
