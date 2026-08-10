-- =============================================================================
-- 0017 · Publishing (spec §UC-2 step 8, A3; §UC-1 R3)
-- =============================================================================
-- Publishing is a state machine over the existing job_postings columns:
--   draft → scheduled → published → closed   (with `failed` as an off-ramp)
-- All the state already exists (status, scheduled_for, published_at, external_url,
-- error). This migration only records WHO published, and speeds up the
-- "scheduled posts that are now due" sweep.
--
-- Reality (spec §UC-1): most channels are ASSISTED — publishing means the AI
-- wrote the post and HR pastes it across, then marks it posted (optionally with
-- the live URL). API channels (careers_page today) publish directly. The action
-- layer treats both the same way; only the wording differs in the UI.
-- =============================================================================

alter table public.job_postings
  add column if not exists published_by uuid references public.memberships(id) on delete set null;

-- Partial index for the due-scheduled sweep (publishDuePostings).
create index if not exists job_postings_scheduled_idx
  on public.job_postings (scheduled_for)
  where status = 'scheduled';
