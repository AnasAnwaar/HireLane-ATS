# ATS Portal — Build Checklist & Sprint Tracker

**Spec:** [ATS-Portal-UseCase.md](ATS-Portal-UseCase.md)
**Stack:** Next.js 16 (App Router, React 19, TypeScript) · Tailwind v4 + Radix · Supabase (Postgres / Auth / Storage / RLS) · Prisma 7 (schema + types only, see D23)
**Cadence:** Medium checkpoints — I stop at the end of each functional module for your review.
**Started:** 2026-07-22

---

## How to read this document

| Symbol | Meaning |
|:------:|---------|
| ⬜ | Not started |
| 🔄 | In progress |
| ✅ | Done |
| ⏸️ | Blocked / awaiting your decision |
| ⏭️ | Deferred to a later phase (deliberate) |

**Working agreement:** I complete one checkpoint, update this file, and stop. You review, request changes, and tell me to continue. Nothing in the next checkpoint starts until you say go.

---

## Progress Summary

| Phase | Checkpoints | Status |
|-------|-------------|--------|
| **P0 — Tenancy, Auth & Admin** | CP-1 … CP-5 | ✅ **COMPLETE** |
| **P1 — Job Openings & Applicants** | CP-6 … CP-9 | ✅ **COMPLETE** |
| **P2 — Distribution (channels + AI posts)** | CP-10 … CP-12 | ✅ **COMPLETE** |
| **P3 — AI Screening** | CP-13 … CP-14 | ✅ **COMPLETE** |
| **P4 — Assessments** | CP-15 … CP-18 | ✅ **COMPLETE** |
| **P5 — Proctoring & Interviews** | CP-19 … CP-22 | ✅ **COMPLETE** |
| **P6 — Collaboration & Reporting** | CP-23 … CP-25 | ⬜ Not started |
| **P7 — Plans, Billing & Platform Admin** | CP-26 … CP-28 | ⬜ Not started |

**Current checkpoint:** ✅ **Phases 0, 1 & 2 COMPLETE** (CP-1 … CP-12)
**Environment:** 🟢 Full loop live: setup → openings → apply → screen → profile → candidate portal → channels → AI posts → **publish/schedule** · build clean — **zero blockers**
**Next up:** **Phase 3 — AI Screening** (CP-13 screening agent, CP-14 match reports & ranking). Uses the Gemini key already configured.

### 🖱️ Click it now — demo login
Run `npm run dev`, open **http://localhost:3000/login**:
> **Email:** `demo@hirelane.app`  ·  **Password:** `Hirelane-Demo-2026`

Pre-seeded with 3 sample openings (2 open, 1 draft). Re-seed anytime with `npm run db:seed-demo`.
Created via the admin API (pre-confirmed, no email) so it works even though email isn't fully
configured — see **GL-1**. *(Sign-up **page** still needs "Confirm email" OFF or a verified
domain; the demo login sidesteps that.)*

---

## 🚀 GO-LIVE CHECKLIST (things that must be done before real users)

Deferred deliberately so development could proceed; **each must be handled before launch.**

| # | Item | Why it's deferred | What to do |
|---|------|-------------------|------------|
| **GL-1** | **Email delivery (SMTP + verified domain)** | Resend is connected, but **"Confirm email" is/was ON with no verified domain**, so signup-confirmation and invite emails 500 on send. Currently working around it: demo accounts are created pre-confirmed via the admin API (no email). | Before launch: (a) verify a sending domain in Resend, (b) set Supabase Sender email to `@that-domain`, (c) decide whether "Confirm email" is ON (needs working email) or OFF, (d) confirm redirect URLs list the production origin. Then real sign-up, activation and **team invitations** work. Until then, invites can only reach the Resend account owner's address. |
| **GL-2** | **Swap hand-written DB types for `supabase gen types`** | CLI generator needs Docker/podman, unavailable on this machine. | Run `supabase gen types` at deploy; `db:check-keys` guards drift meanwhile (D32). |
| **GL-3** | **Rotate any credentials seen in development** | Dev convenience. | Rotate DB password + keys before production; move secrets to the host's env, not `.env.local`. |
| **GL-4** | **Remove the demo seed + account** | `demo@hirelane.app` (password in `scripts/seed-demo.cjs`) exists for local clicking. | Delete the demo account and sample data before launch (`npm run db:purge` won't catch it — it's not a test fixture; remove explicitly). |

---

## ✅ DATABASE IS LIVE — CP-2 is now PROVEN

The schema is applied to Supabase project `jertgmxuinzvvqrnhhub` and **all 26 isolation
tests pass**. This closes **O6**: CP-2 moved from "syntax-checked" to *verified against a
real Postgres*.

```
npm run db:test     26 passed, 0 failed
```

| Verified | Result |
|----------|--------|
| 10 migrations applied cleanly | ✅ |
| 14 tables · 87 permissions · 13 modules · 3 presets · 196 grants | ✅ |
| 26 RLS policies active | ✅ |
| Org A cannot read org B — by id, by join, or by update | ✅ 8 assertions |
| Owner holds the full catalogue (87/87) | ✅ |
| Recruiter scoped to `assigned`, denied `manage_roles` and `view_salary` | ✅ |
| Per-user overrides: grant, expiry, and revoke-beats-role | ✅ |
| Guardrails: append-only audit, last-owner, in-use role, Owner role | ✅ 5 assertions |

**Three real bugs found by actually running it** — none of which syntax checking could catch:

1. **Migration ordering.** `current_membership_id()` and `is_org_owner()` are `language sql`,
   whose bodies Postgres resolves against the catalog at creation time. They referenced
   `memberships` before 0002 created it. Moved to the end of 0002. *(Their sibling
   `current_org_id()` survived only because PL/pgSQL bodies are syntax-checked, not resolved.)*
2. **Missing GRANTs — would have broken production.** RLS decides *which rows*; it does not
   grant access to the table. `authenticated` had no privileges at all, so every query failed
   with `permission denied`. Added [0010_grants.sql](supabase/migrations/0010_grants.sql),
   which also re-revokes `audit_log` UPDATE/DELETE that the blanket grant would have handed back.
3. **Prisma 7 config.** `url`/`directUrl` are no longer allowed in `schema.prisma`; they moved
   to `prisma.config.ts`, which also does not read `.env.local` on its own.

### ✅ Supabase API keys verified 2026-07-23

`.env.local` is fully populated and all three endpoints respond correctly:

| Check | Result |
|-------|--------|
| `GET /auth/v1/health` with anon key | ✅ 200 — GoTrue v2.193.1 |
| `GET /rest/v1/permissions` as `service_role` | ✅ 200 — catalogue readable |
| `GET /rest/v1/organizations` as `anon` | ✅ **401 / 42501 permission denied** — exactly as designed |

That third result is the interesting one: it confirms the deliberate choice in
[0010_grants.sql](supabase/migrations/0010_grants.sql) to grant `anon` nothing beyond schema
usage. An unauthenticated caller cannot read tenant data even before RLS is consulted.

### ✅ Password rotated 2026-07-23 — no blockers remain

Rotated to a 16-character alphanumeric password, kept out of chat and set directly in
`.env.local`. Verified: connects, schema intact (14 tables · 87 permissions · 26 policies),
`npm run db:test` still **26/26**.

> Note for next time: a password reset takes a few seconds to propagate. The first connection
> attempt failed with `password authentication failed` and the second succeeded — so retry
> once before assuming the credentials are wrong.

**All blockers are closed.** B1 ✅ · B2 settled (Postgres) · B3 ✅ · B4 ✅

---

## ▶️ RESUME HERE next session

CP-1–CP-4 + CP-6 done and verified. Environment fully working, zero blockers. The portal can
now create, manage and scope **job openings** — the first thing it *does* for recruiting.

**Track B — needs YOU (small, ~15 min, unblocks real auth)**
- **Configure Supabase email**: Auth → SMTP provider + email templates + redirect URLs (allow
  the deployed origin + `http://localhost:3000`). The built-in service is rate-limited —
  `db:test:auth` confirmed it — so activation and invite emails won't reliably send until this
  is done. It's the only thing blocking a real browser run of the auth flows.
- Then walk the flows: sign up → activation → `/dashboard`; invite → `/set-password`; enrol 2FA
  → sign out → `/mfa` challenge; confirm 2FA-disable demands a current code.
- **Once email works, you can click the whole recruiting flow**: sign in → create an opening →
  see it in the list → open/hold/close it. All built and DB-verified; just needs a session.

**Track A — CP-7, Applicants** (next build, solo)
Phase 0 is done. The next recruiting feature gives openings candidates:
- Schema: `candidates`, `applications`, `documents` + RLS (same feature-table pattern as CP-6)
- Public apply form per opening (branded, channel-attributed) — first `anon`-accessible surface
- CV upload to Supabase Storage + parsing to structured fields
- Applicant list per opening; dedup across channels
- "Connect with applicant" → creates the candidate portal invite (ties into CP-9)

**Optional cleanup at go-live:** swap hand-written `src/types/database.ts` for
`supabase gen types` output (needs Docker/podman, unavailable here — decision D32). Not urgent;
`db:check-keys` guards against drift in the meantime.

**Commands available**
| Command | What it does |
|---------|--------------|
| `npm run db:migrate` / `db:reset` | Apply migrations / drop+recreate+reapply |
| `npm run db:test` | Tenant isolation — 26 assertions |
| `npm run db:test:auth` | Auth backend through the real Supabase stack — 17 assertions |
| `npm run db:test:openings` | Job-opening RLS + data-scope — 10 assertions |
| `npm run db:test:admin` | Admin write-paths + RLS guards — 9 assertions |
| `npm run db:test:applicants` | Applicant RLS + opening-scope inheritance — 8 assertions |
| `npm run db:test:notes` | Note visibility scopes (private/team/management) — 9 assertions |
| `npm run db:test:portal` | Candidate portal invites (one-live, revoke, resolve) — 6 assertions |
| `npm run demo-portal-link` | Print a ready candidate-portal link for the demo |
| `npm run db:seed-demo` / `db:seed-team` | Demo workspace + 5 role accounts |
| `npm run db:check-keys` | Fail if code permission keys ≠ database |
| `npm run db:purge` | Remove test fixtures (trigger-aware) |
| `npm run db:query "<sql>"` | Ad-hoc query, printed as a table |
| `npm run db:pull` | Re-introspect Prisma + regenerate client |
| `npm run validate:sql` | Parse migrations without a database |

