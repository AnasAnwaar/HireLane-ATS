"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/validation/auth";
import type { PermissionKey, PermissionScope } from "@/lib/permissions/keys";
import { authorize } from "@/server/auth/authorize";
import { getSessionContext } from "@/server/auth/session";

/**
 * Per-user permission overrides (spec §UC-0 "Per-User Overrides").
 *
 * Grant or revoke a single permission for one member without touching their
 * role. Effective permission = role → override → scope, most-restrictive-wins,
 * resolved in the database (proven by the isolation suite).
 */

async function guard(): Promise<
  { ok: true; organizationId: string; membershipId: string } | { ok: false; error: string }
> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Your session has expired." };
  const auth = await authorize("administration.manage_roles");
  if (!auth.ok) return auth;
  return { ok: true, organizationId: session.organizationId, membershipId: session.membershipId };
}

/**
 * Set an override. `allowed` true grants a permission the role lacks; false
 * revokes one the role has. Optional expiry auto-lapses the override.
 */
export async function setOverrideAction(input: {
  membershipId: string;
  permissionKey: PermissionKey;
  allowed: boolean;
  scope?: PermissionScope | null;
  expiresAt?: string | null;
  reason?: string;
}): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return g;

  const supabase = await createClient();

  // The target membership must belong to this org (RLS also enforces this).
  const { data: target } = await supabase
    .from("memberships")
    .select("id, is_owner")
    .eq("id", input.membershipId)
    .eq("organization_id", g.organizationId)
    .maybeSingle();

  if (!target) return { ok: false, error: "Member not found in this workspace." };
  if (target.is_owner) {
    return { ok: false, error: "The Owner already holds every permission; overrides don't apply." };
  }

  const { error } = await supabase.from("user_permission_overrides").upsert(
    {
      organization_id: g.organizationId,
      membership_id: input.membershipId,
      permission_key: input.permissionKey,
      allowed: input.allowed,
      scope: input.scope ?? null,
      expires_at: input.expiresAt || null,
      reason: input.reason || null,
      granted_by: g.membershipId,
    },
    { onConflict: "membership_id,permission_key" },
  );

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/users/${input.membershipId}`);
  revalidatePath("/", "layout");
  return { ok: true, message: "Override saved." };
}

/** Remove an override, returning the member to their role's permission. */
export async function removeOverrideAction(overrideId: string): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return g;

  const supabase = await createClient();
  const { data: removed, error } = await supabase
    .from("user_permission_overrides")
    .delete()
    .eq("id", overrideId)
    .eq("organization_id", g.organizationId)
    .select("membership_id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };

  if (removed) revalidatePath(`/admin/users/${removed.membership_id}`);
  revalidatePath("/", "layout");
  return { ok: true, message: "Override removed." };
}

/** Change a member's role. */
export async function changeMemberRoleAction(
  membershipId: string,
  roleId: string,
): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Your session has expired." };
  const auth = await authorize("administration.manage_users");
  if (!auth.ok) return auth;

  const supabase = await createClient();

  // Guard against assigning the Owner role by this path (transfer-ownership only).
  const { data: role } = await supabase
    .from("roles")
    .select("is_owner_role")
    .eq("id", roleId)
    .eq("organization_id", session.organizationId)
    .maybeSingle();

  if (!role) return { ok: false, error: "That role doesn't belong to this workspace." };
  if (role.is_owner_role) {
    return { ok: false, error: "Use Transfer ownership to assign the Owner role." };
  }

  const { error } = await supabase
    .from("memberships")
    .update({ role_id: roleId })
    .eq("id", membershipId)
    .eq("organization_id", session.organizationId);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/users/${membershipId}`);
  revalidatePath("/admin/users");
  revalidatePath("/", "layout");
  return { ok: true, message: "Role updated." };
}
