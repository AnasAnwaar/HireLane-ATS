import "server-only";

/**
 * Transactional email via Resend's HTTP API (same key as SMTP). One place all
 * app email flows through. Degrades gracefully: with no RESEND_API_KEY it's a
 * no-op that reports `skipped`, so callers never fail because email isn't set up.
 *
 * Env:
 *   RESEND_API_KEY   required to actually send
 *   EMAIL_FROM       e.g. "HireLane <noreply@yourdomain.com>" (default onboarding@resend.dev)
 *
 * Note: with the default onboarding@resend.dev sender and no verified domain,
 * Resend only delivers to the Resend account owner's address. Verify a domain to
 * reach any recipient.
 */

const DEFAULT_FROM = "HireLane <onboarding@resend.dev>";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export type SendResult = { ok: boolean; skipped?: boolean; error?: string };

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, skipped: true };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || DEFAULT_FROM,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
        ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
      }),
    });
    if (!res.ok) return { ok: false, error: `Resend ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e) };
  }
}

/** Branded, email-client-safe HTML wrapper shared by every app email. */
export function emailLayout(opts: {
  heading: string;
  intro: string;
  bodyHtml?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footnote?: string;
}): string {
  const cta =
    opts.ctaLabel && opts.ctaUrl
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 22px">
          <tr><td align="center" bgcolor="#e5484d" style="border-radius:10px">
            <a href="${opts.ctaUrl}" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:600;color:#fff;text-decoration:none;border-radius:10px">${esc(opts.ctaLabel)}</a>
          </td></tr>
        </table>
        <p style="margin:0 0 6px;font-size:13px;color:#71717a">Or paste this link into your browser:</p>
        <p style="margin:0 0 22px;font-size:13px;word-break:break-all"><a href="${opts.ctaUrl}" style="color:#e5484d">${opts.ctaUrl}</a></p>`
      : "";

  return `<!doctype html><html><body style="margin:0;background:#f4f2ee">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f2ee">
    <tr><td align="center" style="padding:32px 16px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e7e3dc;font-family:-apple-system,Segoe UI,Arial,sans-serif">
        <tr><td style="background:#0b0b0f;padding:22px 32px">
          <span style="font-size:20px;font-weight:700;color:#fff">Hire</span><span style="font-size:20px;font-weight:700;color:#e5484d">Lane</span>
        </td></tr>
        <tr><td style="height:3px;background:linear-gradient(90deg,#e5484d,#f59e0b)"></td></tr>
        <tr><td style="padding:34px 32px 10px">
          <h1 style="margin:0 0 12px;font-size:21px;font-weight:600;color:#18181b">${esc(opts.heading)}</h1>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#52525b">${esc(opts.intro)}</p>
          ${opts.bodyHtml ?? ""}
          ${cta}
          ${opts.footnote ? `<p style="margin:0;font-size:13px;color:#a1a1aa">${esc(opts.footnote)}</p>` : ""}
        </td></tr>
        <tr><td style="padding:22px 32px 28px;border-top:1px solid #f0ede7">
          <p style="margin:0;font-size:12px;color:#a1a1aa">Sent by HireLane · AI-assisted applicant tracking.</p>
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}
