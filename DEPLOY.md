# Deploying HireLane (Vercel + Supabase)

This deploys the app to **Vercel** (free Hobby tier) with data on a **separate
production Supabase project** — kept fully isolated from the database you develop
against, so demo/test activity never touches production and vice-versa.

```
┌────────────┐     HTTPS      ┌──────────────────────────────┐
│  Browser   │ ─────────────▶ │  Vercel (Next.js app)        │
└────────────┘                │  server actions, routes, cron │
                              └───────────────┬───────────────┘
                                              │ Supabase JS (URL + keys)
                                              ▼
                              ┌──────────────────────────────┐
                              │  Supabase PROD project         │
                              │  Postgres · Auth · Storage ·   │
                              │  Realtime                      │
                              └──────────────────────────────┘
```

The app talks to Supabase only through the **Supabase JS client** (project URL +
keys). The Postgres connection string (`DIRECT_URL`) is used **only from your
machine** to run migrations — it never goes on Vercel.

---

## Prerequisites

- The repo on GitHub (already: `AnasAnwaar/HireLane-ATS`).
- A [Supabase](https://supabase.com) account.
- A [Vercel](https://vercel.com) account (sign in with GitHub).
- A [Google AI Studio](https://aistudio.google.com/app/apikey) Gemini API key (optional — AI features degrade gracefully without it).
- Node 20+ locally (to run migrations).

---

## Part 1 — Create the production Supabase project (separate DB)

1. In the Supabase dashboard → **New project**.
   - **Name:** `hirelane-prod` (so it's obviously not your dev project).
   - **Database password:** generate a strong one and save it — you'll need it for the connection string.
   - **Region:** pick the one closest to your users, e.g. **Mumbai (ap-south-1)**. Match this to the Vercel region in Part 4.
2. Wait for it to finish provisioning (~2 min).
3. Collect these from **Project Settings**:
   - **Settings → API**
     - `Project URL` → this is `NEXT_PUBLIC_SUPABASE_URL`
     - `anon` `public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
     - `service_role` `secret` key → `SUPABASE_SERVICE_ROLE_KEY` (**server-only — never expose**)
   - **Settings → Database → Connection string → "Session pooler" (URI)**
     - Looks like `postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres`
     - This is your **prod `DIRECT_URL`** (used only for migrations in Part 2). Use the **Session pooler on port 5432** — the transaction pooler on `:6543` can't run schema changes.

> Storage buckets (`candidate-documents`, `org-branding`, `interview-recordings`)
> are created by the migrations — you don't create them by hand.

---

## Part 2 — Apply migrations to the production database

Run every migration in order **against the prod DB**, without disturbing your
local `.env.local`. A `DIRECT_URL` provided in the shell overrides `.env.local`
for that one command.

**PowerShell (Windows):**
```powershell
$env:DIRECT_URL="postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres"
npm run db:migrate
Remove-Item Env:DIRECT_URL   # clear it so later commands use your dev DB again
```

**bash / macOS / Linux:**
```bash
DIRECT_URL="postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres" npm run db:migrate
```

You should see each `000X_*.sql` reported `OK`. Re-running is safe — migrations
are written to be idempotent.

> **Production starts empty.** Do **not** run any seed command against prod
> (`db:seed-demo`, `seed-assessment`, etc.) — those are dev-only. After migrations,
> prod has the schema and the built-in **permission catalogue / role presets**
> (required for the app to work, inserted by migrations `0007`/`0008`) but **zero
> business data**: no organisations, users, candidates, openings or interviews.
> The first real tenant is created when someone signs up on the live site.

---

## Part 3 — Configure Supabase Auth (do the URL part after Part 4)

In **Authentication → URL Configuration** you'll set:
- **Site URL:** your Vercel URL (from Part 4), e.g. `https://hirelane.vercel.app`
- **Redirect URLs:** add `https://hirelane.vercel.app/**`

Leave this tab open — you'll fill it once Vercel gives you the domain.

If you use email sign-up/confirmation, also review **Authentication → Providers →
Email** and the email templates.

---

## Part 4 — Deploy to Vercel

1. [vercel.com](https://vercel.com) → **Add New… → Project** → import `HireLane-ATS`.
2. Framework preset is auto-detected as **Next.js**. Leave build settings default.
3. **Environment Variables** — add these (Production scope):

   | Name | Value | Notes |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | prod Project URL | from Part 1 |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | prod anon key | from Part 1 |
   | `SUPABASE_SERVICE_ROLE_KEY` | prod service_role key | **secret** |
   | `NEXT_PUBLIC_APP_URL` | `https://<your-app>.vercel.app` | absolute links / portal URLs |
   | `GEMINI_API_KEY` | your Gemini key | optional |
   | `CRON_SECRET` | a long random string | protects the purge cron endpoint |

   > Do **not** add `DIRECT_URL` to Vercel — the running app never uses it.

4. **Region:** the repo's `vercel.json` pins `bom1` (Mumbai) and registers the
   daily evidence-purge cron. If your Supabase region is elsewhere, change
   `regions` in `vercel.json` to the matching Vercel region code and redeploy.
5. Click **Deploy**. When it finishes, copy the production URL (e.g.
   `https://hirelane.vercel.app`).

---

## Part 5 — Point Auth + app URL at the Vercel domain

1. Back in **Supabase → Authentication → URL Configuration**:
   - **Site URL:** `https://hirelane.vercel.app`
   - **Redirect URLs:** `https://hirelane.vercel.app/**`
   - Save.
2. In **Vercel → Project → Settings → Environment Variables**, confirm
   `NEXT_PUBLIC_APP_URL` matches that domain. If you added/changed it, **redeploy**
   (Deployments → ⋯ → Redeploy) so the value is baked into the client bundle.

If you later add a **custom domain** in Vercel, repeat this step with that domain.

---

## Part 6 — Scheduled evidence purge (cron)

- `vercel.json` already registers a daily job hitting `/api/cron/purge-evidence`
  at 03:00 UTC. It deletes check-in photos + exam-audio past the 180-day
  retention window (spec §UC-5.3 / CP-21).
- Vercel calls it with `Authorization: Bearer $CRON_SECRET`, so it can't be hit
  anonymously — just make sure `CRON_SECRET` is set (Part 4).
- Cron jobs appear under **Vercel → Project → Settings → Cron Jobs**. You can also
  trigger the purge manually anytime with `npm run purge:evidence` (uses your dev
  DB unless you override `DIRECT_URL`).

> Vercel Hobby runs cron **once per day** max — the daily schedule fits.

---

## Part 7 — Verify

- [ ] Visit `https://<app>.vercel.app` → landing page loads.
- [ ] The app is **empty** — no orgs/candidates exist until someone signs up (correct for a clean prod).
- [ ] **Sign up a new company** → onboarding → dashboard (auth round-trip works ⇒ URLs are set right). This is the first tenant.
- [ ] Create an opening, a candidate, an assessment → data appears (prod DB wired).
- [ ] Set a brand colour in **Company → Branding** → the portal re-themes.
- [ ] (If `GEMINI_API_KEY` set) generate an AI job post or screen a candidate.
- [ ] **Cron Jobs** tab shows `purge-evidence` scheduled.

---

## Keeping dev and prod separate

- **Local dev** keeps using `.env.local` → your **dev** Supabase project.
- **Production** uses the Vercel env vars → the **prod** Supabase project.
- New migrations: apply to dev normally (`npm run db:migrate`), then to prod with
  the `DIRECT_URL="…prod…" npm run db:migrate` one-liner from Part 2 when you ship.
- Never point Vercel at the dev project, and never put the prod service-role key in
  `.env.local` committed anywhere. `.env.local` is gitignored — keep it that way.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Migrations hang / `no pg_hba` / IPv6 error | Use the **Session pooler** URI (IPv4, port 5432), not the direct `db.<ref>` host. |
| `SUPABASE_SERVICE_ROLE_KEY is required` build error | Add all required env vars in Vercel, then redeploy. |
| Login redirects to `localhost` | Set **Site URL** + **Redirect URLs** in Supabase and `NEXT_PUBLIC_APP_URL` in Vercel, then redeploy. |
| Uploads/recordings 403 | Buckets come from migrations — confirm Part 2 ran fully against prod. |
| AI features say "not set up" | `GEMINI_API_KEY` missing, or you've hit the Gemini free-tier daily quota (429) — unrelated to hosting. |
| Cron endpoint returns 401 | `CRON_SECRET` not set, or mismatched — set it in Vercel and redeploy. |

---

**Note:** Vercel's free **Hobby** tier is for **non-commercial** use. If HireLane
goes commercial, upgrade to Vercel Pro; Supabase similarly has a Free tier with a
Pro upgrade for higher limits and backups.
