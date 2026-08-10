import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageBody, PageHeader } from "@/components/layout/app-shell";
import { NoAccess } from "@/components/permissions/no-access";
import { createClient } from "@/lib/supabase/server";
import { isAiConfigured } from "@/server/ai/gemini";
import { can } from "@/server/auth/authorize";
import { requireSession } from "@/server/auth/session";
import type { QuestionType, TestAnswer, TestAttempt } from "@/types/database";

import { ResultsView, type QuestionResult, type ResultsData } from "./results-view";

export const metadata = { title: "Test results" };

type SnapQuestion = {
  id: string;
  type: QuestionType;
  prompt: string;
  marks: number;
  skill: string | null;
  options: { id: string; text: string }[];
  correct_answers: string[];
  rubric: string | null;
};

export default async function AttemptResultsPage({
  params,
}: {
  params: Promise<{ id: string; attemptId: string }>;
}) {
  await requireSession();
  const { id, attemptId } = await params;

  if (!(await can("assessments.view"))) {
    return <NoAccess title="You don't have access to assessments" />;
  }

  const supabase = await createClient();
  const { data: attemptRow } = await supabase
    .from("test_attempts")
    .select("*")
    .eq("id", attemptId)
    .maybeSingle();
  if (!attemptRow) notFound();
  const attempt = attemptRow as TestAttempt;

  const [{ data: assignment }, canViewAnswers, canGrade] = await Promise.all([
    supabase
      .from("test_assignments")
      .select("candidate_id, tests(title)")
      .eq("id", attempt.assignment_id)
      .maybeSingle(),
    can("assessments.view_answers"),
    can("assessments.confirm_grades"),
  ]);
  if (!assignment || assignment.candidate_id !== id) notFound();

  const [{ data: candidate }, { data: ver }, { data: answerRows }] = await Promise.all([
    supabase.from("candidates").select("full_name").eq("id", id).maybeSingle(),
    supabase
      .from("test_versions")
      .select("snapshot")
      .eq("test_id", attempt.test_id)
      .eq("version", attempt.version)
      .maybeSingle(),
    supabase.from("test_answers").select("*").eq("attempt_id", attemptId),
  ]);

  const snapshot = ver?.snapshot as { questions?: SnapQuestion[] } | undefined;
  const questions = snapshot?.questions ?? [];
  const answerByQ = new Map(((answerRows ?? []) as TestAnswer[]).map((a) => [a.question_id, a]));

  const AUTO: QuestionType[] = ["single_choice", "multiple_choice", "true_false"];

  const results: QuestionResult[] = questions.map((q, i) => {
    const a = answerByQ.get(q.id);
    const textById = new Map(q.options.map((o) => [o.id, o.text]));
    const selected = (a?.response?.selected ?? []).map((oid) => textById.get(oid) ?? "?");
    const correct = q.correct_answers.map((oid) => textById.get(oid) ?? "?");
    return {
      answerId: a?.id ?? null,
      index: i + 1,
      type: q.type,
      auto: AUTO.includes(q.type),
      prompt: q.prompt,
      marks: q.marks,
      skill: q.skill,
      rubric: canViewAnswers ? q.rubric : null,
      answerText: canViewAnswers ? (a?.response?.text ?? null) : null,
      selectedTexts: canViewAnswers ? selected : [],
      correctTexts: correct,
      isCorrect: a?.is_correct ?? null,
      awarded: a?.awarded_marks ?? null,
      confirmed: a?.confirmed ?? false,
      aiSuggested: a?.ai_suggested_marks ?? null,
      aiRationale: a?.ai_rationale ?? null,
    };
  });

  const maxScore = questions.reduce((s, q) => s + q.marks, 0);
  const totalAwarded = results.reduce((s, r) => s + (r.confirmed ? Number(r.awarded ?? 0) : 0), 0);
  const writtenPending = results.filter((r) => !r.auto && !r.confirmed).length;

  const perSkillMap = new Map<string, { awarded: number; max: number }>();
  for (const r of results) {
    const key = r.skill || "General";
    const cur = perSkillMap.get(key) ?? { awarded: 0, max: 0 };
    cur.max += r.marks;
    if (r.confirmed) cur.awarded += Number(r.awarded ?? 0);
    perSkillMap.set(key, cur);
  }
  const perSkill = [...perSkillMap.entries()].map(([skill, v]) => ({ skill, ...v }));

  const data: ResultsData = {
    attemptId,
    candidateName: candidate?.full_name ?? "Candidate",
    testTitle: assignment.tests?.title ?? "Assessment",
    status: attempt.status,
    submittedAt: attempt.submitted_at,
    maxScore,
    totalAwarded: Math.round(totalAwarded * 100) / 100,
    writtenPending,
    perSkill,
    results,
    canViewAnswers,
    canGrade: canGrade && isAiConfigured(),
    canConfirm: canGrade,
  };

  return (
    <>
      <PageHeader
        eyebrow={
          <Link
            href={`/candidates/${id}`}
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3" /> {data.candidateName}
          </Link>
        }
        title="Test results"
        description={data.testTitle}
      />
      <PageBody className="max-w-3xl">
        <ResultsView data={data} />
      </PageBody>
    </>
  );
}
