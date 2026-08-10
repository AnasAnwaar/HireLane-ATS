-- =============================================================================
-- 0020 · Assessments — test authoring (spec §UC-5.1, CP-15)
-- =============================================================================
--   tests           a test definition + its delivery settings (draft/published)
--   test_questions  the working set of questions for a test
--   test_versions   immutable published snapshots (spec R3: editing a published
--                   test creates a new version; in-flight attempts keep theirs)
--   question_bank   reusable, vetted questions at the org level
--
-- Guardrails:
--   R1  nothing goes live unreviewed — AI output lands as a `draft` test that
--       HR must explicitly publish.
--   R2  correct answers and rubrics live here but are NEVER selected into the
--       applicant's delivery payload (enforced by the CP-16 delivery query).
--   R3  publishing snapshots the test into test_versions; attempts bind to a
--       version, so later edits don't change an in-progress test.
-- =============================================================================

create type question_type as enum (
  'single_choice', 'multiple_choice', 'true_false', 'short_answer', 'long_answer', 'scenario'
);
create type test_status as enum ('draft', 'published', 'archived');
create type question_difficulty as enum ('easy', 'medium', 'hard');
create type proctoring_level as enum ('off', 'basic', 'standard', 'strict');

-- -----------------------------------------------------------------------------
create table public.tests (
  id                      uuid        primary key default gen_random_uuid(),
  organization_id         uuid        not null references public.organizations(id) on delete cascade,
  job_opening_id          uuid        references public.job_openings(id) on delete set null,
  title                   text        not null,
  instructions            text,
  status                  test_status not null default 'draft',
  version                 int         not null default 0,   -- latest published version (0 = never)
  has_unpublished_changes boolean     not null default false,

  -- Delivery settings, chosen at authoring time (spec step 6); used in CP-16.
  duration_minutes   int,
  passing_threshold  int,   -- percent 0-100
  shuffle_questions  boolean not null default false,
  shuffle_options    boolean not null default false,
  allow_backtrack    boolean not null default true,
  attempts_allowed   int     not null default 1,
  proctoring_level   proctoring_level not null default 'standard',
  is_bank_template   boolean not null default false,

  created_by  uuid references public.memberships(id) on delete set null,
  published_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint tests_threshold_range check (passing_threshold is null or passing_threshold between 0 and 100),
  constraint tests_attempts_positive check (attempts_allowed >= 1)
);

create index tests_org_idx     on public.tests (organization_id, status);
create index tests_opening_idx on public.tests (job_opening_id);

-- -----------------------------------------------------------------------------
create table public.test_questions (
  id              uuid                primary key default gen_random_uuid(),
  organization_id uuid                not null references public.organizations(id) on delete cascade,
  test_id         uuid                not null references public.tests(id) on delete cascade,
  sort_order      int                 not null default 0,
  type            question_type       not null,
  prompt          text                not null,
  options         jsonb               not null default '[]',   -- [{id,text}] for choice types
  correct_answers jsonb               not null default '[]',   -- option ids, or ['true']/['false']
  rubric          text,               -- model answer / rubric (written types) — never sent to applicant
  marks           int                 not null default 1,
  skill           text,               -- maps to a requirement/skill
  difficulty      question_difficulty not null default 'medium',
  created_at      timestamptz         not null default now(),
  updated_at      timestamptz         not null default now(),
  constraint test_questions_marks_positive check (marks >= 0)
);

create index test_questions_test_idx on public.test_questions (test_id, sort_order);

-- -----------------------------------------------------------------------------
create table public.test_versions (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  test_id         uuid        not null references public.tests(id) on delete cascade,
  version         int         not null,
  snapshot        jsonb       not null,   -- { test:{...}, questions:[...] } at publish time
  published_by    uuid        references public.memberships(id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (test_id, version)
);

-- -----------------------------------------------------------------------------
create table public.question_bank (
  id              uuid                primary key default gen_random_uuid(),
  organization_id uuid                not null references public.organizations(id) on delete cascade,
  type            question_type       not null,
  prompt          text                not null,
  options         jsonb               not null default '[]',
  correct_answers jsonb               not null default '[]',
  rubric          text,
  marks           int                 not null default 1,
  skill           text,
  difficulty      question_difficulty not null default 'medium',
  tags            text[]              not null default '{}',
  created_by      uuid                references public.memberships(id) on delete set null,
  created_at      timestamptz         not null default now(),
  updated_at      timestamptz         not null default now()
);

create index question_bank_org_idx on public.question_bank (organization_id);

-- updated_at triggers
create trigger tests_set_updated_at before update on public.tests
  for each row execute function public.set_updated_at();
create trigger test_questions_set_updated_at before update on public.test_questions
  for each row execute function public.set_updated_at();
create trigger question_bank_set_updated_at before update on public.question_bank
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.tests          enable row level security;
alter table public.test_questions enable row level security;
alter table public.test_versions  enable row level security;
alter table public.question_bank  enable row level security;
alter table public.tests          force row level security;
alter table public.test_questions force row level security;
alter table public.test_versions  force row level security;
alter table public.question_bank  force row level security;

-- Authors: create_manual / generate_ai / edit may write; view to read.
create policy tests_select on public.tests
  for select to authenticated
  using (organization_id = public.current_org_id() and public.has_permission('assessments.view'));
create policy tests_write on public.tests
  for all to authenticated
  using (
    organization_id = public.current_org_id()
    and (public.has_permission('assessments.create_manual')
         or public.has_permission('assessments.generate_ai')
         or public.has_permission('assessments.edit'))
  )
  with check (
    organization_id = public.current_org_id()
    and (public.has_permission('assessments.create_manual')
         or public.has_permission('assessments.generate_ai')
         or public.has_permission('assessments.edit'))
  );

create policy test_questions_select on public.test_questions
  for select to authenticated
  using (organization_id = public.current_org_id() and public.has_permission('assessments.view'));
create policy test_questions_write on public.test_questions
  for all to authenticated
  using (
    organization_id = public.current_org_id()
    and (public.has_permission('assessments.create_manual')
         or public.has_permission('assessments.generate_ai')
         or public.has_permission('assessments.edit'))
  )
  with check (
    organization_id = public.current_org_id()
    and (public.has_permission('assessments.create_manual')
         or public.has_permission('assessments.generate_ai')
         or public.has_permission('assessments.edit'))
  );

create policy test_versions_select on public.test_versions
  for select to authenticated
  using (organization_id = public.current_org_id() and public.has_permission('assessments.view'));
create policy test_versions_write on public.test_versions
  for all to authenticated
  using (organization_id = public.current_org_id() and public.has_permission('assessments.edit'))
  with check (organization_id = public.current_org_id() and public.has_permission('assessments.edit'));

create policy question_bank_select on public.question_bank
  for select to authenticated
  using (organization_id = public.current_org_id() and public.has_permission('assessments.view'));
create policy question_bank_write on public.question_bank
  for all to authenticated
  using (organization_id = public.current_org_id() and public.has_permission('assessments.manage_bank'))
  with check (organization_id = public.current_org_id() and public.has_permission('assessments.manage_bank'));

grant select, insert, update, delete on public.tests, public.test_questions, public.test_versions, public.question_bank to authenticated, service_role;
