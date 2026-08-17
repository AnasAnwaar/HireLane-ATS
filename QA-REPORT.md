# HireLane — QA & UX Bug Report

Compiled from a 6-agent code-level QA sweep (functional / security / UI-UX) plus `UX-IMPROVEMENTS.md`.
Checkboxes track fixes. Severity: **Critical > High > Medium > Low**.

> Note: this was a **code-level** audit (agents read every flow) — items needing a live browser are tagged in `UX-IMPROVEMENTS.md`.

---

## 🔴 Critical

- [ ] **Billing bypass — `changePlanAction` grants any paid plan with no payment when Stripe is live.** `src/server/billing/actions.ts:35-62` — no `isStripeConfigured()` guard; the UI avoids it but the server action is a public POST. Fix: when Stripe configured, reject upgrades to plans with `monthly_cents>0` (force Checkout).

## 🟠 High

### Security
- [ ] **Open-redirect via backslash bypass** in `next=` validation. `src/server/auth/actions.ts:150-151`, `src/app/auth/callback/route.ts:20-21`, `src/app/(auth)/verified/page.tsx:21` — `/\evil.com` passes `startsWith("/") && !startsWith("//")`. Fix: reject backslashes; validate with `new URL(next, origin)` origin match; centralize.
- [ ] **MFA only enforced by a layout redirect, not server-side.** `src/app/(app)/layout.tsx:19` vs actions — an aal1 (password-only) session can invoke server actions directly. Fix: `requireAal2()` in `requireSession`/gated actions or RLS `aal` check.
- [ ] **Public apply auto-screens regardless of `ai_screening` entitlement + no throttle.** `src/server/applicants/apply-action.ts:165` — unauthenticated cost-amplification. Fix: `requireFeature(orgId,"ai_screening")` before the `after()` screen + rate-limit.
- [ ] **Unauthenticated public apply can overwrite an existing candidate's PII.** `src/server/applicants/apply-action.ts:60-91` — dedup-by-email UPDATEs name/phone/links. Fix: only fill blanks from the public path / verify email.

### Functional
- [ ] **Seat-cap bypass — invited members not counted / not re-checked on activation.** `entitlements.ts:76-101` + `team/actions.ts:226-255`. Fix: count `active+invited` in seat usage, or re-check on `activateOwnMembershipAction`.
- [ ] **Comp/custom plan grant reverted by next Stripe webhook (org keeps being billed).** `platform/org-actions.ts:30-39` vs `stripe/webhook/route.ts:79-107`. Fix: cancel/null the Stripe sub on assign, or skip comp-flagged orgs in webhook.
- [ ] **Reopening an opening bypasses the plan's active-opening cap.** `openings/actions.ts:192-208` — `changeOpeningStatusAction("open")` has no cap check. Fix: `requireOpeningAvailable` on transition to open.
- [ ] **Regenerating a published/scheduled post silently reverts it to draft + stale publish metadata.** `openings/post-actions.ts:193-205`. Fix: don't overwrite status/publish cols on regenerate; block for published/scheduled.
- [ ] **Applicant screening answers collected but never saved; "required" unenforced.** `apply/[openingId]/apply-form.tsx:48,105` + `apply-action.ts:30-126`. Fix: persist `answer_*` to `screening_answers`, validate required server-side.
- [ ] **Finishing one attempt locks candidate out of remaining allowed attempts.** `assessments/delivery.ts:420-423` — `finalizeAttempt` sets assignment `submitted` even on expiry. Fix: keep `assigned/in_progress` when `attempts_used < attempts_allowed`.
- [ ] **Account-menu "Profile" links to a non-existent route (404).** `app-topbar.tsx:86` → `/settings/profile` doesn't exist. Fix: create the page or repoint.

## 🟡 Medium

### Security
- [ ] **`external_url` stored unvalidated, rendered as anchor href (stored self-XSS / open-redirect).** `openings/publish-actions.ts:91` + `posts-client.tsx:378`. Fix: require http(s) URL.
- [ ] **Edit-permission can trigger re-publish to API channels without publish permission / open+connection recheck.** `openings/post-actions.ts:273-291`.
- [ ] **PostgREST filter injection in candidate search.** `candidates/queries.ts:211` — raw input in `.or()`. Fix: sanitize/escape or parameterize.
- [ ] **Onboarding invites don't validate `roleId` belongs to org / allow owner role.** `onboarding/actions.ts:103-145`.
- [ ] **Other panelists' private notes leak into page payload (blind scorecards).** `interviews/[id]/page.tsx:122-132`. Fix: omit `notes` from `others` server-side.
- [ ] **Biometric reference photo never purged (indefinite retention).** `proctoring-actions.ts:178` vs cron `purge-evidence/route.ts`.
- [ ] **Existing user re-invited to a 2nd org can overwrite existing candidate PII** — see apply PII above; also membership resolution issues below.

