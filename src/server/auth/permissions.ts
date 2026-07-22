import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import type { PermissionScope } from "@/types/database";

/**
 * Server-side permission checks.
 *
 * These call the same SQL functions that RLS policies use, so the application
 * and the database can never disagree about who may do what. Checking here is
 * for *user experience* — returning a clear error instead of an empty result —
 * not for security. RLS is the boundary.
 *
 * The full engine (scope filters, field masking, `<Can>`) lands in CP-4; this is
 * the minimum needed to gate team invitations.
 */

export const hasPermission = cache(async (key: string): Promise<boolean> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("has_permission", { p_key: key });
  if (error) return false;
  return Boolean(data);
});

export const permissionScopeOf = cache(
  async (key: string): Promise<PermissionScope | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("permission_scope_of", { p_key: key });
    if (error) return null;
    return (data as PermissionScope | null) ?? null;
  },
);

export const myPermissions = cache(async (): Promise<Map<string, PermissionScope>> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_permissions");
  if (error || !data) return new Map();

  return new Map(
    (data as { permission_key: string; scope: PermissionScope }[]).map((row) => [
      row.permission_key,
      row.scope,
    ]),
  );
});
