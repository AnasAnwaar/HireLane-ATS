-- =============================================================================
-- 0011 · Job openings (spec §UC-2, the requisition half)
-- =============================================================================
-- The first feature table. It sets the pattern every later feature follows:
--
--   * organization_id on every row, filtered by RLS (tenant isolation)
--   * created_by (a membership) so the 'own' data scope works
--   * department_id so the 'department' scope works
--   * reads/writes gated by has_permission() + can_access_record() in RLS
--
-- can_access_record() (migration 0005) turns a resolved scope into a per-row
-- decision, so scope logic stays in one place rather than being reinvented here.
-- =============================================================================

create type employment_type as enum (
  'full_time', 'part_time', 'contract', 'internship', 'temporary'
);

create type work_mode as enum ('on_site', 'hybrid', 'remote');

create type opening_status as enum (
  'draft', 'pending_approval', 'open', 'on_hold', 'closed'
);

-- -----------------------------------------------------------------------------
-- job_openings — one row per requisition (spec §UC-2 step 2)
-- -----------------------------------------------------------------------------
create table public.job_openings (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid            not null references public.organizations(id) on delete cascade,
  department_id      uuid            references public.departments(id) on delete set null,
  created_by         uuid            references public.memberships(id) on delete set null,

  title              text            not null check (length(trim(title)) between 2 and 160),
  employment_type    employment_type not null default 'full_time',
  work_mode          work_mode       not null default 'on_site',
  location           text,

  experience_min     int             check (experience_min is null or experience_min >= 0),
  experience_max     int             check (experience_max is null or experience_max >= 0),

  -- Salary is published to candidates only when salary_visible is true
  -- (spec §UC-2 R2). Storing it is always allowed; showing it is gated by the
  -- fields.view_salary permission in the app layer.
  salary_min         numeric(12, 2),
  salary_max         numeric(12, 2),
  salary_currency    char(3),
  salary_visible     boolean         not null default false,

  description        text            not null default '',
  positions          int             not null default 1 check (positions between 1 and 999),
  status             opening_status  not null default 'draft',
  application_deadline date,

  opened_at          timestamptz,
  closed_at          timestamptz,
  created_at         timestamptz     not null default now(),
  updated_at         timestamptz     not null default now(),

  check (experience_max is null or experience_min is null or experience_max >= experience_min),
  check (salary_max is null or salary_min is null or salary_max >= salary_min)
);

create index job_openings_org_idx        on public.job_openings (organization_id, status);
create index job_openings_department_idx on public.job_openings (department_id);
create index job_openings_created_by_idx on public.job_openings (created_by);

create trigger job_openings_set_updated_at
  before update on public.job_openings
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- job_requirements — must-haves, nice-to-haves, qualifications (spec §UC-2)
-- These feed the AI screening agent (CP-13), so they are structured rows rather
-- than free text.
-- -----------------------------------------------------------------------------
create type requirement_kind as enum (
  'must_have', 'nice_to_have', 'qualification', 'certification'
);

create table public.job_requirements (
  id             uuid primary key default gen_random_uuid(),
  job_opening_id uuid             not null references public.job_openings(id) on delete cascade,
  kind           requirement_kind not null,
  label          text             not null check (length(trim(label)) between 1 and 120),
  sort_order     int              not null default 0,
  created_at     timestamptz      not null default now()
);

create index job_requirements_opening_idx on public.job_requirements (job_opening_id, kind, sort_order);

-- -----------------------------------------------------------------------------
-- screening_questions — optional questions shown on the application form
-- (spec §UC-2 step 2). Answers are scored by the agent in CP-13.
-- -----------------------------------------------------------------------------
create table public.screening_questions (
  id             uuid primary key default gen_random_uuid(),
  job_opening_id uuid        not null references public.job_openings(id) on delete cascade,
  question       text        not null check (length(trim(question)) between 1 and 300),
  required       boolean     not null default true,
  sort_order     int         not null default 0,
  created_at     timestamptz not null default now()
);

