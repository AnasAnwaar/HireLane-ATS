"use client";

import { Loader2, Star, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RECOMMENDATION_META, RECOMMENDATION_ORDER } from "@/lib/interviews-display";
import { cn } from "@/lib/utils";
import type { Competency, ScorecardRecommendation } from "@/types/database";
import { saveCandidateScorecardAction } from "@/server/candidates/collaboration-actions";

const DEFAULT_COMPETENCIES = ["Technical skill", "Communication", "Problem solving", "Culture fit"];

export type OwnScorecard = {
  competencies: Competency[];
  overall: number | null;
  recommendation: ScorecardRecommendation | null;
  comment: string | null;
  submitted: boolean;
};

export type ScorecardAggregate = {
  reviewers: number;
  overallAvg: number | null;
  competencyAvgs: { name: string; avg: number }[];
  recCounts: Partial<Record<ScorecardRecommendation, number>>;
};

function Stars({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" onClick={() => onChange(n)} aria-label={`${n}`}>
          <Star className={cn("size-5", value >= n ? "fill-warning text-warning" : "text-muted-foreground/40")} />
        </button>
      ))}
    </div>
  );
}

export function CandidateScorecard({
  candidateId,
  canScore,
  own,
  aggregate,
}: {
  candidateId: string;
  canScore: boolean;
  own: OwnScorecard | null;
  aggregate: ScorecardAggregate;
}) {
  const router = useRouter();
  const initial = own?.competencies?.length
    ? own.competencies
    : DEFAULT_COMPETENCIES.map((name) => ({ name, rating: 0 }));

  const [comps, setComps] = React.useState<Competency[]>(initial);
  const [overall, setOverall] = React.useState<number | null>(own?.overall ?? null);
  const [rec, setRec] = React.useState<ScorecardRecommendation | null>(own?.recommendation ?? null);
  const [comment, setComment] = React.useState(own?.comment ?? "");
  const [busy, setBusy] = React.useState<"draft" | "submit" | null>(null);
  const submitted = Boolean(own?.submitted);

  async function save(submit: boolean) {
    setBusy(submit ? "submit" : "draft");
    const r = await saveCandidateScorecardAction(
      candidateId,
      { competencies: comps, overall, recommendation: rec, comment },
      submit,
    );
    setBusy(null);
    if (r.ok) {
      toast.success(r.message ?? "Saved.");
      router.refresh();
    } else toast.error(r.error);
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Scorecard</CardTitle>
        {aggregate.reviewers > 0 && (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users className="size-3.5" /> {aggregate.reviewers} reviewer{aggregate.reviewers === 1 ? "" : "s"}
          </span>
        )}
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Aggregate across submitted scorecards */}
        {aggregate.reviewers > 0 ? (
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Panel aggregate</p>
              {aggregate.overallAvg != null && (
                <span className="inline-flex items-center gap-1 text-sm font-semibold">
                  <Star className="size-3.5 fill-warning text-warning" /> {aggregate.overallAvg.toFixed(1)}/5
                </span>
              )}
            </div>
            <div className="mt-3 space-y-2">
              {aggregate.competencyAvgs.map((c) => (
                <div key={c.name}>
                  <div className="flex items-center justify-between text-xs">
                    <span>{c.name}</span>
                    <span className="font-medium tabular-nums">{c.avg.toFixed(1)}</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${(c.avg / 5) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {RECOMMENDATION_ORDER.map((r) => {
                const n = aggregate.recCounts[r] ?? 0;
                if (!n) return null;
                return (
                  <Badge key={r} variant={RECOMMENDATION_META[r].variant}>
                    {RECOMMENDATION_META[r].label} · {n}
                  </Badge>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No submitted scorecards yet.</p>
        )}

        {/* Own scorecard */}
        {canScore && (
          <div className="border-t border-border pt-4">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold">Your scorecard</p>
              <Badge variant={submitted ? "success" : "secondary"} className="ml-auto">
                {submitted ? "Submitted" : "Draft"}
              </Badge>
            </div>
            <div className="mt-4 space-y-3">
              {comps.map((c, i) => (
                <div key={c.name} className="flex items-center justify-between gap-3">
                  <span className="text-sm">{c.name}</span>
                  <Stars
                    value={c.rating}
                    onChange={(n) => setComps((prev) => prev.map((x, j) => (j === i ? { ...x, rating: n } : x)))}
                  />
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <span className="text-sm font-medium">Overall</span>
              <Stars value={overall ?? 0} onChange={setOverall} />
            </div>
            <div className="mt-4">
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Recommendation</p>
              <div className="flex flex-wrap gap-1.5">
                {RECOMMENDATION_ORDER.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRec(r)}
                    className={cn(
                      "rounded-md border px-2.5 py-1 text-xs font-medium",
                      rec === r ? "border-primary bg-primary-soft text-primary" : "border-border text-muted-foreground hover:bg-accent",
                    )}
                  >
                    {RECOMMENDATION_META[r].label}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              placeholder="Notes to support your rating…"
              className="mt-4 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => save(false)} disabled={busy !== null}>
                {busy === "draft" ? <Loader2 className="animate-spin" /> : null} Save draft
              </Button>
              <Button size="sm" onClick={() => save(true)} disabled={busy !== null}>
                {busy === "submit" ? <Loader2 className="animate-spin" /> : null} {submitted ? "Update" : "Submit"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
