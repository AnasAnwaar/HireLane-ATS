"use client";

import { Loader2, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useActionState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { OtpInput } from "@/components/ui/otp-input";
import type { ActionResult } from "@/lib/validation/auth";
import { verifyTotpSignInAction } from "@/server/auth/mfa";
import { signOutAction } from "@/server/auth/actions";

export function MfaChallengeForm() {
  const router = useRouter();
  const formRef = React.useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    verifyTotpSignInAction,
    null,
  );

  React.useEffect(() => {
    if (state?.ok && state.redirectTo) router.replace(state.redirectTo);
  }, [state, router]);

  return (
    <div className="text-center">
      <span className="mx-auto mb-5 flex size-12 items-center justify-center rounded-full bg-primary-soft">
        <ShieldCheck className="size-6 text-primary" />
      </span>

      <h1 className="text-2xl font-semibold tracking-tight">Two-factor authentication</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Enter the 6-digit code from your authenticator app.
      </p>

      {state && !state.ok && (
        <Alert variant="destructive" className="mt-6 text-left">
          {state.error}
        </Alert>
      )}

      <form ref={formRef} action={formAction} className="mt-7 space-y-5">
        <OtpInput
          // Submit as soon as six digits are in — nobody wants to type a code
          // against a 30-second clock and then hunt for a button.
          onComplete={() => formRef.current?.requestSubmit()}
        />

        <Button type="submit" className="w-full" size="lg" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          {pending ? "Verifying…" : "Verify"}
        </Button>
      </form>

      <form action={signOutAction} className="mt-6">
        <button
          type="submit"
          className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Sign in with a different account
        </button>
      </form>

      <p className="mt-6 text-xs text-muted-foreground">
        Lost access to your authenticator? Ask a workspace admin to reset it for you.
      </p>
    </div>
  );
}