create index screening_questions_opening_idx on public.screening_questions (job_opening_id, sort_order);

-- -----------------------------------------------------------------------------
-- Row-Level Security
--
-- Read: hold job_openings.view AND the row passes the resolved scope.
-- Write paths each require their own permission (create/edit/close). The scope
-- check applies to edit/delete too, so a Recruiter with 'assigned' scope cannot
-- edit an opening that isn't theirs even though they hold the edit permission.
-- -----------------------------------------------------------------------------
alter table public.job_openings       enable row level security;
alter table public.job_requirements   enable row level security;
alter table public.screening_questions enable row level security;
alter table public.job_openings       force row level security;
alter table public.job_requirements   force row level security;
alter table public.screening_questions force row level security;

-- job_openings ----------------------------------------------------------------
create policy job_openings_select on public.job_openings
  for select to authenticated
  using (
    organization_id = public.current_org_id()
    and public.can_access_record('job_openings.view', created_by, department_id)
  );

create policy job_openings_insert on public.job_openings
  for insert to authenticated
  with check (
    organization_id = public.current_org_id()
    and public.has_permission('job_openings.create')
  );

create policy job_openings_update on public.job_openings
  for update to authenticated
  using (
    organization_id = public.current_org_id()
    and public.has_permission('job_openings.edit')
    and public.can_access_record('job_openings.edit', created_by, department_id)
  )
  with check (organization_id = public.current_org_id());

create policy job_openings_delete on public.job_openings
  for delete to authenticated
  using (
    organization_id = public.current_org_id()
    and public.has_permission('job_openings.delete')
    and public.can_access_record('job_openings.delete', created_by, department_id)
  );

-- Child tables inherit access from their parent opening: if you can see/edit the
-- opening, you can see/edit its requirements and questions. A single EXISTS keeps
-- the rule in one place (the parent's policies).
create policy job_requirements_select on public.job_requirements
  for select to authenticated
  using (exists (select 1 from public.job_openings o where o.id = job_opening_id));

create policy job_requirements_write on public.job_requirements
  for all to authenticated
  using (
    exists (select 1 from public.job_openings o where o.id = job_opening_id)
    and public.has_permission('job_openings.edit')
  )
  with check (
    exists (select 1 from public.job_openings o where o.id = job_opening_id)
    and (public.has_permission('job_openings.edit') or public.has_permission('job_openings.create'))
  );

create policy screening_questions_select on public.screening_questions
  for select to authenticated
  using (exists (select 1 from public.job_openings o where o.id = job_opening_id));

create policy screening_questions_write on public.screening_questions
  for all to authenticated
  using (
    exists (select 1 from public.job_openings o where o.id = job_opening_id)
    and public.has_permission('job_openings.edit')
  )
  with check (
    exists (select 1 from public.job_openings o where o.id = job_opening_id)
    and (public.has_permission('job_openings.edit') or public.has_permission('job_openings.create'))
  );

-- -----------------------------------------------------------------------------
-- Audit: record status changes on openings (open / hold / close).
-- -----------------------------------------------------------------------------
create or replace function public.audit_opening_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email citext;
  v_name  text;
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    -- Left as null when there is no session profile (e.g. a service task);
    -- reading into variables means the audit row is written either way.
    select p.email, p.full_name into v_email, v_name
    from public.profiles p where p.id = auth.uid();

    insert into public.audit_log (
      organization_id, actor_membership_id, actor_email, actor_name,
      action, entity_type, entity_id, summary, before_state, after_state
    )
    values (
      new.organization_id,
      public.current_membership_id(),
      v_email, v_name,
      'opening.status_changed',
      'job_opening',
      new.id::text,
      format('"%s" %s → %s', new.title, old.status, new.status),
      jsonb_build_object('status', old.status),
      jsonb_build_object('status', new.status)
    );
  end if;
  return new;
end;
$$;

create trigger job_openings_audit_status
  after update on public.job_openings
  for each row execute function public.audit_opening_status();
