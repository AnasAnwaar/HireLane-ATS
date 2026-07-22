"use client";

import { Check, Eye, EyeOff, Loader2, MailCheck } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { useActionState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/validation/auth";
import { cn } from "@/lib/utils";
import { signUpAction } from "@/server/auth/actions";

const PRESETS = [
  {
    value: "standard",
    name: "Standard",
    hint: "Six ready-made roles. Recommended — you can change everything later.",
  },
  {
    value: "strict",
    name: "Strict",
    hint: "Least privilege. Almost nothing is granted until you grant it.",
  },
] as const;

/** Live password checklist — clearer than one error after submission. */
function PasswordRules({ value }: { value: string }) {
  const rules = [
    { label: "At least 10 characters", met: value.length >= 10 },
    { label: "Upper and lower case", met: /[a-z]/.test(value) && /[A-Z]/.test(value) },
    { label: "A number", met: /[0-9]/.test(value) },
  ];

  return (
    <ul className="mt-2 space-y-1">
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
  );
}

export function SignupForm() {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    signUpAction,
    null,
  );
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [preset, setPreset] = React.useState<string>("standard");

  const fieldErrors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  // Confirmation-email state: the form is done, nothing left to edit.
  if (state?.ok && state.message) {
    return (
      <div className="text-center">
        <span className="mx-auto mb-5 flex size-12 items-center justify-center rounded-full bg-success-soft">
          <MailCheck className="size-6 text-success" />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">Check your email</h1>
        <p className="mt-2 text-sm text-muted-foreground">{state.message}</p>
        <p className="mt-6 text-sm text-muted-foreground">
          Wrong address?{" "}
          <Link href="/signup" className="font-medium text-primary underline-offset-4 hover:underline">
            Start again
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Create your workspace</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        You&rsquo;ll be the owner, with full control over roles and permissions.
      </p>

      {state && !state.ok && (
        <Alert variant="destructive" className="mt-6">
          {state.error}
        </Alert>
      )}

      <form action={formAction} className="mt-6 space-y-4" noValidate>
        <Field
          id="companyName"
          label="Company name"
          error={fieldErrors.companyName}
          required
        >
          <Input name="companyName" autoComplete="organization" placeholder="Acme Tech" required />
        </Field>

        <Field id="fullName" label="Your name" error={fieldErrors.fullName} required>
          <Input name="fullName" autoComplete="name" placeholder="Anas Anwaar" required />
        </Field>

        <Field id="email" label="Work email" error={fieldErrors.email} required>
          <Input
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            required
          />
        </Field>

        <Field id="password" label="Password" error={fieldErrors.password} required>
          <div className="relative">
            <Input
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              className="pr-10"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-0 top-0 flex h-9 w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </Field>
        <PasswordRules value={password} />

        <fieldset className="pt-1">
          <legend className="text-sm font-medium">Starting permissions</legend>
          <p className="mt-0.5 text-xs text-muted-foreground">
            A starting point only — every permission is editable afterwards.
          </p>
          <input type="hidden" name="preset" value={preset} />
          <div className="mt-2.5 grid gap-2">
            {PRESETS.map((option) => {
              const selected = preset === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setPreset(option.value)}
                  aria-pressed={selected}
                  className={cn(
                    "rounded-lg border p-3 text-left transition-colors",
                    selected
                      ? "border-primary bg-primary-soft"
                      : "border-border hover:border-primary/40 hover:bg-accent/50",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className={cn(
                        "flex size-4 items-center justify-center rounded-full border-2 transition-colors",
                        selected ? "border-primary bg-primary" : "border-border",
                      )}
                    >
                      {selected && <Check className="size-2.5 text-primary-foreground" />}
                    </span>
                    <span className="text-sm font-medium">{option.name}</span>
                  </span>
                  <span className="mt-1 block pl-6 text-xs text-muted-foreground">
                    {option.hint}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <Button type="submit" className="w-full" size="lg" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          {pending ? "Creating workspace…" : "Create workspace"}
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          By continuing you agree to our terms and privacy policy.
        </p>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
