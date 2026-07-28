-- =============================================================================
-- 0015 · Candidate portal invitations (spec §UC-3)
-- =============================================================================
-- When HR "connects" with an applicant, the system issues a unique, expiring,
-- signed link to a Candidate Portal. Candidates are NOT auth users — they never
-- log in to the main app — so access is by link alone (magic-link style):
--
--   /candidate/<raw-token>   →   validated against token_hash here
--
-- Only the SHA-256 hash of the token is stored, so a database leak cannot be
-- replayed as a working link. The portal reads/writes through a SECURITY-DEFINER
-- server action (admin client) after validating the token; there is therefore
-- no `anon` RLS on this table.
-- =============================================================================

create table public.candidate_portal_invites (
  id               uuid        primary key default gen_random_uuid(),
  organization_id  uuid        not null references public.organizations(id) on delete cascade,
  candidate_id     uuid        not null references public.candidates(id) on delete cascade,
  token_hash       text        not null unique,
  expires_at       timestamptz not null,
  revoked_at       timestamptz,
  last_accessed_at timestamptz,
  created_by       uuid        references public.memberships(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (expires_at > created_at)
);

create index candidate_portal_invites_candidate_idx on public.candidate_portal_invites (candidate_id);
create index candidate_portal_invites_org_idx       on public.candidate_portal_invites (organization_id);

-- Only one live (un-revoked) invite per candidate — reissuing revokes the old.
create unique index candidate_portal_invites_one_live
  on public.candidate_portal_invites (candidate_id)
  where revoked_at is null;

create trigger candidate_portal_invites_set_updated_at
  before update on public.candidate_portal_invites
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- RLS — members with the invitation permission manage these; the candidate's
-- own access is via the token-validated admin path, not RLS.
-- -----------------------------------------------------------------------------
alter table public.candidate_portal_invites enable row level security;
alter table public.candidate_portal_invites force row level security;

create policy candidate_portal_invites_select on public.candidate_portal_invites
  for select to authenticated
  using (
    organization_id = public.current_org_id()
    and public.has_permission('applicants.send_invitation')
  );

create policy candidate_portal_invites_write on public.candidate_portal_invites
  for all to authenticated
  using (
    organization_id = public.current_org_id()
    and public.has_permission('applicants.send_invitation')
  )
  with check (
    organization_id = public.current_org_id()
    and public.has_permission('applicants.send_invitation')
  );
