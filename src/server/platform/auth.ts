import "server-only";

import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import { createAdminClient } from "@/lib/supabase/server";
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
 * Full gate for the super-admin portal: must be signed in and a platform admin.
 * Non-admins get a 404 so the portal's existence isn't revealed. Callers that
 * pass this may act cross-tenant via the admin client. (Role-based only; a 2FA
 * step-up can be layered back on later if desired.)
 */
export async function requirePlatformAccess(): Promise<PlatformAdmin> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent("/platform")}`);

  const admin = await getPlatformAdmin();
  if (!admin) notFound();
  return admin;
}

/**
 * Guard for platform server actions — platform-admin required. Returns a result
 * instead of redirecting so actions can surface a clean error. Actions must call
 * this: the layout gate protects the page, not a direct action invocation.
 */
export async function requirePlatformActor(): Promise<
  { ok: true; actor: PlatformAdmin } | { ok: false; error: string }
> {
  const actor = await getPlatformAdmin();
  if (!actor) return { ok: false, error: "You are not authorized for the platform portal." };
  return { ok: true, actor };
}
