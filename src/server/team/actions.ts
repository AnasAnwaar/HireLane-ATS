"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { clientEnv } from "@/lib/env";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { toFieldErrors, type ActionResult } from "@/lib/validation/auth";
import { hasPermission } from "@/server/auth/permissions";
import { getSessionContext } from "@/server/auth/session";

const inviteSchema = z.object({
  email: z.email("Enter a valid email address").max(255),
  fullName: z.string().trim().min(2, "Enter their name").max(120),
  roleId: z.uuid("Choose a role"),
  departmentId: z.string().optional(),
});

/**
 * Invite a team member.
 *
 * Uses Supabase's own `inviteUserByEmail`, which creates the auth user and
 * sends the invitation email in one step — so there is no bespoke token to
 * generate, store, expire or leak. The link lands on /auth/callback, which
 * establishes a session and forwards to /set-password.
 *
 * The membership row is created immediately with status `invited`, carrying the
 * role the admin chose. It is flipped to `active` once they set a password, so
 * an un-activated invitee can never act inside the workspace.
 */
export async function inviteTeamMemberAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Your session has expired. Please sign in again." };

  if (!(await hasPermission("administration.manage_users"))) {
    return { ok: false, error: "You don't have permission to invite team members." };
  }

  const parsed = inviteSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please correct the highlighted fields.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  }

  const { email, fullName, roleId, departmentId } = parsed.data;
  const admin = createAdminClient();

  // The chosen role must belong to *this* organisation — otherwise an admin
  // could smuggle in a role id belonging to another tenant.
  const { data: role } = await admin
    .from("roles")
    .select("id, is_owner_role")
    .eq("id", roleId)
    .eq("organization_id", session.organizationId)
    .maybeSingle();

  if (!role) return { ok: false, error: "That role doesn't belong to your organisation." };
  if (role.is_owner_role) {
    return {
      ok: false,
      error: "The Owner role can't be assigned by invitation. Use Transfer ownership instead.",
    };
  }

  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${clientEnv.NEXT_PUBLIC_APP_URL}/auth/callback?next=/set-password`,
    data: { full_name: fullName, invited_to_organization: session.organizationId },
  });

  // Already has an account: reuse it rather than failing. They may be joining a
  // second workspace, or re-invited after a revoked invitation.
  let userId = invited?.user?.id;

  if (inviteError) {
    const alreadyExists = /already been registered|already registered|email_exists/i.test(
      inviteError.message,
    );
    if (!alreadyExists) {
      return { ok: false, error: `Couldn't send the invitation: ${inviteError.message}` };
    }

    const { data: existing } = await admin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (!existing) {
      return { ok: false, error: "That email is already in use but the account can't be found." };
    }
    userId = existing.id;
  }

  if (!userId) return { ok: false, error: "Couldn't create the invited account." };

  const { data: existingMembership } = await admin
    .from("memberships")
    .select("id, status")
    .eq("organization_id", session.organizationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (existingMembership && existingMembership.status === "active") {
    return { ok: false, error: "That person is already a member of this workspace." };
  }

  const membership = {
    organization_id: session.organizationId,
    user_id: userId,
    role_id: roleId,
    department_id: departmentId || null,
    status: "invited" as const,
  };

  const { error: membershipError } = existingMembership
    ? await admin.from("memberships").update(membership).eq("id", existingMembership.id)
    : await admin.from("memberships").insert(membership);

  if (membershipError) {
    return { ok: false, error: `Couldn't add them to the workspace: ${membershipError.message}` };
  }

  await admin.from("audit_log").insert({
    organization_id: session.organizationId,
    actor_membership_id: session.membershipId,
    actor_email: session.email,
    actor_name: session.fullName,
    action: "member.invited",
    entity_type: "membership",
    entity_id: userId,
    summary: `Invited ${email}`,
    after_state: { email, role_id: roleId },
  });

  revalidatePath("/admin/users");
  return { ok: true, message: `Invitation sent to ${email}.` };
}

/** Re-send an invitation email to someone who has not activated yet. */
export async function resendInvitationAction(membershipId: string): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Your session has expired." };

  if (!(await hasPermission("administration.manage_users"))) {
    return { ok: false, error: "You don't have permission to do that." };
  }

  const admin = createAdminClient();

  const { data: membership } = await admin
    .from("memberships")
    .select("user_id, status")
    .eq("id", membershipId)
    .eq("organization_id", session.organizationId)
    .maybeSingle();

  if (!membership) return { ok: false, error: "Member not found." };
  if (membership.status === "active") {
    return { ok: false, error: "That member has already activated their account." };
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("email")
    .eq("id", membership.user_id)
    .maybeSingle();

  if (!profile) return { ok: false, error: "Their account could not be found." };

  const { error } = await admin.auth.admin.inviteUserByEmail(profile.email, {
    redirectTo: `${clientEnv.NEXT_PUBLIC_APP_URL}/auth/callback?next=/set-password`,
  });

  if (error) return { ok: false, error: `Couldn't resend: ${error.message}` };

  revalidatePath("/admin/users");
  return { ok: true, message: `Invitation resent to ${profile.email}.` };
}

/** Deactivate a member. Their history stays for the audit trail. */
export async function deactivateMemberAction(membershipId: string): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Your session has expired." };

  if (!(await hasPermission("administration.manage_users"))) {
    return { ok: false, error: "You don't have permission to do that." };
  }

  if (membershipId === session.membershipId) {
    return { ok: false, error: "You can't deactivate your own account." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("memberships")
    .update({ status: "deactivated", deactivated_at: new Date().toISOString() })
    .eq("id", membershipId)
    .eq("organization_id", session.organizationId);

  // The database refuses to deactivate the last owner; surface that plainly.
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/users");
  return { ok: true, message: "Member deactivated." };
}

/**
 * Activate the caller's own invited membership. Called from /set-password once
 * they choose a password.
 *
 * Runs with the admin client because an invited member has no active membership
 * yet, so RLS would hide their own row from them. Scoped strictly to the caller's
 * own `user_id`, so it cannot activate anyone else.
 */
export async function activateOwnMembershipAction(): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "Not signed in." };

  const admin = createAdminClient();
  const { data: membership } = await admin
    .from("memberships")
    .select("id, organization_id")
    .eq("user_id", user.id)
    .eq("status", "invited")
    .order("created_at")
    .limit(1)
    .maybeSingle();

  if (!membership) {
    // Nothing pending: they may already be active, which is not an error.
    return { ok: true };
  }

  const { error } = await admin
    .from("memberships")
    .update({ status: "active" })
    .eq("id", membership.id)
    .eq("user_id", user.id);

  if (error) return { ok: false, error: error.message };

  await admin.from("audit_log").insert({
    organization_id: membership.organization_id,
    actor_membership_id: membership.id,
    actor_email: user.email ?? null,
    action: "member.activated",
    entity_type: "membership",
    entity_id: membership.id,
    summary: "Member activated their account.",
  });

  revalidatePath("/", "layout");
  return { ok: true };
}
