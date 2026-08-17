import { ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";

import { MfaChallengeForm } from "@/app/(auth)/mfa/mfa-challenge-form";
import { TwoFactorCard } from "@/app/(app)/settings/security/two-factor-card";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { getMfaStatus } from "@/server/auth/mfa-status";
import { requirePlatformAdmin } from "@/server/platform/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Security · Platform" };

/**
 * Mandatory 2FA for the super-admin. The portal requires AAL2 everywhere else
 * (requirePlatformAccess), and sends admins here to enrol / step up. This page
 * itself only needs platform-admin (requirePlatformAdmin) so it stays reachable
 * before 2FA is set up.
 */
export default async function PlatformSecurityPage() {
  await requirePlatformAdmin();

  const [mfa, supabase] = await Promise.all([getMfaStatus(), createClient()]);
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  // Already verified this session — nothing to do here.
  if (aal?.currentLevel === "aal2") redirect("/platform");

  // Enrolled but this session is still aal1 → challenge to step up.
  if (mfa.enabled) {
    return (
      <div className="mx-auto max-w-md py-8">
        <Card className="p-8">
          <MfaChallengeForm />
        </Card>
      </div>
    );
  }

  // Not enrolled — mandatory setup before the portal opens.
  return (
    <div className="mx-auto max-w-lg py-8">
      <div className="mb-6 text-center">
        <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary">
          <ShieldCheck className="size-6" />
        </span>
        <h1 className="text-xl font-semibold">Secure your super-admin access</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Two-factor authentication is <strong>required</strong> for the platform portal. Set up
          Google Authenticator (or any TOTP app) to continue.
        </p>
      </div>
      <TwoFactorCard enabled={mfa.enabled} friendlyName={mfa.friendlyName} />
    </div>
  );
}
