"use client";

import { Check, Copy, Loader2, ShieldCheck, ShieldOff, Smartphone } from "lucide-react";
import * as React from "react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OtpInput } from "@/components/ui/otp-input";
import {
  cancelEnrollmentAction,
  disableTotpAction,
  enrollTotpAction,
  verifyTotpEnrollmentAction,
} from "@/server/auth/mfa";

type Enrollment = { factorId: string; qrCode: string; secret: string };

export function TwoFactorCard({
  enabled,
  friendlyName,
}: {
  enabled: boolean;
  friendlyName: string | null;
}) {
  const [enrollment, setEnrollment] = React.useState<Enrollment | null>(null);
  const [code, setCode] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [disabling, setDisabling] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  async function startEnrollment() {
    setPending(true);
    setError(null);
    const result = await enrollTotpAction();
    setPending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    setEnrollment({ factorId: result.factorId, qrCode: result.qrCode, secret: result.secret });
  }

  async function confirmEnrollment(value: string) {
    if (!enrollment) return;
    setPending(true);
    setError(null);
    const result = await verifyTotpEnrollmentAction(enrollment.factorId, value);
    setPending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    setEnrollment(null);
    setCode("");
    setNotice(result.message ?? "Two-factor authentication is on.");
    // Server components hold the enabled flag; refresh to pick it up.
    window.location.reload();
  }

  async function cancel() {
    if (enrollment) await cancelEnrollmentAction(enrollment.factorId);
    setEnrollment(null);
    setCode("");
    setError(null);
  }

  async function submitDisable(formData: FormData) {
    setPending(true);
    setError(null);
    const result = await disableTotpAction(null, formData);
    setPending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    window.location.reload();
  }

  async function copySecret() {
    if (!enrollment) return;
    await navigator.clipboard.writeText(enrollment.secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            Two-factor authentication
            {enabled ? (
              <Badge variant="success" dot>
                On
              </Badge>
            ) : (
              <Badge variant="secondary" dot>
                Off
              </Badge>
            )}
          </CardTitle>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Require a code from your authenticator app in addition to your password.
          </p>
        </div>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft">
          {enabled ? (
            <ShieldCheck className="size-4 text-primary" />
          ) : (
            <ShieldOff className="size-4 text-muted-foreground" />
          )}
        </span>
      </CardHeader>

      <CardContent className="space-y-4">
        {error && <Alert variant="destructive">{error}</Alert>}
        {notice && <Alert variant="success">{notice}</Alert>}

        {/* --- Already enabled --------------------------------------------- */}
        {enabled && !disabling && (
          <>
            <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/50 p-3">
              <Smartphone className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{friendlyName || "Authenticator app"}</p>
                <p className="text-xs text-muted-foreground">
                  You&rsquo;ll be asked for a code each time you sign in.
                </p>
              </div>
            </div>
            <Button variant="outline" onClick={() => setDisabling(true)}>
              Turn off two-factor
            </Button>
          </>
        )}

        {/* --- Turning it off ---------------------------------------------- */}
        {enabled && disabling && (
          <form action={submitDisable} className="space-y-4">
            <Alert variant="warning">
              Enter a current code to confirm. Without this, anyone with access to your
              signed-in device could remove your second factor.
            </Alert>
            <OtpInput />
            <div className="flex gap-2">
              <Button type="submit" variant="destructive" disabled={pending}>
                {pending && <Loader2 className="animate-spin" />}
                Turn off two-factor
              </Button>
              <Button type="button" variant="ghost" onClick={() => setDisabling(false)}>
                Cancel
              </Button>
            </div>
          </form>
        )}

        {/* --- Not enabled, not started ------------------------------------ */}
        {!enabled && !enrollment && (
          <Button onClick={startEnrollment} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            Set up two-factor
          </Button>
        )}

        {/* --- Enrolment in progress --------------------------------------- */}
        {!enabled && enrollment && (
          <div className="space-y-5">
            <ol className="space-y-5">
              <li>
                <p className="text-sm font-medium">
                  1. Scan this with Google Authenticator
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Or any TOTP app — Authy, 1Password, Microsoft Authenticator.
                </p>
                <div className="mt-3 inline-block rounded-xl border border-border bg-white p-3">
                  {/* Supabase returns the QR as an SVG string from our own backend. */}
                  <div
                    className="[&>svg]:size-40"
                    dangerouslySetInnerHTML={{ __html: enrollment.qrCode }}
                  />
                </div>
              </li>

              <li>
                <p className="text-sm font-medium">2. Can&rsquo;t scan? Enter this key</p>
                <div className="mt-2 flex items-center gap-2">
                  <code className="flex-1 select-all break-all rounded-lg border border-border bg-muted px-3 py-2 font-mono text-xs">
                    {enrollment.secret}
                  </code>
                  <Button type="button" variant="outline" size="icon" onClick={copySecret}>
                    {copied ? <Check className="text-success" /> : <Copy />}
                  </Button>
                </div>
              </li>

              <li>
                <p className="text-sm font-medium">3. Enter the 6-digit code</p>
                <div className="mt-3">
                  <OtpInput autoFocus={false} onComplete={(value) => {
                    setCode(value);
                    void confirmEnrollment(value);
                  }} />
                </div>
              </li>
            </ol>

            <div className="flex gap-2">
              <Button
                onClick={() => confirmEnrollment(code)}
                disabled={pending || code.length !== 6}
              >
                {pending && <Loader2 className="animate-spin" />}
                Verify and turn on
              </Button>
              <Button type="button" variant="ghost" onClick={cancel} disabled={pending}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
