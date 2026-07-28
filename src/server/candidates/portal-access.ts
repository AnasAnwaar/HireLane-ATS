import "server-only";

import { createAdminClient } from "@/lib/supabase/server";
import { hashToken } from "@/lib/token";
import type { ApplicationStage } from "@/types/database";

export type PortalSession = {
  inviteId: string;
  candidateId: string;
  organizationId: string;
  organizationName: string;
  candidate: {
    fullName: string;
    email: string;
    phone: string | null;
    location: string | null;
    headline: string | null;
    linkedinUrl: string | null;
    portfolioUrl: string | null;
    githubUrl: string | null;
  };
  applications: { jobTitle: string; stage: ApplicationStage; appliedAt: string }[];
  hasCv: boolean;
};

/**
 * Resolve a candidate-portal token to its session, or null if the link is
 * invalid, expired or revoked. Uses the admin client because the candidate is
 * unauthenticated; the token hash is the authorisation.
 *
 * `touch` records the access time (skip it in read-only metadata calls).
 */
export async function resolvePortalSession(
  rawToken: string,
  touch = false,
): Promise<PortalSession | null> {
  if (!rawToken || rawToken.length < 20) return null;

  const admin = createAdminClient();
  const { data: invite } = await admin
    .from("candidate_portal_invites")
    .select("id, candidate_id, organization_id, expires_at, revoked_at")
    .eq("token_hash", await hashToken(rawToken))
    .maybeSingle();

  if (!invite) return null;
  if (invite.revoked_at) return null;
  if (new Date(invite.expires_at) < new Date()) return null;

  const [{ data: candidate }, { data: org }, { data: apps }, { data: docs }] = await Promise.all([
    admin
      .from("candidates")
      .select("full_name, email, phone, location, headline, linkedin_url, portfolio_url, github_url")
      .eq("id", invite.candidate_id)
      .maybeSingle(),
    admin.from("organizations").select("name").eq("id", invite.organization_id).maybeSingle(),
    admin
      .from("applications")
      .select("stage, applied_at, job_openings(title)")
      .eq("candidate_id", invite.candidate_id)
      .order("applied_at", { ascending: false }),
    admin.from("documents").select("id").eq("candidate_id", invite.candidate_id).eq("kind", "cv").limit(1),
  ]);

  if (!candidate) return null;

  if (touch) {
    await admin
      .from("candidate_portal_invites")
      .update({ last_accessed_at: new Date().toISOString() })
      .eq("id", invite.id);
  }

  return {
    inviteId: invite.id,
    candidateId: invite.candidate_id,
    organizationId: invite.organization_id,
    organizationName: org?.name ?? "the company",
    candidate: {
      fullName: candidate.full_name,
      email: candidate.email,
      phone: candidate.phone,
      location: candidate.location,
      headline: candidate.headline,
      linkedinUrl: candidate.linkedin_url,
      portfolioUrl: candidate.portfolio_url,
      githubUrl: candidate.github_url,
    },
    applications: (apps ?? []).map((a) => ({
      jobTitle: a.job_openings?.title ?? "a role",
      stage: a.stage as ApplicationStage,
      appliedAt: a.applied_at,
    })),
    hasCv: (docs ?? []).length > 0,
  };
}
