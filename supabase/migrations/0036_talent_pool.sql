-- =============================================================================
-- 0036 · Talent pool & cross-opening reuse (spec §UC-8, CP-25)
-- =============================================================================
-- A candidate can be kept in the talent pool for future roles and organised with
-- free-form tags, independent of any single application. Reuse across openings is
-- just creating another application for the same candidate (existing applications
-- table + applicants.import), so no new join table is needed.
-- =============================================================================

alter table public.candidates
  add column if not exists in_talent_pool boolean not null default false,
  add column if not exists tags           text[]  not null default '{}';

create index if not exists candidates_talent_pool_idx
  on public.candidates (organization_id) where in_talent_pool;
