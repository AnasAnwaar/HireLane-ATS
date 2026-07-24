"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/validation/auth";
import type { PermissionKey, PermissionScope } from "@/lib/permissions/keys";
import { authorize } from "@/server/auth/authorize";
import { getSessionContext } from "@/server/auth/session";

/**
 * Role & permission editing (spec §UC-0 "Configuring Permissions").
 *
 * Every write authorizes on `administration.manage_roles` first, then goes
 * through the RLS-bound client — which enforces the same permission AND the
 * "Owner role is immutable" rule again. The permission-change audit trigger
 * (migration 0004) records each grant edit automatically.
 */

async function guard(): Promise<
  { ok: true; organizationId: string } | { ok: false; error: string }
> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Your session has expired. Please sign in again." };
  const auth = await authorize("administration.manage_roles");
  if (!auth.ok) return auth;
  return { ok: true, organizationId: session.organizationId };
}

/** Kebab/snake a display name into a stable role key. */
function toKey(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "role";
}

const roleNameSchema = z.string().trim().min(2, "Give the role a name").max(60);

/**
 * Create a role — blank, or cloned from an existing one (spec: create / clone).
 */
export async function createRoleAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return g;

  const parsedName = roleNameSchema.safeParse(formData.get("name"));
  if (!parsedName.success) {
    return { ok: false, error: parsedName.error.issues[0].message };
  }
  const name = parsedName.data;
  const cloneFromId = String(formData.get("cloneFrom") || "");

  const supabase = await createClient();

  // Unique key within the org — append a number on collision.
  let key = toKey(name);
  const { data: existing } = await supabase
    .from("roles")
    .select("key")
    .eq("organization_id", g.organizationId);
  const taken = new Set((existing ?? []).map((r) => r.key));
  if (taken.has(key)) {
    let n = 2;
    while (taken.has(`${key}_${n}`)) n++;
    key = `${key}_${n}`;
  }

  const nextOrder = (existing?.length ?? 0) + 10;

  const { data: role, error } = await supabase
    .from("roles")
    .insert({
      organization_id: g.organizationId,
      key,
      name,
      description: String(formData.get("description") || ""),
      is_system: false,
      sort_order: nextOrder,
    })
    .select("id")
    .single();

  if (error || !role) return { ok: false, error: error?.message ?? "Couldn't create the role." };

  // Clone grants from the source role (never the Owner — its grants are implicit).
  if (cloneFromId) {
    const { data: source } = await supabase
      .from("roles")
      .select("id, is_owner_role")
      .eq("id", cloneFromId)
      .eq("organization_id", g.organizationId)
      .maybeSingle();

    if (source && !source.is_owner_role) {
      const { data: grants } = await supabase
        .from("role_permissions")
        .select("permission_key, allowed, scope")
        .eq("role_id", cloneFromId);

      if (grants?.length) {
        await supabase.from("role_permissions").insert(
          grants.map((grant) => ({
            role_id: role.id,
            permission_key: grant.permission_key,
            allowed: grant.allowed,
            scope: grant.scope,
          })),
        );
      }
    }
  }

  revalidatePath("/admin/roles");
  return { ok: true, message: "Role created.", redirectTo: `/admin/roles/${role.id}` };
}

export async function renameRoleAction(
  roleId: string,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return g;

  const parsed = roleNameSchema.safeParse(formData.get("name"));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase
    .from("roles")
    .update({
      name: parsed.data,
      description: String(formData.get("description") || ""),
    })
    .eq("id", roleId)
    .eq("organization_id", g.organizationId);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/roles/${roleId}`);
  revalidatePath("/admin/roles");
  return { ok: true, message: "Role updated." };
}

/**
 * Delete a role. The database refuses if it's still assigned (spec §UC-0 A2) or
 * is the Owner role — those errors are surfaced verbatim.
 */
export async function deleteRoleAction(roleId: string): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return g;

  const supabase = await createClient();
  const { error } = await supabase
    .from("roles")
    .delete()
    .eq("id", roleId)
    .eq("organization_id", g.organizationId);

  if (error) {
    // The guard trigger raises a readable message ("still assigned to N members").
    return { ok: false, error: error.message };
  }

  revalidatePath("/admin/roles");
  return { ok: true, message: "Role deleted.", redirectTo: "/admin/roles" };
}

/**
 * Toggle a single permission for a role, or change its scope.
 *   allowed=false → the grant row is removed (absence = not granted).
 *   allowed=true  → the row is upserted with the chosen scope.
 * The Owner role is rejected by RLS; we also block it here for a clear message.
 */
export async function setRolePermissionAction(input: {
  roleId: string;
  permissionKey: PermissionKey;
  allowed: boolean;
  scope?: PermissionScope;
}): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return g;

  const supabase = await createClient();

  const { data: role } = await supabase
    .from("roles")
    .select("is_owner_role")
    .eq("id", input.roleId)
    .eq("organization_id", g.organizationId)
    .maybeSingle();

  if (!role) return { ok: false, error: "Role not found." };
  if (role.is_owner_role) {
    return { ok: false, error: "The Owner role always holds every permission and can't be edited." };
  }

  if (!input.allowed) {
    const { error } = await supabase
      .from("role_permissions")
      .delete()
      .eq("role_id", input.roleId)
      .eq("permission_key", input.permissionKey);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase.from("role_permissions").upsert(
      {
        role_id: input.roleId,
        permission_key: input.permissionKey,
        allowed: true,
        scope: input.scope ?? "all",
      },
      { onConflict: "role_id,permission_key" },
    );
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath(`/admin/roles/${input.roleId}`);
  // A member's effective permissions change; their next request re-resolves.
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Restore a role to its shipped preset defaults (spec §UC-0 A5), for roles that
 * came from a preset. Replaces the role's grants with the preset's.
 */
export async function restoreRoleDefaultsAction(roleId: string): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return g;

  const supabase = await createClient();

  const { data: role } = await supabase
    .from("roles")
    .select("key, is_system, is_owner_role")
    .eq("id", roleId)
    .eq("organization_id", g.organizationId)
    .maybeSingle();

  if (!role) return { ok: false, error: "Role not found." };
  if (role.is_owner_role) {
    return { ok: false, error: "The Owner role has no editable defaults." };
  }
  if (!role.is_system) {
    return {
      ok: false,
      error: "This is a custom role with no preset defaults to restore.",
    };
  }

  // The org was provisioned from a preset; find the matching preset grants for
  // this role key. We assume the Standard preset for restore (the common case);
  // a full "which preset" record is a future refinement.
  const { data: presetGrants } = await supabase
    .from("permission_preset_grants")
    .select("permission_key, allowed, scope")
    .eq("preset_key", "standard")
    .eq("role_key", role.key);

  await supabase.from("role_permissions").delete().eq("role_id", roleId);

  if (presetGrants?.length) {
    await supabase.from("role_permissions").insert(
      presetGrants.map((grant) => ({
        role_id: roleId,
        permission_key: grant.permission_key,
        allowed: grant.allowed,
        scope: grant.scope,
      })),
    );
  }

  revalidatePath(`/admin/roles/${roleId}`);
  revalidatePath("/", "layout");
  return { ok: true, message: "Role reset to defaults." };
}
