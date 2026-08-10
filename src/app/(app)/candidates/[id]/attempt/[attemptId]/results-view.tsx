"use client";

import { Check, CircleCheck, CircleX, Loader2, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { QUESTION_TYPE_META } from "@/lib/assessments-display";
import { cn, formatDate } from "@/lib/utils";
import type { QuestionType } from "@/types/database";
import {
  confirmAllGradesAction,
  confirmGradeAction,
  gradeAttemptAction,
} from "@/server/assessments/grade-actions";

export type QuestionResult = {
  answerId: string | null;
  index: number;
  type: QuestionType;
  auto: boolean;
  prompt: string;
  marks: number;
  skill: string | null;
  rubric: string | null;
  answerText: string | null;
  selectedTexts: string[];
  correctTexts: string[];
  isCorrect: boolean | null;
  awarded: number | null;
  confirmed: boolean;
  aiSuggested: number | null;
  aiRationale: string | null;
};

export type ResultsData = {
  attemptId: string;
  candidateName: string;
  testTitle: string;
  status: string;
  submittedAt: string | null;
  maxScore: number;
  totalAwarded: number;
  writtenPending: number;
  perSkill: { skill: string; awarded: number; max: number }[];
  results: QuestionResult[];
  canViewAnswers: boolean;
  canGrade: boolean;
  canConfirm: boolean;
};

export function ResultsView({ data }: { data: ResultsData }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const pct = data.maxScore ? Math.round((data.totalAwarded / data.maxScore) * 100) : 0;
  const tone = pct >= 75 ? "text-success" : pct >= 50 ? "text-warning" : "text-destructive";

  async function gradeAi() {
    setBusy("ai");
    const r = await gradeAttemptAction(data.attemptId);
    setBusy(null);
    if (r.ok) {
      toast.success(r.message ?? "Graded.");
      router.refresh();
    } else toast.error(r.error);
  }
  async function confirmAll() {
    setBusy("all");
    const r = await confirmAllGradesAction(data.attemptId);
    setBusy(null);
    if (r.ok) {
      toast.success(r.message ?? "Confirmed.");
      router.refresh();
    } else toast.error(r.error);
  }

  const hasUngradedWritten = data.results.some((r) => !r.auto && !r.confirmed && r.aiSuggested == null);
  const hasUnconfirmed = data.results.some((r) => !r.confirmed && r.aiSuggested != null);

  return (
    <div className="space-y-5">
      {/* Summary */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-6 p-5">
          <div>
            <p className={cn("text-3xl font-semibold tabular-nums", tone)}>
              {data.totalAwarded}
              <span className="text-lg text-muted-foreground">/{data.maxScore}</span>
            </p>
            <p className="text-xs text-muted-foreground">{pct}% score</p>
          </div>
          <div className="text-sm">
            <p className="font-medium">{data.candidateName}</p>
            <p className="text-muted-foreground">
              {data.status === "expired" ? "Auto-submitted (time up)" : "Submitted"}
              {data.submittedAt ? ` · ${formatDate(data.submittedAt)}` : ""}
            </p>
          </div>
          {data.writtenPending > 0 && (
            <Badge variant="warning" className="ml-auto">
              {data.writtenPending} written answer{data.writtenPending === 1 ? "" : "s"} to grade
            </Badge>
          )}
        </CardContent>
      </Card>

      {/* Grading actions */}
      {(data.canGrade || data.canConfirm) && data.writtenPending > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/20 bg-primary-soft/50 p-4">
          <p className="text-sm font-medium">Grade the written answers</p>
          <div className="ml-auto flex gap-2">
            {data.canGrade && hasUngradedWritten && (
              <Button size="sm" onClick={gradeAi} disabled={busy !== null}>
                {busy === "ai" ? <Loader2 className="animate-spin" /> : <Sparkles />}
                Grade with AI
              </Button>
            )}
            {data.canConfirm && hasUnconfirmed && (
              <Button size="sm" variant="outline" onClick={confirmAll} disabled={busy !== null}>
                {busy === "all" ? <Loader2 className="animate-spin" /> : <Check />}
                Confirm all suggestions
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Per-skill breakdown */}
      {data.perSkill.length > 0 && (
        <Card>
          <CardContent className="space-y-2.5 p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Per-skill breakdown
            </p>
            {data.perSkill.map((s) => {
              const p = s.max ? Math.round((s.awarded / s.max) * 100) : 0;
              const t = p >= 75 ? "bg-success" : p >= 50 ? "bg-warning" : "bg-destructive";
              return (
                <div key={s.skill}>
                  <div className="flex items-center justify-between text-sm">
                    <span>{s.skill}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {s.awarded}/{s.max}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div className={cn("h-full rounded-full", t)} style={{ width: `${p}%` }} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Per-question */}
      {data.canViewAnswers ? (
        data.results.map((r) => (
          <QuestionResultCard
            key={r.index}
            r={r}
            canConfirm={data.canConfirm}
            busy={busy}
            setBusy={setBusy}
          />
        ))
      ) : (
        <p className="text-sm text-muted-foreground">
          You can see the score, but not individual answers (needs the “View answers” permission).
        </p>
      )}
    </div>
  );
}

function QuestionResultCard({
  r,
  canConfirm,
  busy,
  setBusy,
}: {
  r: QuestionResult;
  canConfirm: boolean;
  busy: string | null;
  setBusy: (v: string | null) => void;
}) {
  const router = useRouter();
  const [marks, setMarks] = React.useState<number>(Number(r.awarded ?? r.aiSuggested ?? 0));
  const meta = QUESTION_TYPE_META[r.type];

  async function confirm() {
    if (!r.answerId) return;
    setBusy(r.answerId);
    const res = await confirmGradeAction(r.answerId, marks);
    setBusy(null);
    if (res.ok) {
      toast.success("Grade confirmed.");
      router.refresh();
    } else toast.error(res.error);
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex size-5 items-center justify-center rounded bg-muted font-semibold text-foreground">
            {r.index}
          </span>
          <Badge variant="outline">{meta.label}</Badge>
          {r.skill && <span>· {r.skill}</span>}
          <span className="ml-auto tabular-nums">
            {r.confirmed ? `${r.awarded ?? 0}/${r.marks}` : `— /${r.marks}`} marks
          </span>
        </div>

        <p className="text-sm font-medium">{r.prompt}</p>

        {r.auto ? (
          <div className="space-y-1.5 text-sm">
            <div className="flex items-center gap-2">
              {r.isCorrect ? (
                <CircleCheck className="size-4 text-success" />
              ) : (
                <CircleX className="size-4 text-destructive" />
              )}
              <span className="text-muted-foreground">Answered:</span>
              <span>{r.selectedTexts.length ? r.selectedTexts.join(", ") : "— (blank)"}</span>
            </div>
            {!r.isCorrect && (
              <p className="text-xs text-muted-foreground">
                Correct: {r.correctTexts.join(", ")}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
              <p className="mb-1 text-xs font-medium text-muted-foreground">Candidate answer</p>
              {r.answerText ? (
                <p className="whitespace-pre-wrap">{r.answerText}</p>
              ) : (
                <p className="italic text-muted-foreground">No answer provided.</p>
              )}
            </div>

            {r.aiSuggested != null && (
              <div className="rounded-lg border border-primary/20 bg-primary-soft/40 p-3 text-sm">
                <p className="flex items-center gap-1.5 text-xs font-medium text-primary">
                  <Sparkles className="size-3" /> AI suggests {r.aiSuggested}/{r.marks}
                </p>
                {r.aiRationale && <p className="mt-1 text-muted-foreground">{r.aiRationale}</p>}
              </div>
            )}

            {canConfirm && r.answerId && (
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground">Marks</label>
                <Input
                  type="number"
                  min={0}
                  max={r.marks}
                  value={marks}
                  onChange={(e) => setMarks(Math.max(0, Math.min(r.marks, Number(e.target.value) || 0)))}
                  className="h-8 w-20"
                />
                <span className="text-xs text-muted-foreground">/ {r.marks}</span>
                {r.confirmed ? (
                  <span className="ml-auto inline-flex items-center gap-1 text-xs text-success">
                    <Check className="size-3.5" /> Confirmed
                  </span>
                ) : (
                  <Button size="sm" className="ml-auto" onClick={confirm} disabled={busy === r.answerId}>
                    {busy === r.answerId ? <Loader2 className="animate-spin" /> : <Check />}
                    Confirm
                  </Button>
                )}
              </div>
            )}
            {r.confirmed && !canConfirm && (
              <p className="text-xs text-success">Confirmed: {r.awarded}/{r.marks}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
