"use server";

import { revalidatePath } from "next/cache";

import { clientEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { generateToken, hashToken } from "@/lib/token";
import { emailLayout, sendEmail } from "@/server/email/send";
import type { ActionResult } from "@/lib/validation/auth";
import { authorize } from "@/server/auth/authorize";
import { getSessionContext } from "@/server/auth/session";

const INVITE_TTL_DAYS = 14;

/**
 * "Connect with applicant" (spec §UC-3): issue a signed, expiring link to the
 * candidate portal. Reissuing revokes any previous live link (enforced by a
 * partial unique index), so only one works at a time.
 *
 * Returns the full URL so the caller can copy or email it. The raw token is
 * never persisted — only its hash — so it exists only in this response.
 */
export async function issuePortalInviteAction(
  candidateId: string,
): Promise<{ ok: true; url: string; expiresAt: string } | { ok: false; error: string }> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Your session has expired." };

  const auth = await authorize("applicants.send_invitation");
  if (!auth.ok) return auth;

  const supabase = await createClient();

  // Confirm the candidate is in the caller's org (RLS also enforces this).
  const { data: candidate } = await supabase
    .from("candidates")
    .select("id, full_name, email")
    .eq("id", candidateId)
    .maybeSingle();
  if (!candidate) return { ok: false, error: "Candidate not found." };

  // Revoke any existing live invite so the partial unique index is free.
  await supabase
    .from("candidate_portal_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("candidate_id", candidateId)
    .is("revoked_at", null);

  const raw = generateToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86400_000).toISOString();

  const { error } = await supabase.from("candidate_portal_invites").insert({
    organization_id: session.organizationId,
    candidate_id: candidateId,
    token_hash: await hashToken(raw),
    expires_at: expiresAt,
    created_by: session.membershipId,
  });

  if (error) return { ok: false, error: error.message };

  await supabase.from("audit_log").insert({
    organization_id: session.organizationId,
    actor_membership_id: session.membershipId,
    actor_email: session.email,
    actor_name: session.fullName,
    action: "candidate.portal_invited",
    entity_type: "candidate",
    entity_id: candidateId,
    summary: "Issued a candidate portal link.",
  });

  const url = `${clientEnv.NEXT_PUBLIC_APP_URL}/candidate/${raw}`;

  // Best-effort email of the link to the candidate (no-op without a mail key).
  if (candidate.email) {
    await sendEmail({
      to: candidate.email,
      subject: `Your ${session.organizationName} application portal`,
      html: emailLayout({
        heading: `Hi ${candidate.full_name?.split(" ")[0] || "there"},`,
        intro: `${session.organizationName} has set up a secure space where you can track your application, complete assessments and record video interviews.`,
        ctaLabel: "Open your portal",
        ctaUrl: url,
        footnote: "This private link is just for you and expires in a few days.",
      }),
    });
  }

  revalidatePath(`/candidates/${candidateId}`);
  return { ok: true, url, expiresAt };
}

/** Revoke the candidate's live portal link. */
export async function revokePortalInviteAction(candidateId: string): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Your session has expired." };

  const auth = await authorize("applicants.send_invitation");
  if (!auth.ok) return auth;

  const supabase = await createClient();
  const { error } = await supabase
    .from("candidate_portal_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("candidate_id", candidateId)
    .is("revoked_at", null);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/candidates/${candidateId}`);
  return { ok: true, message: "Portal link revoked." };
}
