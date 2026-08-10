"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/validation/auth";
import { authorize } from "@/server/auth/authorize";
import { getSessionContext } from "@/server/auth/session";
import { isAiConfigured } from "@/server/ai/gemini";

import { gradeAttempt } from "./grade";

async function guard() {
  const session = await getSessionContext();
  if (!session) return { ok: false as const, error: "Your session has expired." };
  const auth = await authorize("assessments.confirm_grades");
  if (!auth.ok) return { ok: false as const, error: auth.error };
  return { ok: true as const, organizationId: session.organizationId, membershipId: session.membershipId };
}

/** Revalidate the candidate's results view + profile after a grade change. */
async function revalidateForAttempt(db: Awaited<ReturnType<typeof createClient>>, attemptId: string) {
  const { data: attempt } = await db
    .from("test_attempts")
    .select("assignment_id")
    .eq("id", attemptId)
    .maybeSingle();
  if (!attempt) return;
  const { data: assignment } = await db
    .from("test_assignments")
    .select("candidate_id")
    .eq("id", attempt.assignment_id)
    .maybeSingle();
  if (assignment) {
    revalidatePath(`/candidates/${assignment.candidate_id}/attempt/${attemptId}`);
    revalidatePath(`/candidates/${assignment.candidate_id}`);
  }
}

/** AI-grade every not-yet-confirmed written answer (suggestions only). */
export async function gradeAttemptAction(attemptId: string): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return g;
  if (!isAiConfigured()) {
    return { ok: false, error: "AI grading isn't set up yet — a Gemini API key is required." };
  }

  const db = await createClient();
  const { data: attempt } = await db
    .from("test_attempts")
    .select("id, test_id, version, organization_id")
    .eq("id", attemptId)
    .maybeSingle();
  if (!attempt) return { ok: false, error: "Attempt not found." };

  const result = await gradeAttempt(db, attempt);
  await revalidateForAttempt(db, attemptId);

  if (result.error) return { ok: false, error: result.error };
  if (result.graded === 0) return { ok: false, error: "No written answers to grade." };
  return { ok: true, message: `AI graded ${result.graded} written answer${result.graded === 1 ? "" : "s"}. Review and confirm.` };
}

/** Confirm (or amend) one written answer's mark. */
export async function confirmGradeAction(answerId: string, marks: number): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return g;

  const db = await createClient();

  // Never trust a client-supplied maximum: derive the question's marks from the
  // pinned version snapshot and clamp to that (spec R3 — the version the
  // candidate took is authoritative).
  const { data: ans } = await db
    .from("test_answers")
    .select("attempt_id, question_id")
    .eq("id", answerId)
    .maybeSingle();
  if (!ans) return { ok: false, error: "Answer not found." };

  const { data: attempt } = await db
    .from("test_attempts")
    .select("test_id, version")
    .eq("id", ans.attempt_id)
    .maybeSingle();
  let maxMarks = 0;
  if (attempt) {
    const { data: ver } = await db
      .from("test_versions")
      .select("snapshot")
      .eq("test_id", attempt.test_id)
      .eq("version", attempt.version)
      .maybeSingle();
    const questions = (ver?.snapshot as { questions?: { id: string; marks: number }[] } | undefined)?.questions ?? [];
    maxMarks = questions.find((q) => q.id === ans.question_id)?.marks ?? 0;
  }

  const awarded = Math.max(0, Math.min(maxMarks, Math.round(marks)));
  const { data: updated, error } = await db
    .from("test_answers")
    .update({ awarded_marks: awarded, confirmed: true, graded_by: g.membershipId, graded_at: new Date().toISOString() })
    .eq("id", answerId)
    .select("attempt_id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (updated) await revalidateForAttempt(db, updated.attempt_id);
  return { ok: true, message: "Grade confirmed." };
}

/** Accept all outstanding AI suggestions for an attempt in one click. */
export async function confirmAllGradesAction(attemptId: string): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return g;

  const db = await createClient();
  const { data: pending } = await db
    .from("test_answers")
    .select("id, ai_suggested_marks")
    .eq("attempt_id", attemptId)
    .eq("confirmed", false);

  const rows = (pending ?? []).filter((a) => a.ai_suggested_marks != null);
  if (rows.length === 0) return { ok: false, error: "Nothing to confirm — grade the written answers first." };

  const now = new Date().toISOString();
  for (const a of rows) {
    await db
      .from("test_answers")
      .update({ awarded_marks: a.ai_suggested_marks, confirmed: true, graded_by: g.membershipId, graded_at: now })
      .eq("id", a.id);
  }
  await revalidateForAttempt(db, attemptId);
  return { ok: true, message: `Confirmed ${rows.length} grade${rows.length === 1 ? "" : "s"}.` };
}
