"use client";

import { Check, Eye, EyeOff, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useActionState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/lib/validation/auth";
import { setPasswordAction } from "@/server/auth/set-password";

export function SetPasswordForm({
  email,
  fullName,
  organizationName,
}: {
  email: string;
  fullName: string;
  organizationName: string | null;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    setPasswordAction,
    null,
  );
  const [password, setPassword] = React.useState("");
  const [show, setShow] = React.useState(false);

  React.useEffect(() => {
    if (state?.ok && state.redirectTo) router.replace(state.redirectTo);
  }, [state, router]);

  const fieldErrors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  const rules = [
    { label: "At least 10 characters", met: password.length >= 10 },
    { label: "Upper and lower case", met: /[a-z]/.test(password) && /[A-Z]/.test(password) },
    { label: "A number", met: /[0-9]/.test(password) },
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">
        {organizationName ? `Join ${organizationName}` : "Set your password"}
      </h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Choose a password to finish setting up your account
        {email && (
          <>
            {" "}
            for <strong className="text-foreground">{email}</strong>
          </>
        )}
        .
      </p>

      {state && !state.ok && (
        <Alert variant="destructive" className="mt-6">
          {state.error}
        </Alert>
      )}

      <form action={formAction} className="mt-6 space-y-4" noValidate>
        <Field id="fullName" label="Your name" error={fieldErrors.fullName} required>
          <Input name="fullName" defaultValue={fullName} autoComplete="name" required />
        </Field>

        <Field id="password" label="Password" error={fieldErrors.password} required>
          <div className="relative">
            <Input
              name="password"
              type={show ? "text" : "password"}
              autoComplete="new-password"
              className="pr-10"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="absolute right-0 top-0 flex h-9 w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
              aria-label={show ? "Hide password" : "Show password"}
            >
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </Field>

        <ul className="space-y-1">
          {rules.map((rule) => (
            <li
              key={rule.label}
              className={cn(
                "flex items-center gap-1.5 text-xs transition-colors",
                rule.met ? "text-success" : "text-muted-foreground",
              )}
            >
              <Check className={cn("size-3", !rule.met && "opacity-35")} />
              {rule.label}
            </li>
          ))}
        </ul>

        <Field
          id="confirmPassword"
          label="Confirm password"
          error={fieldErrors.confirmPassword}
          required
        >
          <Input name="confirmPassword" type="password" autoComplete="new-password" required />
        </Field>

        <Button type="submit" className="w-full" size="lg" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          {pending ? "Setting up…" : "Set password and continue"}
        </Button>
      </form>
    </div>
  );
}
