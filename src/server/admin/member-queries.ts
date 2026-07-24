import "server-only";

import { cache } from "react";

import { createAdminClient, createClient } from "@/lib/supabase/server";
import type { PermissionScope, Role } from "@/types/database";

export type MemberDetail = {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  status: string;
  isOwner: boolean;
  roleId: string | null;
  roleName: string;
  departmentName: string | null;
};

export type MemberOverride = {
  id: string;
  permissionKey: string;
  allowed: boolean;
  scope: PermissionScope | null;
  reason: string | null;
  expiresAt: string | null;
};

/** One member's full record for the admin detail page. */
export const getMemberDetail = cache(
  async (
    membershipId: string,
    organizationId: string,
  ): Promise<{ member: MemberDetail; overrides: MemberOverride[]; roles: Role[] } | null> => {
    const supabase = await createClient();

    const { data: m } = await supabase
      .from("memberships")
      .select("id, user_id, status, is_owner, role_id, roles(name), departments(name)")
      .eq("id", membershipId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (!m) return null;

    // Profile via the admin client — a colleague's profile is visible under RLS
    // to same-org members, but using the admin client keeps this robust for
    // invited (not-yet-active) members too.
    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("full_name, email")
      .eq("id", m.user_id)
      .maybeSingle();

    const [{ data: overrides }, { data: roles }] = await Promise.all([
      supabase
        .from("user_permission_overrides")
        .select("id, permission_key, allowed, scope, reason, expires_at")
        .eq("membership_id", membershipId),
      supabase
        .from("roles")
        .select("*")
        .eq("organization_id", organizationId)
        .order("sort_order"),
    ]);

    return {
      member: {
        membershipId: m.id,
        userId: m.user_id,
        name: profile?.full_name || profile?.email || "Pending",
        email: profile?.email ?? "",
        status: m.status,
        isOwner: m.is_owner,
        roleId: m.role_id,
        roleName: m.roles?.name ?? "—",
        departmentName: m.departments?.name ?? null,
      },
      overrides: (overrides ?? []).map((o) => ({
        id: o.id,
        permissionKey: o.permission_key,
        allowed: o.allowed,
        scope: o.scope,
        reason: o.reason,
        expiresAt: o.expires_at,
      })),
      roles: (roles ?? []) as Role[],
    };
  },
);
