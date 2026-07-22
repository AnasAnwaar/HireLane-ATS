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
| **P0 — Tenancy, Auth & Admin** | CP-1 … CP-5 | 🔄 CP-1, CP-2, CP-3 done · 2 remaining |
| **P1 — Job Openings & Applicants** | CP-6 … CP-9 | ⬜ Not started |
| **P2 — Distribution (channels + AI posts)** | CP-10 … CP-12 | ⬜ Not started |
| **P3 — AI Screening** | CP-13 … CP-14 | ⬜ Not started |
| **P4 — Assessments** | CP-15 … CP-18 | ⬜ Not started |
| **P5 — Proctoring & Interviews** | CP-19 … CP-22 | ⬜ Not started |
| **P6 — Collaboration & Reporting** | CP-23 … CP-25 | ⬜ Not started |

**Current checkpoint:** ✅ CP-1, CP-2 (**proven on live DB**), CP-3 + CP-3b complete
**Environment:** 🟢 Database live · API keys verified · password rotated · build clean — **zero blockers**
**Next up:** regenerate types → end-to-end test CP-3 → CP-4 (Permission Engine). See **▶️ RESUME HERE** below.

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

Environment is fully working: database live and proven, API keys verified, `dev`/`build`/
`lint`/`typecheck` all clean. Nothing is blocked except the password rotation above.

**Step 1 — regenerate types** *(~2 min, do this first)*
```bash
npx supabase gen types typescript --project-id jertgmxuinzvvqrnhhub > src/types/database.ts
```
Replaces the hand-written [src/types/database.ts](src/types/database.ts). This also fixes the
two places where embedded joins had to be split into separate queries because the hand-written
types declare no relationships — [session.ts](src/server/auth/session.ts) and
[admin/users/page.tsx](src/app/(app)/admin/users/page.tsx).

**Step 2 — first real end-to-end test of CP-3 / CP-3b** *(never yet run against a live stack)*
- [ ] Sign up → confirmation email arrives → activate → lands on `/dashboard`
- [ ] `provision_organization()` fires: workspace, 6 roles, Owner membership, audit entry
- [ ] Setup banner shows; onboarding wizard saves and completes
- [ ] Admin invites a member → invitation email arrives → `/set-password` → `/dashboard`
- [ ] Invited membership flips `invited` → `active`
- [ ] 2FA: enrol with Google Authenticator, sign out, sign in, challenged at `/mfa`
- [ ] 2FA disable requires a current code
- [ ] Confirm Supabase Auth email templates and redirect URLs are configured for the deployed origin

**Step 3 — then CP-4** (permission engine: `<Can>`, scope filters, field masking)

**Useful commands added this session**
| Command | What it does |
|---------|--------------|
| `npm run db:migrate` | Apply `supabase/migrations/*.sql` in order |
| `npm run db:reset` | Drop + recreate `public`, then re-apply everything |
| `npm run db:test` | Tenant isolation suite — 26 assertions |
| `npm run db:query "<sql>"` | Ad-hoc query, printed as a table |
| `npm run db:pull` | Re-introspect into Prisma + regenerate client |
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

### ⬜ CP-4 — Permission Engine (server-side enforcement)
- [ ] Permission resolution: role → per-user override → data scope, most-restrictive-wins
- [ ] Server-side guard for every mutation and query (never UI-only)
- [ ] Scope filters: `All` / `Department` / `Assigned` / `Own`
- [ ] Field-level visibility masking (salary, contact, evidence, recordings, notes)
- [ ] Client-side `usePermission()` hook + `<Can>` component for UI gating
- [ ] Graceful "your access has changed" handling mid-action
- [ ] Permission cache with immediate invalidation on change
- [ ] Unit tests covering the resolution matrix

**Review focus:** enforcement correctness — this is the security boundary.

---

### ⬜ CP-5 — Admin Portal UI
- [ ] Users: invite, list, deactivate, resend invite, transfer ownership
- [ ] Roles: create, clone, rename, delete, reassign-on-delete
- [ ] Permission editor: full catalogue grid with per-permission toggles
- [ ] Data-scope selector per permission
- [ ] Field-level visibility panel
- [ ] Per-user overrides with optional expiry
- [ ] "View as role" preview mode
- [ ] Approval chain configuration
- [ ] Restore-to-default and rollback from change history
- [ ] Audit log viewer with filters and export
- [ ] Warning prompts on high-risk toggles

**Review focus:** is the permission editor actually usable by a non-technical admin?

---

## Phase 1 — Job Openings & Applicants
> *Maps to UC-2 (authoring half) and UC-3.*

### ⬜ CP-6 — Job Openings CRUD
- [ ] Schema: `job_openings`, `job_requirements`, `screening_questions`, `pipeline_stages`
- [ ] Requisition form (all fields from spec UC-2 step 2)
- [ ] Openings list with filters, search, status
- [ ] Opening detail view + edit
- [ ] Configurable pipeline stages per organisation
- [ ] Approval workflow when the org has it enabled
- [ ] Close / reopen an opening

### ⬜ CP-7 — Applicant Ingestion & Parsing
- [ ] Schema: `candidates`, `applications`, `documents`
- [ ] Public application form (per-opening, branded, channel-attributed)
- [ ] CV upload to Supabase Storage
- [ ] Resume parsing → structured fields
- [ ] Duplicate detection and merge across channels
- [ ] Manual add / bulk import

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
