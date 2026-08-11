"use client";

import { Check, Gavel, Loader2, ShieldX, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { INTEGRITY_DECISION_META } from "@/lib/assessments-display";
import { cn, formatDate } from "@/lib/utils";
import type { IntegrityDecision } from "@/types/database";
import { recordIntegrityDecisionAction } from "@/server/assessments/integrity-actions";

const CHOICES: { key: Exclude<IntegrityDecision, "pending">; icon: typeof Check }[] = [
  { key: "accepted", icon: Check },
  { key: "invalidated", icon: ShieldX },
  { key: "rejected", icon: XCircle },
];

export function IntegrityDecisionPanel({
  attemptId,
  decision,
  reason,
  decidedAt,
  decidedByName,
  canDecide,
}: {
  attemptId: string;
  decision: IntegrityDecision;
  reason: string | null;
  decidedAt: string | null;
  decidedByName: string | null;
  canDecide: boolean;
}) {
  const router = useRouter();
  const meta = INTEGRITY_DECISION_META[decision];
  const decided = decision !== "pending";

  const [editing, setEditing] = React.useState(false);
  const [choice, setChoice] = React.useState<Exclude<IntegrityDecision, "pending">>(
    decided ? (decision as Exclude<IntegrityDecision, "pending">) : "accepted",
  );
  const [why, setWhy] = React.useState(reason ?? "");
  const [busy, setBusy] = React.useState(false);

  async function save() {
    if (choice !== "accepted" && !why.trim()) {
      toast.error("A reason is required to invalidate or reject.");
      return;
    }
    setBusy(true);
    const r = await recordIntegrityDecisionAction(attemptId, choice, why);
    setBusy(false);
    if (r.ok) {
      toast.success(r.message ?? "Decision recorded.");
      setEditing(false);
      router.refresh();
    } else {
      toast.error(r.error);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-card">
      <div className="flex flex-wrap items-center gap-2">
        <Gavel className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Reviewer decision</h2>
        <Badge variant={meta.variant} dot className="ml-auto">
          {meta.label}
        </Badge>
      </div>

      {decided && !editing && (
        <p className="mt-2.5 text-sm text-muted-foreground">
          {meta.blurb}
          {reason ? <> — “{reason}”</> : null}
          {decidedByName && (
            <span className="block text-xs">
              by {decidedByName}
              {decidedAt ? ` · ${formatDate(decidedAt)}` : ""}
            </span>
          )}
        </p>
      )}

      {!decided && !editing && (
        <p className="mt-2.5 text-sm text-muted-foreground">{meta.blurb}</p>
      )}

      {canDecide && !editing && (
        <Button variant="outline" size="sm" className="mt-4" onClick={() => setEditing(true)}>
          <Gavel /> {decided ? "Change decision" : "Record decision"}
        </Button>
      )}

      {canDecide && editing && (
        <div className="mt-4 space-y-3">
          <div className="grid gap-2 sm:grid-cols-3">
            {CHOICES.map(({ key, icon: Icon }) => {
              const m = INTEGRITY_DECISION_META[key];
              const on = choice === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setChoice(key)}
                  className={cn(
                    "flex items-start gap-2 rounded-lg border p-3 text-left text-sm transition-colors",
                    on ? "border-primary bg-primary-soft" : "border-border hover:bg-accent",
                  )}
                >
                  <Icon className="mt-0.5 size-4 shrink-0" />
                  <span>
                    <span className="font-medium">{m.label}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{m.blurb}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <textarea
            value={why}
            onChange={(e) => setWhy(e.target.value)}
            rows={2}
            placeholder={
              choice === "accepted"
                ? "Optional note (recorded)…"
                : "Reason for this decision (required, recorded)…"
            }
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={busy}>
              Cancel
            </Button>
            <Button size="sm" onClick={save} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Gavel />}
              Save decision
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
