import "server-only";

import { scopeOf } from "@/server/auth/authorize";
import { getSessionContext } from "@/server/auth/session";
import type { PermissionKey, PermissionScope } from "@/lib/permissions/keys";

/**
 * Data-scope resolution (spec §UC-0: All / Department / Assigned / Own).
 *
 * RLS already enforces scope at the database via `can_access_record()`, so this
 * is not the security boundary. It exists so the application can:
 *   - narrow a query up front (don't fetch rows RLS will only discard), and
 *   - show the right empty-state ("no openings assigned to you" vs "none exist").
 *
 * Returned as a plain descriptor rather than a query fragment, because the
 * feature tables it applies to don't exist yet (CP-6+). Each will translate this
 * into its own `.eq()` / `.in()` filter, keeping scope logic in one shape.
 */
export type ResolvedScope =
  | { kind: "none" } // permission not held at all
  | { kind: "all" }
  | { kind: "department"; departmentId: string | null }
  | { kind: "assigned"; membershipId: string }
  | { kind: "own"; membershipId: string };

export async function resolveScope(key: PermissionKey): Promise<ResolvedScope> {
  const scope = await scopeOf(key);
  if (scope === null) return { kind: "none" };
  if (scope === "all") return { kind: "all" };

  const session = await getSessionContext();
  if (!session) return { kind: "none" };

  switch (scope satisfies PermissionScope) {
    case "department":
      // departmentId may be null (member not in a department); the caller then
      // sees only rows with no department — handled where the filter is applied.
      return { kind: "department", departmentId: session.departmentId ?? null };
    case "assigned":
      return { kind: "assigned", membershipId: session.membershipId };
    case "own":
      return { kind: "own", membershipId: session.membershipId };
    default:
      return { kind: "none" };
  }
}
