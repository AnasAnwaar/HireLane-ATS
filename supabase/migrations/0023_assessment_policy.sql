-- =============================================================================
-- 0023 · Assessment policy & accessibility (spec §UC-5, CP-18)
-- =============================================================================
-- One policy row per organisation holding the DEFAULTS applied to every new
-- test (duration, proctoring, threshold, attempts, navigation, shuffle) and the
-- cap on how many retakes may be granted. Accommodations (extra time,
-- screen-reader mode) already live per-assignment on test_assignments; this adds
-- the org-wide policy an admin configures once.
-- =============================================================================

create table public.assessment_policies (
  organization_id           uuid             primary key references public.organizations(id) on delete cascade,
  default_proctoring_level  proctoring_level not null default 'standard',
  default_duration_minutes  int              not null default 30,
  default_passing_threshold int,
  default_attempts          int              not null default 1,
  default_allow_backtrack   boolean          not null default true,
  default_shuffle_questions boolean          not null default false,
  max_attempts              int              not null default 3,
  updated_by                uuid             references public.memberships(id) on delete set null,
  created_at                timestamptz      not null default now(),
  updated_at                timestamptz      not null default now(),
  constraint assessment_policies_threshold check (default_passing_threshold is null or default_passing_threshold between 0 and 100),
  constraint assessment_policies_attempts check (default_attempts >= 1),
  constraint assessment_policies_max_attempts check (max_attempts >= 1)
);

create trigger assessment_policies_set_updated_at before update on public.assessment_policies
  for each row execute function public.set_updated_at();

alter table public.assessment_policies enable row level security;
alter table public.assessment_policies force row level security;

-- Readable by anyone in the org (test creation reads the defaults); written
-- only by an admin with the AI/assessment policy permission.
create policy assessment_policies_select on public.assessment_policies
  for select to authenticated
  using (organization_id = public.current_org_id());
create policy assessment_policies_write on public.assessment_policies
  for all to authenticated
  using (organization_id = public.current_org_id() and public.has_permission('administration.configure_ai_policy'))
  with check (organization_id = public.current_org_id() and public.has_permission('administration.configure_ai_policy'));

grant select, insert, update, delete on public.assessment_policies to authenticated, service_role;
