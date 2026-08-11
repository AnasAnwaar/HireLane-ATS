"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient, createClient } from "@/lib/supabase/server";
import { INTEGRITY_DECISION_META } from "@/lib/assessments-display";
import type { ActionResult } from "@/lib/validation/auth";
import { authorize } from "@/server/auth/authorize";
import { getSessionContext } from "@/server/auth/session";
import type { IntegrityDecision } from "@/types/database";

const DECIDABLE: IntegrityDecision[] = ["accepted", "invalidated", "rejected"];

/**
 * Record the reviewer's decision on an attempt's integrity (spec §UC-5.3 R2 —
 * a human decides; the system never auto-rejects). Gated on proctoring.invalidate.
 * The decision is written service-side (the table's own write policy gates on a
 * different permission) and always leaves an audit trail of who, when and why.
 */
export async function recordIntegrityDecisionAction(
  attemptId: string,
  decision: IntegrityDecision,
  reason: string,
): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Your session has expired." };
  const auth = await authorize("proctoring.invalidate");
  if (!auth.ok) return { ok: false, error: auth.error };

  if (!DECIDABLE.includes(decision)) {
    return { ok: false, error: "Choose accept, invalidate or reject." };
  }
  const cleanReason = reason.trim().slice(0, 1000);
  if (decision !== "accepted" && !cleanReason) {
    return { ok: false, error: "A reason is required to invalidate or reject." };
  }

  // Read through RLS so the caller only ever acts on attempts in their org.
  const db = await createClient();
  const { data: attempt } = await db
    .from("test_attempts")
    .select("id, organization_id, assignment_id")
    .eq("id", attemptId)
    .maybeSingle();
  if (!attempt) return { ok: false, error: "Attempt not found." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("test_attempts")
    .update({
      integrity_decision: decision,
      integrity_reason: cleanReason || null,
      integrity_decided_by: session.membershipId,
      integrity_decided_at: new Date().toISOString(),
    })
    .eq("id", attemptId);
  if (error) return { ok: false, error: error.message };

  await admin.from("audit_log").insert({
    organization_id: attempt.organization_id,
    actor_membership_id: session.membershipId,
    action: "attempt.integrity_decision",
    entity_type: "test_attempt",
    entity_id: attemptId,
    summary: `Integrity ${INTEGRITY_DECISION_META[decision].label.toLowerCase()}${cleanReason ? ` — ${cleanReason}` : ""}`,
  });

  const { data: assignment } = await db
    .from("test_assignments")
    .select("candidate_id")
    .eq("id", attempt.assignment_id)
    .maybeSingle();
  if (assignment?.candidate_id) {
    revalidatePath(`/candidates/${assignment.candidate_id}/attempt/${attemptId}/integrity`);
    revalidatePath(`/candidates/${assignment.candidate_id}/attempt/${attemptId}`);
  }

  return { ok: true, message: `Decision recorded: ${INTEGRITY_DECISION_META[decision].label}.` };
}
