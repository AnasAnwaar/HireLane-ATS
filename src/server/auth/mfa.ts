"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/validation/auth";

/**
 * Two-factor authentication via TOTP — Google Authenticator, 1Password, Authy
 * and anything else implementing RFC 6238.
 *
 * Supabase models this as "assurance levels": a password sign-in gets you aal1;
 * verifying a TOTP code promotes the session to aal2. A user with a verified
 * factor whose session is only aal1 is signed in but not fully authenticated —
 * that is what the /mfa gate checks.
 */

export type MfaFactor = {
  id: string;
  friendlyName: string;
  status: "verified" | "unverified";
  createdAt: string;
};

export type EnrollResult =
  | { ok: true; factorId: string; qrCode: string; secret: string; uri: string }
  | { ok: false; error: string };

/** Begin enrolment: returns a QR code to scan and the secret for manual entry. */
export async function enrollTotpAction(friendlyName?: string): Promise<EnrollResult> {
  const supabase = await createClient();

  // A previous abandoned attempt leaves an unverified factor behind, and
  // Supabase rejects a duplicate friendly name. Clear those first.
  const { data: existing } = await supabase.auth.mfa.listFactors();
  for (const factor of existing?.all ?? []) {
    if (factor.status === "unverified") {
      await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: friendlyName?.trim() || `Authenticator app`,
  });

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Couldn't start two-factor setup." };
  }

  return {
    ok: true,
    factorId: data.id,
    qrCode: data.totp.qr_code,
    secret: data.totp.secret,
    uri: data.totp.uri,
  };
}

/** Finish enrolment by proving the user can generate a valid code. */
export async function verifyTotpEnrollmentAction(
  factorId: string,
  code: string,
): Promise<ActionResult> {
  const supabase = await createClient();

  const cleaned = code.replace(/\D/g, "");
  if (cleaned.length !== 6) {
    return { ok: false, error: "Enter the 6-digit code from your authenticator app." };
  }

  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
    factorId,
  });

  if (challengeError || !challenge) {
    return { ok: false, error: challengeError?.message ?? "Couldn't verify that code." };
  }

  const { error } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code: cleaned,
  });

  if (error) {
    return {
      ok: false,
      error: /invalid|incorrect/i.test(error.message)
        ? "That code isn't right. Codes expire every 30 seconds — try the current one."
        : error.message,
    };
  }

  revalidatePath("/settings/security");
  return { ok: true, message: "Two-factor authentication is on." };
}

/** Verify a code at sign-in, promoting the session from aal1 to aal2. */
export async function verifyTotpSignInAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const cleaned = String(formData.get("code") ?? "").replace(/\D/g, "");

  if (cleaned.length !== 6) {
    return { ok: false, error: "Enter the 6-digit code from your authenticator app." };
  }

  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
  if (listError) return { ok: false, error: listError.message };

  const factor = factors?.totp?.find((f) => f.status === "verified");
  if (!factor) return { ok: false, error: "No authenticator app is set up on this account." };

  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
    factorId: factor.id,
  });
  if (challengeError || !challenge) {
    return { ok: false, error: challengeError?.message ?? "Couldn't verify that code." };
  }

  const { error } = await supabase.auth.mfa.verify({
    factorId: factor.id,
    challengeId: challenge.id,
    code: cleaned,
  });

  if (error) {
    return {
      ok: false,
      error: /invalid|incorrect/i.test(error.message)
        ? "That code isn't right. Codes expire every 30 seconds — try the current one."
        : error.message,
    };
  }

  revalidatePath("/", "layout");
  return { ok: true, redirectTo: "/dashboard" };
}

/**
 * Turn 2FA off.
 *
 * Requires a fresh TOTP code: otherwise anyone who found an unlocked laptop
 * could strip the second factor without proving they hold it.
 */
export async function disableTotpAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const cleaned = String(formData.get("code") ?? "").replace(/\D/g, "");

  if (cleaned.length !== 6) {
    return { ok: false, error: "Enter a current 6-digit code to confirm." };
  }

  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor = factors?.totp?.find((f) => f.status === "verified");
  if (!factor) return { ok: false, error: "Two-factor authentication isn't enabled." };

  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
    factorId: factor.id,
  });
  if (challengeError || !challenge) {
    return { ok: false, error: "Couldn't confirm that code." };
  }

  const { error: verifyError } = await supabase.auth.mfa.verify({
    factorId: factor.id,
    challengeId: challenge.id,
    code: cleaned,
  });
  if (verifyError) {
    return { ok: false, error: "That code isn't right. Try the current one." };
  }

  const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings/security");
  return { ok: true, message: "Two-factor authentication is off." };
}

/** Cancel a half-finished enrolment. */
export async function cancelEnrollmentAction(factorId: string): Promise<ActionResult> {
  const supabase = await createClient();
  await supabase.auth.mfa.unenroll({ factorId });
  revalidatePath("/settings/security");
  return { ok: true };
}
