-- =============================================================================
-- 0028 · Video Interviews (spec §UC-7, CP-22)
-- =============================================================================
--   interviews            a scheduled interview for one application, with a
--                         panel, an external video link and a lifecycle
--   interview_panelists   the interviewers on the panel
--   interview_scorecards  one blind scorecard per panelist per interview
--
-- The live room is external (a pasted Zoom/Meet link) plus in-app collaboration
-- (chat + shared code pad over Supabase Realtime — no tables needed). Recording
-- and transcription are handled by the external tool.
--
-- Guardrails (spec §UC-7):
--   R  scorecards are BLIND — an interviewer sees another's scorecard only once
--      their own is submitted (or they hold interviews.view_others_scorecards),
--      so panellists don't anchor on each other. Enforced in RLS below.
-- =============================================================================

create type interview_mode as enum ('video', 'phone', 'onsite');
create type interview_status as enum ('scheduled', 'completed', 'cancelled', 'no_show');
create type scorecard_recommendation as enum ('strong_yes', 'yes', 'no', 'strong_no');

create table public.interviews (
  id               uuid             primary key default gen_random_uuid(),
  organization_id  uuid             not null references public.organizations(id) on delete cascade,
  application_id   uuid             not null references public.applications(id) on delete cascade,
  candidate_id     uuid             not null references public.candidates(id) on delete cascade,
  job_opening_id   uuid             references public.job_openings(id) on delete set null,
  title            text             not null default 'Interview',
  round            text,
  mode             interview_mode   not null default 'video',
  scheduled_at     timestamptz      not null,
  duration_minutes int              not null default 45,
  timezone         text             not null default 'UTC',
  video_link       text,
  location         text,
  status           interview_status not null default 'scheduled',
  shared_notes     text,            -- persisted from the in-app room
  created_by       uuid             references public.memberships(id) on delete set null,
  created_at       timestamptz      not null default now(),
  updated_at       timestamptz      not null default now(),
  constraint interviews_duration_positive check (duration_minutes between 5 and 480)
);

create index interviews_org_time_idx on public.interviews (organization_id, scheduled_at);
create index interviews_application_idx on public.interviews (application_id);

create table public.interview_panelists (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  interview_id    uuid        not null references public.interviews(id) on delete cascade,
  membership_id   uuid        not null references public.memberships(id) on delete cascade,
  created_at      timestamptz not null default now(),
  unique (interview_id, membership_id)
);

create index interview_panelists_interview_idx on public.interview_panelists (interview_id);

create table public.interview_scorecards (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  interview_id    uuid        not null references public.interviews(id) on delete cascade,
  membership_id   uuid        not null references public.memberships(id) on delete cascade,
  recommendation  scorecard_recommendation,
  rating          int,        -- overall 1-5
  strengths       text,
  concerns        text,
  notes           text,
  submitted       boolean     not null default false,
  submitted_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (interview_id, membership_id),
  constraint scorecard_rating_range check (rating is null or rating between 1 and 5)
);

create index interview_scorecards_interview_idx on public.interview_scorecards (interview_id);

create trigger interviews_set_updated_at before update on public.interviews
  for each row execute function public.set_updated_at();
create trigger interview_scorecards_set_updated_at before update on public.interview_scorecards
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.interviews           enable row level security;
alter table public.interview_panelists  enable row level security;
alter table public.interview_scorecards enable row level security;
alter table public.interviews           force row level security;
alter table public.interview_panelists  force row level security;
alter table public.interview_scorecards force row level security;

create policy interviews_select on public.interviews
  for select to authenticated
  using (organization_id = public.current_org_id() and public.has_permission('interviews.view_schedule'));
create policy interviews_write on public.interviews
  for all to authenticated
  using (organization_id = public.current_org_id() and public.has_permission('interviews.schedule'))
  with check (organization_id = public.current_org_id() and public.has_permission('interviews.schedule'));

create policy interview_panelists_select on public.interview_panelists
  for select to authenticated
  using (organization_id = public.current_org_id() and public.has_permission('interviews.view_schedule'));
create policy interview_panelists_write on public.interview_panelists
  for all to authenticated
  using (organization_id = public.current_org_id() and public.has_permission('interviews.schedule'))
  with check (organization_id = public.current_org_id() and public.has_permission('interviews.schedule'));

-- Scorecards are BLIND. You can always see your own. You see another panellist's
-- only once it's submitted AND either you hold view_others_scorecards or your own
-- scorecard is already submitted — so nobody anchors on a peer's rating early.
create policy interview_scorecards_select on public.interview_scorecards
  for select to authenticated
  using (
    organization_id = public.current_org_id()
    and public.has_permission('interviews.view_schedule')
    and (
      membership_id = public.current_membership_id()
      or (
        submitted
        and (
          public.has_permission('interviews.view_others_scorecards')
          or exists (
            select 1 from public.interview_scorecards mine
            where mine.interview_id = interview_scorecards.interview_id
              and mine.membership_id = public.current_membership_id()
              and mine.submitted
          )
        )
      )
    )
  );

-- You may only write your OWN scorecard, and only with submit_scorecard.
create policy interview_scorecards_write on public.interview_scorecards
  for all to authenticated
  using (
    organization_id = public.current_org_id()
    and public.has_permission('interviews.submit_scorecard')
    and membership_id = public.current_membership_id()
  )
  with check (
    organization_id = public.current_org_id()
    and public.has_permission('interviews.submit_scorecard')
    and membership_id = public.current_membership_id()
  );

grant select, insert, update, delete on
  public.interviews, public.interview_panelists, public.interview_scorecards
  to authenticated, service_role;
