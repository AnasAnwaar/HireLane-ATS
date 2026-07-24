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
| **P1 — Job Openings & Applicants** | CP-6 … CP-9 | 🔄 **CP-6, CP-7 done** · CP-8–9 remaining |
| **P2 — Distribution (channels + AI posts)** | CP-10 … CP-12 | ⬜ Not started |
| **P3 — AI Screening** | CP-13 … CP-14 | ⬜ Not started |
| **P4 — Assessments** | CP-15 … CP-18 | ⬜ Not started |
| **P5 — Proctoring & Interviews** | CP-19 … CP-22 | ⬜ Not started |
| **P6 — Collaboration & Reporting** | CP-23 … CP-25 | ⬜ Not started |

**Current checkpoint:** ✅ Phase 0 (CP-1–5) + **CP-6 (Openings)** + **CP-7 (Applicants)**
**Environment:** 🟢 Database live · auth/admin proven · openings receive candidates · build clean — **zero blockers**
**Next up:** CP-8 — Applicant list & profile shell (candidate profile, pipeline board, notes). Then CP-9 (candidate portal).

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

### ⬜ CP-8 — Applicant List & Profile Shell
- [ ] Applicant list per opening: sort, filter, bulk select
- [ ] Applicant profile layout with all spec §UC-6 sections stubbed
- [ ] Stage advancement with permission checks
- [ ] Immutable timeline / audit of candidate events

### ⬜ CP-9 — Candidate Portal & Invitations
- [ ] "Connect with applicant" → creates profile, issues signed expiring link
- [ ] Candidate portal: profile completion, document upload, status view
- [ ] Email dispatch with templates
- [ ] Link expiry / reissue flow
- [ ] Withdraw flow

---

## Phase 2 — Distribution
> *Maps to UC-1 and the publishing half of UC-2.*

### ⬜ CP-10 — Channel Integration Framework
- [ ] Schema: `channels`, `channel_connections`, `job_postings`
- [ ] Adapter interface per platform (capabilities, limits, taxonomy)
- [ ] OAuth connect/disconnect/re-authorise, encrypted token vault
- [ ] Assisted mode for API-less boards (copy-to-clipboard + mark posted)
- [ ] Connection health monitoring and expiry banners

### ⬜ CP-11 — AI Post Generation
- [ ] Claude integration for per-channel post variants
- [ ] SEO scoring and improvement hints
- [ ] Side-by-side variant editor with inline edit + regenerate
- [ ] Guardrail: generated content constrained to the canonical requisition

### ⬜ CP-12 — Publishing
- [ ] One-click multi-channel publish with per-channel status
- [ ] Scheduled posting
- [ ] Partial-failure handling and per-channel retry
- [ ] Edit-after-publish and takedown on close
- [ ] Source attribution tracking end-to-end

---

## Phase 3 — AI Screening
> *Maps to UC-4.*

### ⬜ CP-13 — Screening Agent
- [ ] Scoring pipeline against must-haves / nice-to-haves
- [ ] Per-criterion breakdown with cited CV evidence
- [ ] Highlights, concerns, recommendation
- [ ] Protected-attribute exclusion
- [ ] Model version + inputs logged per run

### ⬜ CP-14 — Match Reports & Ranking UI
- [ ] Ranked list with colour-coded bands
- [ ] Match report view, side-by-side with requirements
- [ ] Configurable scoring weights per opening
- [ ] Re-rank on requirement change
- [ ] Human override with recorded reason

---

## Phase 4 — Assessments
> *Maps to UC-5.1 and UC-5.2.*

### ⬜ CP-15 — Test Authoring
- [ ] Schema: `tests`, `questions`, `question_bank`, `test_versions`
- [ ] Manual authoring UI, all 6 question types
- [ ] AI test generation from the job requirements
- [ ] Per-question regenerate, reorder, marks, rubrics
- [ ] Versioning on edit-after-publish

### ⬜ CP-16 — Test Assignment & Delivery
- [ ] Assign to candidates with deadline
- [ ] Candidate test runner: full-screen, timer, auto-save
- [ ] Shuffling, navigation rules, attempt limits
- [ ] Disconnect/resume with grace window
- [ ] Auto-submit on expiry

### ⬜ CP-17 — Scoring
- [ ] Auto-scoring for MCQ / true-false (incl. partial credit)
- [ ] AI-assisted grading of written answers against rubrics
- [ ] Human confirmation step
- [ ] Per-skill breakdown on the profile

### ⬜ CP-18 — Assessment Policy & Accessibility
- [ ] Admin-configurable assessment policy
- [ ] Accommodations: extra time, screen-reader mode
- [ ] Retake grants

---

## Phase 5 — Proctoring & Interviews
> *Maps to UC-5.3 and UC-7.*

### ⬜ CP-19 — Proctoring Capture
- [ ] Consent gate (recorded, non-configurable per spec §9.3)
- [ ] System check: camera, mic, network, browser
- [ ] Browser event capture: tab switch, blur, fullscreen exit, copy/paste, devtools
- [ ] Environment signals: IP change, multi-session, VM indicators
- [ ] Tiered levels: Off / Basic / Standard / Strict

### ⬜ CP-20 — AI Proctoring Analysis
- [ ] Face presence / multiple faces / identity match
- [ ] Audio: additional voices
- [ ] Behavioural anomaly detection
- [ ] Confidence scoring per flag

### ⬜ CP-21 — Integrity Reports
- [ ] Event timeline aligned to questions
- [ ] Evidence storage, watermarking, access control, auto-deletion
- [ ] Overall integrity level + plain-language summary
- [ ] HR decision: accept / invalidate / reject

### ⬜ CP-22 — Video Interviews
- [ ] Scheduling with availability and calendar invites
- [ ] WebRTC room: screen share, chat, private notes, shared code pad
- [ ] Consent-gated recording + transcription
- [ ] Blind scorecards until submitted
- [ ] Reschedule / no-show / async video interview

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
| O2 | **Anthropic API key** — needed from CP-11 onward for AI post generation, screening and test creation. Not blocking until then. *(Your note: handle at go-live.)* | ⏸️ Needed by CP-11 |
| O3 | **Spec §12 Q9** — sign-off on the four non-configurable guardrails (consent, append-only audit, Owner lockout, tenant isolation). | ⏸️ Awaiting decision |
| O4 | **Branding** — brand colours. Currently the "Teal & Ember" palette; every colour is a token in [globals.css](src/app/globals.css), so swapping to your brand is a one-file change. | ⏸️ Optional |
| O5 | ~~**Product name**~~ — **Resolved:** the product is **Hirelane**. | ✅ Decided |

---

## Change Log

| Date | Checkpoint | Summary |
|------|-----------|---------|
| 2026-07-22 | — | Checklist created; stack and cadence agreed |
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
