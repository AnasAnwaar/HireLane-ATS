import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

export type SessionContext = {
  userId: string;
  email: string;
  fullName: string;
  organizationId: string;
  organizationName: string;
  membershipId: string;
  departmentId: string | null;
  roleName: string;
  isOwner: boolean;
  onboardingCompleted: boolean;
  orgSuspended: boolean;
  orgDeactivated: boolean;
};

/**
 * The signed-in user, or null.
 *
 * `getUser()` rather than `getSession()`: it revalidates the JWT with Supabase,
 * whereas `getSession()` trusts a cookie the client could have forged.
 *
 * Wrapped in React `cache` so several server components in one render share a
 * single round trip.
 */
export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;
  return user;
});

/**
 * Full tenant context: who the caller is, which organisation they are acting in,
 * and their role. Returns null when signed out or with no active membership
 * (i.e. sign-up completed but provisioning has not run yet).
 */
export const getSessionContext = cache(async (): Promise<SessionContext | null> => {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("memberships")
    .select(
      `
      id,
      is_owner,
      organization_id,
      department_id,
      organizations ( name, onboarding_completed_at, suspended_at, deactivated_at ),
      roles ( name ),
      profiles ( full_name, email )
    `,
    )
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at")
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  // A to-one embedded relation comes back as a single object (or null), now that
  // the foreign keys are declared in the generated types.
  const org = data.organizations;
  const role = data.roles;
  const profile = data.profiles;

  if (!org) return null;

  return {
    userId: user.id,
    email: profile?.email ?? user.email ?? "",
    fullName: profile?.full_name || "",
    organizationId: data.organization_id,
    organizationName: org.name,
    membershipId: data.id,
    departmentId: data.department_id,
    roleName: role?.name ?? "Member",
    isOwner: data.is_owner,
    onboardingCompleted: Boolean(org.onboarding_completed_at),
    orgSuspended: Boolean(org.suspended_at),
    orgDeactivated: Boolean(org.deactivated_at),
  };
});

/**
 * Guard for authenticated pages. Redirects rather than throwing so callers read
 * as straight-line code.
 *
 * This is a convenience gate, not the security boundary — RLS and
 * `has_permission()` are what actually protect the data.
 */
export async function requireSession(nextPath?: string): Promise<SessionContext> {
  const user = await getCurrentUser();

  if (!user) {
    const target = nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login";
    redirect(target);
  }

  const context = await getSessionContext();

  // Authenticated but no organisation: sign-up did not finish provisioning.
  if (!context) redirect("/setup");

  return context;
}
