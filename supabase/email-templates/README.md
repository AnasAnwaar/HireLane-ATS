# HireLane email templates

Branded HTML for the Supabase auth emails. They're plain HTML with Supabase's
`{{ .ConfirmationURL }}` variable, so they drop straight into the dashboard.

## Install

1. Supabase dashboard → your **`hirelane-prod`** project → **Authentication → Emails**.
2. For each template below, open it, **paste the matching HTML**, and save. Set a
   clear **Subject** line too.

| Supabase template | File | Suggested subject |
|---|---|---|
| **Confirm signup** | `confirm-signup.html` | `Confirm your email — HireLane` |
| **Invite user** | `invite.html` | `You're invited to HireLane` |
| **Reset Password** | `reset-password.html` | `Reset your HireLane password` |
| **Magic Link** | reuse `confirm-signup.html` (change the heading to "Sign in to HireLane") | `Your HireLane sign-in link` |
| **Change Email Address** | reuse `confirm-signup.html` (heading "Confirm your new email") | `Confirm your new email — HireLane` |

## Why the links land well

- The app sends `emailRedirectTo = <APP_URL>/auth/callback?next=/setup` on signup.
- `/auth/callback` exchanges the code and forwards to the branded **`/verified`**
  screen (success) or shows a friendly expired-link screen (failure).
- So make sure, in **Authentication → URL Configuration**, that **Site URL** and
  **Redirect URLs** include your deployed domain (e.g. `https://hirelane.vercel.app`
  and `https://hirelane.vercel.app/**`). If the redirect target isn't allow-listed,
  the confirmation link won't complete.

## Notes

- These are transactional emails sent by Supabase's built-in mailer, which is
  rate-limited on the free tier. For production volume, configure a custom SMTP
  provider (e.g. Resend) under **Authentication → SMTP Settings** — the templates
  work unchanged.
- The design is email-client-safe (table layout, inline styles, a bulletproof
  button) and uses no external images, so it renders in Gmail/Outlook/Apple Mail.
