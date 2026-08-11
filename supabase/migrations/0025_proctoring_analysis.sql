-- =============================================================================
-- 0025 · AI Proctoring Analysis (spec §UC-5.3, CP-20)
-- =============================================================================
-- Derives one integrity verdict per attempt from the CP-19 evidence: the
-- browser/environment event timeline plus the check-in photo. The model does
-- BEHAVIOURAL anomaly detection over the timeline and face analysis of the
-- check-in frame, attaching a confidence to every finding.
--
-- Guardrails (spec §UC-5.3):
--   R2  the verdict never auto-rejects — it's advisory; a human decides in the
--       Integrity Report (CP-21). No trigger touches application.stage.
--   R4  every signal is probabilistic — findings carry a 0..1 confidence and the
--       plain-language reasoning that produced them.
--
-- Continuous multi-face tracking and additional-voice (audio) detection need
-- continuous capture, which CP-19 does not record; they join when recording
-- lands with Video Interviews (CP-22). This checkpoint analyses what we capture.
-- =============================================================================

create type integrity_level as enum ('clear', 'low', 'medium', 'high');

create table public.proctoring_analyses (
  id              uuid            primary key default gen_random_uuid(),
  organization_id uuid            not null references public.organizations(id) on delete cascade,
  attempt_id      uuid            not null unique references public.test_attempts(id) on delete cascade,
  integrity_level integrity_level not null,
  confidence      numeric         not null default 0,   -- overall, 0..1
  summary         text            not null,             -- plain-language verdict
  findings        jsonb           not null default '[]', -- [{signal,label,severity,confidence,detail}]
  face            jsonb,                                 -- {analyzed,face_present,face_count,note} | null
  model           text            not null,
  analyzed_by     uuid            references public.memberships(id) on delete set null,
  analyzed_at     timestamptz     not null default now(),
  created_at      timestamptz     not null default now()
);

-- -----------------------------------------------------------------------------
-- RLS. The verdict is a read-side artifact of the integrity summary: anyone who
-- may view the summary may (re)generate and read it. Evidence-level access isn't
-- required to see the plain-language verdict.
-- -----------------------------------------------------------------------------
alter table public.proctoring_analyses enable row level security;
alter table public.proctoring_analyses force row level security;

create policy proctoring_analyses_select on public.proctoring_analyses
  for select to authenticated
  using (
    organization_id = public.current_org_id()
    and (public.has_permission('proctoring.view_summary') or public.has_permission('proctoring.view_evidence'))
  );

create policy proctoring_analyses_write on public.proctoring_analyses
  for all to authenticated
  using (organization_id = public.current_org_id() and public.has_permission('proctoring.view_summary'))
  with check (organization_id = public.current_org_id() and public.has_permission('proctoring.view_summary'));

grant select, insert, update, delete on public.proctoring_analyses to authenticated, service_role;
