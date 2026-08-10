-- =============================================================================
-- 0022 · Scoring — AI grading of written answers (spec §UC-5.2 step 7, CP-17)
-- =============================================================================
-- Auto-scored questions get their marks at submit time (CP-16). Written answers
-- (short/long/scenario) are graded against their rubric by the AI, which
-- SUGGESTS a mark + rationale; a human then confirms or amends it. Nothing
-- counts toward the final score until `confirmed` is true.
-- =============================================================================

alter table public.test_answers
  add column if not exists ai_suggested_marks numeric,
  add column if not exists ai_rationale       text,
  add column if not exists confirmed          boolean not null default false,
  add column if not exists graded_by          uuid references public.memberships(id) on delete set null,
  add column if not exists graded_at          timestamptz;

-- Auto-scored answers are "confirmed" by construction — mark existing ones so
-- the results view treats them as final without a human step.
update public.test_answers a
   set confirmed = true
  from public.test_attempts t
 where a.attempt_id = t.id
   and a.is_correct is not null
   and a.confirmed = false;
