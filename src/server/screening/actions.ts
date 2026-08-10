"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/validation/auth";
import { authorize } from "@/server/auth/authorize";
import { getSessionContext } from "@/server/auth/session";
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
