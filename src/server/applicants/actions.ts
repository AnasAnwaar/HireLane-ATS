"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { manualCandidateSchema } from "@/lib/validation/apply";
import { toFieldErrors, type ActionResult } from "@/lib/validation/auth";
import { authorize } from "@/server/auth/authorize";
import { getSessionContext } from "@/server/auth/session";
import type { ApplicationStage } from "@/types/database";

/**
 * Manually add a candidate to an opening (spec §UC-3 A1).
 *
 * Runs as the member through RLS — which requires applicants.import — so scope
 * and tenancy are enforced by the database. Dedups by email like the public
 * path does.
 */
export async function addCandidateAction(
  jobOpeningId: string,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Your session has expired." };

  const auth = await authorize("applicants.import");
  if (!auth.ok) return auth;

  const parsed = manualCandidateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please correct the highlighted fields.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  }

  const d = parsed.data;
  const supabase = await createClient();

  // Dedup by (org, email).
  const { data: existing } = await supabase
    .from("candidates")
    .select("id")
    .eq("organization_id", session.organizationId)
    .eq("email", d.email)
    .maybeSingle();

  let candidateId = existing?.id;

  const fields = {
    full_name: d.fullName,
    phone: d.phone || null,
    location: d.location || null,
    headline: d.headline || null,
    years_experience: d.yearsExperience,
  };

  if (candidateId) {
    await supabase.from("candidates").update(fields).eq("id", candidateId);
  } else {
    const { data: created, error } = await supabase
      .from("candidates")
      .insert({
        organization_id: session.organizationId,
        email: d.email,
        created_by: session.membershipId,
        ...fields,
      })
      .select("id")
      .single();
    if (error || !created) return { ok: false, error: error?.message ?? "Couldn't add the candidate." };
    candidateId = created.id;
  }

  // Already applied to this opening?
  const { data: existingApp } = await supabase
    .from("applications")
    .select("id")
    .eq("candidate_id", candidateId)
    .eq("job_opening_id", jobOpeningId)
    .maybeSingle();

  if (existingApp) {
    return { ok: false, error: "That candidate is already on this opening." };
  }

  const { error } = await supabase.from("applications").insert({
    organization_id: session.organizationId,
    candidate_id: candidateId,
    job_opening_id: jobOpeningId,
    source: d.source || "manual",
    stage: "applied",
    created_by: session.membershipId,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/openings/${jobOpeningId}/applicants`);
  return { ok: true, message: `${d.fullName} added.` };
}

/** Move an application to a new pipeline stage. */
export async function changeApplicationStageAction(
  applicationId: string,
  stage: ApplicationStage,
): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Your session has expired." };

  const auth = await authorize(stage === "rejected" ? "pipeline.reject" : "pipeline.advance");
  if (!auth.ok) return auth;

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("applications")
    .update({ stage })
    .eq("id", applicationId)
    .select("job_opening_id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };

  if (updated) revalidatePath(`/openings/${updated.job_opening_id}/applicants`);
  return { ok: true, message: "Stage updated." };
}
