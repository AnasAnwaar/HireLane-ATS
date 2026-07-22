import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

export type MfaStatus = {
  /** A verified TOTP factor exists on the account. */
  enabled: boolean;
  factorId: string | null;
  friendlyName: string | null;
  /** Signed in with a password but the second factor is still outstanding. */
  needsChallenge: boolean;
};

/**
 * Read-only MFA state. Kept apart from `mfa.ts` because that file is
 * `"use server"` — every export there must be an async action, so plain helpers
 * cannot live alongside them.
 */
export const getMfaStatus = cache(async (): Promise<MfaStatus> => {
  const supabase = await createClient();

  const [{ data: factors }, { data: aal }] = await Promise.all([
    supabase.auth.mfa.listFactors(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);

  const verified = factors?.totp?.find((f) => f.status === "verified") ?? null;

  return {
    enabled: Boolean(verified),
    factorId: verified?.id ?? null,
    friendlyName: verified?.friendly_name ?? null,
    // aal1 now, aal2 available → the account has 2FA and this session hasn't
    // satisfied it yet.
    needsChallenge: aal?.currentLevel === "aal1" && aal?.nextLevel === "aal2",
  };
});
