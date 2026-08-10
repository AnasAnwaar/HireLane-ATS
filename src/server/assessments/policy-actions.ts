"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/validation/auth";
import { authorize } from "@/server/auth/authorize";
import { getSessionContext } from "@/server/auth/session";
import type { ProctoringLevel } from "@/types/database";

export type PolicyInput = {
  proctoringLevel: ProctoringLevel;
  durationMinutes: number;
  passingThreshold: number | null;
  attempts: number;
  allowBacktrack: boolean;
  shuffleQuestions: boolean;
  maxAttempts: number;
};

export async function updateAssessmentPolicyAction(input: PolicyInput): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Your session has expired." };
  const auth = await authorize("administration.configure_ai_policy");
  if (!auth.ok) return auth;

  const attempts = Math.max(1, Math.round(input.attempts));
  const maxAttempts = Math.max(attempts, Math.round(input.maxAttempts));
  const threshold =
    input.passingThreshold == null
      ? null
      : Math.max(0, Math.min(100, Math.round(input.passingThreshold)));

  const db = await createClient();
  const { error } = await db.from("assessment_policies").upsert(
    {
      organization_id: session.organizationId,
      default_proctoring_level: input.proctoringLevel,
      default_duration_minutes: Math.max(0, Math.round(input.durationMinutes)),
      default_passing_threshold: threshold,
      default_attempts: attempts,
      default_allow_backtrack: input.allowBacktrack,
      default_shuffle_questions: input.shuffleQuestions,
      max_attempts: maxAttempts,
      updated_by: session.membershipId,
    },
    { onConflict: "organization_id" },
  );
  if (error) return { ok: false, error: error.message };

  await db.from("audit_log").insert({
    organization_id: session.organizationId,
    actor_membership_id: session.membershipId,
    action: "assessment_policy.updated",
    entity_type: "organization",
    entity_id: session.organizationId,
    summary: "Updated the assessment policy",
  });
  revalidatePath("/admin/assessments");
  return { ok: true, message: "Assessment policy saved." };
}
