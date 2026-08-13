"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { recommendationForScore } from "@/lib/screening-display";
import { coerceWeights, weightedScore } from "@/lib/scoring-weights";
import type { ActionResult } from "@/lib/validation/auth";
import type { CriterionScore, ScoringWeights, ScreeningRecommendation } from "@/types/database";
import { authorize } from "@/server/auth/authorize";
import { getSessionContext } from "@/server/auth/session";
import { requireFeature } from "@/server/billing/entitlements";
import { isAiConfigured } from "@/server/ai/gemini";

import { screenApplication } from "./screen";

async function guard() {
  const session = await getSessionContext();
  if (!session) return { ok: false as const, error: "Your session has expired." };
  if (!isAiConfigured()) {
    return { ok: false as const, error: "AI screening isn't set up yet — a Gemini API key is required." };
  }
  const auth = await authorize("screening.rerank");
  if (!auth.ok) return { ok: false as const, error: auth.error };
  return { ok: true as const, organizationId: session.organizationId, membershipId: session.membershipId };
}

/** Screen (or re-screen) a single application on demand. */
export async function screenApplicationAction(applicationId: string): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return g;
  const feat = await requireFeature(g.organizationId, "ai_screening");
  if (!feat.ok) return feat;

  const db = await createClient();
  const result = await screenApplication(db, g.organizationId, applicationId, g.membershipId);

  const { data: app } = await db
    .from("applications")
    .select("job_opening_id")
    .eq("id", applicationId)
    .maybeSingle();
  if (app) revalidatePath(`/openings/${app.job_opening_id}/applicants`);

  if (!result.ok) return { ok: false, error: result.error };
  return {
    ok: true,
    message: result.status === "needs_manual_review" ? "Flagged for manual review." : "Applicant screened.",
  };
}

/** Re-rank All (spec §UC-4 step 1 / A1): score every applicant for an opening. */
export async function rerankOpeningAction(openingId: string): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return g;
  const feat = await requireFeature(g.organizationId, "ai_screening");
  if (!feat.ok) return feat;

  const db = await createClient();
  const { data: apps } = await db.from("applications").select("id").eq("job_opening_id", openingId);
  const ids = (apps ?? []).map((a) => a.id);
  if (ids.length === 0) return { ok: false, error: "No applicants to screen yet." };

  let scored = 0;
  let failed = 0;
  // Sequential to stay within the AI rate limit.
  for (const id of ids) {
    const r = await screenApplication(db, g.organizationId, id, g.membershipId);
    if (r.ok) scored++;
    else failed++;
  }

  await db.from("audit_log").insert({
    organization_id: g.organizationId,
    actor_membership_id: g.membershipId,
    action: "screening.reranked",
    entity_type: "job_opening",
    entity_id: openingId,
    summary: `Re-ranked ${scored} applicant${scored === 1 ? "" : "s"}`,
  });
  revalidatePath(`/openings/${openingId}/applicants`);

  if (scored === 0) return { ok: false, error: "Screening failed for every applicant." };
  return {
    ok: true,
    message: failed ? `Screened ${scored}, ${failed} failed.` : `Screened all ${scored} applicants.`,
  };
}

/**
 * Adjust an opening's scoring weights and instantly re-rank (spec §UC-4 A3).
 * Re-weighting only re-blends each screening's stored sub-scores, so this needs
 * NO new AI calls — it's an instant, deterministic recompute.
 */
export async function updateScoringWeightsAction(
  openingId: string,
  weightsInput: ScoringWeights,
): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Your session has expired." };
  const auth = await authorize("screening.adjust_weights");
  if (!auth.ok) return auth;

  const weights = coerceWeights(weightsInput);
  const db = await createClient();

  const { error: openingErr } = await db
    .from("job_openings")
    .update({ scoring_weights: weights })
    .eq("id", openingId);
  if (openingErr) return { ok: false, error: openingErr.message };

  const { data: screenings } = await db
    .from("application_screenings")
    .select("id, criteria")
    .eq("job_opening_id", openingId)
    .eq("status", "scored");

  for (const s of screenings ?? []) {
    const criteria = (s.criteria ?? []) as CriterionScore[];
    const at = (k: string) => criteria.find((c) => c.key === k)?.score ?? null;
    const score = weightedScore(
      { skills: at("skills"), experience: at("experience"), qualification: at("qualification") },
      weights,
    );
    const reweighted = criteria.map((c) =>
      c.key === "skills"
        ? { ...c, weight: weights.skills }
        : c.key === "experience"
          ? { ...c, weight: weights.experience }
          : c.key === "qualification"
            ? { ...c, weight: weights.qualification }
            : c,
    );
    await db
      .from("application_screenings")
      .update({ score, recommendation: recommendationForScore(score), criteria: reweighted })
      .eq("id", s.id);
  }

  await db.from("audit_log").insert({
    organization_id: session.organizationId,
    actor_membership_id: session.membershipId,
    action: "screening.weights_updated",
    entity_type: "job_opening",
    entity_id: openingId,
    summary: `Weights: skills ${weights.skills} / experience ${weights.experience} / qualification ${weights.qualification}`,
  });
  revalidatePath(`/openings/${openingId}/applicants`);
  return { ok: true, message: "Weights saved and applicants re-ranked." };
}

/**
 * Human override of the AI recommendation (spec §UC-4 step 7). Recorded with the
 * reviewer and reason, and reversible (pass null to clear). Never changes the
 * pipeline stage — advancing/rejecting stays a separate, explicit action.
 */
export async function overrideRecommendationAction(
  applicationId: string,
  recommendation: ScreeningRecommendation | null,
  reason: string,
): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Your session has expired." };
  const auth = await authorize("screening.override");
  if (!auth.ok) return auth;

  if (recommendation && !reason.trim()) {
    return { ok: false, error: "Add a short reason for the override." };
  }

  const db = await createClient();
  const patch = recommendation
    ? {
        override_recommendation: recommendation,
        override_reason: reason.trim().slice(0, 1000),
        overridden_by: session.membershipId,
        overridden_at: new Date().toISOString(),
      }
    : { override_recommendation: null, override_reason: null, overridden_by: null, overridden_at: null };

  const { data: updated, error } = await db
    .from("application_screenings")
    .update(patch)
    .eq("application_id", applicationId)
    .select("job_opening_id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };

  await db.from("audit_log").insert({
    organization_id: session.organizationId,
    actor_membership_id: session.membershipId,
    action: recommendation ? "screening.overridden" : "screening.override_cleared",
    entity_type: "application",
    entity_id: applicationId,
    summary: recommendation ? `Overrode to ${recommendation}` : "Cleared override",
  });
  if (updated) revalidatePath(`/openings/${updated.job_opening_id}/applicants`);
  return { ok: true, message: recommendation ? "Override recorded." : "Override cleared." };
}