### Functional
- [ ] **Webhook has no event de-dup / ordering guard** — stale `subscription.updated` after `deleted` re-activates. `stripe/webhook/route.ts:116-167`.
- [ ] **`invoice.payment_failed` sets past_due with no recovery handler.** `stripe/webhook/route.ts:159`.
- [ ] **MRR counts trialing subs as paid revenue.** `platform/page.tsx:61-69`. Fix: use `paidActive`.
- [ ] **`syncPlanStripeAction` creates a new Product every sync (orphans dupes).** `plan-actions.ts:117`.
- [ ] **`assignPlanToOrgAction` doesn't reset `addon_seats` / clear stripe linkage.** `org-actions.ts:30`.
- [ ] **Existing user re-invited to 2nd org dead- ends at /set-password (wrong-membership resolution).** `set-password/page.tsx:27-38`.
- [ ] **Invited user abandoning /set-password gets stuck on /setup error.** `auth/actions.ts:265` + `setup/page.tsx:34`.
- [ ] **Single-membership model: user's oldest org suspended → fully locked out.** `session.ts:54-71`.
- [ ] **`changeOpeningStatusAction` accepts any status, no transition validation.** `openings/actions.ts:192`.
- [ ] **No stage-transition validation on applications (terminal states reversible).** `applicants/actions.ts:105`.
- [ ] **Scheduling doesn't require open opening → scheduled posts never fire.** `openings/publish-actions.ts:256`.
- [ ] **"Publish all" fires scheduled posts immediately.** `publish-actions.ts:206`.
- [ ] **`updatePostAction` reports success when no row updated.** `post-actions.ts:258`.
- [ ] **Interviews schedulable/reschedulable in the past.** `interviews/actions.ts:60,135`.
- [ ] **Reschedule pre-fill timezone drift** (`datetime-local` UTC vs local). `interviews/[id]/page.tsx:283`.
- [ ] **Portal "Withdraw" withdraws from ALL roles despite "this role" copy.** `candidate-self-actions.ts:109`.

### UI/UX (also in UX-IMPROVEMENTS.md)
- [ ] **Sidebar hardcodes "Free plan" for every tenant.** `app-sidebar.tsx:155` (AS-3).
- [ ] **Topbar search + ⌘K + bell are decorative/non-functional.** `app-topbar.tsx:44-62` (AS-2).
- [ ] **"Users & roles" in account menu not permission-gated.** `app-topbar.tsx:95` (AS-7).
- [ ] **Mobile nav drawer: no focus trap / Escape / scroll-lock / close-on-nav.** `app-shell.tsx` (AS-1, AS-4).
- [ ] **No route-level `loading.tsx` skeletons in `(app)`.** (AS-5).
- [ ] **Rejected/withdrawn render green "success" in candidate portal.** `candidate/[token]/page.tsx` (CP-1).
- [ ] **Test-runner options / palette have no focus ring; not a radiogroup.** `test-runner.tsx` (CP-2, CP-3, A11Y-4).
- [ ] **Brand-preview chip hardcodes white text (invisible on light brand).** `company-form.tsx:194`.
- [ ] **Dashboard shows all-zero stats for roles lacking `applicants.view_list` (looks broken).** `dashboard/page.tsx:85`.
- [ ] **`--muted-foreground` and white-on-`--primary` likely fail WCAG AA** (verify + darken tokens). `globals.css:31,45` (A11Y-1/2/3).

## 🟢 Low
- [ ] FK org-ownership not validated (`department_id`, `job_opening_id`). `openings/actions.ts:80,148`, `assessments/actions.ts:83`.
- [ ] Reopening leaves stale `closed_at`. `openings/actions.ts:205`.
- [ ] `createAiTestAction` ignores `test_questions` insert error. `assessments/actions.ts:155`.
- [ ] `resetPasswordAction` allows password change without re-auth / recovery check. `auth/actions.ts:211`.
- [ ] `enrollTotpAction` unenrolls all unverified factors. `mfa.ts:35`.
- [ ] Blind scorecard editable after reveal (anchoring loophole). `interviews/actions.ts:314`.
- [ ] Proctoring audio orphaned when no check-in photo; IP-change high-severity never flags. `proctoring-actions.ts`.
- [ ] Async video answers submittable after interview completed; no size/type validation. `async-actions.ts`.
- [ ] Interview recording uploaded before consent gate. `recording-panel.tsx:56`.
- [ ] Orphan auth-user deletion failures swallowed. `company/danger-actions.ts:80`.
- [ ] Usage `Meter` mishandles zero cap. `billing-plans.tsx:453`.
- [ ] Workspace reactivation is a side-effect write during layout render. `(app)/layout.tsx:57`.
- [ ] Notifications without a candidate are dead clicks. `notification-bell.tsx:39`.
- [ ] Recent-activity list uses array index as key. `dashboard/page.tsx:264`.
- [ ] Headline attempt score misleading before written answers graded. `attempt/[attemptId]/page.tsx:130`.
- [ ] Dashboard header actions not permission-gated. `dashboard/page.tsx:143`.
- [ ] Duplicate `Main` nav landmark. `app-sidebar.tsx:86`.
- [ ] LP: fake 5-star/avatars, inconsistent CTA label, R3F reduced-motion at-mount-only, missing footer links. (LP-1,2,5,8).

---
_Fixes applied are checked off; commits reference this file._
