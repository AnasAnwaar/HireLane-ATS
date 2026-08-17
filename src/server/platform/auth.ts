import "server-only";

import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/server/auth/session";

export type PlatformAdmin = {
  userId: string;
  email: string;
  fullName: string;
};

/**
 * The signed-in user IF they are a platform super-admin, else null. Deliberately
 * decoupled from org membership (a platform operator need not belong to any
 * tenant) — reads the org-independent `profiles.is_platform_admin` flag via the
 * admin client so it works regardless of the caller's RLS view.
 */
export const getPlatformAdmin = cache(async (): Promise<PlatformAdmin | null> => {
  const user = await getCurrentUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("is_platform_admin, full_name, email")
    .eq("id", user.id)
    .maybeSingle();

  if (!data?.is_platform_admin) return null;
  return { userId: user.id, email: data.email ?? user.email ?? "", fullName: data.full_name ?? "" };
});

/**
 * Full gate for the super-admin portal: must be signed in, a platform admin, and
 * stepped up to AAL2 (a verified TOTP factor — Google Authenticator). Non-admins
 * get a 404 so the portal's existence isn't revealed. Callers that pass this may
 * act cross-tenant via the admin client.
 */
export async function requirePlatformAccess(): Promise<PlatformAdmin> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent("/platform")}`);

  const admin = await getPlatformAdmin();
  if (!admin) notFound();

  // 2FA is mandatory for the portal. Reuse Supabase's AAL model.
  const supabase = await createClient();
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== "aal2") {
    // A factor exists → challenge it; otherwise the admin must enrol one first.
    if (aal?.nextLevel === "aal2") redirect("/mfa");
    redirect("/settings/security?reason=platform-2fa");
  }

  return admin;
}

/**
 * Guard for platform server actions — same requirements as requirePlatformAccess
 * (platform-admin + AAL2) but returns a result instead of redirecting, so
 * actions can surface a clean error. Actions must call this: the layout gate
 * protects the page, not a direct action invocation.
 */
export async function requirePlatformActor(): Promise<
  { ok: true; actor: PlatformAdmin } | { ok: false; error: string }
> {
  const actor = await getPlatformAdmin();
  if (!actor) return { ok: false, error: "You are not authorized for the platform portal." };

  const supabase = await createClient();
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== "aal2") return { ok: false, error: "Two-factor step-up is required." };

  return { ok: true, actor };
}
