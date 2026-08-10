import "server-only";

import { createAdminClient } from "@/lib/supabase/server";
import { resolvePortalSession } from "@/server/candidates/portal-access";
import type {
  QuestionOption,
  QuestionType,
  TestAnswer,
  TestAnswerResponse,
  TestAttempt,
} from "@/types/database";

/**
 * Candidate-side test delivery (spec §UC-5.2). The candidate is unauthenticated;
 * their portal token is the authorisation. Everything runs on the service role
 * through validated helpers.
 *
 * R2 is enforced here: `toDeliveryQuestions` strips correct answers and rubrics
 * before anything reaches the browser.
 */

type Admin = ReturnType<typeof createAdminClient>;

// The full question, as stored in the published version snapshot (has the key).
export type SnapshotQuestion = {
  id: string;
  type: QuestionType;
  prompt: string;
  options: QuestionOption[];
  correct_answers: string[];
  rubric: string | null;
  marks: number;
  skill: string | null;
};

// What the candidate's browser is allowed to see — no key, no rubric.
export type DeliveryQuestion = {
  id: string;
  type: QuestionType;
  prompt: string;
  options: { id: string; text: string }[];
  marks: number;
};

export type ResolvedAttempt = {
  candidateId: string;
  organizationId: string;
  attempt: TestAttempt;
  assignment: { id: string; test_id: string; deadline: string | null };
};

const AUTO_TYPES: QuestionType[] = ["single_choice", "multiple_choice", "true_false"];
export const isAutoScored = (t: QuestionType) => AUTO_TYPES.includes(t);

export type PortalAssignment = {
  id: string;
  testTitle: string;
  durationMinutes: number | null;
  questionCount: number;
  status: string;
  deadline: string | null;
  overdue: boolean;
  attemptsUsed: number;
  attemptsAllowed: number;
  activeAttemptId: string | null;
};

/** List the tests assigned to the candidate behind this portal token. */
export async function getPortalAssignments(rawToken: string): Promise<PortalAssignment[]> {
  const session = await resolvePortalSession(rawToken);
  if (!session) return [];
  const admin = createAdminClient();

  const { data: rows } = await admin
    .from("test_assignments")
    .select("id, test_id, status, deadline, attempts_used, attempts_allowed, tests(title, duration_minutes)")
    .eq("candidate_id", session.candidateId)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false });

  const assignments = rows ?? [];
  if (assignments.length === 0) return [];

  const testIds = [...new Set(assignments.map((a) => a.test_id))];
  const assignmentIds = assignments.map((a) => a.id);

  const [{ data: qCounts }, { data: active }] = await Promise.all([
    admin.from("test_questions").select("test_id").in("test_id", testIds),
    admin
      .from("test_attempts")
      .select("id, assignment_id")
      .in("assignment_id", assignmentIds)
      .eq("status", "in_progress"),
  ]);

  const countByTest = new Map<string, number>();
  for (const q of qCounts ?? []) countByTest.set(q.test_id, (countByTest.get(q.test_id) ?? 0) + 1);

  const activeByAssignment = new Map<string, string>();
  for (const a of active ?? []) activeByAssignment.set(a.assignment_id, a.id);

  const now = Date.now();
  return assignments.map((a) => ({
    id: a.id,
    testTitle: a.tests?.title ?? "Assessment",
    durationMinutes: a.tests?.duration_minutes ?? null,
    questionCount: countByTest.get(a.test_id) ?? 0,
    status: a.status,
    deadline: a.deadline,
    overdue: a.deadline ? new Date(a.deadline).getTime() < now : false,
    attemptsUsed: a.attempts_used,
    attemptsAllowed: a.attempts_allowed,
    activeAttemptId: activeByAssignment.get(a.id) ?? null,
  }));
}

export type AssignmentView = {
  id: string;
  testTitle: string;
  instructions: string | null;
  durationMinutes: number | null;
  questionCount: number;
  proctoringLevel: string;
  deadline: string | null;
  status: string;
  attemptsUsed: number;
  attemptsAllowed: number;
  activeAttemptId: string | null;
  canStart: boolean;
  blockedReason: string | null;
};

