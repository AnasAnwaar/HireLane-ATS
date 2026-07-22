# ATS Portal — Build Checklist & Sprint Tracker

**Spec:** [ATS-Portal-UseCase.md](ATS-Portal-UseCase.md)
**Stack:** Next.js 16 (App Router, React 19, TypeScript) · Tailwind v4 + Radix · Supabase (Postgres / Auth / Storage / RLS)
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

**Current checkpoint:** ✅ CP-3 complete — **stopped for your review**
**Next up (on your go-ahead):** CP-4 — Permission Engine (server-side enforcement)

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
| Migrations executed against a database | ❌ **not done — see caveat** |

**⚠️ Honest caveat on what "verified" means here.** The migrations are **syntax-verified only**.
No Postgres or Docker exists on this machine, and per your instruction nothing was applied to
a live project. Syntax checking cannot catch a wrong column reference, a policy predicate that
does not do what it claims, or an RLS gap. **Treat the schema as unproven until the migrations
are applied and [tenant_isolation_test.sql](supabase/tests/tenant_isolation_test.sql) passes.**
That test exists precisely to be the go-live gate.

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

**Deliberate gaps to close later:**
- **Invitation emails are not sent.** `sendInvitationsAction` creates the invitation row and
  token hash, but there is no email provider wired up. Invitees cannot yet be reached.
- **Invitation acceptance** (creating an account from the link) is deferred to CP-4, where the
  permission engine can assign the invited role safely.
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
| D11 | 2026-07-22 | Dashboard and landing ship with realistic sample data | Empty placeholder tiles make layout problems invisible. Sample data is clearly labelled and replaced from CP-6 |

---

## Open Items for You

| # | Item | Status |
|---|------|--------|
| O1 | ~~**Supabase project**~~ — **Resolved:** SQL-first. Migrations live in `supabase/migrations/` and get applied when going live. | ✅ Decided |
| O6 | **Apply + test the schema before go-live.** The migrations are syntax-verified but never executed. Running them plus `tenant_isolation_test.sql` on any Postgres is the gate that turns "probably correct" into "proven". | ⏸️ Required before launch | use SQLLITE for now we'll change to supabase or mongo when going live
| O2 | **Anthropic API key** — needed from CP-11 onward for AI post generation, screening and test creation. Not blocking until then. | ⏸️ Needed by CP-11 | we'll take care of later when going live
| O3 | **Spec §12 Q9** — sign-off on the four non-configurable guardrails (consent, append-only audit, Owner lockout, tenant isolation). | ⏸️ Awaiting decision |
| O4 | **Branding** — brand colours. Currently the "Teal & Ember" palette; every colour is a token in [globals.css](src/app/globals.css), so swapping to your brand is a one-file change. | ⏸️ Optional |
| O5 | ~~**Product name**~~ — **Resolved:** the product is **Hirelane**. | ✅ Decided |

---

## Change Log

| Date | Checkpoint | Summary |
|------|-----------|---------|
| 2026-07-22 | — | Checklist created; stack and cadence agreed |
| 2026-07-22 | CP-3 | Auth complete: sign-up with deferred provisioning, email verification, login/logout/reset, 4-step onboarding wizard, invitation landing, session helpers. CP-1 public-route hack removed. 11 routes build; all gates verified at runtime. |
| 2026-07-22 | CP-2 | Schema complete as portable SQL: 9 migrations, ~90 permission keys, 3 presets, RLS on every table, resolution functions, provisioning, isolation test suite, SQL validator. Syntax-verified; not yet executed. |
| 2026-07-22 | CP-1c | Brand palette applied (red/cream/khaki/black), product named **Hirelane**, black sidebar chrome, README rewritten with flow + features for sharing. |
| 2026-07-22 | CP-1b | Visual design pass: light theme default, "Teal & Ember" palette on warm neutrals, brand mark, Avatar/ScoreRing primitives, rebuilt dashboard and landing page. |
| 2026-07-22 | CP-1 | Foundation complete: Next 16 app, design tokens, UI primitives, Supabase clients, permission-aware app shell, landing + dashboard. Lint, typecheck and build all clean; routes smoke-tested. |
