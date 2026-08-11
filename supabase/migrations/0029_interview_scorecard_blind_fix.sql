-- =============================================================================
-- 0029 · Fix blind-scorecard recursion (CP-22)
-- =============================================================================
-- The 0028 interview_scorecards select policy referenced interview_scorecards
-- inside its own USING clause, which re-applies the policy → infinite recursion.
-- Move the "has the viewer submitted their own scorecard?" check into a
-- SECURITY DEFINER helper (owned by postgres, so it bypasses RLS and can't
-- recurse), and rebuild the policy to call it.
-- =============================================================================

create or replace function public.viewer_submitted_scorecard(p_interview uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.interview_scorecards s
    where s.interview_id = p_interview
      and s.membership_id = public.current_membership_id()
      and s.submitted
  );
$$;

grant execute on function public.viewer_submitted_scorecard(uuid) to authenticated, service_role;

drop policy if exists interview_scorecards_select on public.interview_scorecards;

create policy interview_scorecards_select on public.interview_scorecards
  for select to authenticated
  using (
    organization_id = public.current_org_id()
    and public.has_permission('interviews.view_schedule')
    and (
      membership_id = public.current_membership_id()          -- always your own
      or (
        submitted                                             -- others: only when submitted
        and (
          public.has_permission('interviews.view_others_scorecards')
          or public.viewer_submitted_scorecard(interview_id)  -- ...and you've submitted yours
        )
      )
    )
  );
