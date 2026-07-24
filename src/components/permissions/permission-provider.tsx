"use client";

import * as React from "react";

import type { PermissionKey, PermissionScope } from "@/lib/permissions/keys";

/**
 * Client-side permission context.
 *
 * Seeded once, server-side, from `getMyPermissions()` and passed down as a plain
 * array (a Map isn't serialisable across the server/client boundary). Client
 * components read it through `usePermissions()` / `<Can>` to show or hide UI.
 *
 * This is a convenience for rendering, NOT a security control. Every gated
 * action re-checks on the server, and RLS is the real boundary — hiding a button
 * never protects the data behind it.
 */

export type PermissionEntry = { key: PermissionKey; scope: PermissionScope };

type PermissionContextValue = {
  map: ReadonlyMap<PermissionKey, PermissionScope>;
};

const PermissionContext = React.createContext<PermissionContextValue | null>(null);

export function PermissionProvider({
  permissions,
  children,
}: {
  permissions: PermissionEntry[];
  children: React.ReactNode;
}) {
  const value = React.useMemo<PermissionContextValue>(
    () => ({ map: new Map(permissions.map((p) => [p.key, p.scope])) }),
    [permissions],
  );

  return <PermissionContext.Provider value={value}>{children}</PermissionContext.Provider>;
}

export function usePermissions() {
  const ctx = React.useContext(PermissionContext);
  if (!ctx) {
    throw new Error("usePermissions must be used within a PermissionProvider.");
  }

  const { map } = ctx;

  return React.useMemo(
    () => ({
      /** Does the caller hold this permission (at any scope)? */
      can: (key: PermissionKey) => map.has(key),
      /** Hold any one of these? */
      canAny: (...keys: PermissionKey[]) => keys.some((k) => map.has(k)),
      /** Hold all of these? */
      canAll: (...keys: PermissionKey[]) => keys.every((k) => map.has(k)),
      /** Resolved scope for a held permission, or null if not held. */
      scopeOf: (key: PermissionKey) => map.get(key) ?? null,
    }),
    [map],
  );
}
