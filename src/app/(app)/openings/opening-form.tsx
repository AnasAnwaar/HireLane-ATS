"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useActionState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { EMPLOYMENT_TYPES, WORK_MODES } from "@/lib/validation/openings";
import type { ActionResult } from "@/lib/validation/auth";

type Department = { id: string; name: string };

export type OpeningFormValues = {
  title: string;
  departmentId: string;
  employmentType: string;
  workMode: string;
  location: string;
  experienceMin: string;
  experienceMax: string;
  salaryMin: string;
  salaryMax: string;
  salaryCurrency: string;
  salaryVisible: boolean;
  description: string;
  positions: string;
  applicationDeadline: string;
  mustHaves: string;
  niceToHaves: string;
  qualifications: string;
  screeningQuestions: string;
};

const EMPTY: OpeningFormValues = {
  title: "",
  departmentId: "",
  employmentType: "full_time",
  workMode: "on_site",
  location: "",
  experienceMin: "",
  experienceMax: "",
  salaryMin: "",
  salaryMax: "",
  salaryCurrency: "",
  salaryVisible: false,
  description: "",
  positions: "1",
  applicationDeadline: "",
  mustHaves: "",
  niceToHaves: "",
  qualifications: "",
  screeningQuestions: "",
};

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
const textareaClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring";

export function OpeningForm({
  action,
  departments,
  defaultCurrency,
  initial,
  mode,
}: {
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  departments: Department[];
  defaultCurrency: string;
  initial?: Partial<OpeningFormValues>;
  mode: "create" | "edit";
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    action,
    null,
  );
  const values = { ...EMPTY, salaryCurrency: defaultCurrency, ...initial };

  React.useEffect(() => {
    if (state?.ok && state.redirectTo) router.push(state.redirectTo);
  }, [state, router]);

  const fe = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  return (
    <form action={formAction} className="space-y-6" noValidate>
      {state && !state.ok && !Object.keys(fe).length && (
        <Alert variant="destructive">{state.error}</Alert>
      )}

      <Section title="Basics">
        <Field id="title" label="Job title" error={fe.title} required className="sm:col-span-2">
          <Input name="title" defaultValue={values.title} placeholder="Senior React Developer" required />
        </Field>

        <Field id="departmentId" label="Department">
          <select name="departmentId" defaultValue={values.departmentId} className={selectClass}>
            <option value="">No department</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>

        <Field id="positions" label="Positions" error={fe.positions}>
          <Input name="positions" type="number" min={1} max={999} defaultValue={values.positions} />
        </Field>

        <Field id="employmentType" label="Employment type">
          <select name="employmentType" defaultValue={values.employmentType} className={selectClass}>
            {EMPLOYMENT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>

        <Field id="workMode" label="Work mode">
          <select name="workMode" defaultValue={values.workMode} className={selectClass}>
            {WORK_MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>

        <Field id="location" label="Location">
          <Input name="location" defaultValue={values.location} placeholder="Lahore, Pakistan" />
        </Field>

        <Field id="applicationDeadline" label="Application deadline">
          <Input name="applicationDeadline" type="date" defaultValue={values.applicationDeadline} />
        </Field>
      </Section>

      <Section title="Experience & salary">
        <Field id="experienceMin" label="Min. experience (yrs)" error={fe.experienceMin}>
          <Input name="experienceMin" type="number" min={0} defaultValue={values.experienceMin} />
        </Field>
        <Field id="experienceMax" label="Max. experience (yrs)" error={fe.experienceMax}>
          <Input name="experienceMax" type="number" min={0} defaultValue={values.experienceMax} />
        </Field>

        <Field id="salaryMin" label="Salary from" error={fe.salaryMin}>
          <Input name="salaryMin" type="number" min={0} defaultValue={values.salaryMin} />
        </Field>
        <Field id="salaryMax" label="Salary to" error={fe.salaryMax}>
          <Input name="salaryMax" type="number" min={0} defaultValue={values.salaryMax} />
        </Field>
        <Field id="salaryCurrency" label="Currency">
          <Input name="salaryCurrency" maxLength={3} defaultValue={values.salaryCurrency} placeholder="USD" />
        </Field>

        <label className="flex items-center gap-2 self-end pb-2 text-sm sm:col-span-1">
          <input
            type="checkbox"
            name="salaryVisible"
            defaultChecked={values.salaryVisible}
            value="true"
            className="size-4 rounded border-input accent-[var(--primary)]"
          />
          Show salary to candidates
        </label>
      </Section>

      <Section title="Description">
        <div className="sm:col-span-2">
          <textarea
            name="description"
            defaultValue={values.description}
            rows={7}
            placeholder="What the role involves, the team, what success looks like…"
            className={textareaClass}
          />
        </div>
      </Section>

      <Section
        title="Requirements"
        hint="One per line. These feed the AI screening agent later."
      >
        <Field id="mustHaves" label="Must-have skills" className="sm:col-span-2">
          <textarea name="mustHaves" defaultValue={values.mustHaves} rows={4} className={textareaClass}
            placeholder={"React\nTypeScript\n5+ years frontend"} />
        </Field>
        <Field id="niceToHaves" label="Nice-to-have skills" className="sm:col-span-2">
          <textarea name="niceToHaves" defaultValue={values.niceToHaves} rows={3} className={textareaClass}
            placeholder={"GraphQL\nNext.js"} />
        </Field>
        <Field id="qualifications" label="Qualifications" className="sm:col-span-2">
          <textarea name="qualifications" defaultValue={values.qualifications} rows={2} className={textareaClass}
            placeholder={"BSc Computer Science or equivalent"} />
        </Field>
      </Section>

      <Section title="Screening questions" hint="Optional. Shown on the application form; one per line.">
        <div className="sm:col-span-2">
          <textarea name="screeningQuestions" defaultValue={values.screeningQuestions} rows={3} className={textareaClass}
            placeholder={"Are you eligible to work in Pakistan?\nWhat is your notice period?"} />
        </div>
      </Section>

      <div className="flex items-center justify-end gap-2 border-t border-border pt-5">
        <Button type="button" variant="ghost" asChild>
          <Link href="/openings">Cancel</Link>
        </Button>
        {mode === "create" ? (
          <>
            <Button type="submit" name="action" value="draft" variant="outline" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              Save as draft
            </Button>
            <Button type="submit" name="action" value="open" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              Create &amp; open
            </Button>
          </>
        ) : (
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            Save changes
          </Button>
        )}
      </div>
    </form>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-card">
      <h2 className="text-sm font-semibold">{title}</h2>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}
