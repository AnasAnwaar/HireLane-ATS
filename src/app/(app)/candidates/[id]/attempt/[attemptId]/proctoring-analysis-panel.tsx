"use client";

import { Loader2, ScanFace, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { INTEGRITY_LEVEL_META, PROCTORING_SEVERITY_META } from "@/lib/assessments-display";
import { cn, formatDate } from "@/lib/utils";
import type { ProctoringAnalysis } from "@/types/database";
import { analyzeProctoringAction } from "@/server/assessments/proctoring-analysis-actions";

const pct = (n: number) => `${Math.round(Math.max(0, Math.min(1, n)) * 100)}%`;

export function ProctoringAnalysisPanel({
  attemptId,
  analysis,
  canAnalyze,
  aiConfigured,
}: {
  attemptId: string;
  analysis: ProctoringAnalysis | null;
  canAnalyze: boolean;
  aiConfigured: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function run() {
    setBusy(true);
    const r = await analyzeProctoringAction(attemptId);
    setBusy(false);
    if (r.ok) {
      toast.success(r.message ?? "Analysis complete.");
      router.refresh();
    } else {
      toast.error(r.error);
    }
  }

  const AnalyzeButton = canAnalyze ? (
    <Button
      variant="outline"
      size="sm"
      onClick={run}
      disabled={busy || !aiConfigured}
      title={aiConfigured ? undefined : "A Gemini API key is required."}
    >
      {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
      {analysis ? "Re-analyze" : "Analyze with AI"}
    </Button>
  ) : null;

  if (!analysis) {
    // Nothing generated yet — offer it (or explain why it's unavailable).
    return (
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
        <Sparkles className="size-4 shrink-0" />
        <span className="flex-1">
          {canAnalyze
            ? "Generate an AI integrity verdict from the captured evidence."
            : "No AI integrity verdict yet."}
        </span>
        {AnalyzeButton}
      </div>
    );
  }

  const level = INTEGRITY_LEVEL_META[analysis.integrity_level];

  return (
    <div className="mt-4 rounded-lg border border-border bg-muted/20 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="size-4 text-primary" />
        <span className="text-sm font-semibold">AI integrity verdict</span>
        <Badge variant={level.variant} dot>
          {level.label}
        </Badge>
        <span className="text-xs text-muted-foreground">{pct(analysis.confidence)} confidence</span>
        <span className="ml-auto">{AnalyzeButton}</span>
      </div>

      <p className="mt-2.5 text-sm leading-relaxed text-foreground/90">{analysis.summary}</p>

      {analysis.findings.length > 0 && (
        <ul className="mt-3 space-y-2">
          {analysis.findings.map((f, i) => {
            const sev = PROCTORING_SEVERITY_META[f.severity];
            return (
              <li key={i} className="rounded-md border border-border bg-card p-2.5">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">{f.label}</span>
                  <Badge variant={sev.variant} className="text-[0.625rem]">
                    {sev.label}
                  </Badge>
                  <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                    {pct(f.confidence)}
                  </span>
                </div>
                <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      f.severity === "high"
                        ? "bg-destructive"
                        : f.severity === "medium"
                          ? "bg-warning"
                          : "bg-muted-foreground",
                    )}
                    style={{ width: pct(f.confidence) }}
                  />
                </div>
                {f.detail && <p className="mt-1.5 text-xs text-muted-foreground">{f.detail}</p>}
              </li>
            );
          })}
        </ul>
      )}

      {analysis.face?.analyzed && (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-border bg-card p-2.5 text-sm">
          <ScanFace className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span>
            <span className="font-medium">Check-in photo:</span>{" "}
            {analysis.face.face_present
              ? `${analysis.face.face_count === 1 ? "One person" : `${analysis.face.face_count} people`} visible`
              : "No face detected"}
            {analysis.face.note ? ` — ${analysis.face.note}` : ""}
          </span>
        </div>
      )}

      <p className="mt-3 text-xs text-muted-foreground">
        Advisory only — never auto-rejects. {analysis.model} · {formatDate(analysis.analyzed_at)}
      </p>
    </div>
  );
}
