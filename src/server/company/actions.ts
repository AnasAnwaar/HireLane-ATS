"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { toFieldErrors, type ActionResult } from "@/lib/validation/auth";
import { getSessionContext } from "@/server/auth/session";

const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

const companyProfileSchema = z.object({
  name: z.string().trim().min(1, "Company name is required").max(120),
  tagline: optionalText(140),
  description: optionalText(2000),
  industry: optionalText(80),
  website: optionalText(200),
  careers_url: optionalText(200),
  logo_url: optionalText(400),
  brand_color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use a 6-digit hex colour, e.g. #4f46e5")
    .optional()
    .or(z.literal("")),
  timezone: z.string().trim().min(1).max(64),
  currency: z.string().trim().length(3, "Use a 3-letter currency code"),
  locale: z.string().trim().min(2).max(10),
  email_from_name: optionalText(80),
  email_reply_to: z
    .string()
    .trim()
    .email("Enter a valid email address")
    .optional()
    .or(z.literal("")),
});

/**
 * Save the company profile (admin → Company). RLS enforces the tenant boundary
 * and administration.manage_company_profile — no in-code permission check needed.
 */
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
  const d = parsed.data;
  const nullify = (v: string | undefined) => (v && v.trim() ? v.trim() : null);

  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .update({
      name: d.name.trim(),
      tagline: nullify(d.tagline),
      description: nullify(d.description),
      industry: nullify(d.industry),
      website: nullify(d.website),
      careers_url: nullify(d.careers_url),
      logo_url: nullify(d.logo_url),
      brand_color: d.brand_color ? d.brand_color.toLowerCase() : null,
      timezone: d.timezone,
      currency: d.currency.toUpperCase(),
      locale: d.locale,
      email_from_name: nullify(d.email_from_name),
      email_reply_to: nullify(d.email_reply_to),
    })
    .eq("id", session.organizationId);

  if (error) {
    // RLS denial surfaces as a no-op/permission error — translate the common one.
    if (/permission|row-level/i.test(error.message)) {
      return { ok: false, error: "You don't have permission to edit the company profile." };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/admin/company");
  return { ok: true, message: "Company profile saved." };
}