---

## Phase 0 — Tenancy, Auth & Admin Portal
> *Maps to UC-0. Must land first: every other feature is permission-gated by it.*

### ✅ CP-1 — Project Foundation & Tooling  *(complete — awaiting your review)*
- [x] Next.js scaffold (App Router, TypeScript, `src/`, import alias `@/*`) — landed on **Next 16.2 / React 19.2 / Tailwind v4**
- [x] Tailwind v4 design tokens, light + dark, incl. `success` / `warning` semantic colours
- [x] Base UI primitives hand-written shadcn-style: button (with `asChild`), input, card, badge, skeleton, dropdown-menu
- [x] Folder architecture established (`app/`, `components/ui`, `components/layout`, `lib/`, `types/`)
- [x] Environment validation with zod — fails fast, client/server split so secrets can't leak to the bundle
- [x] Supabase client wiring — browser, server (RLS-bound) and admin (service-role) clients
- [x] Session refresh + route protection via Next 16 `proxy.ts`
- [x] Root layout: fonts (Inter / JetBrains Mono), theme provider, toast host
- [x] App shell: sidebar with mobile drawer, topbar with account menu, `PageHeader` / `PageBody` pattern
- [x] Navigation items carry their **permission keys** already, so CP-4 can gate them without a rewrite
- [x] Landing page + dashboard placeholder
- [x] `README` rewritten with setup, structure and architectural notes
- [x] `npm run lint`, `npm run typecheck`, `npm run build` all pass clean
- [x] Runtime smoke test: `/` and `/dashboard` return 200 and render; auth gate verified (307 → `/login`)

**Review focus:** folder structure, visual direction, naming conventions.

**Verification evidence:**
| Check | Result |
|-------|--------|
| `npm run lint` | ✅ clean |
| `npm run typecheck` | ✅ clean |
| `npm run build` | ✅ compiled, 3 routes prerendered |
| `GET /` | ✅ 200 |
| `GET /dashboard` | ✅ 200, sidebar renders |
| Auth gate on protected route | ✅ 307 → `/login?next=…` |

#### CP-1b — Visual design pass *(follow-up on your feedback: "too vibecoded", light theme preferred)*
- [x] **Light is now the default theme**; system-preference following disabled, dark is opt-in
- [x] New palette — **"Teal & Ember"**: deep teal primary + amber accent, on *warm* neutrals rather than the cold default grey
- [x] Layered warm-tinted shadow scale, larger radii, tightened heading tracking
- [x] Brand identity: funnel logomark + wordmark ([brand-mark.tsx](src/components/brand-mark.tsx)) — **placeholder name "Hirelane", see open item O5**
- [x] New primitives: `Avatar` (deterministic per-person tint), `ScoreRing` (SVG match-score dial), `Badge` with status dots
- [x] Sidebar: active rail indicator, primary CTA, org switcher footer, grouped sections
- [x] Topbar: search field with ⌘K affordance, notification bell, richer account menu
- [x] Dashboard rebuilt with real substance — stat tiles with trend deltas, pipeline funnel with stage conversion rates, ranked candidates with score dials, activity timeline, upcoming interviews
- [x] Landing page rebuilt — gradient hero wash + dot grid, product preview mock, 6-feature bento grid, 4-step flow, CTA
- [x] Accessibility held: score dials carry `aria-label`, status uses dot + text not colour alone, reduced-motion respected
- [x] Re-verified: lint, typecheck, build clean; both routes 200 and render in light theme

**⚠️ Deliberate temporary hack to remove in CP-3:** `/dashboard` is listed as a public route in
[src/lib/supabase/middleware.ts](src/lib/supabase/middleware.ts) so the shell is reviewable
before login exists. It carries a `TODO(CP-3)` marker. **Leaving it in place past CP-3 would
expose the application unauthenticated.**

---

### ✅ CP-2 — Database Schema & Tenant Isolation  *(complete — awaiting your review)*
> **Approach: SQL-first** (your call). Migrations are plain SQL, applied to a live project when going live. No cloud dependency to develop against.

