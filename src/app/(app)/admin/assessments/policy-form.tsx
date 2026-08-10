"use client";

import { Loader2, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PROCTORING_META } from "@/lib/assessments-display";
import { cn } from "@/lib/utils";
import type { ProctoringLevel } from "@/types/database";
import type { PolicyDefaults } from "@/server/assessments/policy";
import { updateAssessmentPolicyAction } from "@/server/assessments/policy-actions";

export function PolicyForm({ policy }: { policy: PolicyDefaults }) {
  const router = useRouter();
  const [proctoring, setProctoring] = React.useState<ProctoringLevel>(policy.proctoringLevel);
  const [duration, setDuration] = React.useState(policy.durationMinutes);
  const [threshold, setThreshold] = React.useState<number | "">(policy.passingThreshold ?? "");
  const [attempts, setAttempts] = React.useState(policy.attempts);
  const [maxAttempts, setMaxAttempts] = React.useState(policy.maxAttempts);
  const [backtrack, setBacktrack] = React.useState(policy.allowBacktrack);
  const [shuffle, setShuffle] = React.useState(policy.shuffleQuestions);
  const [busy, setBusy] = React.useState(false);

  async function save() {
    setBusy(true);
    const r = await updateAssessmentPolicyAction({
      proctoringLevel: proctoring,
      durationMinutes: duration,
      passingThreshold: threshold === "" ? null : Number(threshold),
      attempts,
      allowBacktrack: backtrack,
      shuffleQuestions: shuffle,
      maxAttempts,
    });
    setBusy(false);
    if (r.ok) {
      toast.success(r.message ?? "Saved.");
      router.refresh();
    } else {
      toast.error(r.error);
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="space-y-5 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Defaults for new tests
          </p>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Proctoring level</label>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(PROCTORING_META) as ProctoringLevel[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setProctoring(p)}
                  title={PROCTORING_META[p].hint}
                  className={cn(
                    "rounded-md border px-2.5 py-1 text-xs font-medium",
                    proctoring === p
                      ? "border-primary bg-primary-soft text-primary"
                      : "border-border text-muted-foreground hover:bg-accent",
                  )}
                >
                  {PROCTORING_META[p].label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{PROCTORING_META[proctoring].hint}</p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field id="duration" label="Duration (min)">
              <Input type="number" min={0} value={duration} onChange={(e) => setDuration(Math.max(0, Number(e.target.value) || 0))} />
            </Field>
            <Field id="threshold" label="Pass %">
              <Input type="number" min={0} max={100} value={threshold} onChange={(e) => setThreshold(e.target.value === "" ? "" : Number(e.target.value))} placeholder="none" />
            </Field>
            <Field id="attempts" label="Attempts">
              <Input type="number" min={1} value={attempts} onChange={(e) => setAttempts(Math.max(1, Number(e.target.value) || 1))} />
            </Field>
          </div>

          <div className="space-y-2">
            <Toggle label="Allow going back to previous questions" checked={backtrack} onChange={setBacktrack} />
            <Toggle label="Shuffle questions by default" checked={shuffle} onChange={setShuffle} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Retakes
          </p>
          <Field id="maxAttempts" label="Maximum attempts a recruiter may grant">
            <Input
              type="number"
              min={1}
              value={maxAttempts}
              onChange={(e) => setMaxAttempts(Math.max(1, Number(e.target.value) || 1))}
              className="w-24"
            />
          </Field>
          <p className="text-xs text-muted-foreground">
            Granting a retake is blocked once an assignment reaches this many attempts.
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Save />}
          Save policy
        </Button>
      </div>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-accent"
    >
      {label}
      <span className={cn("relative h-5 w-9 rounded-full transition-colors", checked ? "bg-primary" : "bg-muted")}>
        <span
          className={cn(
            "absolute top-0.5 size-4 rounded-full bg-white transition-transform",
            checked ? "translate-x-4" : "translate-x-0.5",
          )}
        />
      </span>
    </button>
  );
}
