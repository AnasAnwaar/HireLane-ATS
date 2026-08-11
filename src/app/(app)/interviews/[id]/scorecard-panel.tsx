"use client";

import { Eye, EyeOff, Loader2, Lock, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RECOMMENDATION_META, RECOMMENDATION_ORDER } from "@/lib/interviews-display";
import { cn } from "@/lib/utils";
import type { ScorecardRecommendation } from "@/types/database";
import { saveScorecardAction } from "@/server/interviews/actions";

export type ScorecardView = {
  author: string;
  recommendation: ScorecardRecommendation | null;
  rating: number | null;
  strengths: string | null;
  concerns: string | null;
  notes: string | null;
  submitted: boolean;
};

type OwnScorecard = Omit<ScorecardView, "author">;

const taClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ScorecardPanel({
  interviewId,
  canScore,
  own,
  others,
}: {
  interviewId: string;
  canScore: boolean;
  own: OwnScorecard | null;
  others: ScorecardView[];
}) {
  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold">Scorecards</h2>
      {canScore && <OwnScorecardForm interviewId={interviewId} initial={own} />}
      <OthersScorecards others={others} ownSubmitted={Boolean(own?.submitted)} canScore={canScore} />
    </section>
  );
}

function OwnScorecardForm({
  interviewId,
  initial,
}: {
  interviewId: string;
  initial: OwnScorecard | null;
}) {
  const router = useRouter();
  const [rec, setRec] = React.useState<ScorecardRecommendation | null>(initial?.recommendation ?? null);
  const [rating, setRating] = React.useState<number | null>(initial?.rating ?? null);
  const [strengths, setStrengths] = React.useState(initial?.strengths ?? "");
  const [concerns, setConcerns] = React.useState(initial?.concerns ?? "");
  const [notes, setNotes] = React.useState(initial?.notes ?? "");
  const [busy, setBusy] = React.useState<"draft" | "submit" | null>(null);
  const submitted = Boolean(initial?.submitted);

  async function save(submit: boolean) {
    if (submit && !rec) {
      toast.error("Pick a recommendation before submitting.");
      return;
    }
    setBusy(submit ? "submit" : "draft");
    const r = await saveScorecardAction(
      interviewId,
      { recommendation: rec, rating, strengths, concerns, notes },
      submit,
    );
    setBusy(null);
    if (r.ok) {
      toast.success(r.message ?? "Saved.");
      router.refresh();
    } else {
      toast.error(r.error);
    }
  }

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold">Your scorecard</p>
        {submitted ? (
          <Badge variant="success" className="ml-auto gap-1">
            <Eye className="size-3" /> Submitted
          </Badge>
        ) : (
          <Badge variant="secondary" className="ml-auto gap-1">
            <EyeOff className="size-3" /> Draft — private until submitted
          </Badge>
        )}
      </div>

      <div className="mt-4 space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Recommendation</label>
          <div className="flex flex-wrap gap-1.5">
            {RECOMMENDATION_ORDER.map((r) => {
              const m = RECOMMENDATION_META[r];
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRec(r)}
                  className={cn(
                    "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                    rec === r ? "border-primary bg-primary-soft text-primary" : "border-border text-muted-foreground hover:bg-accent",
                  )}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Overall rating</label>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" onClick={() => setRating(n)} aria-label={`${n} stars`}>
                <Star
                  className={cn(
                    "size-6 transition-colors",
                    rating && n <= rating ? "fill-warning text-warning" : "text-muted-foreground/40",
                  )}
                />
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Strengths</label>
            <textarea rows={3} value={strengths} onChange={(e) => setStrengths(e.target.value)} className={taClass} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Concerns</label>
            <textarea rows={3} value={concerns} onChange={(e) => setConcerns(e.target.value)} className={taClass} />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Private notes</label>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={taClass} />
        </div>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => save(false)} disabled={busy !== null}>
          {busy === "draft" ? <Loader2 className="animate-spin" /> : null}
          Save draft
        </Button>
        <Button size="sm" onClick={() => save(true)} disabled={busy !== null}>
          {busy === "submit" ? <Loader2 className="animate-spin" /> : null}
          {submitted ? "Update" : "Submit"}
        </Button>
      </div>
    </Card>
  );
}

function OthersScorecards({
  others,
  ownSubmitted,
  canScore,
}: {
  others: ScorecardView[];
  ownSubmitted: boolean;
  canScore: boolean;
}) {
  const visible = others.filter((o) => o.submitted);

  if (visible.length === 0) {
    return (
      <Card className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Lock className="size-4 shrink-0" />
        {canScore && !ownSubmitted
          ? "Other panellists' scorecards stay hidden until you submit yours — no anchoring."
          : "No other scorecards are visible yet."}
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {visible.map((s, i) => (
        <Card key={i} className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">{s.author}</p>
            {s.recommendation && (
              <Badge variant={RECOMMENDATION_META[s.recommendation].variant}>
                {RECOMMENDATION_META[s.recommendation].label}
              </Badge>
            )}
            {s.rating != null && (
              <span className="ml-auto inline-flex items-center gap-1 text-sm text-muted-foreground">
                <Star className="size-3.5 fill-warning text-warning" /> {s.rating}/5
              </span>
            )}
          </div>
          {(s.strengths || s.concerns) && (
            <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
              {s.strengths && (
                <p>
                  <span className="text-xs font-medium text-success">Strengths</span>
                  <br />
                  {s.strengths}
                </p>
              )}
              {s.concerns && (
                <p>
                  <span className="text-xs font-medium text-warning">Concerns</span>
                  <br />
                  {s.concerns}
                </p>
              )}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
