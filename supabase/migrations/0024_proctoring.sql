-- =============================================================================
-- 0024 · Proctoring capture (spec §UC-5.3, CP-19)
-- =============================================================================
-- The capture layer: browser + environment integrity events recorded against an
-- attempt, plus the per-attempt check-in photo and IP fingerprint. The AI
-- analysis and the Integrity Report land in CP-20/21.
--
-- Guardrails (spec §UC-5.3):
--   R1  no monitoring without recorded consent — the attempt's consent_at
--       (CP-16) gates capture; the consent copy names every signal (in the UI).
--   R2  the system FLAGS, never auto-rejects — events + a `flagged` boolean;
--       no trigger ever touches application.stage.
--   R4  every signal is probabilistic — events carry a severity and detail; the
--       raw evidence travels with them.
-- =============================================================================

create type proctoring_severity as enum ('low', 'medium', 'high');

create table public.proctoring_events (
  id              uuid                primary key default gen_random_uuid(),
  organization_id uuid                not null references public.organizations(id) on delete cascade,
  attempt_id      uuid                not null references public.test_attempts(id) on delete cascade,
  type            text                not null,   -- tab_switch | window_blur | fullscreen_exit | copy | paste | right_click | devtools | ip_change | multi_session | camera_denied | check_in
  severity        proctoring_severity not null default 'low',
  detail          jsonb               not null default '{}',
  occurred_at     timestamptz         not null default now(),
  created_at      timestamptz         not null default now()
);

create index proctoring_events_attempt_idx on public.proctoring_events (attempt_id, occurred_at);

-- Capture context on the attempt.
alter table public.test_attempts
  add column if not exists check_in_photo_path text,
  add column if not exists last_ip_hash        text,
  add column if not exists breach_count        int     not null default 0,
  add column if not exists flagged             boolean not null default false;

-- -----------------------------------------------------------------------------
-- RLS. Candidate writes go through the service role (they're unauthenticated);
-- HR reads the integrity signals with the proctoring permissions.
-- -----------------------------------------------------------------------------
alter table public.proctoring_events enable row level security;
alter table public.proctoring_events force row level security;

create policy proctoring_events_select on public.proctoring_events
  for select to authenticated
  using (
    organization_id = public.current_org_id()
    and (public.has_permission('proctoring.view_summary') or public.has_permission('proctoring.view_evidence'))
  );

-- Only an integrity-invalidation holder may mutate from the app side; the
-- candidate's capture path uses the service role and bypasses this.
create policy proctoring_events_write on public.proctoring_events
  for all to authenticated
  using (organization_id = public.current_org_id() and public.has_permission('proctoring.invalidate'))
  with check (organization_id = public.current_org_id() and public.has_permission('proctoring.invalidate'));

grant select, insert, update, delete on public.proctoring_events to authenticated, service_role;
