"use client";

import { ChevronLeft, ChevronRight, Clock, Eye, Loader2, Maximize, Send, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { QUESTION_TYPE_META } from "@/lib/assessments-display";
import { cn } from "@/lib/utils";
import type { TestAnswerResponse } from "@/types/database";
import type { RunnerData } from "@/server/assessments/delivery";
import { saveAnswerAction, submitAttemptAction } from "@/server/assessments/attempt-actions";

import { useProctoring } from "./use-proctoring";

type ActiveRunner = Extract<RunnerData, { state: "active" }>;

function isAnswered(r: TestAnswerResponse | undefined): boolean {
  if (!r) return false;
  if (r.selected?.length) return true;
  return Boolean(r.text && r.text.trim());
}

function fmt(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export function TestRunner({ token, data }: { token: string; data: ActiveRunner }) {
  const router = useRouter();
  const confirm = useConfirm();
  const { questions, allowBacktrack, testTitle, expiresAt, attemptId } = data;

  const [answers, setAnswers] = React.useState<Record<string, TestAnswerResponse>>(data.answers);
  const [idx, setIdx] = React.useState(0);
  const [remaining, setRemaining] = React.useState(() =>
    Math.max(0, new Date(expiresAt).getTime() - Date.now()),
  );
  const [saving, setSaving] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const submittedRef = React.useRef(false);
  const debounce = React.useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Proctoring capture (CP-19) — no-op when the level is "off".
  const proctor = useProctoring({ token, attemptId, level: data.proctoringLevel });

  function goFullscreen() {
    document.documentElement.requestFullscreen?.().catch(() => {});
  }

  const q = questions[idx];
  const answeredCount = questions.filter((x) => isAnswered(answers[x.id])).length;

  const finish = React.useCallback(
    async (auto: boolean) => {
      if (submittedRef.current) return;
      submittedRef.current = true;
      setSubmitting(true);
      await submitAttemptAction(token, attemptId);
      if (auto) toast.message("Time's up — your assessment was submitted.");
      router.refresh();
    },
    [token, attemptId, router],
  );

  // Server-authoritative clock. Ticks locally; hard-submits at zero.
  React.useEffect(() => {
    const t = setInterval(() => {
      const rem = Math.max(0, new Date(expiresAt).getTime() - Date.now());
      setRemaining(rem);
      if (rem <= 0) {
        clearInterval(t);
        void finish(true);
      }
    }, 1000);
    return () => clearInterval(t);
  }, [expiresAt, finish]);

  async function persist(qid: string, response: TestAnswerResponse) {
    setSaving(true);
    const r = await saveAnswerAction(token, attemptId, qid, response);
    setSaving(false);
    if (!r.ok && r.expired) {
      submittedRef.current = true;
      toast.error(r.error);
      router.refresh();
    }
  }

  function setChoice(optionId: string, multi: boolean) {
    setAnswers((prev) => {
      const cur = prev[q.id]?.selected ?? [];
      const selected = multi
        ? cur.includes(optionId)
          ? cur.filter((x) => x !== optionId)
          : [...cur, optionId]
        : [optionId];
      const response = { selected };
      void persist(q.id, response);
      return { ...prev, [q.id]: response };
    });
  }

  function setText(text: string) {
    setAnswers((prev) => ({ ...prev, [q.id]: { text } }));
    clearTimeout(debounce.current[q.id]);
    debounce.current[q.id] = setTimeout(() => persist(q.id, { text }), 700);
  }

  function flushText() {
    const pending = debounce.current[q.id];
    if (pending) {
      clearTimeout(pending);
      const resp = answers[q.id];
      if (resp) void persist(q.id, resp);
    }
  }

  function go(to: number) {
    flushText();
    setIdx(Math.max(0, Math.min(questions.length - 1, to)));
  }

  async function onSubmit() {
    flushText();
    const unanswered = questions.length - answeredCount;
    const ok = await confirm({
      title: "Submit your assessment?",
      description: unanswered
        ? `${unanswered} question${unanswered === 1 ? " is" : "s are"} unanswered. You can't change your answers after submitting.`
        : "You can't change your answers after submitting.",
      confirmLabel: "Submit",
    });
    if (!ok) return;
    void finish(false);
  }

  const meta = QUESTION_TYPE_META[q.type];
  const selected = answers[q.id]?.selected ?? [];
  const low = remaining <= 60_000;
  const sr = data.screenReaderMode;

  return (
    <div className={cn("fixed inset-0 z-50 flex flex-col bg-background", sr && "text-[1.0625rem]")}>
      {/* In-test integrity warning */}
      {proctor.warning && (
        <div className="absolute inset-x-0 top-0 z-[60] flex justify-center px-4 pt-3">
          <div className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-sm font-medium text-warning shadow-lg">
            <ShieldAlert className="size-4 shrink-0" /> {proctor.warning}
          </div>
        </div>
      )}

      {/* Header */}
      <header className="flex items-center gap-3 border-b border-border bg-card px-4 py-3 sm:px-6">
        <p className="truncate text-sm font-semibold">{testTitle}</p>
        {sr && (
          <span className="rounded bg-primary-soft px-1.5 py-0.5 text-[0.625rem] font-medium text-primary">
            Screen-reader mode
          </span>
        )}
        {proctor.enabled && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.625rem] font-medium",
              proctor.flagged ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground",
            )}
            title={proctor.flagged ? "Repeated activity flagged for review" : "This assessment is monitored"}
          >
            <Eye className="size-3" /> Monitored{proctor.breaches > 0 ? ` · ${proctor.breaches}` : ""}
          </span>
        )}
        <span className="ml-auto text-xs text-muted-foreground" aria-live="polite">
          {saving ? "Saving…" : "Saved"}
        </span>
        {proctor.enabled && (
          <button
            type="button"
            onClick={goFullscreen}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
          >
            <Maximize className="size-3.5" /> Full-screen
          </button>
        )}
        <span
          role="timer"
          aria-label={`Time remaining ${fmt(remaining)}`}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm font-semibold tabular-nums",
            low ? "bg-destructive/10 text-destructive" : "bg-muted text-foreground",
          )}
        >
          <Clock className="size-4" /> {fmt(remaining)}
        </span>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-6 py-8">
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Question {idx + 1} of {questions.length}
            </span>
            <span>
              {meta.label} · {q.marks} {q.marks === 1 ? "mark" : "marks"}
            </span>
          </div>
          <p className="whitespace-pre-wrap text-lg font-medium leading-snug">{q.prompt}</p>

          <div className="mt-5 space-y-2">
            {meta.hasOptions
              ? q.options.map((o) => {
                  const on = selected.includes(o.id);
                  return (
                    <button
                      key={o.id}
                      type="button"
                      role={meta.multi ? "checkbox" : "radio"}
                      aria-checked={on}
                      onClick={() => setChoice(o.id, meta.multi)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors",
                        sr ? "text-base" : "text-sm",
                        on ? "border-primary bg-primary-soft" : "border-border hover:bg-accent",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-5 shrink-0 items-center justify-center border",
                          meta.multi ? "rounded" : "rounded-full",
                          on ? "border-primary bg-primary text-primary-foreground" : "border-input",
                        )}
                      >
                        {on && <span className="size-2 rounded-full bg-current" />}
                      </span>
                      {o.text}
                    </button>
                  );
                })
              : (
                <textarea
                  value={answers[q.id]?.text ?? ""}
                  onChange={(e) => setText(e.target.value)}
                  onBlur={flushText}
                  rows={8}
                  placeholder="Type your answer…"
                  className="w-full rounded-lg border border-input bg-background px-4 py-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-border bg-card px-4 py-3 sm:px-6">
        {/* Question palette */}
        <div className="mb-3 flex flex-wrap gap-1.5">
          {questions.map((x, i) => {
            const done = isAnswered(answers[x.id]);
            const current = i === idx;
            const reachable = allowBacktrack || i >= idx;
            return (
              <button
                key={x.id}
                type="button"
                disabled={!reachable}
                onClick={() => reachable && go(i)}
                className={cn(
                  "size-7 rounded-md border text-xs font-medium tabular-nums transition-colors",
                  current
                    ? "border-primary bg-primary text-primary-foreground"
                    : done
                      ? "border-success/40 bg-success-soft text-success"
                      : "border-border text-muted-foreground",
                  !reachable && "cursor-not-allowed opacity-40",
                )}
              >
                {i + 1}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          {allowBacktrack && (
            <Button variant="outline" size="sm" onClick={() => go(idx - 1)} disabled={idx === 0}>
              <ChevronLeft /> Back
            </Button>
          )}
          <span className="text-xs text-muted-foreground">
            {answeredCount}/{questions.length} answered
          </span>
          <div className="ml-auto flex items-center gap-2">
            {idx < questions.length - 1 ? (
              <Button size="sm" onClick={() => go(idx + 1)}>
                Next <ChevronRight />
              </Button>
            ) : null}
            <Button
              size="sm"
              variant={idx === questions.length - 1 ? "default" : "outline"}
              onClick={onSubmit}
              disabled={submitting}
            >
              {submitting ? <Loader2 className="animate-spin" /> : <Send />}
              Submit
            </Button>
          </div>
        </div>
      </footer>
    </div>
  );
}
