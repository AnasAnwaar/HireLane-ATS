"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/validation/auth";
import { authorize } from "@/server/auth/authorize";
import { getSessionContext } from "@/server/auth/session";
import type { Competency, ScorecardRecommendation } from "@/types/database";

const RECS: ScorecardRecommendation[] = ["strong_yes", "yes", "no", "strong_no"];

/** Save (and optionally submit) the caller's competency scorecard for a candidate. */
export async function saveCandidateScorecardAction(
  candidateId: string,
  input: {
    competencies: Competency[];
    overall: number | null;
    recommendation: ScorecardRecommendation | null;
    comment: string;
  },
  submit: boolean,
): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Your session has expired." };
  const auth = await authorize("interviews.submit_scorecard");
  if (!auth.ok) return { ok: false, error: auth.error };

  const competencies = (input.competencies ?? [])
    .filter((c) => c.name && c.rating > 0)
    .map((c) => ({ name: String(c.name).slice(0, 80), rating: Math.max(1, Math.min(5, Math.round(c.rating))) }))
    .slice(0, 12);
  const overall = input.overall != null ? Math.max(1, Math.min(5, Math.round(input.overall))) : null;
  const recommendation = input.recommendation && RECS.includes(input.recommendation) ? input.recommendation : null;

  if (submit && !recommendation) return { ok: false, error: "Pick a recommendation before submitting." };

  const db = await createClient();
  const { data: existing } = await db
    .from("candidate_scorecards")
    .select("submitted, submitted_at")
    .eq("candidate_id", candidateId)
    .eq("author_membership_id", session.membershipId)
    .maybeSingle();
  const submitted = submit || Boolean(existing?.submitted);

  const { error } = await db.from("candidate_scorecards").upsert(
    {
      organization_id: session.organizationId,
      candidate_id: candidateId,
      author_membership_id: session.membershipId,
      competencies,
      overall,
      recommendation,
      comment: input.comment?.slice(0, 4000) || null,
      submitted,
      submitted_at: submitted ? (existing?.submitted_at ?? new Date().toISOString()) : null,
    },
    { onConflict: "candidate_id,author_membership_id" },
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/candidates/${candidateId}`);
  return { ok: true, message: submit ? "Scorecard submitted." : "Draft saved." };
}

/** Declare (or update) a conflict of interest on a candidate. */
export async function declareConflictAction(candidateId: string, reason: string): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Your session has expired." };

  const db = await createClient();
  const { error } = await db.from("conflict_declarations").upsert(
    {
      organization_id: session.organizationId,
      candidate_id: candidateId,
      membership_id: session.membershipId,
      reason: reason.trim().slice(0, 1000) || null,
    },
    { onConflict: "candidate_id,membership_id" },
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/candidates/${candidateId}`);
  return { ok: true, message: "Conflict of interest declared." };
}

/** Withdraw the caller's conflict declaration. */
export async function withdrawConflictAction(candidateId: string): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Your session has expired." };

  const db = await createClient();
  const { error } = await db
    .from("conflict_declarations")
    .delete()
    .eq("candidate_id", candidateId)
    .eq("membership_id", session.membershipId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/candidates/${candidateId}`);
  return { ok: true, message: "Declaration withdrawn." };
}
