-- =============================================================================
-- 0042 · Organization self-service deactivation (company settings)
-- =============================================================================
-- An owner/admin can pause their own workspace: non-admin members are locked
-- out until an admin signs in, which auto-reactivates it. Distinct from
-- suspended_at (platform-imposed, only a super-admin can lift). Null = active.
-- =============================================================================

alter table public.organizations
  add column if not exists deactivated_at timestamptz;
