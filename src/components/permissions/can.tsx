"use client";

import type * as React from "react";

import { usePermissions } from "@/components/permissions/permission-provider";
import type { PermissionKey } from "@/lib/permissions/keys";

/**
 * Conditionally render children based on the viewer's permissions.
 *
 *   <Can permission="job_openings.create">
 *     <NewOpeningButton />
 *   </Can>
 *
 *   <Can anyOf={["reporting.view_company", "reporting.view_department"]}>…</Can>
 *
 *   <Can permission="fields.view_salary" fallback={<Redacted />}>{salary}</Can>
 *
 * Reminder: this only hides UI. The server re-checks every gated action.
 */
export function Can({
  permission,
  anyOf,
  allOf,
  fallback = null,
  children,
}: {
  permission?: PermissionKey;
  anyOf?: PermissionKey[];
  allOf?: PermissionKey[];
  fallback?: React.ReactNode;
  children: React.ReactNode;
}) {
  const perms = usePermissions();

  let allowed = true;
  if (permission) allowed = allowed && perms.can(permission);
  if (anyOf?.length) allowed = allowed && perms.canAny(...anyOf);
  if (allOf?.length) allowed = allowed && perms.canAll(...allOf);

  return <>{allowed ? children : fallback}</>;
}
