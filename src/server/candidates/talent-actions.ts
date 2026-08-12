"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/validation/auth";
import { authorize } from "@/server/auth/authorize";
import { getSessionContext } from "@/server/auth/session";

/** Organise a candidate with free-form talent-pool tags. */
export async function updateCandidateTagsAction(
  candidateId: string,
  tags: string[],
): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Your session has expired." };
  const auth = await authorize("applicants.import");
  if (!auth.ok) return { ok: false, error: auth.error };

  const clean = [...new Set(tags.map((t) => t.trim().slice(0, 40)).filter(Boolean))].slice(0, 20);
  const db = await createClient();
  const { error } = await db.from("candidates").update({ tags: clean }).eq("id", candidateId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/candidates/${candidateId}`);
  return { ok: true, message: "Tags updated." };
}

/** Add / remove a candidate from the talent pool for future roles. */
export async function toggleTalentPoolAction(
  candidateId: string,
  inPool: boolean,
): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Your session has expired." };
  const auth = await authorize("pipeline.add_to_talent_pool");
  if (!auth.ok) return { ok: false, error: auth.error };

  const db = await createClient();
  const { error } = await db.from("candidates").update({ in_talent_pool: inPool }).eq("id", candidateId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/candidates/${candidateId}`);
  return { ok: true, message: inPool ? "Added to talent pool." : "Removed from talent pool." };
}

/** Consider an existing candidate for another opening (cross-opening reuse). */
export async function addToOpeningAction(
  candidateId: string,
  openingId: string,
): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Your session has expired." };
  const auth = await authorize("applicants.import");
  if (!auth.ok) return { ok: false, error: auth.error };

  const db = await createClient();
  const { data: existing } = await db
    .from("applications")
    .select("id")
    .eq("candidate_id", candidateId)
    .eq("job_opening_id", openingId)
    .maybeSingle();
  if (existing) return { ok: false, error: "This candidate is already on that opening." };

  const { error } = await db.from("applications").insert({
    organization_id: session.organizationId,
    candidate_id: candidateId,
    job_opening_id: openingId,
    stage: "applied",
    source: "talent_pool",
    applied_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/candidates/${candidateId}`);
  return { ok: true, message: "Added to the opening." };
}
