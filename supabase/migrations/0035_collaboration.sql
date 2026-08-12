-- =============================================================================
-- 0035 · Notes & Collaboration (spec §UC-6, CP-23)
-- =============================================================================
--   • threaded notes + @mentions on candidate_notes
--   • notifications (mentions / replies) delivered to a member's bell
--   • candidate competency scorecards (per-reviewer, aggregated)
--   • conflict-of-interest declarations
-- =============================================================================

-- -- Threaded notes + mentions ------------------------------------------------
alter table public.candidate_notes
  add column if not exists parent_id uuid references public.candidate_notes(id) on delete cascade,
  add column if not exists mentions  jsonb not null default '[]';  -- [{membership_id, name}]

create index if not exists candidate_notes_parent_idx on public.candidate_notes (parent_id);

-- -- Notifications -----------------------------------------------------------
create table public.notifications (
  id                     uuid        primary key default gen_random_uuid(),
  organization_id        uuid        not null references public.organizations(id) on delete cascade,
  recipient_membership_id uuid       not null references public.memberships(id) on delete cascade,
  actor_membership_id    uuid        references public.memberships(id) on delete set null,
  type                   text        not null,   -- mention | note_reply
  candidate_id           uuid        references public.candidates(id) on delete cascade,
  note_id                uuid        references public.candidate_notes(id) on delete cascade,
  body                   text,
  read_at                timestamptz,
  created_at             timestamptz not null default now()
);

create index notifications_recipient_idx on public.notifications (recipient_membership_id, created_at desc);

alter table public.notifications enable row level security;
alter table public.notifications force row level security;

-- You only ever see, and mark read, your OWN notifications.
create policy notifications_select on public.notifications
  for select to authenticated
  using (organization_id = public.current_org_id() and recipient_membership_id = public.current_membership_id());
create policy notifications_update on public.notifications
  for update to authenticated
  using (organization_id = public.current_org_id() and recipient_membership_id = public.current_membership_id())
  with check (organization_id = public.current_org_id() and recipient_membership_id = public.current_membership_id());
-- Inserts come from the note action via the service role (fan-out to recipients).

grant select, insert, update, delete on public.notifications to authenticated, service_role;

-- -- Candidate competency scorecards ------------------------------------------
create table public.candidate_scorecards (
  id                   uuid                     primary key default gen_random_uuid(),
  organization_id      uuid                     not null references public.organizations(id) on delete cascade,
  candidate_id         uuid                     not null references public.candidates(id) on delete cascade,
  application_id       uuid                     references public.applications(id) on delete set null,
  author_membership_id uuid                     not null references public.memberships(id) on delete cascade,
  competencies         jsonb                    not null default '[]',  -- [{name, rating 1-5}]
  overall              int,                     -- 1-5
  recommendation       scorecard_recommendation,
  comment              text,
  submitted            boolean                  not null default false,
  submitted_at         timestamptz,
  created_at           timestamptz              not null default now(),
  updated_at           timestamptz              not null default now(),
  unique (candidate_id, author_membership_id),
  constraint candidate_scorecard_overall_range check (overall is null or overall between 1 and 5)
);

create index candidate_scorecards_candidate_idx on public.candidate_scorecards (candidate_id);

create trigger candidate_scorecards_set_updated_at before update on public.candidate_scorecards
  for each row execute function public.set_updated_at();

alter table public.candidate_scorecards enable row level security;
alter table public.candidate_scorecards force row level security;

-- Read: your own always; others' once submitted, if you can view the profile.
create policy candidate_scorecards_select on public.candidate_scorecards
  for select to authenticated
  using (
    organization_id = public.current_org_id()
    and public.has_permission('applicants.view_profile')
    and (author_membership_id = public.current_membership_id() or submitted)
  );
-- Write only your own, with the scorecard permission.
create policy candidate_scorecards_write on public.candidate_scorecards
  for all to authenticated
  using (
    organization_id = public.current_org_id()
    and public.has_permission('interviews.submit_scorecard')
    and author_membership_id = public.current_membership_id()
  )
  with check (
    organization_id = public.current_org_id()
    and public.has_permission('interviews.submit_scorecard')
    and author_membership_id = public.current_membership_id()
  );

grant select, insert, update, delete on public.candidate_scorecards to authenticated, service_role;

-- -- Conflict-of-interest declarations ----------------------------------------
create table public.conflict_declarations (
  id            uuid        primary key default gen_random_uuid(),
  organization_id uuid      not null references public.organizations(id) on delete cascade,
  candidate_id  uuid        not null references public.candidates(id) on delete cascade,
  membership_id uuid        not null references public.memberships(id) on delete cascade,
  reason        text,
  created_at    timestamptz not null default now(),
  unique (candidate_id, membership_id)
);

create index conflict_declarations_candidate_idx on public.conflict_declarations (candidate_id);

alter table public.conflict_declarations enable row level security;
alter table public.conflict_declarations force row level security;

-- Anyone who can view the profile sees declared conflicts (transparency); you
-- may only declare/withdraw your own.
create policy conflict_declarations_select on public.conflict_declarations
  for select to authenticated
  using (organization_id = public.current_org_id() and public.has_permission('applicants.view_profile'));
create policy conflict_declarations_write on public.conflict_declarations
  for all to authenticated
  using (organization_id = public.current_org_id() and membership_id = public.current_membership_id())
  with check (organization_id = public.current_org_id() and membership_id = public.current_membership_id());

grant select, insert, update, delete on public.conflict_declarations to authenticated, service_role;
