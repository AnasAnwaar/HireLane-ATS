"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/server";
import { ALLOWED_CV_TYPES, MAX_CV_BYTES } from "@/lib/validation/apply";
import type { ActionResult } from "@/lib/validation/auth";
import { resolvePortalSession } from "@/server/candidates/portal-access";

/**
 * Actions the CANDIDATE performs from their portal (spec §UC-3). Every one
 * re-validates the token and operates only on that token's candidate — the
 * candidate can never touch another record. Runs with the admin client because
 * the candidate is unauthenticated; the token is the authorisation.
 */

const profileSchema = z.object({
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  location: z.string().trim().max(160).optional().or(z.literal("")),
  headline: z.string().trim().max(160).optional().or(z.literal("")),
  linkedinUrl: z.string().trim().max(300).optional().or(z.literal("")),
  portfolioUrl: z.string().trim().max(300).optional().or(z.literal("")),
  githubUrl: z.string().trim().max(300).optional().or(z.literal("")),
});

export async function updateOwnProfileAction(
  token: string,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const portal = await resolvePortalSession(token);
  if (!portal) return { ok: false, error: "This link has expired. Ask your contact for a new one." };

  const parsed = profileSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Please check the details and try again." };
  const d = parsed.data;

  const admin = createAdminClient();
  const { error } = await admin
    .from("candidates")
    .update({
      phone: d.phone || null,
      location: d.location || null,
      headline: d.headline || null,
      linkedin_url: d.linkedinUrl || null,
      portfolio_url: d.portfolioUrl || null,
      github_url: d.githubUrl || null,
    })
    .eq("id", portal.candidateId);

  if (error) return { ok: false, error: "Couldn't save your changes. Please try again." };

  revalidatePath(`/candidate/${token}`);
  return { ok: true, message: "Saved." };
}

export async function uploadOwnCvAction(
  token: string,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const portal = await resolvePortalSession(token);
  if (!portal) return { ok: false, error: "This link has expired. Ask your contact for a new one." };

  const cv = formData.get("cv");
  if (!(cv instanceof File) || cv.size === 0) {
    return { ok: false, error: "Please choose a file." };
  }
  if (cv.size > MAX_CV_BYTES) {
    return { ok: false, error: "That file is larger than 10 MB." };
  }
  if (!ALLOWED_CV_TYPES.includes(cv.type)) {
    return { ok: false, error: "Please upload a PDF or Word document." };
  }

  const admin = createAdminClient();
  const ext = cv.name.split(".").pop()?.toLowerCase() ?? "pdf";
  const storagePath = `${portal.organizationId}/${portal.candidateId}/cv-${Date.now()}.${ext}`;

  const { error: uploadError } = await admin.storage
    .from("candidate-documents")
    .upload(storagePath, cv, { contentType: cv.type, upsert: false });

  if (uploadError) return { ok: false, error: "Upload failed. Please try again." };

  await admin.from("documents").insert({
    organization_id: portal.organizationId,
    candidate_id: portal.candidateId,
    kind: "cv",
    storage_path: storagePath,
    file_name: cv.name.slice(0, 200),
    file_size: cv.size,
    mime_type: cv.type,
  });

  revalidatePath(`/candidate/${token}`);
  return { ok: true, message: "CV uploaded." };
}

/** The candidate withdraws from consideration — marks their applications withdrawn. */
export async function withdrawAction(token: string): Promise<ActionResult> {
  const portal = await resolvePortalSession(token);
  if (!portal) return { ok: false, error: "This link has expired." };

  const admin = createAdminClient();

  // Withdraw only active applications (not already hired/rejected/withdrawn).
  const { error } = await admin
    .from("applications")
    .update({ stage: "withdrawn" })
    .eq("candidate_id", portal.candidateId)
    .not("stage", "in", "(hired,rejected,withdrawn)");

  if (error) return { ok: false, error: "Something went wrong. Please try again." };

  // Revoke the link — nothing left to do in the portal.
  await admin
    .from("candidate_portal_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", portal.inviteId);

  revalidatePath(`/candidate/${token}`);
  return { ok: true, message: "You've withdrawn your application." };
}
