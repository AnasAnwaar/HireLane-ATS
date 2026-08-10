"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { resolvePortalSession } from "@/server/candidates/portal-access";
import { QUESTION_TYPE_META } from "@/lib/assessments-display";
import type { TestAnswerResponse } from "@/types/database";

import { finalizeAttempt, loadSnapshot, resolveAttempt } from "./delivery";

/**
 * Candidate-side attempt lifecycle (spec §UC-5.2). All actions authorise via the
 * portal token and run on the service role. Answers auto-save so a disconnect
 * never loses work; the clock is server-authoritative (expires_at).
 */

type StartResult = { ok: true; attemptId: string } | { ok: false; error: string };
type SaveResult = { ok: true } | { ok: false; error: string; expired?: boolean };

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Begin (or retake) an attempt. Consent to monitoring is recorded here. */
export async function startAttemptAction(
  rawToken: string,
  assignmentId: string,
  consent: boolean,
): Promise<StartResult> {
  if (!consent) return { ok: false, error: "You must consent to monitoring to take the test." };

  const session = await resolvePortalSession(rawToken);
  if (!session) return { ok: false, error: "Your session has expired. Re-open your portal link." };

  const admin = createAdminClient();
  const { data: assignment } = await admin
    .from("test_assignments")
    .select("*")
    .eq("id", assignmentId)
    .maybeSingle();
  if (!assignment || assignment.candidate_id !== session.candidateId) {
    return { ok: false, error: "Assignment not found." };
  }
  if (assignment.status === "submitted") return { ok: false, error: "You've already submitted this test." };
  if (assignment.deadline && new Date(assignment.deadline).getTime() < Date.now()) {
    return { ok: false, error: "The deadline for this test has passed." };
  }

  // Resume an in-progress attempt rather than starting a new one.
  const { data: existing } = await admin
    .from("test_attempts")
    .select("id")
    .eq("assignment_id", assignmentId)
    .eq("status", "in_progress")
    .maybeSingle();
  if (existing) return { ok: true, attemptId: existing.id };

  if (assignment.attempts_used >= assignment.attempts_allowed) {
    return { ok: false, error: "You've used all your attempts." };
  }

  const { data: test } = await admin
    .from("tests")
    .select("id, status, version, duration_minutes, shuffle_questions, shuffle_options")
    .eq("id", assignment.test_id)
    .maybeSingle();
  if (!test || test.status !== "published" || test.version < 1) {
    return { ok: false, error: "This test isn't available." };
  }

  const snapshot = await loadSnapshot(admin, test.id, test.version);
  if (!snapshot || snapshot.questions.length === 0) {
    return { ok: false, error: "This test has no questions." };
  }

  const order = test.shuffle_questions
    ? shuffle(snapshot.questions.map((q) => q.id))
    : snapshot.questions.map((q) => q.id);

  const optionOrders: Record<string, string[]> = {};
  if (test.shuffle_options) {
    for (const q of snapshot.questions) {
      if (QUESTION_TYPE_META[q.type].hasOptions && q.type !== "true_false") {
        optionOrders[q.id] = shuffle(q.options.map((o) => o.id));
      }
    }
  }

  const minutes = (test.duration_minutes ?? 60) + (assignment.extra_time_minutes ?? 0);
  let expires = Date.now() + minutes * 60_000;
  if (assignment.deadline) expires = Math.min(expires, new Date(assignment.deadline).getTime());
  const maxScore = snapshot.questions.reduce((s, q) => s + q.marks, 0);

  // Atomically claim an attempt slot: the compare-and-swap on attempts_used
  // (only bump when it still equals what we read, and stays under the cap) means
  // two simultaneous "start" clicks can't both slip past the limit.
  const { data: claimed } = await admin
    .from("test_assignments")
    .update({ status: "in_progress", attempts_used: assignment.attempts_used + 1 })
    .eq("id", assignmentId)
    .eq("attempts_used", assignment.attempts_used)
    .lt("attempts_used", assignment.attempts_allowed)
    .select("id")
    .maybeSingle();
  if (!claimed) return { ok: false, error: "You've used all your attempts." };

  const { data: attempt, error } = await admin
    .from("test_attempts")
    .insert({
      organization_id: assignment.organization_id,
      assignment_id: assignmentId,
      test_id: test.id,
      version: test.version,
      question_order: order,
      option_orders: optionOrders,
      status: "in_progress",
      started_at: new Date().toISOString(),
      expires_at: new Date(expires).toISOString(),
      consent_at: new Date().toISOString(),
      max_score: maxScore,
    })
    .select("id")
    .single();
  if (error || !attempt) {
    // Roll back the slot we claimed so a failed start doesn't burn an attempt.
    await admin
      .from("test_assignments")
      .update({ attempts_used: assignment.attempts_used })
      .eq("id", assignmentId);
    return { ok: false, error: error?.message ?? "Couldn't start the test." };
  }

  return { ok: true, attemptId: attempt.id };
}

/** Auto-save one answer. Rejected (and the attempt finalised) once time is up. */
export async function saveAnswerAction(
  rawToken: string,
  attemptId: string,
  questionId: string,
  response: TestAnswerResponse,
): Promise<SaveResult> {
  const r = await resolveAttempt(rawToken, attemptId);
  if (!r) return { ok: false, error: "Your session has expired." };
  if (r.attempt.status !== "in_progress") return { ok: false, error: "This test is already submitted." };

  const admin = createAdminClient();
  if (new Date(r.attempt.expires_at).getTime() <= Date.now()) {
    await finalizeAttempt(admin, r.attempt, "expired");
    return { ok: false, error: "Time is up — your test was submitted.", expired: true };
  }
  if (!r.attempt.question_order.includes(questionId)) {
    return { ok: false, error: "Unknown question." };
  }

  const clean: TestAnswerResponse = {};
  if (Array.isArray(response.selected)) {
    clean.selected = response.selected.filter((x) => typeof x === "string").slice(0, 20);
  }
  if (typeof response.text === "string") clean.text = response.text.slice(0, 10_000);

  const { error } = await admin.from("test_answers").upsert(
    {
      organization_id: r.attempt.organization_id,
      attempt_id: attemptId,
      question_id: questionId,
      response: clean,
    },
    { onConflict: "attempt_id,question_id" },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Submit the attempt — auto-scores the choice questions immediately. */
export async function submitAttemptAction(
  rawToken: string,
  attemptId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const r = await resolveAttempt(rawToken, attemptId);
  if (!r) return { ok: false, error: "Your session has expired." };

  const admin = createAdminClient();
  if (r.attempt.status === "in_progress") {
    await finalizeAttempt(admin, r.attempt, "submitted");
  }
  return { ok: true };
}
