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

/** Whether the current session has stepped up to a verified second factor. */
async function isAal2(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return data?.currentLevel === "aal2";
}

/**
 * Platform-admin gate WITHOUT the 2FA step-up. Used by the portal layout and the
 * /platform/security page (which is where 2FA gets set up, so it can't itself
 * require 2FA). Non-admins get a 404 so the portal stays hidden.
 */
export async function requirePlatformAdmin(): Promise<PlatformAdmin> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent("/platform")}`);

  const admin = await getPlatformAdmin();
  if (!admin) notFound();
  return admin;
}

/**
 * Full gate for super-admin content: platform-admin + mandatory 2FA (a verified
 * TOTP factor via Google Authenticator). Admins who haven't enrolled/stepped up
 * are sent to /platform/security to do so.
 */
export async function requirePlatformAccess(): Promise<PlatformAdmin> {
  const admin = await requirePlatformAdmin();
  if (!(await isAal2())) redirect("/platform/security");
  return admin;
}

/**
 * Guard for platform server actions — platform-admin + 2FA. Returns a result
 * instead of redirecting so actions can surface a clean error.
 */
export async function requirePlatformActor(): Promise<
  { ok: true; actor: PlatformAdmin } | { ok: false; error: string }
> {
  const actor = await getPlatformAdmin();
  if (!actor) return { ok: false, error: "You are not authorized for the platform portal." };
  if (!(await isAal2())) return { ok: false, error: "Two-factor step-up is required." };
  return { ok: true, actor };
}
