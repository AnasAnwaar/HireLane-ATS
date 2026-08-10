"use client";

import { Check, Link2, Loader2, Sparkles, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/validation/auth";
import { addCandidateAction } from "@/server/applicants/actions";
import { rerankOpeningAction } from "@/server/screening/actions";

export function ApplicantsToolbar({
  openingId,
  applyUrl,
  isOpen,
  canImport,
  canRerank,
}: {
  openingId: string;
  applyUrl: string;
  isOpen: boolean;
  canImport: boolean;
  canRerank: boolean;
}) {
  const router = useRouter();
  const [copied, setCopied] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [reranking, setReranking] = React.useState(false);
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
      {canRerank && (
        <Button variant="outline" size="sm" onClick={rerank} disabled={reranking}>
          {reranking ? <Loader2 className="animate-spin" /> : <Sparkles />}
          Re-rank all
        </Button>
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
