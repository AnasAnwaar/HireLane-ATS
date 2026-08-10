-- =============================================================================
-- 0019 · Configurable scoring weights + re-rank-on-change (spec §UC-4 A1/A3, CP-14)
-- =============================================================================
-- Two small additions on top of CP-13's screening:
--
--  1. job_openings.scoring_weights — per-opening weighting of the three primary
--     dimensions (skills / experience / qualification). NULL means "use the
--     defaults" (50/30/20). The engine reads these to compute the weighted
--     overall score, so adjusting them re-ranks the shortlist.
--
--  2. application_screenings.stale — set true whenever the opening's
--     requirements change, so the UI can prompt "requirements changed — re-rank"
--     (spec A1). A trigger on job_requirements flips it, so every edit path is
--     covered, not just the one server action.
-- =============================================================================

alter table public.job_openings
  add column if not exists scoring_weights jsonb;

alter table public.application_screenings
  add column if not exists stale boolean not null default false;

-- When an opening's requirements change, mark its screenings stale.
create or replace function public.mark_screenings_stale()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  opening uuid := coalesce(new.job_opening_id, old.job_opening_id);
begin
  update public.application_screenings
     set stale = true
   where job_opening_id = opening
     and stale = false;
  return coalesce(new, old);
end;
$$;

create trigger job_requirements_mark_stale
  after insert or update or delete on public.job_requirements
  for each row execute function public.mark_screenings_stale();
