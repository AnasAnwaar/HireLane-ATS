-- =============================================================================
-- 0013 · Applicants (spec §UC-3)
-- =============================================================================
--   candidates    one person within an org, reused across openings (spec: "one
--                 person = one identity across openings")
--   applications  one candidate applying to one opening
--   documents     files (CVs, portfolios) in Supabase Storage
--
-- Applicants arrive from two paths:
--   1. The public apply form — an unauthenticated candidate. That path does NOT
--      touch these tables directly; it goes through a SECURITY DEFINER server
--      action that validates and inserts. So there is no `anon` RLS here.
--   2. Manual add by a member — ordinary RLS, gated on applicants.* permissions.
--
-- Application visibility follows the parent OPENING: if you can see the opening
-- (job_openings RLS already scopes that), you can see its applicants. This keeps
-- data-scope in one place rather than re-deriving it per table.
-- =============================================================================

create type application_stage as enum (
  'applied',
  'screened',
  'shortlisted',
  'test_assigned',
  'test_completed',
  'interview_scheduled',
  'interviewed',
  'offer',
  'hired',
  'rejected',
  'on_hold',
  'withdrawn'
);

create type document_kind as enum ('cv', 'portfolio', 'cover_letter', 'other');

-- -----------------------------------------------------------------------------
-- candidates — one identity per person per org (dedup by email).
-- -----------------------------------------------------------------------------
create table public.candidates (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  full_name       text        not null check (length(trim(full_name)) between 1 and 160),
  email           citext      not null,
  phone           text,
  location        text,
  headline        text,                 -- current title / one-line summary
  years_experience int         check (years_experience is null or years_experience between 0 and 80),
  linkedin_url    text,
  portfolio_url   text,
  github_url      text,
  -- Free-form skills captured at apply time or added later; the AI screening
  -- agent (CP-13) enriches this from the CV.
  skills          text[]      not null default '{}',
  created_by      uuid        references public.memberships(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, email)
);

create index candidates_org_idx on public.candidates (organization_id);

create trigger candidates_set_updated_at
  before update on public.candidates
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- applications — a candidate applied to an opening (one per pair).
-- -----------------------------------------------------------------------------
create table public.applications (
  id              uuid              primary key default gen_random_uuid(),
  organization_id uuid              not null references public.organizations(id) on delete cascade,
  candidate_id    uuid              not null references public.candidates(id) on delete cascade,
  job_opening_id  uuid              not null references public.job_openings(id) on delete cascade,
  stage           application_stage not null default 'applied',
  -- Channel attribution (spec §UC-2 R3): where this application came from.
  source          text,
  cover_note      text,
  -- Answers to the opening's screening questions, keyed by question id.
  screening_answers jsonb           not null default '{}',
  -- Null when the candidate self-applied; set when a member added them.
  created_by      uuid              references public.memberships(id) on delete set null,
  applied_at      timestamptz       not null default now(),
  updated_at      timestamptz       not null default now(),
  unique (candidate_id, job_opening_id)
);

create index applications_org_idx     on public.applications (organization_id);
create index applications_opening_idx on public.applications (job_opening_id, stage);
create index applications_candidate_idx on public.applications (candidate_id);

create trigger applications_set_updated_at
  before update on public.applications
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- documents — files attached to a candidate (and optionally an application).
-- The bytes live in Supabase Storage; this row is the metadata + path.
-- -----------------------------------------------------------------------------
create table public.documents (
  id              uuid          primary key default gen_random_uuid(),
  organization_id uuid          not null references public.organizations(id) on delete cascade,
  candidate_id    uuid          references public.candidates(id) on delete cascade,
  application_id  uuid          references public.applications(id) on delete cascade,
  kind            document_kind not null default 'cv',
  storage_path    text          not null,
  file_name       text          not null,
  file_size       int,
  mime_type       text,
  uploaded_by     uuid          references public.memberships(id) on delete set null,
  created_at      timestamptz   not null default now()
);

create index documents_candidate_idx on public.documents (candidate_id);
create index documents_org_idx       on public.documents (organization_id);

-- -----------------------------------------------------------------------------
-- Stage-change audit (mirrors the opening status audit).
-- -----------------------------------------------------------------------------
create or replace function public.audit_application_stage()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email citext;
  v_name  text;
  v_candidate text;
begin
  if tg_op = 'UPDATE' and new.stage is distinct from old.stage then
    select p.email, p.full_name into v_email, v_name
    from public.profiles p where p.id = auth.uid();

    select c.full_name into v_candidate from public.candidates c where c.id = new.candidate_id;

    insert into public.audit_log (
      organization_id, actor_membership_id, actor_email, actor_name,
      action, entity_type, entity_id, summary, before_state, after_state
    )
    values (
      new.organization_id, public.current_membership_id(), v_email, v_name,
      'application.stage_changed', 'application', new.id::text,
      format('%s: %s → %s', coalesce(v_candidate, 'Candidate'), old.stage, new.stage),
      jsonb_build_object('stage', old.stage),
      jsonb_build_object('stage', new.stage)
    );
  end if;
  return new;
end;
$$;

create trigger applications_audit_stage
  after update on public.applications
  for each row execute function public.audit_application_stage();

-- -----------------------------------------------------------------------------
-- Row-Level Security
-- -----------------------------------------------------------------------------
alter table public.candidates   enable row level security;
alter table public.applications enable row level security;
alter table public.documents    enable row level security;
alter table public.candidates   force row level security;
alter table public.applications force row level security;
alter table public.documents    force row level security;

-- candidates ------------------------------------------------------------------
create policy candidates_select on public.candidates
  for select to authenticated
  using (
    organization_id = public.current_org_id()
    and public.has_permission('applicants.view_list')
  );

create policy candidates_write on public.candidates
  for all to authenticated
  using (
    organization_id = public.current_org_id()
    and public.has_permission('applicants.import')
  )
  with check (
    organization_id = public.current_org_id()
    and public.has_permission('applicants.import')
  );

-- applications — visibility follows the parent opening (job_openings RLS scopes
-- which openings the caller sees; the EXISTS inherits that scope).
create policy applications_select on public.applications
  for select to authenticated
  using (
    organization_id = public.current_org_id()
    and public.has_permission('applicants.view_list')
    and exists (select 1 from public.job_openings o where o.id = job_opening_id)
  );

create policy applications_write on public.applications
  for all to authenticated
  using (
    organization_id = public.current_org_id()
    and public.has_permission('applicants.import')
    and exists (select 1 from public.job_openings o where o.id = job_opening_id)
  )
  with check (
    organization_id = public.current_org_id()
    and exists (select 1 from public.job_openings o where o.id = job_opening_id)
  );

-- Stage changes need the pipeline.advance permission (a lighter grant than the
-- full import capability), so recruiters can move candidates without editing them.
create policy applications_stage_update on public.applications
  for update to authenticated
  using (
    organization_id = public.current_org_id()
    and public.has_permission('pipeline.advance')
    and exists (select 1 from public.job_openings o where o.id = job_opening_id)
  )
  with check (organization_id = public.current_org_id());

-- documents — visible to anyone who can view the candidate; the actual file
-- bytes are separately gated by storage policies below.
create policy documents_select on public.documents
  for select to authenticated
  using (
    organization_id = public.current_org_id()
    and public.has_permission('applicants.view_profile')
  );

create policy documents_write on public.documents
  for all to authenticated
  using (
    organization_id = public.current_org_id()
    and public.has_permission('profile.upload_documents')
  )
  with check (
    organization_id = public.current_org_id()
    and public.has_permission('profile.upload_documents')
  );

-- -----------------------------------------------------------------------------
-- Storage bucket for candidate documents (private).
-- The public apply form uploads via the service role in a server action, so no
-- anon storage policy is needed. Authenticated members read their org's files;
-- the path is prefixed with the organization id, enforced here.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'candidate-documents',
  'candidate-documents',
  false,
  10485760, -- 10 MB
  array['application/pdf', 'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do nothing;

-- Read: an authenticated member may read a file whose path starts with an org id
-- they belong to and hold applicants.view_profile in.
create policy "candidate docs readable by org members"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'candidate-documents'
    and (storage.foldername(name))[1] = public.current_org_id()::text
    and public.has_permission('applicants.view_profile')
  );

create policy "candidate docs writable by uploaders"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'candidate-documents'
    and (storage.foldername(name))[1] = public.current_org_id()::text
    and public.has_permission('profile.upload_documents')
  );
