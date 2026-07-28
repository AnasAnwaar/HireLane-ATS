-- =============================================================================
-- 0014 · Candidate notes (spec §UC-6 "Notes & Discussion")
-- =============================================================================
-- Notes carry a visibility scope so the same profile can hold a private
-- reminder, a note for the hiring team, and a management-only remark:
--
--   private     the author, plus anyone with fields.view_private_notes
--   team        anyone with profile.view_team_notes
--   management  anyone with profile.view_management_notes
--
-- The author always sees their own note regardless of scope. Visibility is
-- enforced in RLS, so a note the caller may not see is never returned — not
-- merely hidden in the UI.
-- =============================================================================

create type note_visibility as enum ('private', 'team', 'management');

create table public.candidate_notes (
  id                   uuid            primary key default gen_random_uuid(),
  organization_id      uuid            not null references public.organizations(id) on delete cascade,
  candidate_id         uuid            not null references public.candidates(id) on delete cascade,
  -- Optional: a note written in the context of a specific application.
  application_id       uuid            references public.applications(id) on delete set null,
  author_membership_id uuid            references public.memberships(id) on delete set null,
  body                 text            not null check (length(trim(body)) between 1 and 10000),
  visibility           note_visibility not null default 'team',
  edited_at            timestamptz,
  created_at           timestamptz     not null default now(),
  updated_at           timestamptz     not null default now()
);

create index candidate_notes_candidate_idx on public.candidate_notes (candidate_id, created_at desc);
create index candidate_notes_org_idx       on public.candidate_notes (organization_id);

create trigger candidate_notes_set_updated_at
  before update on public.candidate_notes
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.candidate_notes enable row level security;
alter table public.candidate_notes force row level security;

-- Read: you must be able to see the candidate AND the note's visibility must
-- grant you access (or you authored it).
create policy candidate_notes_select on public.candidate_notes
  for select to authenticated
  using (
    organization_id = public.current_org_id()
    and exists (select 1 from public.candidates c where c.id = candidate_id)
    and (
      author_membership_id = public.current_membership_id()
      or (visibility = 'private'    and public.has_permission('fields.view_private_notes'))
      or (visibility = 'team'       and public.has_permission('profile.view_team_notes'))
      or (visibility = 'management' and public.has_permission('profile.view_management_notes'))
    )
  );

-- Create: needs the add-note permission; the author is stamped to the caller so
-- it cannot be forged to someone else.
create policy candidate_notes_insert on public.candidate_notes
  for insert to authenticated
  with check (
    organization_id = public.current_org_id()
    and public.has_permission('profile.add_note')
    and author_membership_id = public.current_membership_id()
    and exists (select 1 from public.candidates c where c.id = candidate_id)
  );

-- Edit: only your own note, only with the edit-own permission.
create policy candidate_notes_update on public.candidate_notes
  for update to authenticated
  using (
    organization_id = public.current_org_id()
    and author_membership_id = public.current_membership_id()
    and public.has_permission('profile.edit_own_note')
  )
  with check (
    organization_id = public.current_org_id()
    and author_membership_id = public.current_membership_id()
  );

-- Delete: your own note (edit-own covers removal too).
create policy candidate_notes_delete on public.candidate_notes
  for delete to authenticated
  using (
    organization_id = public.current_org_id()
    and author_membership_id = public.current_membership_id()
    and public.has_permission('profile.edit_own_note')
  );
