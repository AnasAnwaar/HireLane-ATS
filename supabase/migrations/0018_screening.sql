-- =============================================================================
-- 0018 · AI Screening (spec §UC-4, CP-13)
-- =============================================================================
-- One screening row per application holds the latest AI evaluation: an overall
-- relevance score, a per-criterion breakdown, must/nice-to-have coverage, and
-- cited highlights + concerns — so HR reads EVIDENCE, not raw CVs.
--
-- Guardrails baked in here and in the engine:
--   R1  every score is explainable — the breakdown/evidence travels with it.
--   R2  the agent only recommends; it never sets application.stage. Rejection
--       stays a human action. (No trigger touches applications from here.)
--   R3  protected attributes (gender, age, nationality, marital status, photo)
--       are never fed to the model — enforced in the engine's input builder.
--   R4  the model id and the exact inputs are stored per run for auditability.
-- =============================================================================

create type screening_status as enum ('scored', 'needs_manual_review', 'failed');
create type screening_recommendation as enum ('strong_fit', 'possible_fit', 'weak_fit');

create table public.application_screenings (
  id               uuid             primary key default gen_random_uuid(),
  organization_id  uuid             not null references public.organizations(id) on delete cascade,
  application_id   uuid             not null references public.applications(id)  on delete cascade,
  job_opening_id   uuid             not null references public.job_openings(id)  on delete cascade,

  status           screening_status not null default 'scored',
  score            int              check (score is null or score between 0 and 100),
  recommendation   screening_recommendation,
  summary          text,

  -- Explainability payloads (spec R1). Arrays of small objects; see the engine
  -- for their shape. Kept as jsonb so the schema can evolve without migrations.
  must_haves       jsonb            not null default '[]',
  nice_to_haves    jsonb            not null default '[]',
  criteria         jsonb            not null default '[]',
  highlights       jsonb            not null default '[]',
  concerns         jsonb            not null default '[]',

  -- Auditability (spec R4): which model, and the exact inputs it saw.
  model            text,
  inputs           jsonb,
  error            text,

  -- Human override (spec step 7) — recorded, reversible, never auto.
  override_recommendation screening_recommendation,
  override_reason  text,
  overridden_by    uuid             references public.memberships(id) on delete set null,
  overridden_at    timestamptz,

  -- Who triggered this run (null = automatic on application arrival).
  scored_by        uuid             references public.memberships(id) on delete set null,
  created_at       timestamptz      not null default now(),
  updated_at       timestamptz      not null default now(),

  unique (application_id)
);

create index application_screenings_opening_idx
  on public.application_screenings (job_opening_id, score desc nulls last);
create index application_screenings_org_idx
  on public.application_screenings (organization_id);

create trigger application_screenings_set_updated_at
  before update on public.application_screenings
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.application_screenings enable row level security;
alter table public.application_screenings force row level security;

-- Visible to viewers who may see the score, and only for applications they can
-- already see (the EXISTS is itself subject to applications' RLS scoping).
create policy application_screenings_select on public.application_screenings
  for select to authenticated
  using (
    organization_id = public.current_org_id()
    and (public.has_permission('screening.view_score') or public.has_permission('screening.view_report'))
    and exists (select 1 from public.applications a where a.id = application_id)
  );

-- Written by re-rank (whole engine) or override. The automatic on-arrival run
-- goes through the service role and bypasses RLS.
create policy application_screenings_write on public.application_screenings
  for all to authenticated
  using (
    organization_id = public.current_org_id()
    and (public.has_permission('screening.rerank') or public.has_permission('screening.override'))
    and exists (select 1 from public.applications a where a.id = application_id)
  )
  with check (
    organization_id = public.current_org_id()
    and exists (select 1 from public.applications a where a.id = application_id)
  );

grant select, insert, update, delete on public.application_screenings to authenticated, service_role;
