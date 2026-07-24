import "server-only";

import { getMyPermissions } from "@/server/auth/authorize";
import { FIELD_PERMISSION_KEYS, type FieldPermissionKey } from "@/lib/permissions/keys";

/**
 * Field-level visibility (spec §UC-0 step 5).
 *
 * RLS is row-level: it decides which *rows* a caller sees, not which *columns*.
 * Sensitive fields — salary, candidate contact details, ID documents, private
 * notes — are gated per role, which is dynamic, so column-level GRANTs (static,
 * coarse) don't fit. They are masked here, in the server layer, before data
 * reaches the client.
 *
 * The rule of thumb: never send a value the viewer isn't allowed to see, even
 * hidden behind a UI flag — a determined user reads it out of the payload.
 */

export type FieldVisibility = Record<FieldPermissionKey, boolean>;

/** Which sensitive fields the current caller may see. One round trip. */
export async function getFieldVisibility(): Promise<FieldVisibility> {
  const perms = await getMyPermissions();
  return Object.fromEntries(
    FIELD_PERMISSION_KEYS.map((key) => [key, perms.has(key)]),
  ) as FieldVisibility;
}

/**
 * A masked value: either the real value, or a marker that it was withheld. This
 * is deliberately explicit rather than silently returning null — the UI can then
 * show "You don't have access to this" instead of a blank that reads as "empty".
 */
export type Masked<T> = { visible: true; value: T } | { visible: false };

export function mask<T>(visible: boolean, value: T): Masked<T> {
  return visible ? { visible: true, value } : { visible: false };
}

/**
 * Redact keys from a plain object the caller may not see. Returns a shallow copy
 * with the named keys removed entirely (not nulled), so the value never travels.
 */
export function redactKeys<T extends Record<string, unknown>>(
  obj: T,
  hide: (keyof T)[],
): Partial<T> {
  const out: Partial<T> = { ...obj };
  for (const key of hide) delete out[key];
  return out;
}

/**
 * Given the caller's field visibility, list the object keys to strip. Pairs each
 * field-permission with the columns it guards so call sites stay declarative.
 */
export function hiddenFieldsFor(
  visibility: FieldVisibility,
  mapping: Partial<Record<FieldPermissionKey, string[]>>,
): string[] {
  const hidden: string[] = [];
  for (const [permission, columns] of Object.entries(mapping)) {
    if (!visibility[permission as FieldPermissionKey] && columns) {
      hidden.push(...columns);
    }
  }
  return hidden;
}
