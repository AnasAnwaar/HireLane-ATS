"use server";

import { createAdminClient, createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/validation/auth";
import { authorize } from "@/server/auth/authorize";
import { getSessionContext } from "@/server/auth/session";

/**
 * Pause the whole workspace (company settings danger zone). Non-admin members
 * are then blocked at the app shell; an admin signing back in auto-reactivates
 * it. We sign the acting admin out immediately so the pause actually takes hold
 * (otherwise their next request would reactivate it).
 */
export async function deactivateCompanyAction(): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Your session has expired." };
  const auth = await authorize("administration.manage_company_profile");
  if (!auth.ok) return { ok: false, error: auth.error };

  const admin = createAdminClient();
  const { error } = await admin
    .from("organizations")
    .update({ deactivated_at: new Date().toISOString() })
    .eq("id", session.organizationId);
  if (error) return { ok: false, error: error.message };

  const supabase = await createClient();
  await supabase.auth.signOut();
  return { ok: true, redirectTo: "/login", message: "Workspace paused." };
}

/**
 * Permanently delete the organization and every account that belongs only to it
 * (GitHub-style). Owner-only, requires a fresh TOTP code when the owner has 2FA,
 * and the typed org name must match. Org-scoped data cascades on the org delete;
 * we then remove any now-orphaned auth users.
 */
export async function deleteCompanyAction(input: {
  confirmName: string;
  code?: string;
}): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Your session has expired." };
  if (!session.isOwner) return { ok: false, error: "Only the workspace owner can delete it." };

  if (input.confirmName?.trim() !== session.organizationName) {
    return { ok: false, error: "The name you typed doesn't match the workspace name." };
  }

  const supabase = await createClient();

  // Step-up 2FA when the owner has an authenticator enrolled.
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const totp = factors?.totp?.find((f) => f.status === "verified");
  if (totp) {
    if (!input.code?.trim()) return { ok: false, error: "Enter your authenticator code to confirm." };
    const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId: totp.id });
    if (cErr) return { ok: false, error: cErr.message };
    const { error: vErr } = await supabase.auth.mfa.verify({
      factorId: totp.id,
      challengeId: challenge.id,
      code: input.code.trim(),
    });
    if (vErr) return { ok: false, error: "Invalid authenticator code." };
  }

  const admin = createAdminClient();
  const orgId = session.organizationId;

  // Who belongs to this org (before the cascade removes the rows).
  const { data: members } = await admin.from("memberships").select("user_id").eq("organization_id", orgId);
  const userIds = [...new Set((members ?? []).map((m) => m.user_id))];

  // Delete the org — org-scoped tables cascade (departments, memberships, roles,
  // openings, candidates, subscriptions, …).
  const { error: delErr } = await admin.from("organizations").delete().eq("id", orgId);
  if (delErr) return { ok: false, error: delErr.message };

  // Remove auth users who no longer belong to any organization.
  for (const uid of userIds) {
    const { count } = await admin
      .from("memberships")
      .select("id", { count: "exact", head: true })
      .eq("user_id", uid);
    if ((count ?? 0) === 0) {
      await admin.auth.admin.deleteUser(uid).catch(() => {});
    }
  }

  await supabase.auth.signOut();
  return { ok: true, redirectTo: "/login", message: "Workspace deleted." };
}
