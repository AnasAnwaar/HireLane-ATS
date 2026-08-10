"use client";

import { Check, Link2, Loader2, SlidersHorizontal, Sparkles, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { WEIGHT_LABELS } from "@/lib/scoring-weights";
import type { ActionResult } from "@/lib/validation/auth";
import type { ScoringWeights } from "@/types/database";
import { addCandidateAction } from "@/server/applicants/actions";
import { rerankOpeningAction, updateScoringWeightsAction } from "@/server/screening/actions";

export function ApplicantsToolbar({
  openingId,
  applyUrl,
  isOpen,
  canImport,
  canRerank,
  canAdjustWeights,
  weights,
}: {
  openingId: string;
  applyUrl: string;
  isOpen: boolean;
  canImport: boolean;
  canRerank: boolean;
  canAdjustWeights: boolean;
  weights: ScoringWeights;
}) {
  const router = useRouter();
  const [copied, setCopied] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [reranking, setReranking] = React.useState(false);
  const [showWeights, setShowWeights] = React.useState(false);
  const [error, setError] = React.useState<ActionResult | null>(null);

  async function rerank() {
    setReranking(true);
    const result = await rerankOpeningAction(openingId);
    setReranking(false);
    if (result.ok) {
      toast.success(result.message ?? "Re-ranked.");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  // A manual submit handler (not useActionState) so success-side UI changes —
  // closing the modal, refreshing — happen in an event handler, not an effect.
  async function submit(formData: FormData) {
    setPending(true);
    setError(null);
    const result = await addCandidateAction(openingId, null, formData);
    setPending(false);

    if (result.ok) {
      toast.success(result.message ?? "Added.");
      setAdding(false);
      router.refresh();
    } else {
      setError(result);
    }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(applyUrl);
    setCopied(true);
    toast.success("Application link copied.");
    setTimeout(() => setCopied(false), 2000);
  }

  const fe = error && !error.ok ? (error.fieldErrors ?? {}) : {};

  return (
    <div className="flex items-center gap-2">
      {isOpen && (
        <Button variant="outline" size="sm" onClick={copyLink}>
          {copied ? <Check className="text-success" /> : <Link2 />}
          Copy apply link
        </Button>
      )}
      {canAdjustWeights && (
        <Button variant="outline" size="sm" onClick={() => setShowWeights(true)}>
          <SlidersHorizontal /> Weights
        </Button>
      )}
      {canRerank && (
        <Button variant="outline" size="sm" onClick={rerank} disabled={reranking}>
          {reranking ? <Loader2 className="animate-spin" /> : <Sparkles />}
          Re-rank all
        </Button>
      )}
      {canAdjustWeights && (
        <WeightsDialog
          open={showWeights}
          openingId={openingId}
          initial={weights}
          onClose={() => setShowWeights(false)}
          onSaved={() => {
            setShowWeights(false);
            router.refresh();
          }}
        />
      )}
      {canImport && (
        <Button size="sm" onClick={() => setAdding(true)}>
          <UserPlus /> Add candidate
        </Button>
      )}

      {adding && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-20">
          <button className="absolute inset-0" aria-label="Close" onClick={() => setAdding(false)} />
          <div className="relative z-10 w-full max-w-lg rounded-xl border border-border bg-card p-5 text-left shadow-card-lg">
            <h2 className="font-semibold">Add a candidate</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Add someone to this opening manually — sourced elsewhere, or a referral.
            </p>

            {error && !error.ok && !Object.keys(fe).length && (
              <Alert variant="destructive" className="mt-4">
                {error.error}
              </Alert>
            )}

            <form action={submit} className="mt-4 space-y-4" noValidate>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="fullName" label="Full name" error={fe.fullName} required className="sm:col-span-2">
                  <Input name="fullName" required autoFocus />
                </Field>
                <Field id="email" label="Email" error={fe.email} required>
                  <Input name="email" type="email" required />
                </Field>
                <Field id="phone" label="Phone" error={fe.phone}>
                  <Input name="phone" type="tel" />
                </Field>
                <Field id="headline" label="Current title" error={fe.headline}>
                  <Input name="headline" />
                </Field>
                <Field id="location" label="Location" error={fe.location}>
                  <Input name="location" />
                </Field>
                <Field id="yearsExperience" label="Years experience" error={fe.yearsExperience}>
                  <Input name="yearsExperience" type="number" min={0} max={80} />
                </Field>
                <Field id="source" label="Source" error={fe.source}>
                  <Input name="source" placeholder="Referral, LinkedIn…" defaultValue="manual" />
                </Field>
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending && <Loader2 className="animate-spin" />}
                  Add candidate
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function WeightsDialog({
  open,
  openingId,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  openingId: string;
  initial: ScoringWeights;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [w, setW] = React.useState<ScoringWeights>(initial);
  const [saving, setSaving] = React.useState(false);
  const total = w.skills + w.experience + w.qualification;

  function set(key: keyof ScoringWeights, value: string) {
    const n = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
    setW((prev) => ({ ...prev, [key]: n }));
  }

  async function save() {
    setSaving(true);
    const result = await updateScoringWeightsAction(openingId, w);
    setSaving(false);
    if (result.ok) {
      toast.success(result.message ?? "Saved.");
      onSaved();
    } else {
      toast.error(result.error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Scoring weights</DialogTitle>
          <DialogDescription>
            Tune how much each dimension counts toward the match score. Saving re-ranks every
            applicant instantly — no re-screening needed.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {(Object.keys(WEIGHT_LABELS) as (keyof ScoringWeights)[]).map((key) => (
            <div key={key} className="flex items-center gap-3">
              <label className="w-28 text-sm">{WEIGHT_LABELS[key]}</label>
              <input
                type="range"
                min={0}
                max={100}
                value={w[key]}
                onChange={(e) => set(key, e.target.value)}
                className="flex-1 accent-primary"
              />
              <Input
                type="number"
                min={0}
                max={100}
                value={w[key]}
                onChange={(e) => set(key, e.target.value)}
                className="w-16"
              />
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            Weights are relative (they don&rsquo;t need to total 100). Current total: {total}.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || total === 0}>
            {saving ? <Loader2 className="animate-spin" /> : <SlidersHorizontal />}
            Save &amp; re-rank
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
