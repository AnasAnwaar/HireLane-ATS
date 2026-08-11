"use client";

import { AlertTriangle, Check, Gavel, Loader2, RefreshCw, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScoreRing } from "@/components/ui/score-ring";
import { RECOMMENDATION_META } from "@/lib/screening-display";
import { cn, formatDate } from "@/lib/utils";
import type {
  CoverageItem,
  CoverageStatus,
  CriterionScore,
  ScreeningConcern,
  ScreeningHighlight,
  ScreeningRecommendation,
  ScreeningStatus,
} from "@/types/database";
import {
  overrideRecommendationAction,
  screenApplicationAction,
} from "@/server/screening/actions";

export type MatchReportData = {
  applicationId: string;
  openingTitle: string;
  status: ScreeningStatus;
  score: number | null;
  recommendation: ScreeningRecommendation | null;
  summary: string | null;
  mustHaves: CoverageItem[];
  niceToHaves: CoverageItem[];
  criteria: CriterionScore[];
  highlights: ScreeningHighlight[];
  concerns: ScreeningConcern[];
  model: string | null;
  stale: boolean;
  overrideRecommendation: ScreeningRecommendation | null;
  overrideReason: string | null;
  overriddenAt: string | null;
};

const REC_ORDER: ScreeningRecommendation[] = ["strong_fit", "possible_fit", "weak_fit"];