- [x] ~~Supabase project connected~~ → **deferred by decision D12**; migrations written as portable SQL
- [x] `0002` — `organizations`, `profiles` (auto-synced from `auth.users`), `departments`, `memberships`, `invitations`
- [x] `0003` — `permissions` catalogue, `roles`, `role_permissions`, `user_permission_overrides`, `approval_rules`, preset tables
- [x] `0004` — append-only `audit_log` + auto-audit trigger on every permission change
- [x] `0007` — **~90 permission keys seeded** across all 13 modules of spec §9.1
- [x] `0008` — the three presets: `Standard` (6 roles), `Strict` (3), `Custom` (owner only)
- [x] `0006` — RLS on every table with `FORCE ROW LEVEL SECURITY`, keyed on `organization_id`
- [x] `0001`/`0005` — helpers: `current_org_id()`, `is_org_owner()`, `has_permission()`, `permission_scope_of()`, `can_access_record()`, `my_permissions()`
- [x] `0009` — `provision_organization()` (sign-up path) and `transfer_ownership()`
- [x] Tenant-isolation test suite: [supabase/tests/tenant_isolation_test.sql](supabase/tests/tenant_isolation_test.sql) — 20+ assertions covering isolation, owner privilege, scopes, overrides, expiry, and all guardrails
- [x] TypeScript types hand-written to match the schema ([src/types/database.ts](src/types/database.ts)); replaced by `supabase gen types` on go-live
- [x] `npm run validate:sql` — parses every migration with the **real Postgres grammar** (WASM build of the server's own parser)
- [x] [supabase/README.md](supabase/README.md) documenting apply steps and design decisions

**Review focus:** data model correctness, RLS policy soundness. *This is the hardest thing to change later — worth a careful read.*

**Verification evidence:**
| Check | Result |
|-------|--------|
| `npm run validate:sql` | ✅ all 9 migrations parse (138 statements) |
| `npm run typecheck` | ✅ clean |
| `npm run lint` | ✅ clean |
| `npm run build` | ✅ clean |
| Migrations executed against a real database | ✅ **all 10 applied 2026-07-23** |
| `npm run db:test` — tenant isolation | ✅ **26 passed, 0 failed** |

**✅ RESOLVED 2026-07-23 — the schema is proven.** Applied to a live Supabase Postgres; all
26 isolation assertions pass. See the summary at the top of this document for the three bugs
that only surfaced on execution. The runner is [scripts/test-isolation.cjs](scripts/test-isolation.cjs)
(`npm run db:test`) — it replaces the original psql-based file, which relied on `\gset`
meta-commands that only `psql` understands.

**Two bugs found and fixed while writing (worth knowing about):**
1. `transfer_ownership()` deadlocked against its own safety rails — the partial unique index
   forbids two active owners, so the old flag must drop first, but that momentarily leaves
   zero owners and tripped the last-owner guard. Resolved with a transaction-local suppression flag.
2. The permission-change audit trigger used a malformed `union all` whose column types could
   never line up. Rewritten with plain variables.

---

### ✅ CP-3 — Authentication & Company Sign-Up  *(complete — awaiting your review)*
- [x] Sign-up: company + name + email + password + preset → auth user, then org provisioned on first authenticated request
- [x] Email verification via `/auth/callback` (handles both PKCE `code` and `token_hash` flows)
- [x] Login, logout, password reset (request + set-new)
- [x] Session helpers: `getCurrentUser()`, `getSessionContext()`, `requireSession()` — React-`cache`d so one render makes one round trip
- [x] Protected route groups; **CP-1 `/dashboard` public-route hack removed** ✅
- [x] Onboarding wizard: company profile → departments → invite team → done
- [x] `/setup` recovery route — idempotent provisioning after email confirmation
- [x] Invitation landing page with expiry/used/revoked states
- [x] "Resume setup later" — wizard is skippable; `(app)` layout redirects back until complete
- [x] Auth error states: friendly messages, **no account-enumeration leak** on reset or sign-up
- [x] Open-redirect protection on `?next=` (login) and `/auth/callback`
- [x] Live password-rules checklist; show/hide toggle; `aria-invalid` + `aria-describedby` on every field
- [x] Split-screen auth layout with the brand panel

**Review focus:** sign-up UX, whether the wizard asks for the right things.

**Verification evidence:**
| Check | Result |
|-------|--------|
| `npm run typecheck` / `lint` / `build` | ✅ clean — 11 routes |
| `npm run validate:sql` | ✅ 9 migrations parse |
| `/`, `/login`, `/signup`, `/forgot-password`, `/reset-password` | ✅ 200, correct content markers |
| `/dashboard`, `/onboarding`, `/setup` unauthenticated | ✅ 307 → `/login?next=…` |
| `/invite/<bad-token>` | ✅ 200 with graceful error (was 500 — fixed) |
| End-to-end sign-up against a real database | ❌ **not possible — no Supabase project** |

**⚠️ What is NOT proven.** Routing, validation, redirects and error states are verified. The
*happy path* is not: with no Supabase project, no account can actually be created, no email
sent, and `provision_organization()` has never run. Sign-up, verification, login and the
wizard's writes all need a live database before they can be called working.

#### CP-3b — Flow rework + 2FA *(your revised requirements — code complete, unverified)*

**Sign-up flow changed as requested:** activation link → account activated → **straight to the
dashboard**. Onboarding is no longer a gate; it became a dismissible setup banner on the
dashboard, so "resume setup later" still holds without blocking anyone.

- [x] `/setup` now redirects to `/dashboard` (was `/onboarding`)
- [x] `(app)` layout no longer forces the wizard
- [x] Dashboard shows a "Finish setting up" card while `onboarding_completed_at` is null

**Team member invitations — rebuilt on Supabase's native invite email:**
- [x] Admin creates a member at [/admin/users](src/app/(app)/admin/users/page.tsx) — name, email, role, department
- [x] `inviteUserByEmail()` creates the auth user **and sends the email** — the bespoke token scheme from CP-3 is gone, so there is no longer a token to generate, store, expire or leak
- [x] Membership row created immediately as `invited`, carrying the chosen role
- [x] Link → `/auth/callback` → **`/set-password`** → password set → membership flipped to `active` → **dashboard**
- [x] Role ownership validated against the caller's org (blocks cross-tenant role-id smuggling); Owner role cannot be granted by invitation
- [x] Re-invite / already-registered handled; resend + deactivate actions; member list with status badges

**Two-factor authentication (TOTP — Google Authenticator, Authy, 1Password):**
- [x] [/settings/security](src/app/(app)/settings/security/page.tsx) — enrol with QR code + manual key, verify, disable
- [x] Sign-in challenge at `/mfa`; `(app)` layout redirects any `aal1` session holding a verified factor
- [x] Custom 6-box `OtpInput` with paste, backspace-stepping and auto-submit
- [x] **Disabling 2FA requires a current code** — otherwise anyone at an unlocked laptop could strip the second factor
- [x] Abandoned enrolments cleaned up before starting a new one

- [x] `typecheck` / `lint` / `build` clean — **16 routes**

**⚠️ None of CP-3b is runtime-verified.** It compiles and routes correctly, but no invitation
email has ever been sent and no TOTP code has ever been validated, because there is no
working database or Supabase key yet. See blockers B3/B4.

**Deliberate gaps to close later:**
- **Onboarding's own invite step** still writes to the `invitations` table (the old path) rather
  than going through `inviteTeamMemberAction`. Harmless but redundant — consolidate in CP-5.
- **2FA reset for a locked-out user** — an admin cannot yet clear someone's factor. Needed before real use.
- **Invitation acceptance for a user who already has an account** in another workspace works,
  but has no UI to choose between workspaces. Multi-workspace switching is not built.
- **Permission preset moved to the sign-up form**, not the wizard as spec §UC-0 describes —
  `provision_organization()` needs the preset at creation time to stay atomic. Switching preset
  later needs an `apply_preset()` function; noted for CP-5.

---

### ✅ CP-4 — Permission Engine  *(complete — awaiting your review)*
> The resolution *logic* lives in the database (built + proven in CP-2). CP-4 is the
> **application layer** on top: typed keys, server guards, scope resolution, field masking,
> and client gating — all calling the same SQL functions RLS uses, so UI and database can
> never disagree.

- [x] Permission resolution: role → override → scope, most-restrictive-wins — **proven, DB-side** (CP-2's `has_permission` / `permission_scope_of` / `my_permissions`)
- [x] Typed key catalogue: [keys.ts](src/lib/permissions/keys.ts) — all 87 keys as a `PermissionKey` union, no magic strings
- [x] Server guards: [authorize.ts](src/server/auth/authorize.ts) — `can`, `canAny`, `canAll`, `requirePermission` (throws `PermissionError`), `authorize` (returns the form-friendly result)
- [x] Scope resolution: [scope.ts](src/server/auth/scope.ts) — `resolveScope()` → `all`/`department`/`assigned`/`own` descriptor for feature tables (CP-6+)
- [x] Field-level masking: [field-visibility.ts](src/server/auth/field-visibility.ts) — `getFieldVisibility()`, `mask()`, `redactKeys()`; enforces column visibility the row-level RLS can't
- [x] Client gating: [`<Can>`](src/components/permissions/can.tsx) + [`usePermissions()`](src/components/permissions/permission-provider.tsx), seeded once server-side from `my_permissions()` (no client round trip)
- [x] **Sidebar now filters by permission** — items hide, empty sections vanish; the CP-1 "nav items carry permission keys" decision paid off with zero restructuring
- [x] "New job opening" CTA gated by `job_openings.create`
- [x] Graceful "your access has changed" via `authorize()` (spec §UC-0 A4)
- [x] Cache: per-request via React `cache()`; a new request re-resolves, so an admin's change takes effect on the member's next navigation
- [x] [NoAccess](src/components/permissions/no-access.tsx) wall for hard-gated pages
- [x] Consolidated the CP-3b `permissions.ts` into `authorize.ts` (one layer, not two)
- [x] `check-permission-keys.cjs` — CI guard against code/DB key drift

**Review focus:** enforcement correctness — this is the security boundary.

**Verification evidence:**
| Check | Result |
|-------|--------|
| `npm run typecheck` / `lint` / `build` | ✅ clean — 16 routes |
| `npm run db:test` (isolation, incl. scope + override resolution) | ✅ **26/26** |
| `npm run db:test:auth` (recruiter scoped to `assigned`, denied `manage_roles` via live API) | ✅ **17/17** |
| `npm run db:check-keys` | ✅ **87 keys in sync** code ↔ database |
| App boots; permission provider doesn't break SSR; gate redirects | ✅ smoke-tested |

**How the pieces enforce, in order (defence in depth):**
1. **RLS** — the real boundary. Even a skipped app check can't read the row.
2. **Server guards** (`requirePermission` / `authorize`) — clear errors, not silent empties.
3. **Field masking** — sensitive columns never leave the server for an unauthorised viewer.
4. **Client `<Can>`** — hides UI. *Never* the boundary; purely cosmetic.

**Deliberate scope notes:**
- **"Unit tests covering the resolution matrix"** — satisfied by the DB-level suites (26 isolation
  + 17 live-API assertions exercise owner/role/override/scope/expiry). A JS unit harness over the
  same functions would only re-test the database through a thinner wrapper.
- **Scope *filters* are descriptors, not yet applied** — `resolveScope()` returns the shape, but
  there are no feature tables to filter until CP-6. Each will translate the descriptor into its
  own `.eq()`/`.in()`. RLS enforces scope regardless.
- **Field masking covers the 4 seeded field permissions** (salary, contact, documents, private
  notes). Evidence/recording visibility joins when proctoring/interview tables land (CP-19/22).

---

### ✅ CP-5 — Admin Portal UI  *(complete — awaiting your review)*
> Makes the "your rules, not ours" promise tangible. The permission *engine* was built and
> proven in CP-4; this is the UI that lets a non-technical admin drive it — and the checkpoint
> that **finishes Phase 0.**

- [x] Users: list, invite, deactivate, resend (CP-3b) + **per-member detail page** ([users/[id]](<src/app/(app)/admin/users/[id]/page.tsx>))
- [x] Roles: **create, clone, rename, delete** ([roles](src/app/(app)/admin/roles/page.tsx)); reassign-on-delete enforced by the DB guard
- [x] **Permission editor** — the 87-key catalogue as a per-role toggle grid, grouped by 13 collapsible modules, optimistic updates ([permission-editor](<src/app/(app)/admin/roles/[id]/permission-editor.tsx>))
- [x] **Data-scope selector** per scope-supporting permission (All / Department / Assigned / Own)
- [x] Field-visibility permissions surfaced inline with a `field` tag (same grid)
- [x] **Per-user overrides** with effect (grant/revoke), scope, **optional expiry**, reason ([override-manager](<src/app/(app)/admin/users/[id]/override-manager.tsx>))
- [x] Change a member's role from their detail page
- [x] **Restore-to-default** for preset roles (from `permission_preset_grants`)
- [x] **Audit log viewer** — paginated, action labels, actor, relative time ([audit](src/app/(app)/admin/audit/page.tsx))
- [x] **High-risk permissions flagged** with a warning icon in the grid
- [x] Owner role shown as fixed/uneditable (guarantee made visible, not just enforced)
- [x] New nav: Users · Roles & Permissions · Audit Log (permission-gated)

**Review focus:** is the permission editor actually usable by a non-technical admin? Log in as
`demo@hirelane.app`, open **Roles & Permissions → any role**, and toggle things. Sign in as
`recruiter@hirelane.app` to see the effect.

**Verification evidence:**
| Check | Result |
|-------|--------|
| `npm run typecheck` / `lint` / `build` | ✅ clean — 25 routes |
| `npm run db:test:admin` — **new** write-path suite | ✅ **9/9** |
| ↳ owner edits grants · change takes effect · revoke · overrides · **RLS blocks Owner-role edit & non-admin writes** · audited | ✅ |
| Full regression (`db:test` + `:auth` + `:openings`) | ✅ 26 + 17 + 10 |

**Bug found & fixed during CP-5 — audit-log noise (migration [0012](supabase/migrations/0012_provisioning_audit_quiet.sql)):**
Provisioning seeded ~190 role-permission grants, each firing the audit trigger, so a brand-new
workspace opened with ~190 "permission granted" entries burying real history. Now suppressed
during provisioning via a transaction-local flag — a fresh workspace has **1** audit entry.

**Also fixed — a replica-mode teardown bug in the dev scripts** (not app code): deleting orgs
under `session_replication_role = replica` skipped FK cascades, orphaning `audit_log`, `profiles`
and `auth.identities` rows (which then broke re-seeding with a 500). Rewrote teardown to disable
*only* the three guard triggers, keeping cascades live. Integrity verified: 5 users = 5 profiles
= 5 identities, 0 orphans.

**Deliberately deferred (noted):**
- **"View as role" preview** — the effect is already inspectable by signing in as a seeded role
  account; a dedicated in-place preview is a nice-to-have, deferred.
- **Approval-chain configuration UI** — `approval_rules` exists; its runtime lands with the
  actions it gates (publishing, CP-12), so a config UI now would gate nothing.
- **Rollback from change history** — audit records before/after state (the data is there); a
  one-click rollback UI is deferred.
- **Audit export (CSV/PDF)** — viewer is done; export joins the reporting work in CP-24.
- **Preset-per-org record** — restore-to-default assumes the Standard preset. A stored
  "which preset" column would make it exact; fine for now (Standard is the common case).

---

## Phase 1 — Job Openings & Applicants
> *Maps to UC-2 (authoring half) and UC-3.*

### ✅ CP-6 — Job Openings CRUD  *(complete — awaiting your review)*
> The first real recruiting feature, and the first feature table. It proves the pattern every
> later feature reuses: `organization_id` + `created_by` + `department_id`, RLS filtering via
> `can_access_record()`, permission-gated writes. **The whole CP-2/CP-4 stack, working together
> on real data for the first time.**

- [x] Schema [0011](supabase/migrations/0011_job_openings.sql): `job_openings`, `job_requirements`, `screening_questions` + 4 enums, applied to live DB
- [x] RLS on all three: scoped read (`can_access_record`), permission-gated create/edit/delete; child tables inherit access from the parent opening
- [x] Status-change audit trigger (draft → open → on_hold → closed)
- [x] Requisition form — all spec §UC-2 fields: type, mode, location, experience & salary bands, description, must/nice-to-have/qualifications, screening questions
- [x] Openings **list** with status filter + title search ([openings](src/app/(app)/openings/page.tsx))
- [x] Opening **detail** view with requirements, questions, facts sidebar ([[id]](<src/app/(app)/openings/[id]/page.tsx>))
- [x] **Edit** (reuses the form) + **create** (save-as-draft or create-&-open)
- [x] **Close / reopen / hold** with per-status permission checks
- [x] **Salary double-gate** — shown only when the opening opts in *and* the viewer holds `fields.view_salary`; otherwise "Hidden from your role" (spec §UC-2 R2 × §UC-0 step 5, the field-masking layer's first real use)
- [x] Server actions authorize first (`authorize()`), then write through RLS — belt and braces
- [x] Empty states, permission-aware CTAs, `NoAccess` walls on hard-gated pages
- [x] Server-side search/filter via query params (shareable URLs, no client state)

**Review focus:** does the scoped-access model behave as expected? Try it as a Recruiter (sees
only their own openings) vs. Owner (sees all).

**Verification evidence:**
| Check | Result |
|-------|--------|
| `npm run typecheck` / `lint` / `build` | ✅ clean — 20 routes |
| `npm run db:test:openings` — **new** scope suite | ✅ **10/10** |
| ↳ owner sees all · recruiter (assigned) sees only own · scoped edit blocked · child inherit · audit · cross-tenant | ✅ |
| `db:test` + `db:test:auth` (regression) | ✅ 26 + 17 |
| Routes gate unauthenticated → `/login?next=…` | ✅ smoke-tested |

**Deliberately deferred (noted, not forgotten):**
- **Configurable pipeline stages** — the checklist lists these under CP-6, but stages only matter
  once candidates exist. Moved to CP-7/8 where they're used.
- **Approval workflow** — `approval_rules` table exists; the runtime that enforces "publishing
  needs approval" lands with publishing itself (CP-12). Status is currently a direct action.
- **Requirements/questions edited as replace-all** — simpler and correct at these row counts than
  diffing; revisit only if it ever matters.

### ✅ CP-7 — Applicant Ingestion & Parsing  *(complete — awaiting your review)*
> Puts real candidates into openings. Introduces the **first `anon`-facing surface** (the public
> apply form) and the first Storage use (CV uploads).

- [x] Schema [0013](supabase/migrations/0013_applicants.sql): `candidates`, `applications`, `documents` + 2 enums + private Storage bucket, on live DB
- [x] RLS: candidates/applications/documents org-scoped; **application visibility inherits the parent opening's scope** (a recruiter sees applicants only on openings they can see — proven)
- [x] **Public apply form** at [/apply/[openingId]](<src/app/apply/[openingId]/page.tsx>) — branded, shows the role, channel-attributed via `?src=`; unauthenticated
- [x] Submission via a **SECURITY-DEFINER-style server action** (admin client): the only anon write path, fully validated, org derived from the opening — no `anon` RLS surface
- [x] **CV upload** to the private `candidate-documents` bucket; storage RLS keys read access off the org-id path prefix
- [x] **Dedup by (org, email)** — one identity per person; re-applying updates, never duplicates (spec §UC-3 R1)
- [x] Applicant **list per opening** with stage, source, CV indicator, contact (field-gated) ([applicants](<src/app/(app)/openings/[id]/applicants/page.tsx>))
- [x] **Manual add** (spec §UC-3 A1) + **copy apply link** for HR to share
- [x] Stage-change audit trigger; stage moves gated on `pipeline.advance` / `pipeline.reject`
- [x] Detail page's Applicants card now shows a live count + link
- [x] 5 sample applicants seeded on the demo's first opening (`db:seed-demo`)

**Review focus:** open a job → **View applicants** (5 seeded) → **Copy apply link** → open it in a
new tab and submit an application → watch it appear.

**Verification evidence:**
| Check | Result |
|-------|--------|
| `npm run typecheck` / `lint` / `build` | ✅ clean — 26 routes |
| `npm run db:test:applicants` — **new** scope suite | ✅ **8/8** |
| ↳ dedup · one identity across openings · **application scope inherits opening** · audit · cross-tenant | ✅ |
| Full regression (isolation/auth/openings/admin) | ✅ 26+17+10+9 |
| Public `/apply/[id]` reachable unauthenticated, renders | ✅ 200 |

**Bug found & fixed — `ANTHROPIC_API_KEY` env validation:** the key sits empty in `.env.local`, and
`z.string().min(1).optional()` accepts *undefined* but not an empty string — so every
`createAdminClient()` call threw at runtime ("Invalid server environment"). This is the first code
path to actually exercise the admin client at runtime; it would also have broken **team invites**.
Fixed by transforming empty → undefined in [env.ts](src/lib/env.ts).

**Deliberately deferred (noted):**
- **AI résumé parsing** (CV → auto-extracted skills/experience) needs the Anthropic key (go-live
  O2) — the form captures structured fields directly for now; the AI screening agent (CP-13)
  enriches from the CV later.
- **Merge duplicates UI** — dedup-on-write is done; a manual merge tool for edge cases is deferred.
- **Bulk import** (CSV) — deferred; manual add + public form cover ingestion.
- **Full candidate profile & pipeline board** — that's **CP-8** (this checkpoint is ingestion + list).

### ✅ CP-8 — Applicant List & Profile Shell  *(complete — awaiting your review)*
> The §UC-6 "single source of truth per candidate" — where hiring actually gets managed.
> Makes the applicants CP-7 collects *actionable*.

- [x] **Candidate profile** at [/candidates/[id]](<src/app/(app)/candidates/[id]/page.tsx>) — the full §UC-6 layout: header, contact/links/skills, applications, documents, notes, timeline
- [x] **Candidates list** at [/candidates](<src/app/(app)/candidates/page.tsx>) — fills the previously-stub nav item; search by name/email, latest stage per candidate
- [x] **Pipeline stage management** — inline stage selector on the profile *and* per-opening list; gated on `pipeline.advance` / `pipeline.reject`; audited
- [x] **Notes** ([migration 0014](supabase/migrations/0014_candidate_notes.sql)) with **three visibility scopes** — Private / Team / Management — enforced in RLS, add + delete-own
- [x] **Immutable timeline** — applied events + stage-change audit + notes, merged and time-ordered (read-only, from the append-only log)
- [x] **CV download** via short-lived (5-min) signed Storage URLs, permission-gated
- [x] **Field-gated everywhere** — contact details and documents hidden unless the viewer holds the field permission ("hidden from your role" messaging)
- [x] Per-opening applicant rows now link through to the profile
- [x] Sample notes (team + management) seeded on the demo's top candidate

**Review focus:** open a candidate, move them through stages, add notes at different visibilities.
Sign in as `recruiter@hirelane.app` — they see team notes but **not** management/private ones.

**Verification evidence:**
| Check | Result |
|-------|--------|
| `npm run typecheck` / `lint` / `build` | ✅ clean — 28 routes |
| `npm run db:test:notes` — **new** visibility suite | ✅ **9/9** |
| ↳ author sees own · recruiter sees team-not-management-not-private · owner sees all · can't edit others' · cross-tenant | ✅ |
| Full regression (isolation/openings/applicants/admin) | ✅ 26+10+8+9 |
| Candidate routes gate unauthenticated → login | ✅ |

**Deliberately deferred (noted):**
- **@mentions + notifications** — notes carry visibility now; @mention routing joins the
  notification work later.
- **Structured scorecards / ratings** (spec §UC-6 Ratings) — land with interviews (CP-22/23).
- **Bulk select on the list** — single-candidate actions cover the flow; bulk is a later nicety.
- **Match report / assessments / interviews sections** are visibly stubbed on the profile,
  filled by CP-13 / CP-15+ / CP-22.

### ✅ CP-9 — Candidate Portal & Invitations  *(complete — awaiting your review)* — **finishes Phase 1**
> The candidate-facing side. Candidates aren't auth users — access is by a signed, expiring,
> hashed-token link (magic-link style), validated through the admin path.

- [x] **"Connect with applicant"** → issues a signed expiring portal link ([migration 0015](supabase/migrations/0015_candidate_portal.sql)); only the SHA-256 hash is stored; **one live link per candidate** (partial unique index)
- [x] **Candidate portal** at [/candidate/[token]](<src/app/candidate/[token]/page.tsx>) — status of each application (candidate-friendly labels), profile completion, CV upload, all unauthenticated
- [x] Candidate **self-service actions** — update profile, upload CV, **withdraw** — every one re-validates the token and touches only that candidate (spec §UC-3 A4)
- [x] **Link expiry / reissue / revoke** — reissue revokes the old link; invalid/expired/revoked links show a friendly wall
- [x] **Invite management on the profile** ([portal-invite-card](<src/app/(app)/candidates/[id]/portal-invite-card.tsx>)) — create / reissue / revoke, URL shown once for copying; gated on `applicants.send_invitation`; audited
- [x] Shared opaque-token helper ([token.ts](src/lib/token.ts)) — random token, store hash only

**Review focus:** open a candidate → **Create portal link** → copy it → open in a new tab (no login)
→ see their status, edit details, upload a CV, withdraw. `npm run demo-portal-link` prints a
ready link for the top demo candidate.

**Verification evidence:**
| Check | Result |
|-------|--------|
| `npm run typecheck` / `lint` / `build` | ✅ clean — 29 routes |
| `npm run db:test:portal` — **new** invite suite | ✅ **6/6** |
| ↳ one-live-per-candidate · revoke frees slot · token-hash resolve · revoked stops resolving · cross-tenant | ✅ |
| Full regression (isolation/applicants/notes/admin) | ✅ 26+8+9+9 |
| Portal renders with a real token; invalid token → friendly wall | ✅ 200 |

**⚠️ Deferred — automated email delivery of the portal link (GL-1).** The link is generated and
copied by HR for now. Sending it automatically needs the email integration (a direct Resend API
call for transactional mail — the current Resend SMTP config only covers Supabase *auth* emails,
and candidates aren't auth users). Logged under go-live GL-1.

**Also deferred:** email *templates* (join the email work), and "connect" auto-advancing the
stage (kept as an explicit HR action).

---

## Phase 2 — Distribution
> *Maps to UC-1 and the publishing half of UC-2.*

### ✅ CP-10 — Channel Integration Framework  *(complete — awaiting your review)* — **starts Phase 2**
- [x] Schema [0016](supabase/migrations/0016_channels.sql): `channels` (global catalogue), `channel_connections`, `job_postings` shell + 3 enums + RLS
- [x] **8 channels seeded** — Careers Page, LinkedIn, Indeed, Rozee.pk, Glassdoor, Bayt, Facebook Jobs, X — with per-channel **capability hints** (title/body limits, media) for AI generation (CP-11)
- [x] **Assisted mode** connect/disconnect (spec §UC-1 A1) — works fully now without any API partnership
- [x] Integrations page at [/admin/integrations](<src/app/(app)/admin/integrations/page.tsx>) — was a stub, now real: channel grid, status, connect/reconnect/disconnect, permission-gated
- [x] **Connection health banner** — expired connections flagged with a re-authorise prompt
- [x] `integrations.view` / `.connect` / `.disconnect` permission-gated throughout; connect/disconnect audited
- [x] `job_postings` table ready for CP-11 (AI content) / CP-12 (publishing)
- [x] 4 channels connected in the demo workspace

**Review focus:** open **Integrations** in the sidebar — connect/disconnect boards, see status.

**Verification evidence:**
| Check | Result |
|-------|--------|
| `npm run typecheck` / `lint` / `build` | ✅ clean — 30 routes |
| `npm run db:test:channels` — **new** | ✅ **6/6** (global catalogue, org-scoped connections, permission-gated, isolation) |
| Full regression (isolation/openings/applicants/notes/portal/admin) | ✅ all green |

**Deliberately deferred (spec-anticipated, go-live):**
- **Real OAuth + encrypted token vault** — direct API posting to LinkedIn/Indeed needs partner
  approval (a business process). The `*_cipher` columns and `oauth` mode are in place; the flow
  slots in per platform at go-live. **Everything works in assisted mode meanwhile.**
- **Multiple accounts per platform** (spec §UC-1 A3) — one connection per channel per org for now.
- **Capability probe on connect** — capabilities are seeded statically rather than fetched live.

### ✅ CP-11 — AI Post Generation  *(complete — awaiting your review)*
> The "AI writes the post, you publish it" feature. **First live AI in the product** — and it
> genuinely works: validated with a real Gemini call producing a real post.

- [x] **Gemini (Google) integration** — [gemini.ts](src/server/ai/gemini.ts) client using `gemini-flash-latest`, structured-JSON output (responseSchema), graceful error mapping (rate-limit / bad-key / parse). Switched from Anthropic per your key.
- [x] **Per-channel post variants** — one tuned post per *connected* channel, respecting each channel's title/body length limits (from CP-10's capability hints)
- [x] **SEO score + improvement hints + hashtags** returned per post, shown with a colour-graded badge
- [x] **Editor** ([posts](<src/app/(app)/openings/[id]/posts/page.tsx>)) — per-channel cards with editable title/body (live char counts), **regenerate**, **copy**, save-edits; a **Generate all** button does every connected channel
- [x] **Guardrail (spec §UC-2 R4)** — the prompt hard-constrains the model to the canonical requisition: "do NOT invent skills, requirements or facts; only rephrase, format and SEO-optimise." Output also length-clamped server-side as a safety net.
- [x] Reachable via **AI posts** button on the opening; degrades gracefully if no key / no channels connected
- [x] Permission-gated: `post_generation.generate` / `.edit`

**Review focus:** open the demo's **Senior React Developer** → **AI posts** → **Generate all** →
watch tuned LinkedIn/Indeed/Rozee/Careers posts appear; edit and regenerate them.

**Verification evidence:**
| Check | Result |
|-------|--------|
| `npm run typecheck` / `lint` / `build` | ✅ clean — 31 routes |
| `npm run test:gemini` — live key smoke test | ✅ **key + model working** |
| Real end-to-end generation against a demo opening | ✅ post in ~7s (title, SEO 88, body, hints, hashtags), stayed on-facts |

**Notes:**
- **Model:** `gemini-flash-latest` (stable alias). The versioned names like `gemini-2.5-flash` are
  deprecated for new keys; the `-latest` alias stays current.
- **Rate limits:** "Generate all" runs sequentially to stay within the free-tier per-minute cap.
- **Deferred:** live SEO keyword-trend data (score is the model's estimate for now); scheduled
  regeneration. **Publishing** these posts to the boards is CP-12.

### ✅ CP-12 — Publishing
- [x] One-click multi-channel publish with per-channel status (**Publish all** + per-card Publish/Retry; `posting_status` state machine: draft → scheduled → published → closed, with `failed` off-ramp)
- [x] Scheduled posting (per-channel schedule modal; `publishDuePostsAction` stand-in scheduler flips due posts live on page load — a real cron runs the same logic at go-live)
- [x] Partial-failure handling and per-channel retry (`publishAllPostsAction` reports "published N, couldn't publish M (…)"; failed cards show the reason + **Retry**; disconnected/expired channels fail with an actionable message)
- [x] Edit-after-publish and takedown on close (spec §UC-2 A3: editing a live post re-publishes on API channels, warns "update manually" on assisted; closing an opening marks its live/scheduled posts `closed`/unmanaged — never deletes)
- [x] Source attribution end-to-end (per-channel tagged apply link `…/apply/{id}?src={channel}` → `applications.source`; verified stored and reportable)

**Assisted-mode publish:** most boards are copy-paste — the Publish button opens a modal to copy the post, paste it on the board, and mark it posted (optionally with the live URL). API channels (careers_page) publish directly. Same action, drop-in OAuth branch per platform at go-live.

**Verification:** `node scripts/test-publishing.cjs` → **13/13 pass** (schema, publish transition + attribution of `published_by`, schedule + due-sweep, takedown-on-close, RLS write gate, cross-org isolation, source attribution). Typecheck + lint + production build (31 routes) all clean.

---

## Phase 3 — AI Screening
> *Maps to UC-4.*

### ✅ CP-13 — Screening Agent
- [x] Scoring pipeline against must-haves / nice-to-haves (Gemini structured-JSON engine in [screen.ts](src/server/screening/screen.ts); per-requirement matched/partial/missing coverage; auto-screens on application arrival via `after()`, plus **Re-rank all** on demand)
- [x] Per-criterion breakdown with cited evidence (experience / qualification / stability / logistics scores + must/nice coverage, each carrying the data point it came from — spec R1). CVs are stored as files (unparsed), so evidence cites the structured profile + application answers
- [x] Highlights, concerns, recommendation (3–5 evidence-cited highlights; concerns; `strong_fit` / `possible_fit` / `weak_fit`)
- [x] Protected-attribute exclusion (spec R3 — `buildCandidateView` sends only job-relevant fields: no name, gender, age, nationality, marital status or photo; the prompt forbids inferring them)
- [x] Model version + inputs logged per run (spec R4 — `model` + full `inputs` snapshot stored on every screening row). Never touches `application.stage` (spec R2 — recommends only, no auto-reject)

**Surfacing:** applicants list now shows a colour-banded ScoreRing + recommendation and sorts by score (gated on `screening.view_score`). The full match-report view, filters and configurable weights are **CP-14**.

**Verification:** `node scripts/test-screening.cjs` → **11/11 pass** (schema, write via rerank perm, evidence payloads round-trip, stage untouched, view_score gate, write gate, cross-org isolation). `node scripts/test-screening-smoke.cjs` → live Gemini run separates a strong candidate (**95 / strong_fit**, all must-haves matched) from a weak one (**30 / weak_fit**, TypeScript + 5-yrs + state-mgmt correctly missing, 3 concerns). Typecheck + lint + build all clean. Migration: 0018_screening.

### ✅ CP-14 — Match Reports & Ranking UI
- [x] Ranked list with colour-coded bands (ScoreRing + recommendation, sorted by score — CP-13, carried forward)
- [x] Match report view, side-by-side with requirements ([match-report.tsx](<src/app/(app)/candidates/[id]/match-report.tsx>) on the candidate profile: weighted score breakdown, must/nice coverage with per-requirement matched/partial/missing + evidence, highlights, concerns, model attribution)
- [x] Configurable scoring weights per opening (skills / experience / qualification sliders in a dialog off the applicants toolbar; stored on `job_openings.scoring_weights`). Overall score is a **weighted blend** of stored sub-scores, so re-weighting is an **instant, AI-free recompute** ([scoring-weights.ts](src/lib/scoring-weights.ts))
- [x] Re-rank on requirement change (a DB trigger on `job_requirements` flips `application_screenings.stale`; the applicants page shows a "Requirements changed — re-rank" banner — spec A1, covers every edit path)
- [x] Human override with recorded reason (spec step 7 — reviewer picks a recommendation + reason on the match report; recorded with who/when, reversible, gated on `screening.override`; never changes the pipeline stage)

**Verification:** `node scripts/test-scoring.cjs` → **11/11 pass** (weight formula incl. missing-dimension renormalisation, weights persistence, stale trigger on add/edit/delete requirement, override write + reason, override write-gate, stage-untouched). Typecheck + lint + build all clean. Migration: 0019_scoring_weights.

> Note: screenings created before CP-14 keep their CP-13 scores until re-ranked — click **Re-rank all** once to pick up weighted scores + the skills criterion.

---

## Phase 4 — Assessments
> *Maps to UC-5.1 and UC-5.2.*

### ✅ CP-15 — Test Authoring
- [x] Schema: `tests`, `test_questions`, `test_versions`, `question_bank` (+ enums `question_type`, `test_status`, `question_difficulty`, `proctoring_level`; migration 0020). Delivery settings (duration, threshold, shuffle, backtrack, attempts, proctoring level) live on `tests`, set at authoring, consumed in CP-16
- [x] Manual authoring UI, all 6 question types (editor at [openings/[id]/tests/[testId]](<src/app/(app)/openings/[id]/tests/[testId]/test-editor.tsx>): single/multiple choice with tick-correct, true/false, short/long/scenario with rubric)
- [x] AI test generation from the job requirements ([generate.ts](src/server/assessments/generate.ts) → structured-JSON questions with options + answer key or rubric, marks, skill, difficulty; lands as a **draft** — spec R1, nothing goes live unreviewed)
- [x] Per-question regenerate, reorder, marks, rubrics (up/down reorder, per-question AI regenerate, marks/skill/difficulty, save-to-bank)
- [x] Versioning on edit-after-publish (spec R3 — publishing snapshots the test into `test_versions` and bumps `tests.version`; editing a published test flags `has_unpublished_changes`; a re-publish appends the next immutable version)

**Guardrails:** correct answers + rubrics are stored but flagged "never shown to the candidate" and will be stripped in the CP-16 delivery query (spec R2).

**Verification:** `node scripts/test-assessments.cjs` → **13/13 pass** (schema, authoring, version snapshots + unique-version constraint, RLS write-gate for view-only roles, question-bank gate, cross-org isolation). Typecheck + lint + build (33 routes) all clean. `scripts/test-assessments-smoke.cjs` (live AI gen) is quota-limited today (Gemini free tier 20 req/day) — same proven path as CP-11/13; retry when quota resets.

### ✅ CP-16 — Test Assignment & Delivery
- [x] Assign to candidates with deadline (Assessments card on the candidate profile → pick a published test + deadline; migration 0021: `test_assignments`, `test_attempts`, `test_answers`)
- [x] Candidate test runner: full-screen, timer, auto-save ([test-runner.tsx](<src/app/candidate/[token]/test/[assignmentId]/test-runner.tsx>): fixed full-viewport, server-authoritative countdown, per-answer auto-save with debounced text). Consent + rules screen before start (spec step 3)
- [x] Shuffling, navigation rules, attempt limits (question/option shuffle stored on the attempt for resume-stability; one-way vs back-navigation from the test's `allow_backtrack`; `attempts_used`/`attempts_allowed`)
- [x] Disconnect/resume with grace window (attempt persists server-side; answers auto-save; reopening resumes at saved state within the time limit — spec A1)
- [x] Auto-submit on expiry (client submits at zero; `getRunnerData`/`saveAnswer` also finalise server-side if the clock has already passed — belt and braces)

**Guardrails:** delivery payload strips `correct_answers` + `rubric` before it reaches the browser (spec R2, `toDeliveryQuestions`). Attempts pin to the published **version** (spec R3). Submitting auto-scores choice/true-false instantly (full + partial credit); written answers await CP-17. Candidate access is via the existing portal token on the service role — no new auth surface.

**Verification:** `node scripts/test-delivery.cjs` → **15/15 pass** (key-stripping, single + partial-credit scoring, RLS assign-gate, answer reads gated on `view_answers`, version pinning, cross-org isolation). Typecheck + lint + build (35 routes) all clean.

> Deferred to Phase 5: real proctoring capture + hardware/system check (UC-5.3). The consent screen and `proctoring_level` are wired; monitoring itself lands in CP-19–22.

### ✅ CP-17 — Scoring
- [x] Auto-scoring for MCQ / true-false (incl. partial credit) — done in CP-16 (`finalizeAttempt`), now marked `confirmed` by construction so it's final without a human step
- [x] AI-assisted grading of written answers against rubrics ([grade.ts](src/server/assessments/grade.ts) → Gemini grades each short/long/scenario answer 0–max against its rubric with a rationale; **suggestion only**)
- [x] Human confirmation step (spec §UC-5.2 step 7 — the results view shows the AI suggestion + rationale; HR confirms or amends the mark; nothing counts until `confirmed`, gated on `assessments.confirm_grades`; "Confirm all" accepts every suggestion at once)
- [x] Per-skill breakdown on the profile (results view at [candidates/[id]/attempt/[attemptId]](<src/app/(app)/candidates/[id]/attempt/[attemptId]/results-view.tsx>): overall score, per-skill bars, per-question detail with the candidate's answer, correct answer for auto items, and grading controls for written items; reachable via **Results** on the Assessments card)

**Verification:** `node scripts/test-grading.cjs` → **10/10 pass** (total counts only confirmed marks, per-skill grouping, AI suggestion doesn't count until confirmed, HR confirm write, `confirm_grades` RLS gate, cross-org isolation). Migration 0022 (grading columns). Typecheck + lint + build (36 routes) all clean.

### ✅ CP-18 — Assessment Policy & Accessibility
- [x] Admin-configurable assessment policy (org-wide defaults for proctoring, duration, pass %, attempts, backtrack, shuffle + the retake cap — [Administration → Assessment policy](<src/app/(app)/admin/assessments/policy-form.tsx>); migration 0023 `assessment_policies`, gated on `administration.configure_ai_policy`). New tests inherit these defaults on creation
- [x] Accommodations: extra time, screen-reader mode (spec §UC-5.2 A4 — per-assignment on the Assign dialog; extra minutes fold into the attempt's `expires_at`; screen-reader mode flows to the runner which applies larger type + ARIA roles/`aria-checked` on options + a labelled `timer`)
- [x] Retake grants (Grant retake / Extend deadline on the Assessments card; retakes are **capped by the policy's `max_attempts`** — enforced in `grantRetakeAction`)

**Verification:** `node scripts/test-policy.cjs` → **8/8 pass** (retake-cap logic, policy schema, admin-only write with member read, `max_attempts` constraint, cross-org isolation). Typecheck + lint + build (37 routes) all clean. **Phase 4 complete.**

---

## Platform pages (standalone — outside the numbered CPs)
- [x] **Assessments hub** (`/assessments`) — org-wide index over every test, attempt and grading task: stat tiles, tabbed Attempts / Grading queue / Tests with status filters, integrity flags, and a "New test" opening-picker entry point. Replaces the placeholder.
- [x] **Company profile** (`/admin/company`) — editable org identity (name, tagline, about, industry, website), branding (logo URL, brand colour) with a live candidate-facing preview, localization and candidate-email sender fields. `0026_company_profile.sql` adds the columns; RLS gates writes on `administration.manage_company_profile`; `scripts/test-company.cjs` (7 assertions green).
- [x] **Assessment library** — create reusable assessments in the hub (author by hand or generate with AI from typed topics), then **Use in a role** copies the template into a job opening as an independent draft (its own versioning; edits never ripple back). Library tab + editor at `/assessments/library/[testId]`; `attachLibraryTestToOpeningAction` clones template + questions; `scripts/test-library.cjs` (7 assertions — template shape, copy independence, author RLS, cross-org).
- Coming-soon placeholders remain for `/interviews` (CP-22) and `/reports` (Phase 6).

## Phase 5 — Proctoring & Interviews
> *Maps to UC-5.3 and UC-7.*

### ✅ CP-19 — Proctoring Capture
- [x] Consent gate — recorded consent + per-level signal disclosure on the intro screen (R1)
- [x] System check: camera, mic, network, browser + check-in photo capture
- [x] Browser event capture: tab switch, blur, fullscreen exit, copy/paste, right-click, devtools heuristic
- [x] Environment signals: IP-change fingerprint (multi-session/VM indicators deferred to CP-20)
- [x] Tiered levels: Off / Basic / Standard / Strict (capture no-ops when Off)
- [x] Server-authoritative severity + escalation — FLAGS at threshold, never auto-rejects (R2)
- [x] HR results view surfaces the integrity summary (flag + event tally), gated on `proctoring.view_summary`
- [x] `0024_proctoring.sql` (proctoring_events + attempt capture columns + RLS); `scripts/test-proctoring.cjs` (14 assertions green)

### ✅ CP-20 — AI Proctoring Analysis
- [x] Behavioural anomaly detection — Gemini reasons over the CP-19 event timeline (frequency/clustering), not a raw dump
- [x] Face presence / multiple faces — vision pass over the check-in photo (present / face count / note)
- [x] Confidence scoring per flag — every finding + the overall verdict carry a bounded 0–1 confidence (R4)
- [x] Advisory only — produces an integrity level (clear/low/medium/high) + plain-language summary; never auto-rejects (R2)
- [x] `0025_proctoring_analysis.sql` (proctoring_analyses + `integrity_level` enum + RLS); multimodal `generateJson`; AI verdict panel on the results view; `scripts/test-proctoring-analysis.cjs` (11 assertions green)
- [ ] Audio: additional voices — deferred: needs continuous audio capture (lands with recording in CP-22)
- [ ] Identity match to a reference photo — deferred: no reference image on file yet

### ✅ CP-21 — Integrity Reports
- [x] Event timeline aligned to questions — chronological, relative-to-start, best-effort "on Q_n_" correlation from answer save-times (view-answers gated)
- [x] Evidence storage, watermarking, access control, auto-deletion — check-in photo via short-lived signed URL, gated on `proctoring.view_evidence`; display-time viewer-identity watermark; 180-day retention with `scripts/purge-proctoring-evidence.cjs`
- [x] Overall integrity level + plain-language summary — surfaces the CP-20 verdict (level, confidence, findings) at the top of the report
- [x] HR decision: accept / invalidate / reject — `recordIntegrityDecisionAction` gated on `proctoring.invalidate`, reason required for invalidate/reject, written with who/when/why to `audit_log`
- [x] Report at `/candidates/[id]/attempt/[attemptId]/integrity`; decision never moves the application stage (R2); `0027_integrity_reports.sql`; `scripts/test-integrity.cjs` (8 assertions green)

### ✅ CP-22 — Video Interviews
- [x] Scheduling with calendar invites — schedule dialog (candidate, panel, time, mode, video link); downloadable `.ics` invite at `/interviews/[id]/invite`
- [x] In-app room: chat, shared notes, shared code pad — real-time via Supabase Realtime (presence + broadcast), screen-share/video via the external call link
- [x] Blind scorecards until submitted — a panellist sees a peer's scorecard only once their own is submitted (or they hold `view_others_scorecards`); enforced in RLS via a `SECURITY DEFINER` helper (no recursion)
- [x] Reschedule / no-show — full lifecycle (scheduled → completed / cancelled / no-show, reschedule/reopen)
- [x] `0028_interviews.sql` + `0029` blind-fix; `scripts/test-interviews.cjs` (12 assertions — scheduling RLS, blind rule, own-only writes, lifecycle) green
- [ ] Consent-gated recording + transcription — deferred: recording/transcription handled by the external call tool (no media server / TURN in this environment); native capture lands with dedicated infra
- [ ] Async video interviews — deferred: needs candidate-side media capture + storage (the chosen model is live external + in-app collaboration)

---

## Phase 6 — Collaboration & Insight
> *Maps to UC-6 and UC-8.*

### ⬜ CP-23 — Notes & Collaboration
- [ ] Threaded notes with visibility scopes
- [ ] @mentions and notifications
- [ ] Structured competency scorecards + aggregate
- [ ] Conflict-of-interest declaration

### ⬜ CP-24 — Reporting
- [ ] Pipeline funnel, time metrics, source effectiveness
- [ ] Post performance, assessment analytics, team activity
- [ ] Aggregate-only diversity reporting
- [ ] CSV / PDF export

### ⬜ CP-25 — Polish & Hardening
- [ ] Talent pool and cross-opening reuse
- [ ] Notification templates (email / SMS / WhatsApp)
- [ ] Accessibility audit to WCAG 2.1 AA
- [ ] Localisation: English + Urdu, RTL
- [ ] Performance pass against the spec's NFR targets
- [ ] Security review + penetration test prep

---

## Phase 7 — Plans, Billing & Platform Admin
> *New scope beyond the original use-case spec — monetization. Three tiers (Free / Basic / Premium), per-seat add-ons, Stripe billing in **test mode** for now, and a platform-level super-admin. Every entitlement is enforced **server-side** on top of the CP-2 RLS boundary — a locked feature is refused in the action layer, never hidden in the UI alone.*

### Plan matrix (target)

| Capability | **Free** | **Basic** | **Premium** |
|-----------|:--------:|:---------:|:-----------:|
| Seats (users) | **1** (admin only) | **3** (admin + 2) | **up to 10** |
| Job openings | **5** | Unlimited | Unlimited |
| Channel / account integrations | ❌ | ✅ | ✅ |
| AI job-post generation (CP-11) | ❌ | ✅ | ✅ |
| AI screening + match reports (CP-13–14) | ❌ | ❌ | ✅ |
| AI assessments (gen + grading, CP-15–17) | ❌ | ❌ | ✅ |
| Additional seats (paid add-on) | ❌ | ✅ per-seat | ✅ per-seat (beyond 10) |

*“All AI features” = Premium. Basic unlocks integrations + AI **post creation only**. Extra seats are a metered per-seat add-on billed on top of the plan.*

### ⬜ CP-26 — Plans & Entitlements
- [ ] Schema: `plans` (free/basic/premium — seat cap, opening cap, feature flags), `plan_prices`, `org_subscriptions` (plan, status, base seats, purchased add-on seats, current period)
- [ ] Entitlement engine — one source of truth resolving an org's **limits** (seats, openings) and **feature flags** (`integrations`, `ai_posts`, `ai_screening`, `ai_assessments`) from its plan + add-ons
- [ ] Server-side enforcement: block inviting a user past the seat limit; block creating a job opening past the cap (Free = 5); gate the AI actions (CP-11/13–17) and channel connections on the org's feature flags — layered on top of the existing permission + `isAiConfigured` checks, not UI-only
- [ ] Usage surfacing: an org **billing/plan** page showing current plan, seats used/available, openings used vs. cap, and which features are locked (with an upgrade nudge)
- [ ] Graceful downgrade: over-cap resources become read-only rather than deleted (e.g., openings beyond the new limit can't be reopened until upgrade)

### ⬜ CP-27 — Stripe Billing (test mode)
- [ ] Stripe integration in **test mode** (test keys + test cards); Products/Prices mirror the plan matrix
- [ ] Upgrade / downgrade across Free / Basic / Premium via Stripe Checkout, with entitlements updated on success
- [ ] Additional-seat purchase as a quantity-based subscription item (per-seat Price)
- [ ] Subscription lifecycle via **signature-verified, idempotent webhooks** (`checkout.session.completed`, `customer.subscription.updated/deleted`, `invoice.paid/payment_failed`) → sync `org_subscriptions` + entitlements
- [ ] Stripe **Customer Portal** for payment method, invoices and cancellation
- [ ] Org billing admin page: current plan, seat usage, upgrade, buy seats, manage billing
- [ ] Test-mode banner; go-live items (live keys, production webhook endpoint, tax/receipts) tracked under the go-live list

### ⬜ CP-28 — Super-Admin Portal (platform)
- [ ] A separate **cross-tenant** super-admin area for platform staff — hard-gated behind a dedicated super-admin capability (not a normal org role), bypassing org RLS only through an audited service path
- [ ] Manage **plans & pricing** globally: create/edit tiers, limits, the feature matrix and per-seat pricing — kept in sync with Stripe Products/Prices
- [ ] Platform **analytics**: organisations, active subscriptions, plan distribution, MRR, seats sold, AI usage, openings/applicants volume, churn
- [ ] **API & integrations** management: platform API keys, channel/OAuth app credentials, webhook endpoints, and integration health
- [ ] Org administration: view / suspend / comp / trial an organisation, adjust its plan, and audited impersonation for support

---

## Decisions Log

| # | Date | Decision | Rationale |
|---|------|----------|-----------|
| D1 | 2026-07-22 | Next.js 15 + Supabase | Fastest path to multi-tenant product; RLS enforces tenant isolation at the DB layer as UC-0 requires; no Docker needed on this machine |
| D2 | 2026-07-22 | Medium checkpoints | Stop at the end of each functional module for review |
| D3 | 2026-07-22 | App lives at repo root | Single Next.js app rather than a monorepo — no second deployable is needed yet |
| D4 | 2026-07-22 | Next 16 + React 19 + Tailwind v4 (not 15) | `create-next-app` now ships 16.2; no reason to downgrade |
| D5 | 2026-07-22 | UI primitives hand-written, not via the shadcn CLI | Same shadcn structure and API, but no interactive/network CLI step and we own the code outright. Radix supplies the behavioural primitives |
| D6 | 2026-07-22 | `proxy.ts` instead of `middleware.ts` | Next 16 deprecated the `middleware` convention; adopted the replacement now rather than carry a deprecation warning |
| D7 | 2026-07-22 | `getUser()` not `getSession()` in the proxy | `getUser()` revalidates the JWT server-side; `getSession()` trusts a client-supplied cookie |
| D8 | 2026-07-22 | Nav items declare permission keys from day one | CP-4 can turn on enforcement without restructuring navigation |
| D9 | 2026-07-22 | Light theme is the default; system-following off | Your stated preference. Dark remains fully tokenised and available via the toggle |
| D10 | 2026-07-22 | Warm neutrals + teal/ember, not cold grey + indigo | The default cold-grey-and-indigo combination is what makes generated UI look generic. Warm greys and a less-used brand hue give it identity at no cost |
| D18 | 2026-07-22 | Org provisioning deferred to first authenticated request, not sign-up | `provision_organization()` requires an authenticated caller, and no session exists until the confirmation email is followed. Company name is carried on the auth user's metadata and cleared after use, so a second sign-in cannot create a duplicate workspace |
| D19 | 2026-07-22 | Password reset and sign-up return identical responses regardless of whether the email exists | Differing responses turn the endpoint into an account-enumeration oracle |
| D20 | 2026-07-22 | Sign-out is a form POST, not a link | A `<Link>` would be prefetched by the router and sign the user out on hover |
| D21 | 2026-07-22 | `?next=` restricted to same-site relative paths | Otherwise the login form becomes an open redirect for phishing |
| D22 | 2026-07-22 | Permission preset chosen at sign-up rather than in the wizard (deviates from spec §UC-0) | Provisioning must be atomic; changing preset later needs an `apply_preset()` function, deferred to CP-5 |
| D12 | 2026-07-22 | SQL-first schema; no cloud project yet | Your call. Portable plain SQL applies to Supabase or any Postgres later; keeps development moving with no cloud dependency or cost |
| D13 | 2026-07-22 | Permission catalogue lives in the DB, not in code | A permission that only exists as a TypeScript constant cannot be enforced by RLS. Storing it means API and database can never disagree about who may do what |
| D14 | 2026-07-22 | Resolution logic written once, in SQL | `has_permission()` is called by both RLS policies and the application, so the UI cannot drift from what the database enforces |
| D15 | 2026-07-22 | `FORCE ROW LEVEL SECURITY` on every tenant table | Ordinary RLS is skipped for the table owner. Forcing it means a misconfigured connection still cannot read across tenants |
| D16 | 2026-07-22 | Guardrails enforced in the database, not the app | Append-only audit and last-owner protection are the two things that must survive an application bug. Triggers plus revoked grants — belt and braces |
| D17 | 2026-07-22 | Added `npm run validate:sql` using a WASM Postgres parser | Without a local database, this is the only way to catch syntax errors before go-live. Honest about its limit: syntax only, not semantics |
| D23 | 2026-07-22 | **Prisma for schema/types only; Supabase client keeps runtime queries** | Your choice. Prisma connects as `postgres`, which holds `BYPASSRLS` — routing runtime queries through it would silently disable every tenant-isolation guarantee from CP-2. This keeps RLS as the boundary while giving Prisma's schema tooling, generated types and Studio |
| D24 | 2026-07-22 | Activation lands on the dashboard; onboarding demoted to a banner | Your revised flow. A wizard between activation and first value is friction, and the spec only requires setup be resumable — not mandatory |
| D25 | 2026-07-22 | Team invites use Supabase `inviteUserByEmail`, replacing the CP-3 custom token | It creates the user *and* sends the email in one call. A bespoke token is one more secret to generate, hash, expire and leak; deleting it removed code and risk at once |
| D26 | 2026-07-22 | Invited membership starts `invited`, activated only after password set | An invitee who never completes setup must not be able to act in the workspace |
| D27 | 2026-07-22 | Disabling 2FA requires a fresh TOTP code | Otherwise possession of an unlocked, signed-in device is enough to strip the second factor — which defeats the point of having one |
| D29 | 2026-07-24 | Permission checks call the DB functions, not a re-implemented JS copy | `can()` is a thin wrapper over `has_permission`, the same function RLS uses. A parallel JS implementation could drift from the database and create a UI that shows what the DB forbids (or vice versa) |
| D30 | 2026-07-24 | Field visibility masked in the app, not via column GRANTs | RLS and GRANTs are row/table level; per-role *column* visibility is dynamic. Masking in the server layer before data leaves is the pragmatic fit, and it never sends a value the viewer can't see |
| D31 | 2026-07-24 | Client `<Can>` seeded once server-side, explicitly labelled non-security | One `my_permissions()` call hydrates the whole client tree — no per-component round trips — while every action still re-checks on the server. Hiding a button is cosmetic; RLS is the boundary |
| D32 | 2026-07-24 | DB types kept hand-written (+ FK relationships) rather than `supabase gen types` | The CLI generator needs Docker/podman, unavailable here. Hand-written types with explicit relationships build clean and are guarded against drift by `db:check-keys`; swap to generated types at go-live when Docker is available |
| D28 | 2026-07-22 | Password percent-encoded in the connection URL | `@`, `?` and `!` in the password would otherwise make the URL parser read the host as `22?!`. Silent, confusing failure |
| D11 | 2026-07-22 | Dashboard and landing ship with realistic sample data | Empty placeholder tiles make layout problems invisible. Sample data is clearly labelled and replaced from CP-6 |

---

## Open Items for You

| # | Item | Status |
|---|------|--------|
| O1 | ~~**Supabase project**~~ — **Superseded:** a live Supabase project (`jertgmxuinzvvqrnhhub`) was supplied. Note it is **not** under the account your MCP connector is linked to, so I work through the direct connection string, not the Supabase tools. | ✅ Decided |
| O7 | ~~**SQLite vs Postgres**~~ — **Settled: Postgres.** The schema is live and proven on Supabase; SQLite would mean deleting the permission engine. Original note kept below for context. 🔴 **SQLite vs Postgres — you've asked for both.** Your note on O6 says *"use SQLite for now"*, but you then supplied a Supabase Postgres URL and asked for Prisma. **My recommendation: stay on Postgres.** SQLite cannot express *any* of CP-2 — no row-level security, no `plpgsql` functions, no triggers, no enums, no `citext`. Switching would mean deleting the permission engine and re-implementing tenant isolation in application code, which contradicts spec §9.3 guardrail 4. You already have a working Postgres; there is no cost saving to be had. | ⏸️ **Blocking (B2)** |
| **O8** | 🔴 **Rotate the database password.** It was pasted into chat and grants superuser access. | ⏸️ **Blocking (B1)** |
| O9 | ~~**Supabase anon + service-role keys**~~ — **DONE 2026-07-23.** Added to `.env.local` and verified against the live API (auth health, service-role read, anon correctly denied). | ✅ Closed |
| O11 | ~~**Rotate the password**~~ — **DONE 2026-07-23.** 16-char alphanumeric, set directly in `.env.local`, never sent through chat. Connection and full test suite re-verified. | ✅ Closed |
| O6 | ~~**Apply + test the schema**~~ — **DONE 2026-07-23.** 10 migrations applied to `jertgmxuinzvvqrnhhub`; `npm run db:test` → 26 passed, 0 failed. | ✅ Closed |
| O10 | ~~**Approval to apply migrations**~~ — database verified empty first (`P4001`), so there was nothing to lose. Applied. | ✅ Closed |
| O2 | **Gemini (Google) API key** — provided 2026-07-24 for CP-11 AI features (post generation, screening, tests). ⚠️ Value starts `AQ.` not the usual `AIza…` — verify it's a real AI Studio API key at https://aistudio.google.com/apikey before CP-11 relies on it. Now in `.env.local` as `GEMINI_API_KEY`. | ⏸️ Verify format before CP-11 |
| O3 | **Spec §12 Q9** — sign-off on the four non-configurable guardrails (consent, append-only audit, Owner lockout, tenant isolation). | ⏸️ Awaiting decision |
| O4 | **Branding** — brand colours. Currently the "Teal & Ember" palette; every colour is a token in [globals.css](src/app/globals.css), so swapping to your brand is a one-file change. | ⏸️ Optional |
| O5 | ~~**Product name**~~ — **Resolved:** the product is **Hirelane**. | ✅ Decided |

---

## Change Log

| Date | Checkpoint | Summary |
|------|-----------|---------|
| 2026-07-22 | — | Checklist created; stack and cadence agreed |
| 2026-07-24 | Landing | Redesigned landing page — cleaner professional layout (split hero, stat strip, bento features, 4-step flow, screening preview, CTA). Added **Three.js hiring-funnel animation** (React Three Fiber): candidate nodes flow down and warm to brand red, converging on a "hire" point — ties to the product + funnel logo. Mount-gated (SSR-safe, page still static-prerendered), reduced-motion aware, mouse parallax. Targeted eslint override for R3F imperative code. |
| 2026-07-24 | CP-9 | Candidate portal — **Phase 1 complete.** Signed expiring hashed-token links (migration 0015, one-live-per-candidate), public portal (/candidate/[token]) with status + profile completion + CV upload + withdraw, invite management on profile (create/reissue/revoke, audited). New `db:test:portal` **6/6**. `demo-portal-link` script. 29 routes. Email delivery deferred to GL-1. |
| 2026-07-24 | CP-11 | AI post generation — **first live AI.** Gemini (`gemini-flash-latest`) via `@google/genai`, structured JSON, per-channel tuned posts with SEO score/hints/hashtags, editor (generate-all/regenerate/edit/copy), requisition guardrail. Switched AI provider Anthropic→Gemini + fixed the env var. Validated with a real generation (post in ~7s). 31 routes. |
| 2026-07-24 | CP-10 | Channel framework — 8-channel catalogue, connections (assisted mode), integrations page (was a 404), job_postings shell, `db:test:channels` 6/6. Real OAuth deferred to go-live. |
| 2026-07-24 | CP-8 | Candidate profile & pipeline — §UC-6 profile (contact/skills/apps/docs/notes/timeline), candidates list (fills nav), inline stage management (audited), notes with 3 visibility scopes (migration 0014), immutable timeline, CV signed-URL download, field-gated. New `db:test:notes` **9/9**. 28 routes. |
| 2026-07-24 | CP-7 | Applicants — public apply form (`/apply/[id]`, first anon surface), CV upload to Storage, dedup by (org,email), applicant list per opening, manual add, copy-apply-link. Migration 0013 + storage bucket. New `db:test:applicants` **8/8** (app scope inherits opening). Fixed `ANTHROPIC_API_KEY` empty-string env bug that broke all admin-client paths. 26 routes. |
| 2026-07-24 | UI fix | **Real layout bug fixed** (was misdiagnosed as hot-reload): `PageBody` applied the page's `className` to an outer wrapper, not the div directly containing children — so every page's `space-y-*` (list gaps) and the detail page's `grid lg:grid-cols-3` silently no-op'd. Symptoms: dashboard/list cards touching ("overlapping"), detail cards crammed into a 1/3-width left column. One-line fix in [app-shell.tsx](src/components/layout/app-shell.tsx) corrected every page. |
| 2026-07-24 | CP-5 | Admin Portal — **Phase 0 complete.** Permission editor (87-key grid, scopes, risk flags), custom roles (create/clone/rename/delete/restore), per-user overrides with expiry, member role control, audit-log viewer. New `db:test:admin` write-path suite **9/9**. Migration 0012 silences provisioning audit noise (190→1). Fixed replica-mode teardown orphaning bug in dev scripts. 25 routes. |
| 2026-07-24 | Demo + team | 5 role accounts seeded for testing (`db:seed-demo` + `db:seed-team`), all password `Hirelane-Demo-2026`; 2FA cleared. Resend SMTP connected but "Confirm email" on + no verified domain → emails 500; demo seeded via admin API (pre-confirmed). Email logged as go-live GL-1. |
| 2026-07-24 | CP-6 | Job Openings — first recruiting feature + first feature table. Migration 0011 (openings/requirements/questions + RLS + audit), full CRUD (list/detail/create/edit), status lifecycle, salary double-gating. New `db:test:openings` scope suite: **10/10**. 20 routes build. Proves CP-2+CP-4 on real data. |
| 2026-07-24 | CP-4 | Permission engine (app layer): typed keys (87), server guards (`can`/`requirePermission`/`authorize`), scope resolution, field masking, `<Can>`+`usePermissions`, permission-filtered sidebar. Consolidated duplicate perms layer. Added `db:check-keys` parity guard. 16 routes build; 26+17 DB assertions green; keys in sync. |
| 2026-07-24 | Types + auth test | Added FK relationships to hand-written DB types (embedded joins now type; removed the `as never` casts and query splits). New `test-auth-flow.cjs`: **17/17** through the real Supabase stack — provisioning, session context, permission RPCs, isolation, invite→activate→scope. Found the guard-blocks-cascade cleanup issue; added trigger-aware `purge-test-data.cjs`. |
| 2026-07-23 | Environment | Database password rotated to 16-char alphanumeric, kept out of chat. Connection and 26/26 test suite re-verified. **All blockers closed.** |
| 2026-07-23 | Environment | Supabase API keys added and verified: auth health 200, service-role read 200, anon correctly denied (42501). O9 closed. Environment fully operational; only the password rotation remains. |
| 2026-07-23 | **CP-2 proven** | Schema applied to live Supabase Postgres: 10 migrations, 14 tables, 87 permissions, 26 RLS policies. `npm run db:test` → **26/26 pass**. Three execution-only bugs found and fixed: SQL-function ordering, missing table GRANTs, Prisma 7 config move. Prisma introspected; client generated. **O6 closed.** |
| 2026-07-22 | Setup | Prisma 7.9.0 installed; `.env.local` wired with `DATABASE_URL` (pooler 6543) + `DIRECT_URL` (5432), password percent-encoded. **Nothing applied to the database yet** — blocked on B1–B4. |
| 2026-07-22 | CP-3b | Flow rework: activation → dashboard, onboarding demoted to a banner. Team invites rebuilt on Supabase native invite email + `/set-password`. 2FA (TOTP) with enrol, challenge and code-gated disable. 16 routes build clean; runtime-unverified. |
| 2026-07-22 | CP-3 | Auth complete: sign-up with deferred provisioning, email verification, login/logout/reset, 4-step onboarding wizard, invitation landing, session helpers. CP-1 public-route hack removed. 11 routes build; all gates verified at runtime. |
| 2026-07-22 | CP-2 | Schema complete as portable SQL: 9 migrations, ~90 permission keys, 3 presets, RLS on every table, resolution functions, provisioning, isolation test suite, SQL validator. Syntax-verified; not yet executed. |
| 2026-07-22 | CP-1c | Brand palette applied (red/cream/khaki/black), product named **Hirelane**, black sidebar chrome, README rewritten with flow + features for sharing. |
| 2026-07-22 | CP-1b | Visual design pass: light theme default, "Teal & Ember" palette on warm neutrals, brand mark, Avatar/ScoreRing primitives, rebuilt dashboard and landing page. |
| 2026-07-22 | CP-1 | Foundation complete: Next 16 app, design tokens, UI primitives, Supabase clients, permission-aware app shell, landing + dashboard. Lint, typecheck and build all clean; routes smoke-tested. |
