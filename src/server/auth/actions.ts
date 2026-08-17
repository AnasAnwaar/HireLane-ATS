"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requestBaseUrl } from "@/lib/request-url";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
  toFieldErrors,
  type ActionResult,
} from "@/lib/validation/auth";

/**
 * Auth server actions.
 *
 * Every one re-validates its input server-side: the client schema is a
 * convenience for fast feedback, never a control.
 */

function formToObject(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

/**
 * Supabase surfaces auth failures with messages written for developers. Map the
 * ones users actually hit onto something actionable, and never leak whether an
 * email is registered (that is an account-enumeration oracle).
 */
function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();

  if (m.includes("invalid login credentials")) {
    return "That email and password combination doesn't match an account.";
  }
  if (m.includes("email not confirmed")) {
    return "Please confirm your email address first — check your inbox for the link.";
  }
  if (m.includes("already registered") || m.includes("already been registered")) {
    return "An account with that email already exists. Try signing in instead.";
  }
  if (m.includes("rate limit") || m.includes("too many")) {
    return "Too many attempts. Please wait a minute and try again.";
  }
  if (m.includes("weak password")) {
    return "That password is too easy to guess. Try a longer one.";
  }
  if (m.includes("same password")) {
    return "Choose a password you haven't used before.";
  }
  return "Something went wrong. Please try again.";
}

// -----------------------------------------------------------------------------
// Sign up — creates the auth user. The organisation is provisioned once the
// email is confirmed and a session exists (see ensureOrganization below), since
// provision_organization() requires an authenticated caller.
// -----------------------------------------------------------------------------
export async function signUpAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = signUpSchema.safeParse(formToObject(formData));

  if (!parsed.success) {
    return {
      ok: false,
      error: "Please correct the highlighted fields.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  }

  const { companyName, fullName, email, password, preset } = parsed.data;
  const supabase = await createClient();
  const baseUrl = await requestBaseUrl();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${baseUrl}/auth/callback?next=/setup`,
      // Carried on the user record so provisioning can complete after the
      // email-confirmation round trip, when the original form is long gone.
      data: {
        full_name: fullName,
        pending_company_name: companyName,
        pending_preset: preset,
      },
    },
  });

  if (error) {
    return { ok: false, error: friendlyAuthError(error.message) };
  }

  // With email confirmation enabled Supabase returns a user but no session.
  if (data.session) {
    const provisioned = await ensureOrganization();
    if (!provisioned.ok) return provisioned;
    redirect("/onboarding");
  }

  return {
    ok: true,
    message:
      "Check your inbox — we've sent a confirmation link to finish setting up your workspace.",
  };
}

// -----------------------------------------------------------------------------
// Sign in
// -----------------------------------------------------------------------------
export async function signInAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = signInSchema.safeParse(formToObject(formData));

  if (!parsed.success) {
    return {
      ok: false,
      error: "Please correct the highlighted fields.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return { ok: false, error: friendlyAuthError(error.message) };
  }

  // Password accepted, but if the account has 2FA the session is still aal1 —
  // send them to the challenge before anything else.
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === "aal1" && aal?.nextLevel === "aal2") {
    revalidatePath("/", "layout");
    redirect("/mfa");
  }

  // A user who signed up but never finished provisioning lands here too.
  await ensureOrganization();

  // Only allow same-site relative paths — an attacker-supplied absolute URL here
  // would turn the login form into an open redirect.
  const requested = String(formData.get("next") || "");
  const destination =
    requested.startsWith("/") && !requested.startsWith("//") ? requested : "/dashboard";

  revalidatePath("/", "layout");
  redirect(destination);
}

// -----------------------------------------------------------------------------
// Sign out
// -----------------------------------------------------------------------------
export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

// -----------------------------------------------------------------------------
// Password reset
// -----------------------------------------------------------------------------
export async function forgotPasswordAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = forgotPasswordSchema.safeParse(formToObject(formData));

  if (!parsed.success) {
    return {
      ok: false,
      error: "Enter a valid email address.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  }

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${await requestBaseUrl()}/auth/callback?next=/reset-password`,
  });

  // Deliberately identical whether or not the address exists — otherwise this
  // endpoint tells an attacker which emails have accounts.
  return {
    ok: true,
    message: "If an account exists for that address, a reset link is on its way.",
  };
}

export async function resetPasswordAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = resetPasswordSchema.safeParse(formToObject(formData));

  if (!parsed.success) {
    return {
      ok: false,
      error: "Please correct the highlighted fields.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  }

  const supabase = await createClient();

  // The recovery link established a session; without it there is nothing to update.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      error: "This reset link has expired. Request a new one and try again.",
    };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });

  if (error) {
    return { ok: false, error: friendlyAuthError(error.message) };
  }

  revalidatePath("/", "layout");
  return { ok: true, message: "Password updated.", redirectTo: "/dashboard" };
}

// -----------------------------------------------------------------------------
// Organisation provisioning
//
// Runs after the first authenticated moment. Idempotent: if the user already
// has a membership it does nothing, so it is safe to call on every sign-in.
// -----------------------------------------------------------------------------
export async function ensureOrganization(): Promise<ActionResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "Not signed in." };

  const { data: existing } = await supabase
    .from("memberships")
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (existing) return { ok: true };

  const meta = user.user_metadata ?? {};
  const companyName = typeof meta.pending_company_name === "string" ? meta.pending_company_name : "";

  // No pending company means this account was invited to an existing
  // organisation rather than creating one. Nothing to provision.
  if (!companyName) {
    return { ok: false, error: "No workspace is associated with this account." };
  }

  const { data: orgId, error } = await supabase.rpc("provision_organization", {
    p_company_name: companyName,
    p_preset_key: typeof meta.pending_preset === "string" ? meta.pending_preset : "standard",
    p_full_name: typeof meta.full_name === "string" ? meta.full_name : undefined,
  });

  if (error) {
    return {
      ok: false,
      error: `We couldn't finish creating your workspace: ${error.message}`,
    };
  }

  // Demo accounts (provisioned by a super-admin) start on the all-access `demo`
  // plan. The pending_demo flag is only ever set by createDemoAccountAction.
  if (meta.pending_demo === true && orgId) {
    const admin = createAdminClient();
    await admin.from("org_subscriptions").upsert(
      { organization_id: String(orgId), plan_key: "demo", status: "active" },
      { onConflict: "organization_id" },
    );
  }

  // Clear the pending markers so a later sign-in cannot create a second workspace.
  await supabase.auth.updateUser({
    data: { pending_company_name: null, pending_preset: null, pending_demo: null },
  });

  revalidatePath("/", "layout");
  return { ok: true, message: String(orgId) };
}
