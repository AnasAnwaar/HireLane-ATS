# Email setup (Resend)

HireLane sends transactional email through **Resend**. One API key powers both
the app's own emails (contact form, candidate portal links, …) and — via SMTP —
Supabase's auth emails (signup confirmation, password reset, invites).

Everything degrades gracefully: with no key set, email is simply skipped and
nothing breaks (messages are still captured in the DB where relevant).

---

## 1 · Get a Resend key

1. [resend.com](https://resend.com) → sign up (use **manasanwaar17@gmail.com** so
   test emails reach you without a domain).
2. **API Keys → Create** → copy it.

## 2 · App emails (contact form, portal links)

Add these env vars — locally in **`.env.local`**, and in **Vercel → Project →
Settings → Environment Variables** for production:

```
RESEND_API_KEY=re_xxxxxxxx
EMAIL_FROM=HireLane <onboarding@resend.dev>   # or noreply@yourdomain.com once verified
CONTACT_EMAIL=manasanwaar17@gmail.com          # where the contact form lands (optional)
```

The app calls Resend's HTTP API directly (`src/server/email/send.ts`) — no SMTP
needed for these.

## 3 · Supabase auth emails (SMTP)

To brand the **signup / reset / invite** emails, Supabase needs custom SMTP.
Supabase dashboard → **Authentication → SMTP Settings** → enable and enter:

| Field | Value |
|---|---|
| Host | `smtp.resend.com` |
| Port | `465` (SSL) or `587` (STARTTLS) |
| Username | `resend` |
| Password | your **Resend API key** (same one) |
| Sender email | `onboarding@resend.dev` (or your verified domain) |
| Sender name | `HireLane` |

Once enabled, the auth templates become **editable** — paste the branded HTML
from [`supabase/email-templates/`](supabase/email-templates/) (see its README for
which file maps to which template).

---

## The domain caveat ⚠️

With the default **`onboarding@resend.dev`** sender and **no verified domain**,
Resend only delivers to **your Resend account's own email**. That's fine for:

- the **contact form** (lands in your inbox), and
- **testing** signup/portal emails to yourself.

To email **anyone else** (real candidates, teammates), **verify a domain** in
Resend (Domains → Add → add the DNS records) and set `EMAIL_FROM` /
Supabase sender to an address on it (e.g. `noreply@hirelane.app`). A `vercel.app`
subdomain can't be a sender — you need a domain you own.

## What already sends through this

- **Contact form** → emails `CONTACT_EMAIL`
- **Candidate portal link** (Connect with applicant) → emails the candidate their
  private portal URL

Add more by importing `sendEmail` + `emailLayout` from `@/server/email/send`.
