"use client";

import { ArrowLeft, Loader2, MailCheck } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/validation/auth";
import { forgotPasswordAction } from "@/server/auth/actions";

export default function ForgotPasswordPage() {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    forgotPasswordAction,
    null,
  );

  if (state?.ok) {
    return (
      <div className="text-center">
        <span className="mx-auto mb-5 flex size-12 items-center justify-center rounded-full bg-success-soft">
          <MailCheck className="size-6 text-success" />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">Check your email</h1>
        <p className="mt-2 text-sm text-muted-foreground">{state.message}</p>
        <Button variant="outline" className="mt-6" asChild>
          <Link href="/login">
            <ArrowLeft /> Back to sign in
          </Link>
        </Button>
      </div>
    );
  }

  const fieldErrors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Enter your work email and we&rsquo;ll send you a reset link.
      </p>

      {state && !state.ok && (
        <Alert variant="destructive" className="mt-6">
          {state.error}
        </Alert>
      )}

      <form action={formAction} className="mt-6 space-y-4" noValidate>
        <Field id="email" label="Work email" error={fieldErrors.email} required>
          <Input
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            required
          />
        </Field>

        <Button type="submit" className="w-full" size="lg" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          {pending ? "Sending…" : "Send reset link"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm">
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          <ArrowLeft className="size-3.5" /> Back to sign in
        </Link>
      </p>
    </div>
  );
}
