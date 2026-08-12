"use client";

import { Loader2, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { declareConflictAction, withdrawConflictAction } from "@/server/candidates/collaboration-actions";

export type ConflictView = { name: string; reason: string | null; isOwn: boolean };

export function ConflictSection({
  candidateId,
  conflicts,
}: {
  candidateId: string;
  conflicts: ConflictView[];
}) {
  const router = useRouter();
  const hasOwn = conflicts.some((c) => c.isOwn);
  const [editing, setEditing] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function declare() {
    setBusy(true);
    const r = await declareConflictAction(candidateId, reason);
    setBusy(false);
    if (r.ok) {
      toast.success(r.message ?? "Declared.");
      setEditing(false);
      setReason("");
      router.refresh();
    } else toast.error(r.error);
  }

  async function withdraw() {
    setBusy(true);
    const r = await withdrawConflictAction(candidateId);
    setBusy(false);
    if (r.ok) {
      toast.success(r.message ?? "Withdrawn.");
      router.refresh();
    } else toast.error(r.error);
  }

  if (conflicts.length === 0 && !editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <ShieldAlert className="size-3.5" /> Declare a conflict of interest
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-warning/30 bg-warning-soft/50 p-3.5">
      <div className="flex items-center gap-2">
        <ShieldAlert className="size-4 text-warning" />
        <p className="text-sm font-semibold">Conflict of interest</p>
      </div>
      {conflicts.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm">
          {conflicts.map((c, i) => (
            <li key={i} className="text-muted-foreground">
              <span className="font-medium text-foreground">{c.name}</span>
              {c.isOwn ? " (you)" : ""} declared a conflict{c.reason ? ` — ${c.reason}` : ""}.
            </li>
          ))}
        </ul>
      )}

      {editing ? (
        <div className="mt-3 space-y-2">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Reason (optional) — e.g. former colleague, personal relationship…"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={busy}>
              Cancel
            </Button>
            <Button size="sm" onClick={declare} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : null} Declare
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3">
          {hasOwn ? (
            <Button variant="outline" size="sm" onClick={withdraw} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : null} Withdraw my declaration
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <ShieldAlert /> I have a conflict
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
