import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import type { PermissionKey, PermissionScope } from "@/lib/permissions/keys";

/**
 * Server-side authorization.
 *
 * Every check here calls the same SQL functions RLS uses (`has_permission`,
 * `permission_scope_of`, `my_permissions`), so the application and the database
 * can never disagree about who may do what.
 *
 * Two things this layer is and isn't:
 *  - It IS the place server actions and route handlers decide whether to
 *    proceed, and the place that produces a clear "access denied" instead of a
 *    silent empty result.
 *  - It is NOT the security boundary. RLS is. Even if a check here were skipped,
 *    the database still refuses the row. This layer exists for correct behaviour
 *    and good errors, not as the last line of defence.
 *
 * All reads are wrapped in React `cache`, so a single render/request resolves
 * each permission once no matter how many components ask.
 */

/** Thrown by `requirePermission`. Carries the key so callers can report it. */
export class PermissionError extends Error {
  constructor(public readonly permission: PermissionKey) {
    super(`Missing permission: ${permission}`);
    this.name = "PermissionError";
  }
}

export const can = cache(async (key: PermissionKey): Promise<boolean> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("has_permission", { p_key: key });
  if (error) return false; // fail closed
  return Boolean(data);
});

export const scopeOf = cache(
  async (key: PermissionKey): Promise<PermissionScope | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("permission_scope_of", { p_key: key });
    if (error) return null;
    return (data as PermissionScope | null) ?? null;
  },
);

/**
 * The caller's full effective permission set, as a Map for O(1) lookup. One
 * round trip; used to seed the client-side provider.
 */
export const getMyPermissions = cache(
  async (): Promise<Map<PermissionKey, PermissionScope>> => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("my_permissions");
    if (error || !data) return new Map();

    return new Map(
      (data as { permission_key: PermissionKey; scope: PermissionScope }[]).map((r) => [
        r.permission_key,
        r.scope,
      ]),
    );
  },
);

/** True if the caller holds any one of the given permissions. */
export async function canAny(...keys: PermissionKey[]): Promise<boolean> {
  const perms = await getMyPermissions();
  return keys.some((k) => perms.has(k));
}

/** True only if the caller holds every one of the given permissions. */
export async function canAll(...keys: PermissionKey[]): Promise<boolean> {
  const perms = await getMyPermissions();
  return keys.every((k) => perms.has(k));
}

/**
 * Assert a permission or throw `PermissionError`. Use at the top of a server
 * action whose whole purpose requires the permission.
 */
export async function requirePermission(key: PermissionKey): Promise<void> {
  if (!(await can(key))) throw new PermissionError(key);
}

/**
 * Permission check shaped for a server action's return value. Returns the same
 * `{ ok: false, error }` the forms already render, so a lost permission mid-flow
 * surfaces as a clear message rather than an exception (spec §UC-0 A4).
 */
export async function authorize(
  key: PermissionKey,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (await can(key)) return { ok: true };
  return {
    ok: false,
    error: "Your access has changed and you no longer have permission to do this.",
  };
}
