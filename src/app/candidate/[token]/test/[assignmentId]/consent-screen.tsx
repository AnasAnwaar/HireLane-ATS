"use client";

import { Clock, FileQuestion, Loader2, ShieldCheck, Video } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { PROCTORING_META } from "@/lib/assessments-display";
import { formatDate } from "@/lib/utils";
import type { AssignmentView } from "@/server/assessments/delivery";
import { startAttemptAction } from "@/server/assessments/attempt-actions";

export function ConsentScreen({ token, view }: { token: string; view: AssignmentView }) {
  const router = useRouter();
  const [consent, setConsent] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const proctored = view.proctoringLevel !== "off";

  async function begin() {
    setBusy(true);
    const r = await startAttemptAction(token, view.id, consent);
    setBusy(false);
    if (r.ok) {
      router.refresh();
    } else {
      toast.error(r.error);
    }
  }

  return (
    <div className="min-h-dvh bg-background">
      <div aria-hidden className="brand-rule h-1 w-full" />
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-2xl items-center px-6">
          <BrandMark />
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">{view.testTitle}</h1>
        {view.instructions && (
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">
            {view.instructions}
          </p>
        )}

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Fact icon={FileQuestion} label="Questions" value={String(view.questionCount)} />
          <Fact icon={Clock} label="Time limit" value={view.durationMinutes ? `${view.durationMinutes} min` : "Untimed"} />
          <Fact icon={Video} label="Proctoring" value={PROCTORING_META[view.proctoringLevel as keyof typeof PROCTORING_META]?.label ?? "Standard"} />
        </div>

        {view.deadline && (
          <p className="mt-4 text-sm text-muted-foreground">
            Complete by <span className="font-medium text-foreground">{formatDate(view.deadline)}</span>.
          </p>
        )}

        <div className="mt-6 rounded-xl border border-border bg-card p-5 shadow-card">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="size-4 text-primary" /> Before you begin
          </h2>
          <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
            <li>• The timer starts as soon as you begin and keeps running if you disconnect.</li>
            <li>• Your answers save automatically — you can safely resume within the time limit.</li>
            {view.durationMinutes && <li>• The test submits itself when the time is up.</li>}
            {proctored && (
              <li>
                • This assessment is monitored ({PROCTORING_META[view.proctoringLevel as keyof typeof PROCTORING_META]?.hint ?? "activity checks"}).
              </li>
            )}
          </ul>

          <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 size-4 accent-primary"
            />
            <span>
              I understand the rules{proctored ? " and consent to monitoring during this assessment" : ""}.
            </span>
          </label>

          <Button className="mt-5 w-full" onClick={begin} disabled={busy || !consent}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            Begin assessment
          </Button>
        </div>
      </main>
    </div>
  );
}

function Fact({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 text-center shadow-card">
      <Icon className="mx-auto size-4 text-muted-foreground" />
      <p className="mt-1 text-sm font-semibold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
