-- =============================================================================
-- 0033 · Async video interviews (spec §UC-7, CP-22)
-- =============================================================================
-- A one-way interview: HR sets questions, the candidate records a video answer
-- to each on their own time (via their portal link), and the panel reviews +
-- scores later. Answer videos live in the private interview-recordings bucket;
-- the candidate uploads them with a short-lived signed upload URL (they're
-- unauthenticated, so no session-based RLS applies to their write).
-- =============================================================================

alter table public.interviews
  add column if not exists is_async        boolean not null default false,
  add column if not exists async_questions jsonb   not null default '[]';
  -- async_questions: [{ prompt, max_seconds }]

create table public.interview_answers (
  id               uuid        primary key default gen_random_uuid(),
  organization_id  uuid        not null references public.organizations(id) on delete cascade,
  interview_id     uuid        not null references public.interviews(id) on delete cascade,
  question_index   int         not null,
  video_path       text        not null,
  duration_seconds int,
  created_at       timestamptz not null default now(),
  unique (interview_id, question_index)
);

create index interview_answers_interview_idx on public.interview_answers (interview_id);

alter table public.interview_answers enable row level security;
alter table public.interview_answers force row level security;

-- HR reads answers with view_schedule. The candidate writes via the service role
-- (token-gated server action), which bypasses RLS — no authenticated write policy.
create policy interview_answers_select on public.interview_answers
  for select to authenticated
  using (organization_id = public.current_org_id() and public.has_permission('interviews.view_schedule'));

grant select, insert, update, delete on public.interview_answers to authenticated, service_role;