/** Resolve one assignment for the candidate — drives the consent/runner page. */
export async function getAssignmentView(
  rawToken: string,
  assignmentId: string,
): Promise<AssignmentView | null> {
  const session = await resolvePortalSession(rawToken);
  if (!session) return null;
  const admin = createAdminClient();

  const { data: a } = await admin
    .from("test_assignments")
    .select("*, tests(title, instructions, duration_minutes, proctoring_level, version)")
    .eq("id", assignmentId)
    .maybeSingle();
  if (!a || a.candidate_id !== session.candidateId) return null;

  const { data: active } = await admin
    .from("test_attempts")
    .select("id")
    .eq("assignment_id", a.id)
    .eq("status", "in_progress")
    .maybeSingle();

  const { data: qs } = await admin.from("test_questions").select("id").eq("test_id", a.test_id);
  const pastDeadline = a.deadline ? new Date(a.deadline).getTime() < Date.now() : false;
  const attemptsLeft = a.attempts_used < a.attempts_allowed;
  const published = (a.tests?.version ?? 0) > 0;

  let blockedReason: string | null = null;
  if (a.status === "submitted") blockedReason = "You've already submitted this test.";
  else if (pastDeadline) blockedReason = "The deadline for this test has passed.";
  else if (!attemptsLeft && !active) blockedReason = "You've used all your attempts.";
  else if (!published) blockedReason = "This test isn't ready yet.";

  return {
    id: a.id,
    testTitle: a.tests?.title ?? "Assessment",
    instructions: a.tests?.instructions ?? null,
    durationMinutes: a.tests?.duration_minutes ?? null,
    questionCount: (qs ?? []).length,
    proctoringLevel: a.tests?.proctoring_level ?? "standard",
    deadline: a.deadline,
    status: a.status,
    attemptsUsed: a.attempts_used,
    attemptsAllowed: a.attempts_allowed,
    activeAttemptId: active?.id ?? null,
    canStart: !active && !blockedReason,
    blockedReason,
  };
}

/** Resolve a portal token + attempt id to the attempt, or null if unauthorised. */
export async function resolveAttempt(
  rawToken: string,
  attemptId: string,
): Promise<ResolvedAttempt | null> {
  const session = await resolvePortalSession(rawToken);
  if (!session) return null;

  const admin = createAdminClient();
  const { data: attempt } = await admin
    .from("test_attempts")
    .select("*")
    .eq("id", attemptId)
    .maybeSingle();
  if (!attempt || attempt.organization_id !== session.organizationId) return null;

  const { data: assignment } = await admin
    .from("test_assignments")
    .select("id, test_id, candidate_id, deadline")
    .eq("id", attempt.assignment_id)
    .maybeSingle();
  if (!assignment || assignment.candidate_id !== session.candidateId) return null;

  return {
    candidateId: session.candidateId,
    organizationId: session.organizationId,
    attempt: attempt as TestAttempt,
    assignment: { id: assignment.id, test_id: assignment.test_id, deadline: assignment.deadline },
  };
}

type SnapshotTest = { title: string; instructions: string | null; allow_backtrack: boolean };

/** Load the full published-version snapshot the attempt is pinned to. */
export async function loadSnapshot(
  admin: Admin,
  testId: string,
  version: number,
): Promise<{ test: SnapshotTest; questions: SnapshotQuestion[] } | null> {
  const { data } = await admin
    .from("test_versions")
    .select("snapshot")
    .eq("test_id", testId)
    .eq("version", version)
    .maybeSingle();
  const snapshot = data?.snapshot as { test?: SnapshotTest; questions?: SnapshotQuestion[] } | undefined;
  if (!snapshot?.questions) return null;
  return {
    test: snapshot.test ?? { title: "Test", instructions: null, allow_backtrack: true },
    questions: snapshot.questions,
  };
}

export async function loadSnapshotQuestions(
  admin: Admin,
  testId: string,
  version: number,
): Promise<SnapshotQuestion[]> {
  return (await loadSnapshot(admin, testId, version))?.questions ?? [];
}

export type RunnerData =
  | { state: "done"; status: TestAttempt["status"] }
  | {
      state: "active";
      attemptId: string;
      testTitle: string;
      instructions: string | null;
      allowBacktrack: boolean;
      expiresAt: string;
      questions: DeliveryQuestion[];
      answers: Record<string, TestAnswerResponse>;
    };

/**
 * Everything the runner needs — with the answer key stripped (R2). Auto-submits
 * first if the clock has already run out (covers a disconnect past expiry).
 */
