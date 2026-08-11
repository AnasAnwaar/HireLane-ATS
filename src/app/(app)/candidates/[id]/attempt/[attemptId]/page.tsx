import { ArrowLeft, Eye, ShieldAlert, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageBody, PageHeader } from "@/components/layout/app-shell";
import { NoAccess } from "@/components/permissions/no-access";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PROCTORING_EVENT_META, PROCTORING_SEVERITY_META } from "@/lib/assessments-display";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { isAiConfigured } from "@/server/ai/gemini";
import { can } from "@/server/auth/authorize";
import { requireSession } from "@/server/auth/session";
import type {
  ProctoringAnalysis,
  ProctoringEvent,
  QuestionType,
  TestAnswer,
  TestAttempt,
} from "@/types/database";

import { ProctoringAnalysisPanel } from "./proctoring-analysis-panel";
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

  const [{ data: assignment }, canViewAnswers, canGrade, canViewProctoring] = await Promise.all([
    supabase
      .from("test_assignments")
      .select("candidate_id, tests(title)")
      .eq("id", attempt.assignment_id)
      .maybeSingle(),
    can("assessments.view_answers"),
    can("assessments.confirm_grades"),
    can("proctoring.view_summary"),
  ]);
  if (!assignment || assignment.candidate_id !== id) notFound();

  // Integrity capture summary (CP-19). RLS also hides events without the
  // proctoring permissions, so this is empty for a viewer who lacks them.
  const [{ data: eventRows }, { data: analysisRow }] = canViewProctoring
    ? await Promise.all([
        supabase
          .from("proctoring_events")
          .select("*")
          .eq("attempt_id", attemptId)
          .order("occurred_at", { ascending: false }),
        supabase.from("proctoring_analyses").select("*").eq("attempt_id", attemptId).maybeSingle(),
      ])
    : [{ data: [] }, { data: null }];
  const events = (eventRows ?? []) as ProctoringEvent[];
  const analysis = (analysisRow as ProctoringAnalysis | null) ?? null;

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
        {canViewProctoring &&
          (attempt.breach_count > 0 ||
            events.length > 0 ||
            attempt.check_in_photo_path ||
            analysis) && (
            <IntegrityCard
              attemptId={attemptId}
              flagged={attempt.flagged}
              events={events}
              analysis={analysis}
              aiConfigured={isAiConfigured()}
            />
          )}
        <ResultsView data={data} />
      </PageBody>
    </>
  );
}

function IntegrityCard({
  attemptId,
  flagged,
  events,
  analysis,
  aiConfigured,
}: {
  attemptId: string;
  flagged: boolean;
  events: ProctoringEvent[];
  analysis: ProctoringAnalysis | null;
  aiConfigured: boolean;
}) {
  // Tally distinct event types, keeping the highest severity + latest time.
  const byType = new Map<string, { count: number; severity: ProctoringEvent["severity"]; last: string }>();
  for (const e of events) {
    const prev = byType.get(e.type);
    if (prev) {
      prev.count += 1;
      if (e.occurred_at > prev.last) prev.last = e.occurred_at;
    } else {
      byType.set(e.type, { count: 1, severity: e.severity, last: e.occurred_at });
    }
  }
  const rows = [...byType.entries()].sort(
    (a, b) => (b[1].last > a[1].last ? 1 : b[1].last < a[1].last ? -1 : 0),
  );

  return (
    <Card className={flagged ? "border-destructive/40" : undefined}>
      <CardContent className="p-5">
        <div className="flex items-center gap-2">
          {flagged ? (
            <ShieldAlert className="size-4 text-destructive" />
          ) : (
            <ShieldCheck className="size-4 text-muted-foreground" />
          )}
          <h2 className="text-sm font-semibold">Integrity</h2>
          {flagged ? (
            <Badge variant="destructive" className="ml-auto">
              Flagged for review
            </Badge>
          ) : (
            <span className="ml-auto text-xs text-muted-foreground">No escalation</span>
          )}
        </div>

        {rows.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No integrity events were captured.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {rows.map(([type, agg]) => {
              const meta = PROCTORING_EVENT_META[type];
              const sev = PROCTORING_SEVERITY_META[agg.severity];
              return (
                <li key={type} className="flex items-center gap-3 py-2 text-sm">
                  <Eye className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="flex-1">{meta?.label ?? type}</span>
                  {agg.count > 1 && (
                    <span className="text-xs text-muted-foreground tabular-nums">×{agg.count}</span>
                  )}
                  <span className="text-xs text-muted-foreground">{formatDate(agg.last)}</span>
                  <Badge variant={sev?.variant ?? "secondary"}>{sev?.label ?? agg.severity}</Badge>
                </li>
              );
            })}
          </ul>
        )}

        <ProctoringAnalysisPanel
          attemptId={attemptId}
          analysis={analysis}
          canAnalyze
          aiConfigured={aiConfigured}
        />
      </CardContent>
    </Card>
  );
}
