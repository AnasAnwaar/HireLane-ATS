import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import type { Permission, PermissionScope, Role } from "@/types/database";

/**
 * Read-side data for the admin portal.
 *
 * Everything here runs through the RLS-bound client, so a viewer without the
 * relevant permission simply gets empty results — the pages guard explicitly on
 * top for a clear message rather than a blank screen.
 */

export type PermissionModule = {
  module: string;
  permissions: Permission[];
};

/** The full catalogue, grouped by module in catalogue order. */
export const getPermissionCatalogue = cache(async (): Promise<PermissionModule[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("permissions")
    .select("*")
    .order("sort_order");

  const groups: PermissionModule[] = [];
  for (const perm of (data ?? []) as Permission[]) {
    let group = groups.find((g) => g.module === perm.module);
    if (!group) {
      group = { module: perm.module, permissions: [] };
      groups.push(group);
    }
    group.permissions.push(perm);
  }
  return groups;
});

export type RoleSummary = Role & { grantCount: number; memberCount: number };

/** Roles in the org, each with how many permissions it grants and members hold it. */
export const getRoles = cache(async (organizationId: string): Promise<RoleSummary[]> => {
  const supabase = await createClient();

  const [{ data: roles }, { data: grants }, { data: memberships }] = await Promise.all([
    supabase
      .from("roles")
      .select("*")
      .eq("organization_id", organizationId)
      .order("sort_order"),
    supabase.from("role_permissions").select("role_id").eq("allowed", true),
    supabase
      .from("memberships")
      .select("role_id")
      .eq("organization_id", organizationId)
      .neq("status", "deactivated"),
  ]);

  const grantByRole = new Map<string, number>();
  for (const g of grants ?? []) {
    if (g.role_id) grantByRole.set(g.role_id, (grantByRole.get(g.role_id) ?? 0) + 1);
  }
  const memberByRole = new Map<string, number>();
  for (const m of memberships ?? []) {
    if (m.role_id) memberByRole.set(m.role_id, (memberByRole.get(m.role_id) ?? 0) + 1);
  }

  return ((roles ?? []) as Role[]).map((r) => ({
    ...r,
    grantCount: grantByRole.get(r.id) ?? 0,
    memberCount: memberByRole.get(r.id) ?? 0,
  }));
});

export type RoleGrant = { permission_key: string; allowed: boolean; scope: PermissionScope };

/** A single role plus its current grant map. */
export const getRoleWithGrants = cache(
  async (
    roleId: string,
    organizationId: string,
  ): Promise<{ role: Role; grants: Map<string, RoleGrant> } | null> => {
    const supabase = await createClient();

    const { data: role } = await supabase
      .from("roles")
      .select("*")
      .eq("id", roleId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (!role) return null;

    const { data: grants } = await supabase
      .from("role_permissions")
      .select("permission_key, allowed, scope")
      .eq("role_id", roleId);

    const map = new Map<string, RoleGrant>();
    for (const g of (grants ?? []) as RoleGrant[]) map.set(g.permission_key, g);

    return { role: role as Role, grants: map };
  },
);
