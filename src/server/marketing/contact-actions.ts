"use server";

import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/server";
import { toFieldErrors, type ActionResult } from "@/lib/validation/auth";

const DEFAULT_TO = "manasanwaar17@gmail.com";

const schema = z.object({
  name: z.string().trim().min(1, "Your name is required").max(120),
  email: z.string().trim().email("Enter a valid email"),
  subject: z.string().trim().max(160).optional().or(z.literal("")),
  message: z.string().trim().min(5, "Add a little more detail").max(4000),
  // Honeypot — bots fill hidden fields; humans never see this one.
  company_website: z.string().max(0).optional().or(z.literal("")),
});

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Landing-page contact form. Captures every enquiry in the DB (so none is ever
 * lost) and emails it onward via Resend when RESEND_API_KEY is configured.
 */
export async function submitContactAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, error: "Please check the highlighted fields.", fieldErrors: toFieldErrors(parsed.error) };
  }
  const d = parsed.data;

  // Honeypot tripped → pretend success, store nothing.
  if (d.company_website) return { ok: true, message: "Thanks — we'll be in touch shortly." };

  const admin = createAdminClient();
  const { error } = await admin.from("contact_messages").insert({
    name: d.name,
    email: d.email,
    subject: d.subject || null,
    message: d.message,
  });
  if (error) return { ok: false, error: "Something went wrong. Please try again." };

  // Best-effort email notification (never blocks the confirmation).
  const key = process.env.RESEND_API_KEY;
  if (key) {
    const to = process.env.CONTACT_EMAIL || DEFAULT_TO;
    const from = process.env.CONTACT_FROM || "HireLane <onboarding@resend.dev>";
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to,
          reply_to: d.email,
          subject: `New enquiry from ${d.name}${d.subject ? ` — ${d.subject}` : ""}`,
          html: `<div style="font-family:system-ui,Arial,sans-serif;font-size:15px;line-height:1.6;color:#18181b">
            <h2 style="margin:0 0 12px">New HireLane enquiry</h2>
            <p style="margin:0"><strong>Name:</strong> ${esc(d.name)}</p>
            <p style="margin:0"><strong>Email:</strong> ${esc(d.email)}</p>
            ${d.subject ? `<p style="margin:0"><strong>Subject:</strong> ${esc(d.subject)}</p>` : ""}
            <p style="margin:14px 0 4px"><strong>Message</strong></p>
            <p style="margin:0;white-space:pre-wrap">${esc(d.message)}</p>
          </div>`,
        }),
      });
    } catch {
      // Email failed but the message is safely stored — don't surface an error.
    }
  }

  return { ok: true, message: "Thanks — we'll be in touch shortly." };
}