export function MatchReport({
  report,
  canOverride,
  canRerank,
}: {
  report: MatchReportData;
  canOverride: boolean;
  canRerank: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<"rescreen" | "override" | null>(null);
  const [editingOverride, setEditingOverride] = React.useState(false);
  const [choice, setChoice] = React.useState<ScreeningRecommendation>(
    report.overrideRecommendation ?? report.recommendation ?? "possible_fit",
  );
  const [reason, setReason] = React.useState(report.overrideReason ?? "");

  const aiRec = report.recommendation;
  const effectiveRec = report.overrideRecommendation ?? aiRec;
  const isOverridden = report.overrideRecommendation != null;

  async function rescreen() {
    setBusy("rescreen");
    const result = await screenApplicationAction(report.applicationId);
    setBusy(null);
    if (result.ok) {
      toast.success(result.message ?? "Re-screened.");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  async function saveOverride() {
    setBusy("override");
    const result = await overrideRecommendationAction(report.applicationId, choice, reason);
    setBusy(null);
    if (result.ok) {
      toast.success(result.message ?? "Saved.");
      setEditingOverride(false);
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  async function clearOverride() {
    setBusy("override");
    const result = await overrideRecommendationAction(report.applicationId, null, "");
    setBusy(null);
    if (result.ok) {
      toast.success("Override cleared.");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">
          Match report
          <span className="ml-2 font-normal text-muted-foreground">· {report.openingTitle}</span>
        </CardTitle>
        <div className="flex items-center gap-2">
          {report.stale && (
            <Badge variant="warning" className="gap-1">
              <AlertTriangle className="size-3" /> Requirements changed
            </Badge>
          )}
          {canRerank && (
            <Button variant="ghost" size="sm" onClick={rescreen} disabled={busy !== null}>
              {busy === "rescreen" ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              Re-screen
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {report.status === "needs_manual_review" ? (
          <EmptyState
            icon={AlertTriangle}
            title="Needs manual review"
            body="There wasn't enough information to score this applicant fairly. Review their profile directly."
          />
        ) : report.status === "failed" ? (
          <EmptyState
            icon={X}
            title="Screening failed"
            body="The AI couldn't complete this screening. Try re-screening."
          />
        ) : (
          <>
            {/* Score + recommendation */}
            <div className="flex items-start gap-4">
              <ScoreRing score={report.score ?? 0} size={64} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {effectiveRec && (
                    <Badge variant={RECOMMENDATION_META[effectiveRec].variant} dot>
                      {RECOMMENDATION_META[effectiveRec].label}
                    </Badge>
                  )}
                  {isOverridden && (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Gavel className="size-3" /> Human override
                      {aiRec && (
                        <span>
                          {" "}
                          (AI said{" "}
                          <span className="line-through">{RECOMMENDATION_META[aiRec].label}</span>)
                        </span>
                      )}
                    </span>
                  )}
                </div>
                {report.summary && (
                  <p className="mt-1.5 text-sm leading-relaxed text-foreground/90">{report.summary}</p>
                )}
              </div>
            </div>

            {/* Weighted criteria breakdown — two columns to keep it compact */}
            {report.criteria.length > 0 && (
              <div className="space-y-2.5">
                <SectionLabel>Score breakdown</SectionLabel>
                <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                  {report.criteria.map((c) => (
                    <CriterionRow key={c.key} criterion={c} />
                  ))}
                </div>
              </div>
            )}

            {/* Requirement coverage — matched items collapse to chips; the
                exceptions (partial/missing) are spelled out with their evidence. */}
            <CoverageChips title="Must-have requirements" items={report.mustHaves} />
            <CoverageChips title="Nice-to-have" items={report.niceToHaves} />

            {/* Highlights + concerns — side by side on wider screens. Evidence is
                a hover tooltip so the takeaway line stays scannable. */}
            {(report.highlights.length > 0 || report.concerns.length > 0) && (
              <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                {report.highlights.length > 0 && (
                  <div>
                    <SectionLabel className="text-success">Highlights</SectionLabel>
                    <ul className="mt-1.5 space-y-1.5">
                      {report.highlights.map((h, i) => (
                        <li
                          key={i}
                          title={h.evidence || undefined}
                          className="flex items-start gap-1.5 text-sm"
                        >
                          <Check className="mt-0.5 size-3.5 shrink-0 text-success" />
                          <span>{h.text}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {report.concerns.length > 0 && (
                  <div>
                    <SectionLabel className="text-warning">Concerns</SectionLabel>
                    <ul className="mt-1.5 space-y-1.5">
                      {report.concerns.map((c, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-sm">
                          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
                          <span>{c.text}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Override control */}
            {(canOverride || isOverridden) && (
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                {isOverridden && !editingOverride ? (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Gavel className="size-4 text-muted-foreground" />
                    <span>
                      Overridden to{" "}
                      <strong>{RECOMMENDATION_META[report.overrideRecommendation!].label}</strong>
                      {report.overrideReason ? ` — ${report.overrideReason}` : ""}
                      {report.overriddenAt && (
                        <span className="text-muted-foreground"> · {formatDate(report.overriddenAt)}</span>
                      )}
                    </span>
                    {canOverride && (
                      <span className="ml-auto flex gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setEditingOverride(true)}>
                          Edit
                        </Button>
                        <Button variant="ghost" size="sm" onClick={clearOverride} disabled={busy !== null}>
                          Clear
                        </Button>
                      </span>
                    )}
                  </div>
                ) : canOverride && editingOverride ? (
                  <div className="space-y-2.5">
                    <p className="text-xs font-medium text-muted-foreground">
                      Override the AI recommendation
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {REC_ORDER.map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setChoice(r)}
                          className={cn(
                            "rounded-md border px-2 py-1 text-xs font-medium",
                            choice === r
                              ? "border-primary bg-primary-soft text-primary"
                              : "border-border text-muted-foreground hover:bg-accent",
                          )}
                        >
                          {RECOMMENDATION_META[r].label}
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      rows={2}
                      placeholder="Reason for the override (recorded)…"
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setEditingOverride(false)}>
                        Cancel
                      </Button>
                      <Button size="sm" onClick={saveOverride} disabled={busy !== null || !reason.trim()}>
                        {busy === "override" ? <Loader2 className="animate-spin" /> : <Gavel />}
                        Save override
                      </Button>
                    </div>
                  </div>
                ) : canOverride ? (
                  <button
                    type="button"
                    onClick={() => setEditingOverride(true)}
                    className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                  >
                    <Gavel className="size-3.5" /> Override recommendation
                  </button>
                ) : null}
              </div>
            )}

            {report.model && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Sparkles className="size-3" /> Scored by {report.model}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function SectionLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p className={cn("text-xs font-semibold uppercase tracking-wide text-muted-foreground", className)}>
      {children}
    </p>
  );
}

function CriterionRow({ criterion }: { criterion: CriterionScore }) {
  const tone =
    criterion.score >= 75 ? "bg-success" : criterion.score >= 50 ? "bg-warning" : "bg-destructive";
  return (
    <div title={criterion.note || undefined}>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="truncate">
          {criterion.label}
          {criterion.weight != null && (
            <span className="ml-1.5 text-xs text-muted-foreground">{criterion.weight}%</span>
          )}
        </span>
        <span className="font-medium tabular-nums">{criterion.score}</span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${criterion.score}%` }} />
      </div>
    </div>
  );
}

const CHIP_TONE: Record<CoverageStatus, string> = {
  matched: "border-success/30 bg-success-soft text-success",
  partial: "border-warning/30 bg-warning-soft text-warning",
  missing: "border-destructive/30 bg-destructive-soft text-destructive",
};
const DOT_TONE: Record<CoverageStatus, string> = {
  matched: "bg-success",
  partial: "bg-warning",
  missing: "bg-destructive",
};

/**
 * Requirement coverage as compact chips. Matched items are just a labelled chip
 * (evidence on hover); the exceptions that need scrutiny — partial and missing —
 * are also listed out with their evidence so nothing important hides in a tooltip.
 */
function CoverageChips({ title, items }: { title: string; items: CoverageItem[] }) {
  if (!items.length) return null;
  const matched = items.filter((i) => i.status === "matched").length;
  const exceptions = items.filter((i) => i.status !== "matched");
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <SectionLabel>{title}</SectionLabel>
        <span className="text-xs tabular-nums text-muted-foreground">
          {matched}/{items.length}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((it, i) => (
          <span
            key={i}
            title={it.evidence || undefined}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
              CHIP_TONE[it.status],
            )}
          >
            <span className={cn("size-1.5 shrink-0 rounded-full", DOT_TONE[it.status])} />
            {it.requirement}
          </span>
        ))}
      </div>
      {exceptions.length > 0 && (
        <ul className="mt-2.5 space-y-1.5">
          {exceptions.map((it, i) => (
            <li key={i} className="flex items-start gap-1.5 text-xs">
              <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", DOT_TONE[it.status])} />
              <span className="text-muted-foreground">
                <span className="font-medium text-foreground">{it.requirement}</span>
                {it.evidence && ` — ${it.evidence}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-4">
      <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}