export async function getRunnerData(rawToken: string, attemptId: string): Promise<RunnerData | null> {
  const r = await resolveAttempt(rawToken, attemptId);
  if (!r) return null;
  const admin = createAdminClient();

  if (r.attempt.status !== "in_progress") return { state: "done", status: r.attempt.status };
  if (new Date(r.attempt.expires_at).getTime() <= Date.now()) {
    await finalizeAttempt(admin, r.attempt, "expired");
    return { state: "done", status: "expired" };
  }

  const snapshot = await loadSnapshot(admin, r.attempt.test_id, r.attempt.version);
  if (!snapshot) return { state: "done", status: r.attempt.status };

  const questions = toDeliveryQuestions(snapshot.questions, r.attempt.question_order, r.attempt.option_orders);

  const { data: answerRows } = await admin
    .from("test_answers")
    .select("question_id, response")
    .eq("attempt_id", r.attempt.id);
  const answers: Record<string, TestAnswerResponse> = {};
  for (const a of (answerRows ?? []) as Pick<TestAnswer, "question_id" | "response">[]) {
    answers[a.question_id] = a.response;
  }

  return {
    state: "active",
    attemptId: r.attempt.id,
    testTitle: snapshot.test.title,
    instructions: snapshot.test.instructions,
    allowBacktrack: snapshot.test.allow_backtrack,
    expiresAt: r.attempt.expires_at,
    questions,
    answers,
  };
}

/** Build the delivery payload — ordered, key-stripped (spec R2). */
export function toDeliveryQuestions(
  questions: SnapshotQuestion[],
  order: string[],
  optionOrders: Record<string, string[]>,
): DeliveryQuestion[] {
  const byId = new Map(questions.map((q) => [q.id, q]));
  return order
    .map((qid) => byId.get(qid))
    .filter((q): q is SnapshotQuestion => Boolean(q))
    .map((q) => {
      const ord = optionOrders[q.id];
      const options = ord
        ? ord.map((oid) => q.options.find((o) => o.id === oid)).filter((o): o is QuestionOption => Boolean(o))
        : q.options;
      return {
        id: q.id,
        type: q.type,
        prompt: q.prompt,
        marks: q.marks,
        options: options.map((o) => ({ id: o.id, text: o.text })),
      };
    });
}

/** Auto-score one choice/true-false question (partial credit for multi). */
export function scoreChoice(q: SnapshotQuestion, selected: string[]): { marks: number; correct: boolean } {
  const key = new Set(q.correct_answers);
  const picked = new Set(selected);
  if (q.type === "single_choice" || q.type === "true_false") {
    const correct = picked.size === 1 && key.has([...picked][0]);
    return { marks: correct ? q.marks : 0, correct };
  }
  // multiple_choice — partial credit: (right picks - wrong picks) / |key|, floored at 0.
  let right = 0;
  let wrong = 0;
  for (const id of picked) {
    if (key.has(id)) right++;
    else wrong++;
  }
  const ratio = key.size ? Math.max(0, (right - wrong) / key.size) : 0;
  const exact = right === key.size && wrong === 0;
  return { marks: Math.round(ratio * q.marks * 100) / 100, correct: exact };
}

/**
 * Finalise an attempt: auto-score the choice questions, leave written answers
 * for CP-17, and mark the attempt + assignment submitted. Idempotent-ish: only
 * acts on an in-progress attempt.
 */
export async function finalizeAttempt(
  admin: Admin,
  attempt: TestAttempt,
  reason: "submitted" | "expired",
): Promise<void> {
  const questions = await loadSnapshotQuestions(admin, attempt.test_id, attempt.version);

  const { data: answers } = await admin
    .from("test_answers")
    .select("id, question_id, response")
    .eq("attempt_id", attempt.id);

  const answerByQ = new Map(
    ((answers ?? []) as Pick<TestAnswer, "id" | "question_id" | "response">[]).map((a) => [a.question_id, a]),
  );

  let autoScore = 0;
  const maxScore = questions.reduce((s, q) => s + q.marks, 0);

  for (const q of questions) {
    if (!isAutoScored(q.type)) continue;
    const ans = answerByQ.get(q.id);
    const selected = (ans?.response as TestAnswerResponse | undefined)?.selected ?? [];
    const { marks, correct } = scoreChoice(q, selected);
    autoScore += marks;
    if (ans) {
      await admin.from("test_answers").update({ awarded_marks: marks, is_correct: correct }).eq("id", ans.id);
    } else {
      // Unanswered auto question → record a zero so the report is complete.
      await admin.from("test_answers").insert({
        organization_id: attempt.organization_id,
        attempt_id: attempt.id,
        question_id: q.id,
        response: {},
        awarded_marks: 0,
        is_correct: false,
      });
    }
  }

  await admin
    .from("test_attempts")
    .update({
      status: reason,
      submitted_at: new Date().toISOString(),
      auto_score: Math.round(autoScore * 100) / 100,
      max_score: maxScore,
    })
    .eq("id", attempt.id)
    .eq("status", "in_progress");

  await admin
    .from("test_assignments")
    .update({ status: "submitted" })
    .eq("id", attempt.assignment_id);
}
