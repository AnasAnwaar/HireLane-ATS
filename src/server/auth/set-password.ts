"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { toFieldErrors, type ActionResult } from "@/lib/validation/auth";
import { activateOwnMembershipAction } from "@/server/team/actions";

const schema = z
  .object({
    fullName: z.string().trim().min(2, "Enter your name").max(120),
    password: z
      .string()
      .min(10, "Use at least 10 characters")
      .max(72, "Too long — 72 characters maximum")
      .refine(
        (v) => /[a-z]/.test(v) && /[A-Z]/.test(v),
        "Include an upper and lower case letter",
      )
      .refine((v) => /[0-9]/.test(v), "Include a number"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

/**
 * Completes an invited member's account: sets their password, records their
 * name, then flips their membership from `invited` to `active`.
 *
 * Activation happens last on purpose — if the password update fails, they must
 * not end up as an active member with no way to sign in.
 */
export async function setPasswordAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));

  if (!parsed.success) {
    return {
      ok: false,
      error: "Please correct the highlighted fields.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      error: "This invitation link has expired. Ask your admin to send a new one.",
    };
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
    data: { full_name: parsed.data.fullName, password_set: true },
  });

  if (error) {
    return {
      ok: false,
      error: /same password/i.test(error.message)
        ? "Choose a password you haven't used before."
        : error.message,
    };
  }

  await supabase
    .from("profiles")
    .update({ full_name: parsed.data.fullName })
    .eq("id", user.id);

  const activated = await activateOwnMembershipAction();
  if (!activated.ok) return activated;

  revalidatePath("/", "layout");
  return { ok: true, redirectTo: "/dashboard" };
}
