"use client";

import { CheckCircle2, Loader2, Upload } from "lucide-react";
import * as React from "react";
import { useActionState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/validation/auth";
import { submitApplicationAction } from "@/server/applicants/apply-action";

type Question = { id: string; question: string; required: boolean };

export function ApplyForm({
  openingId,
  source,
  questions,
}: {
  openingId: string;
  source: string;
  questions: Question[];
}) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    submitApplicationAction,
    null,
  );
  const [fileName, setFileName] = React.useState<string | null>(null);

  if (state?.ok) {
    return (
      <div className="rounded-xl border border-success/30 bg-success-soft/50 p-10 text-center">
        <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-success/15">
          <CheckCircle2 className="size-6 text-success" />
        </span>
        <h2 className="text-xl font-semibold">Application received</h2>
        <p className="mt-2 text-sm text-muted-foreground">{state.message}</p>
      </div>
    );
  }

  const fe = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  const textareaClass =
    "w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <form action={formAction} className="space-y-6" noValidate>
      <input type="hidden" name="openingId" value={openingId} />
      <input type="hidden" name="source" value={source} />

      {state && !state.ok && !Object.keys(fe).length && (
        <Alert variant="destructive">{state.error}</Alert>
      )}

      <section className="rounded-xl border border-border bg-card p-5 shadow-card">
        <h2 className="text-sm font-semibold">About you</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field id="fullName" label="Full name" error={fe.fullName} required className="sm:col-span-2">
            <Input name="fullName" required autoComplete="name" />
          </Field>
          <Field id="email" label="Email" error={fe.email} required>
            <Input name="email" type="email" required autoComplete="email" />
          </Field>
          <Field id="phone" label="Phone" error={fe.phone}>
            <Input name="phone" type="tel" autoComplete="tel" />
          </Field>
          <Field id="location" label="Location" error={fe.location}>
            <Input name="location" placeholder="City, Country" autoComplete="address-level2" />
          </Field>
          <Field id="headline" label="Current title" error={fe.headline}>
            <Input name="headline" placeholder="Senior Frontend Engineer" />
          </Field>
          <Field id="yearsExperience" label="Years of experience" error={fe.yearsExperience}>
            <Input name="yearsExperience" type="number" min={0} max={80} />
          </Field>
          <Field id="linkedinUrl" label="LinkedIn" error={fe.linkedinUrl}>
            <Input name="linkedinUrl" placeholder="linkedin.com/in/…" />
          </Field>
          <Field id="portfolioUrl" label="Portfolio / GitHub" error={fe.portfolioUrl}>
            <Input name="portfolioUrl" placeholder="github.com/…" />
          </Field>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5 shadow-card">
        <h2 className="text-sm font-semibold">CV / Résumé</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">PDF or Word, up to 10 MB.</p>
        <label className="mt-3 flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-border bg-background px-4 py-3 text-sm transition-colors hover:border-primary/40">
          <Upload className="size-4 text-muted-foreground" />
          <span className="flex-1 truncate text-muted-foreground">
            {fileName ?? "Choose a file…"}
          </span>
          <span className="rounded-md bg-secondary px-2 py-1 text-xs font-medium">Browse</span>
          <input
            type="file"
            name="cv"
            accept=".pdf,.doc,.docx"
            className="hidden"
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
          />
        </label>
      </section>

      {questions.length > 0 && (
        <section className="rounded-xl border border-border bg-card p-5 shadow-card">
          <h2 className="text-sm font-semibold">A few questions</h2>
          <div className="mt-4 space-y-4">
            {questions.map((q) => (
              <Field key={q.id} id={`q_${q.id}`} label={q.question} required={q.required}>
                <textarea name={`answer_${q.id}`} rows={2} className={textareaClass} required={q.required} />
              </Field>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-xl border border-border bg-card p-5 shadow-card">
        <Field id="coverNote" label="Anything else you'd like us to know?" error={fe.coverNote}>
          <textarea name="coverNote" rows={4} className={textareaClass} />
        </Field>
      </section>

      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          {pending ? "Submitting…" : "Submit application"}
        </Button>
      </div>
    </form>
  );
}
