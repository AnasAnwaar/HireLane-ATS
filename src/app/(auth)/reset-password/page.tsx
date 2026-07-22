"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useActionState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/validation/auth";
import { resetPasswordAction } from "@/server/auth/actions";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    resetPasswordAction,
    null,
  );

  // The action cannot redirect itself: it must return so the form can surface
  // validation errors, so navigate here once it reports success.
  React.useEffect(() => {
    if (state?.ok && state.redirectTo) {
      router.replace(state.redirectTo);
    }
  }, [state, router]);

  const fieldErrors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Pick something you haven&rsquo;t used before.
      </p>

      {state && !state.ok && (
        <Alert variant="destructive" className="mt-6">
          {state.error}
        </Alert>
      )}

      <form action={formAction} className="mt-6 space-y-4" noValidate>
        <Field
          id="password"
          label="New password"
          hint="At least 10 characters, with mixed case and a number."
          error={fieldErrors.password}
          required
        >
          <Input name="password" type="password" autoComplete="new-password" required />
        </Field>

        <Field
          id="confirmPassword"
          label="Confirm new password"
          error={fieldErrors.confirmPassword}
          required
        >
          <Input name="confirmPassword" type="password" autoComplete="new-password" required />
        </Field>

        <Button type="submit" className="w-full" size="lg" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          {pending ? "Updating…" : "Update password"}
        </Button>
      </form>
    </div>
  );
}
