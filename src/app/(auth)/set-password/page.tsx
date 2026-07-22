import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/server/auth/session";

import { SetPasswordForm } from "./set-password-form";

export const metadata = { title: "Set your password" };

/**
 * Where an invited team member lands after clicking the emailed link.
 *
 * The link already established a session (via /auth/callback), so there is no
 * token to validate here — they are signed in, they just have no password and
 * an `invited` membership waiting to be activated.
 */
export default async function SetPasswordPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Look up the workspace they were invited to. The admin client is required:
  // an invited membership is not yet active, so RLS hides it from them.
  const admin = createAdminClient();
  let organizationName: string | null = null;

  try {
    const { data: membership } = await admin
      .from("memberships")
      .select("organization_id, status")
      .eq("user_id", user.id)
      .order("created_at")
      .limit(1)
      .maybeSingle();

    // Already active with a password set — nothing to do here.
    if (membership?.status === "active" && user.user_metadata?.password_set) {
      redirect("/dashboard");
    }

    if (membership) {
      const { data: org } = await admin
        .from("organizations")
        .select("name")
        .eq("id", membership.organization_id)
        .maybeSingle();
      organizationName = org?.name ?? null;
    }
  } catch {
    // Fall through with no name — the form still works.
  }

  return (
    <SetPasswordForm
      email={user.email ?? ""}
      fullName={(user.user_metadata?.full_name as string) ?? ""}
      organizationName={organizationName}
    />
  );
}
