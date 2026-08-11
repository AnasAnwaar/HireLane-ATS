-- =============================================================================
-- 0031 · Candidate reference photo (identity match, CP-20)
-- =============================================================================
-- Identity match needs a trusted reference to compare a check-in against. We
-- enrol one automatically: the candidate's FIRST proctored check-in is copied to
-- a stable reference path and recorded here. Later attempts are compared to it by
-- the AI analysis (CP-20). Stored in the private candidate-documents bucket.
-- =============================================================================

alter table public.candidates
  add column if not exists reference_photo_path text;
