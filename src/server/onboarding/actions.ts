"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { toFieldErrors, type ActionResult } from "@/lib/validation/auth";
import { getSessionContext } from "@/server/auth/session";

const companyProfileSchema = z.object({
  industry: z.string().trim().max(80).optional().or(z.literal("")),
  website: z.string().trim().max(200).optional().or(z.literal("")),
  timezone: z.string().trim().min(1).max(64),
  currency: z.string().trim().length(3, "Use a 3-letter currency code"),
});

export async function saveCompanyProfileAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Your session has expired. Please sign in again." };

  const parsed = companyProfileSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please correct the highlighted fields.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  }

  const supabase = await createClient();
  const { industry, website, timezone, currency } = parsed.data;

  // RLS enforces both the tenant boundary and the
  // administration.manage_company_profile permission — no check needed here.
  const { error } = await supabase
    .from("organizations")
    .update({
      industry: industry || null,
      website: website || null,
      timezone,
      currency: currency.toUpperCase(),
    })
    .eq("id", session.organizationId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/onboarding");
  return { ok: true };
}

const departmentsSchema = z.object({
  names: z.array(z.string().trim().min(1).max(100)).max(30),
});

export async function saveDepartmentsAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Your session has expired. Please sign in again." };

  const names = formData
    .getAll("department")
    .map((v) => String(v).trim())
    .filter(Boolean);

  const parsed = departmentsSchema.safeParse({ names });
  if (!parsed.success) {
    return { ok: false, error: "Department names must be 1–100 characters." };
  }

  if (parsed.data.names.length === 0) return { ok: true };

  const supabase = await createClient();
  const { error } = await supabase.from("departments").upsert(
    parsed.data.names.map((name) => ({
      organization_id: session.organizationId,
      name,
    })),
    { onConflict: "organization_id,name", ignoreDuplicates: true },
  );

  if (error) return { ok: false, error: error.message };

  revalidatePath("/onboarding");
  return { ok: true };
}

const inviteSchema = z.object({
  invites: z
    .array(
      z.object({
        email: z.email(),
        roleId: z.string().uuid(),
      }),
    )
    .max(50),
});

export async function sendInvitationsAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Your session has expired. Please sign in again." };

  const emails = formData.getAll("inviteEmail").map((v) => String(v).trim());
  const roleIds = formData.getAll("inviteRole").map((v) => String(v));

  const invites = emails
    .map((email, i) => ({ email, roleId: roleIds[i] ?? "" }))
    .filter((row) => row.email.length > 0);

  if (invites.length === 0) return { ok: true };

  const parsed = inviteSchema.safeParse({ invites });
  if (!parsed.success) {
    return { ok: false, error: "Check the email addresses and roles you entered." };
  }

  const supabase = await createClient();

  // A token is generated per invite; only its SHA-256 hash is stored, so a
  // database leak cannot be replayed as a working invitation link.
  const rows = await Promise.all(
    parsed.data.invites.map(async (invite) => ({
      organization_id: session.organizationId,
      email: invite.email,
      role_id: invite.roleId,
      token_hash: await hashToken(crypto.randomUUID() + crypto.randomUUID()),
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      invited_by: session.membershipId,
    })),
  );

  const { error } = await supabase.from("invitations").insert(rows);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/onboarding");
  return { ok: true, message: `${rows.length} invitation(s) queued.` };
}

async function hashToken(raw: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function completeOnboardingAction(): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Your session has expired. Please sign in again." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq("id", session.organizationId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  return { ok: true, redirectTo: "/dashboard" };
}
