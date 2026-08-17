import "server-only";

import { createAdminClient } from "@/lib/supabase/server";

import type { PlatformAdmin } from "./auth";

/**
 * Append a row to platform_audit_log. Every privileged super-admin action
 * (plan edits, org changes, impersonation, …) records who did what to which
 * target. Best-effort: a logging failure must never block the action, but it is
 * surfaced to the server console.
 */
export async function logPlatformAction(
  actor: PlatformAdmin,
  action: string,
  target?: { type?: string; id?: string; detail?: Record<string, unknown> },
): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("platform_audit_log").insert({
      actor_user_id: actor.userId,
      actor_email: actor.email,
      action,
      target_type: target?.type ?? null,
      target_id: target?.id ?? null,
      detail: target?.detail ?? {},
    });
  } catch (err) {
    console.error("platform audit log failed", { action, err });
  }
}
