-- =============================================================================
-- 0021 · Test assignment & delivery (spec §UC-5.2, CP-16)
-- =============================================================================
--   test_assignments  a published test given to one applicant, with a deadline
--   test_attempts     one run of an assignment; pinned to the published VERSION
--                     the candidate took (spec R3) — later edits don't affect it
--   test_answers      per-question responses, auto-saved continuously
--
-- The candidate is unauthenticated: they reach delivery through their portal
-- token, and all candidate writes go through validated server actions on the
-- service role. RLS here protects the HR/org side. The delivery payload sent to
-- the browser NEVER includes correct answers or rubrics (spec R2) — enforced in
-- the delivery query, not here.
-- =============================================================================

create type test_assignment_status as enum ('assigned', 'in_progress', 'submitted', 'expired', 'cancelled');
create type test_attempt_status as enum ('in_progress', 'submitted', 'expired');

create table public.test_assignments (
  id                 uuid                   primary key default gen_random_uuid(),
  organization_id    uuid                   not null references public.organizations(id) on delete cascade,
  test_id            uuid                   not null references public.tests(id) on delete cascade,
  application_id     uuid                   not null references public.applications(id) on delete cascade,
  candidate_id       uuid                   not null references public.candidates(id) on delete cascade,
  status             test_assignment_status not null default 'assigned',
  deadline           timestamptz,
  attempts_allowed   int                    not null default 1,
  attempts_used      int                    not null default 0,
  extra_time_minutes int                    not null default 0,
  screen_reader_mode boolean                not null default false,
  assigned_by        uuid                   references public.memberships(id) on delete set null,
  created_at         timestamptz            not null default now(),
  updated_at         timestamptz            not null default now(),
  constraint test_assignments_attempts_positive check (attempts_allowed >= 1),
  unique (test_id, application_id)
);

create index test_assignments_app_idx  on public.test_assignments (application_id);
create index test_assignments_cand_idx on public.test_assignments (candidate_id);

create table public.test_attempts (
  id              uuid                primary key default gen_random_uuid(),
  organization_id uuid                not null references public.organizations(id) on delete cascade,
  assignment_id   uuid                not null references public.test_assignments(id) on delete cascade,
  test_id         uuid                not null references public.tests(id) on delete cascade,
  version         int                 not null,   -- published version taken (test_versions)
  question_order  jsonb               not null default '[]',   -- [questionId,...] delivery order
  option_orders   jsonb               not null default '{}',   -- {questionId:[optionId,...]}
  status          test_attempt_status not null default 'in_progress',
  started_at      timestamptz         not null default now(),
  expires_at      timestamptz         not null,
  submitted_at    timestamptz,
  consent_at      timestamptz,
  auto_score      numeric,
  max_score       numeric,
  created_at      timestamptz         not null default now(),
  updated_at      timestamptz         not null default now()
);

create index test_attempts_assignment_idx on public.test_attempts (assignment_id);

create table public.test_answers (
  id           uuid        primary key default gen_random_uuid(),
  organization_id uuid     not null references public.organizations(id) on delete cascade,
  attempt_id   uuid        not null references public.test_attempts(id) on delete cascade,
  question_id  uuid        not null,
  response     jsonb       not null default '{}',   -- {selected:[optionId]} | {text:"..."}
  awarded_marks numeric,
  is_correct   boolean,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (attempt_id, question_id)
);

create index test_answers_attempt_idx on public.test_answers (attempt_id);

create trigger test_assignments_set_updated_at before update on public.test_assignments
  for each row execute function public.set_updated_at();
create trigger test_attempts_set_updated_at before update on public.test_attempts
  for each row execute function public.set_updated_at();
create trigger test_answers_set_updated_at before update on public.test_answers
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- RLS (HR / org side). Candidate writes bypass via the service role.
-- -----------------------------------------------------------------------------
alter table public.test_assignments enable row level security;
alter table public.test_attempts    enable row level security;
alter table public.test_answers     enable row level security;
alter table public.test_assignments force row level security;
alter table public.test_attempts    force row level security;
alter table public.test_answers     force row level security;

create policy test_assignments_select on public.test_assignments
  for select to authenticated
  using (organization_id = public.current_org_id() and public.has_permission('assessments.view'));
create policy test_assignments_write on public.test_assignments
  for all to authenticated
  using (organization_id = public.current_org_id() and public.has_permission('assessments.assign'))
  with check (organization_id = public.current_org_id() and public.has_permission('assessments.assign'));

create policy test_attempts_select on public.test_attempts
  for select to authenticated
  using (organization_id = public.current_org_id() and public.has_permission('assessments.view'));
create policy test_attempts_write on public.test_attempts
  for all to authenticated
  using (organization_id = public.current_org_id() and public.has_permission('assessments.assign'))
  with check (organization_id = public.current_org_id() and public.has_permission('assessments.assign'));

-- Answers carry the candidate's responses — gate reads on view_answers.
create policy test_answers_select on public.test_answers
  for select to authenticated
  using (organization_id = public.current_org_id() and public.has_permission('assessments.view_answers'));
create policy test_answers_write on public.test_answers
  for all to authenticated
  using (organization_id = public.current_org_id() and public.has_permission('assessments.confirm_grades'))
  with check (organization_id = public.current_org_id() and public.has_permission('assessments.confirm_grades'));

grant select, insert, update, delete on public.test_assignments, public.test_attempts, public.test_answers to authenticated, service_role;
