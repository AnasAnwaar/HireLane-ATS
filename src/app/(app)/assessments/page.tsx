import { PageBody, PageHeader } from "@/components/layout/app-shell";
import { NoAccess } from "@/components/permissions/no-access";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/server/auth/authorize";
import { requireSession } from "@/server/auth/session";
import type { Test, TestAttempt } from "@/types/database";

import { AssessmentsHub, type AttemptRow, type TestRow } from "./assessments-hub";
import { NewTestButton } from "./new-test-button";

export const metadata = { title: "Assessments" };

const ATTEMPT_WINDOW = 100;

export default async function AssessmentsPage() {
  await requireSession("/assessments");
  if (!(await can("assessments.view"))) {
    return <NoAccess title="You don't have access to assessments" />;
  }

  const supabase = await createClient();
  const [{ data: testsData }, { data: attemptsData }, canViewAnswers, canManual, canAi] =
    await Promise.all([
    supabase
      .from("tests")
      .select("id, title, status, version, job_opening_id, duration_minutes")
      .order("created_at", { ascending: false }),
    supabase
      .from("test_attempts")
      .select("id, assignment_id, test_id, status, flagged, breach_count, max_score, submitted_at, started_at")
      .order("started_at", { ascending: false })
      .limit(ATTEMPT_WINDOW),
    can("assessments.view_answers"),
    can("assessments.create_manual"),
    can("assessments.generate_ai"),
  ]);
  const canCreate = canManual || canAi;

  const tests = (testsData ?? []) as Pick<
    Test,
    "id" | "title" | "status" | "version" | "job_opening_id" | "duration_minutes"
  >[];
  const attempts = (attemptsData ?? []) as Pick<
    TestAttempt,
    "id" | "assignment_id" | "test_id" | "status" | "flagged" | "breach_count" | "max_score" | "submitted_at" | "started_at"
  >[];

  // ---- Resolve the lookups the rows need (openings, candidates, question counts).
  const openingIds = [...new Set(tests.map((t) => t.job_opening_id).filter(Boolean))] as string[];
  const testIds = tests.map((t) => t.id);
  const assignmentIds = [...new Set(attempts.map((a) => a.assignment_id))];

  const [{ data: openings }, { data: allOpenings }, { data: questionRows }, { data: assignments }] =
    await Promise.all([
      openingIds.length
        ? supabase.from("job_openings").select("id, title").in("id", openingIds)
        : Promise.resolve({ data: [] as { id: string; title: string }[] }),
      // For the "New test" picker — the openings a test could be authored against.
      canCreate
        ? supabase
            .from("job_openings")
            .select("id, title")
            .neq("status", "closed")
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    testIds.length
      ? supabase.from("test_questions").select("test_id").in("test_id", testIds)
      : Promise.resolve({ data: [] as { test_id: string }[] }),
    assignmentIds.length
      ? supabase.from("test_assignments").select("id, candidate_id, test_id").in("id", assignmentIds)
      : Promise.resolve({ data: [] as { id: string; candidate_id: string; test_id: string }[] }),
  ]);

  const openingTitle = new Map((openings ?? []).map((o) => [o.id, o.title]));
  const testTitle = new Map(tests.map((t) => [t.id, t.title]));
  const questionCount = new Map<string, number>();
  for (const q of questionRows ?? []) questionCount.set(q.test_id, (questionCount.get(q.test_id) ?? 0) + 1);
  const assignment = new Map((assignments ?? []).map((a) => [a.id, a]));

  const candidateIds = [...new Set((assignments ?? []).map((a) => a.candidate_id))];
  const { data: candidates } = candidateIds.length
    ? await supabase.from("candidates").select("id, full_name").in("id", candidateIds)
    : { data: [] as { id: string; full_name: string }[] };
  const candidateName = new Map((candidates ?? []).map((c) => [c.id, c.full_name]));

  // ---- Per-attempt score + pending-grading, only when answers are visible.
  const scoreByAttempt = new Map<string, { awarded: number; pending: number }>();
  if (canViewAnswers && attempts.length) {
    const { data: answers } = await supabase
      .from("test_answers")
      .select("attempt_id, awarded_marks, ai_suggested_marks, confirmed, is_correct")
      .in(
        "attempt_id",
        attempts.map((a) => a.id),
      );
    for (const ans of answers ?? []) {
      const agg = scoreByAttempt.get(ans.attempt_id) ?? { awarded: 0, pending: 0 };
      agg.awarded += Number(ans.awarded_marks ?? ans.ai_suggested_marks ?? 0);
      // Written answers carry is_correct = null; unconfirmed ones await a human.
      if (!ans.confirmed && ans.is_correct === null) agg.pending += 1;
      scoreByAttempt.set(ans.attempt_id, agg);
    }
  }

  const attemptRows: AttemptRow[] = attempts.map((a) => {
    const asg = assignment.get(a.assignment_id);
    const test = asg ? tests.find((t) => t.id === asg.test_id) : undefined;
    const openingId = test?.job_opening_id ?? null;
    const score = scoreByAttempt.get(a.id);
    const max = a.max_score != null ? Number(a.max_score) : null;
    return {
      attemptId: a.id,
      candidateId: asg?.candidate_id ?? null,
      candidateName: asg ? (candidateName.get(asg.candidate_id) ?? "Candidate") : "Candidate",
      testTitle: (asg && testTitle.get(asg.test_id)) || "Test",
      openingTitle: openingId ? (openingTitle.get(openingId) ?? null) : null,
      status: a.status,
      flagged: a.flagged,
      scorePct:
        canViewAnswers && score && max && max > 0
          ? Math.round((score.awarded / max) * 100)
          : null,
      pending: score?.pending ?? 0,
      submittedAt: a.submitted_at,
    };
  });

  const testRows: TestRow[] = tests.map((t) => ({
    id: t.id,
    openingId: t.job_opening_id,
    openingTitle: t.job_opening_id ? (openingTitle.get(t.job_opening_id) ?? null) : null,
    title: t.title,
    status: t.status,
    version: t.version,
    durationMinutes: t.duration_minutes,
    questionCount: questionCount.get(t.id) ?? 0,
  }));

  return (
    <>
      <PageHeader
        eyebrow="Recruiting"
        title="Assessments"
        description="Every test, attempt and grading task across all openings in one place."
        actions={canCreate ? <NewTestButton openings={allOpenings ?? []} /> : undefined}
      />
      <PageBody>
        <AssessmentsHub attempts={attemptRows} tests={testRows} canViewAnswers={canViewAnswers} />
      </PageBody>
    </>
  );
}
