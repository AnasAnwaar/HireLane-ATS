# ATS Portal — Product Use Case Document

**Version:** 1.1 — *adds UC-0: Company Admin Portal with fully configurable permissions*
**Date:** 2026-07-22
**Status:** Draft for review

---

## 1. Executive Summary

The ATS (Applicant Tracking System) Portal is an AI-assisted recruitment platform that takes a hiring manager from *"we need a person"* to *"we hired the right person"* without leaving one tool.

It does four things that ordinary ATS products do not:

1. **Publishes once, everywhere** — one job requirement is auto-rewritten into platform-native, SEO-optimised posts for LinkedIn, Indeed, Rozee.pk and others, then posted with a single click.
2. **Ranks applicants automatically** — an AI agent reads every application against the job requirements and produces a ranked shortlist with explained reasoning.
3. **Assesses inside the platform** — AI-generated or manually authored tests (MCQ + written), taken in a proctored browser session with tab-switch and behaviour monitoring, plus built-in video interviews.
4. **Keeps one source of truth per candidate** — every post, test, flag, interview and note lives on the applicant profile so HR, team leads and management review the same record.

Underneath all of it sits an **Admin Portal owned by the person who signs the company up**. Every permission in the platform — who may publish a job, see a salary band, view proctoring footage, reject a candidate, or read the audit log — is a toggle that company configures for itself. The roles and rules described throughout this document are shipped *defaults*, never fixed behaviour.

---

## 2. Goals & Non-Goals

### 2.1 Goals

| # | Goal | Success measure |
|---|------|-----------------|
| G1 | Cut time from job approval to live posting | < 10 minutes, all platforms |
| G2 | Cut manual CV screening effort | ≥ 70% of applications auto-ranked, no manual read |
| G3 | Make assessment integrity credible | Every test session has an integrity report |
| G4 | Single collaborative candidate record | Zero recruitment data in email/spreadsheets |
| G5 | Usable by a non-technical HR user | New user posts a job unaided within 15 minutes |
| G6 | Each company controls its own access rules | 100% of platform capabilities configurable by the Company Admin, no vendor involvement |

### 2.2 Non-Goals (v1)

- Payroll, onboarding, or HRIS functionality after the offer is accepted.
- Native mobile applications (responsive web only).
- Background verification / reference-check automation.
- Contract generation and e-signature.

---

## 3. Personas

| Persona | Role | Primary needs |
|---------|------|---------------|
| **Hiring HR / Recruiter** | Owns the requisition | Post fast, screen fast, schedule fast |
| **Team Lead / Technical Interviewer** | Evaluates skill | Read shortlist, author/review tests, interview, leave verdict |
| **Management / Approver** | Signs off | Pipeline visibility, audit trail, hiring decision review |
| **Applicant** | External candidate | Apply with minimum friction, take test, join interview |
| **Company Admin (Owner)** | The person who signs up the company on the platform | Configure the whole workspace: users, roles, **every permission**, integrations, workflow, branding, billing |

> **Note on the Company Admin.** The Company Admin is the account created at company sign-up. They are the tenant owner and the **single authority over the permission model** — no permission in this document is hard-coded by the vendor. Everything described as "HR can…" or "Team Lead can…" is a *default* that the Company Admin may reassign, restrict or extend. See **UC-0**.

---

## 4. Core Use Cases

---

### UC-0 — Company Sign-Up & Admin Portal (Permission Configuration)

**Actor:** Company Admin (Owner)
**Goal:** Stand up the company workspace and configure who can do what — with full, granular control over every permission in the system.

#### Description
When a company signs up, the signing-up user becomes the **Company Admin (Owner)** of an isolated workspace (tenant). The Admin Portal is where that person defines the organisation's structure, invites users, and — critically — **configures every permission in the platform**. The platform ships with sensible role defaults so a company can start working immediately, but *no permission is fixed*: the Admin can rename roles, create new ones, and toggle every individual capability on or off per role, per user, or scoped to specific departments or job openings.

#### Main Flow — Sign-Up & Setup
1. A user signs up with company name, work email and password; email is verified.
2. The system creates an isolated **company workspace** and assigns the signing-up user the **Company Admin (Owner)** role, which holds all permissions and cannot be locked out of permission management.
3. A guided setup wizard walks the Admin through:
   - Company profile — name, logo, industry, locations, time zone, currency
   - Departments / teams and their heads
   - Invite users by email with a starting role
   - Choose a **permission preset**: `Standard` (recommended defaults), `Strict` (least-privilege), or `Custom` (start from a blank role set)
   - Connect job platforms (UC-1)
   - Configure pipeline stages, notification templates, and branding for the candidate portal
4. Setup can be skipped and resumed later; the Admin Portal remains the permanent control panel.

#### Main Flow — Configuring Permissions
1. Admin opens **Admin Portal → Roles & Permissions**.
2. Admin sees the role list (defaults: Company Admin, HR Manager, Recruiter, Team Lead, Interviewer, Management/Executive, Read-Only Auditor) and may **create**, **clone**, **rename** or **delete** any role except Company Admin.
3. Admin selects a role and sees the full **permission catalogue**, grouped by module (§9.1). Each permission is an independent toggle: `Allowed` / `Denied`.
4. For permissions that support it, Admin sets a **data scope** instead of a plain on/off:
   - `All` — every record in the company
   - `Department` — only their department's openings
   - `Assigned` — only openings/candidates they are assigned to
   - `Own` — only records they created
5. Admin sets **field-level visibility** for sensitive data per role: salary range, candidate contact details, proctoring evidence media, interview recordings, private notes, diversity data, audit log.
6. Admin defines **approval requirements** per action — e.g. "publishing a job requires HR Manager approval", "rejecting a candidate requires two approvers", "an interview scorecard is final once submitted". Any action can be made approval-gated or free.
7. Admin saves. Changes take effect immediately for all affected users; a diff of what changed is written to the audit log.
8. Admin can **preview as a role** ("View as Recruiter") to confirm exactly what that role sees before rolling changes out.

#### Per-User Overrides
- Admin may grant or revoke an individual permission for a **single user** without changing their role (e.g. one recruiter is allowed to see salary data).
- Overrides are visually marked on the user's record and expire on an optional date.
- A user's effective permission = role permission, then per-user override, then scope restriction — with the most restrictive scope winning.

#### Delegation
- Admin may grant the **"Manage roles & permissions"** capability to another user (e.g. an HR Director), making them a co-administrator.
- Admin may restrict a delegate so they can only manage roles *below* their own level, preventing privilege escalation.
- The original Owner can always reclaim full control and cannot be demoted by a delegate.

#### Other Admin Portal Capabilities
| Area | Admin controls |
|------|----------------|
| **Users** | Invite, deactivate, reset MFA, force logout, transfer ownership, bulk import |
| **Roles & permissions** | Full permission catalogue, custom roles, scopes, field-level visibility, per-user overrides |
| **Workflow** | Pipeline stages, approval chains, mandatory fields, SLA timers, auto-reject rules (opt-in) |
| **Assessments policy** | Which roles may author/assign tests; default proctoring level; whether proctoring can be disabled |
| **AI policy** | Which AI features are enabled (post generation, screening, test generation, grading assistance, proctoring); scoring weights; mandatory human-review toggles |
| **Integrations** | Connect/disconnect job boards, calendar, email, HRIS, SSO/SAML |
| **Data & privacy** | Retention periods per data type, consent text, export/erasure request handling, region of data residency |
| **Branding** | Logo, colours, careers page and candidate-portal theming, email templates |
| **Security** | Password policy, MFA enforcement, session timeout, IP allow-list, SSO enforcement |
| **Audit** | Full activity log with filters and export, including every permission change |
| **Billing** | Plan, seats, usage, invoices |

#### Alternate Flows
- **A1 — Admin locks themselves out:** prevented by design. The Owner role's "Manage roles & permissions" toggle cannot be turned off, and at least one active Owner must always exist.
- **A2 — Role deleted while assigned:** Admin must reassign affected users to another role before deletion completes.
- **A3 — Ownership transfer:** the Owner nominates another user; the transfer requires email confirmation from both parties and is logged.
- **A4 — Permission change mid-action:** a user who loses a permission while working sees the action fail with a clear "your access has changed" message rather than a generic error.
- **A5 — Restore defaults:** Admin can reset any role to its shipped default, or roll back to a previous permission snapshot from the audit log.

#### Rules
- R1: **No permission in this platform is hard-coded.** Every capability described anywhere in this document is a configurable toggle in the Admin Portal.
- R2: The Company Admin (Owner) permission set is immutable and always retains permission-management rights; at least one Owner must exist at all times.
- R3: Permission checks are enforced server-side on every request — hiding UI is never the security boundary.
- R4: Every permission change records who changed what, from what to what, and when. Permission history is immutable.
- R5: Workspaces are fully isolated; no data or configuration is ever visible across companies.
- R6: Two safety rails are exempt from configuration and cannot be turned off, because they exist for legal and fairness reasons rather than convenience: **(a)** monitoring/recording always requires recorded applicant consent, and **(b)** the audit timeline is always append-only. *(Flagged in §12 for sign-off.)*

#### Acceptance Criteria
- ✅ Signing up creates an isolated workspace with the signing-up user as Owner.
- ✅ The Admin Portal exposes every permission in the system as an individual toggle.
- ✅ Admin can create custom roles, set data scopes, control field-level visibility and apply per-user overrides.
- ✅ Admin can make any action approval-gated.
- ✅ "View as role" accurately previews a role's access.
- ✅ Permission changes apply immediately, are enforced server-side, and are fully audited and reversible.
- ✅ The Owner cannot be locked out of permission management.

---

### UC-1 — Connect Social & Job Platforms

**Actor:** HR / Admin
**Goal:** Authorise the portal to publish jobs and pull applicants from external job boards.

#### Description
The organisation connects its accounts on LinkedIn, Indeed, Rozee.pk, Glassdoor, Bayt, Facebook Jobs, X and its own careers page. Each connection is a reusable "channel" that any job opening can publish to.

#### Main Flow
1. HR opens **Settings → Integrations**.
2. Screen shows a card per platform: logo, status (`Connected` / `Not connected` / `Expired`), connected account name, last sync time.
3. HR clicks **Connect** on a platform.
4. System redirects to the platform's OAuth consent screen.
5. HR authorises; platform returns an access token.
6. System stores tokens encrypted, records granted scopes, and shows `Connected`.
7. System runs a capability probe and records what the channel supports (post length limits, media types, tag/skill taxonomy, application-pull availability).

#### Alternate Flows
- **A1 — Platform has no public API** (some regional boards): the channel is registered as *assisted mode*. The portal generates the optimised post and provides copy-to-clipboard + a deep link; HR pastes it manually and marks it posted.
- **A2 — Token expiry:** channel status flips to `Expired`, publishing to it is blocked, and HR sees a re-authorise banner on any affected job.
- **A3 — Multiple accounts per platform** (e.g. two LinkedIn company pages): each is a separate channel with its own label.

#### Rules
- R1: Tokens are stored encrypted at rest; never displayed in the UI or logs.
- R2: Channel connect/disconnect is permission-gated; by default only Owner and HR Manager hold it, and the Company Admin may grant it to any role (UC-0).
- R3: Disconnecting a channel does not delete already-published posts; it marks them unmanaged.

#### Acceptance Criteria
- ✅ HR can connect, view and disconnect each supported platform.
- ✅ Expired channels are visibly flagged everywhere they are used.
- ✅ Assisted-mode channels are usable end-to-end without an API.

---

### UC-2 — Create a Job Opening & Auto-Generate Platform-Optimised Posts

**Actor:** HR (author), AI Content Agent (system)
**Goal:** Turn one job requirement into several platform-native, SEO-optimised posts and publish them.

#### Description
HR writes the job **once** — title, description, requirements, experience, salary band, location, work mode. The AI Content Agent then produces a **separate variant per connected channel**, each tuned to that platform's format, length, tone and current keyword trends. HR reviews, edits inline, and publishes.

#### Main Flow
1. HR clicks **New Job Opening**.
2. HR fills the requisition form:
   - Job title, department, hiring manager, number of positions
   - Employment type, work mode (on-site / hybrid / remote), location
   - Experience range, salary range (and whether to publish it)
   - Job description
   - Requirements: must-have skills, nice-to-have skills, qualifications, certifications
   - Screening questions (optional)
   - Application deadline
3. HR selects target channels from connected platforms.
4. HR clicks **Generate Posts**.
5. AI Content Agent produces one draft per channel, each including:
   - Platform-appropriate headline / title
   - Body formatted to that platform's conventions and length limit
   - SEO keyword set derived from current demand signals for the role and region
   - Hashtags / skill tags mapped to the platform's own taxonomy
   - Suggested media (banner image / video slot) where the platform supports it
   - Call-to-action and apply link (portal-hosted, channel-tagged for attribution)
6. HR reviews each variant in a side-by-side tabbed editor with an **SEO score** and improvement hints (missing keyword, title too long, weak CTA, etc.).
7. HR edits any variant inline or clicks **Regenerate** with a tone/angle instruction.
8. HR clicks **Post Opening** — publishes to all selected channels, or **Schedule** for a future time.
9. System records per-channel status, external post ID and live URL.

#### Alternate Flows
- **A1 — Partial failure:** if 3 of 5 channels succeed, the job goes live with 2 marked `Failed`; HR sees the error and can retry per channel.
- **A2 — Draft & approve:** if approval workflow is enabled, the job sits in `Pending Approval` until the approver signs off; only then can it be posted.
- **A3 — Edit after publish:** editing a live post re-publishes an update where the platform API allows it, otherwise flags it as "update manually".
- **A4 — Close early:** HR closes the opening; the portal attempts to take down or mark closed on every channel.

#### Rules
- R1: Every variant derives from a single canonical requisition — editing a variant never changes the canonical record.
- R2: Salary is published only if HR explicitly opts in.
- R3: Every apply link carries a channel-attribution parameter so source-of-hire is measurable.
- R4: AI never invents requirements not present in the requisition; generated content is limited to rephrasing, formatting and keyword optimisation.

#### Acceptance Criteria
- ✅ One requisition produces N channel-specific drafts within 30 seconds.
- ✅ Each draft respects the channel's length and formatting limits.
- ✅ HR can edit, regenerate, schedule and publish, and see per-channel status.
- ✅ Applicant source per channel is reportable.

---

### UC-3 — Applicant Collection & Per-Platform Profile Creation

**Actor:** System (ingestion), HR (decision), Applicant
**Goal:** Gather all applicants for an opening into one list and create a working profile when HR decides to engage.

#### Description
Applications arrive from every channel — API pull, portal apply form, or email forward. They appear in a unified applicant list under the job opening. A **lightweight record** exists for everyone; a **full applicant profile** is created the moment HR decides to connect with the candidate. At that point the applicant receives an invitation link giving them a candidate portal for tests and interviews.

#### Main Flow
1. Applications land under **Job Opening → Applicants**, each showing name, source channel, applied date, parsed summary, AI relevance score, status.
2. Resume parsing extracts contact info, experience, education, skills, certifications and links (GitHub, portfolio, LinkedIn).
3. Duplicate detection merges the same person applying via multiple channels into one record, preserving all sources.
4. HR reviews a candidate and clicks **Connect with Applicant**.
5. System creates the full **Applicant Profile** (see UC-6), linked to that opening.
6. System generates a unique, expiring **invitation link** and sends it by email (and optionally SMS/WhatsApp).
7. Applicant opens the link and lands in the **Candidate Portal**, where they can:
   - Confirm/complete their profile and upload documents
   - Take an assigned test (UC-5)
   - View and confirm scheduled interviews, and join the video call
   - See their current stage in the process
8. Every applicant action updates the profile timeline in real time.

#### Alternate Flows
- **A1 — Manual add:** HR uploads a CV or pastes a profile directly; parsing and scoring run the same way.
- **A2 — Bulk connect:** HR selects several applicants and invites them all at once.
- **A3 — Link expiry:** an expired or already-used link shows a "request new link" page; HR is notified.
- **A4 — Applicant withdraws:** applicant marks themselves unavailable; record moves to `Withdrawn` with reason.
- **A5 — Reapply to another opening:** the person's identity is reused; a new application record is created per opening.

#### Rules
- R1: One person = one identity across openings; one application = one opening.
- R2: Invitation links are single-purpose, signed and time-limited; the applicant sees only their own data.
- R3: Applicants are never exposed to internal scores, notes or flags.
- R4: Personal data handling follows the retention policy in §8.

#### Acceptance Criteria
- ✅ Applicants from all channels appear in one deduplicated list per opening.
- ✅ "Connect" creates the profile and dispatches the invitation in one action.
- ✅ Applicant can complete profile, take a test and join an interview from the link alone.

---

### UC-4 — AI Screening Agent: Rank & Highlight

**Actor:** AI Screening Agent (system), HR (consumer)
**Goal:** Read every application in an opening, rank by relevance to the requirements, and explain why.

#### Description
The agent evaluates each application against the requisition's must-haves and nice-to-haves, produces a score with a transparent breakdown, and surfaces highlights and concerns so HR reads *evidence*, not raw CVs.

#### Main Flow
1. Agent triggers automatically on each new application, and on demand via **Re-rank All**.
2. For each application it evaluates:
   - **Must-have coverage** — each required skill matched / partially matched / missing
   - **Nice-to-have coverage**
   - **Experience fit** — years and relevance of domain
   - **Qualification fit** — degree, certifications
   - **Stability & trajectory** — tenure pattern, seniority progression
   - **Logistics fit** — location, work mode, notice period, salary expectation vs band
   - **Screening question answers**
3. Agent outputs per applicant:
   - **Relevance score** (0–100) with a per-criterion breakdown
   - **Highlights** — 3–5 concrete strengths, each citing the CV line it came from
   - **Concerns** — gaps, contradictions, unexplained employment gaps
   - **Recommendation** — `Strong fit` / `Possible fit` / `Weak fit`
4. The applicant list sorts by score by default, with a colour-coded band per applicant.
5. HR filters by score range, must-have coverage, source, location or availability.
6. HR opens the **Match Report** to see the breakdown side-by-side with the requirements.
7. HR may override the recommendation; overrides are recorded with the reviewer's name and reason.

#### Alternate Flows
- **A1 — Requirements changed:** editing the requisition prompts a re-rank of all existing applicants.
- **A2 — Unparseable CV:** flagged `Needs manual review` rather than scored low.
- **A3 — Preference weighting:** HR adjusts weights per opening (e.g. skills 50% / experience 30% / qualification 20%) and re-ranks.

#### Rules
- R1: Every score must be explainable — a score with no cited evidence is not shown.
- R2: The agent recommends; by default it never auto-rejects and rejection is a human action. A Company Admin may opt in to hard auto-reject rules (e.g. "missing a mandatory licence"), which are logged and reversible; the AI *score* alone can never trigger auto-rejection.
- R3: Protected attributes (gender, age, nationality, marital status, photo) are excluded from scoring inputs.
- R4: Scoring runs and their model version are logged for auditability.

#### Acceptance Criteria
- ✅ Every application receives a score and explanation within 2 minutes of arrival.
- ✅ HR can see exactly which requirement drove each part of the score.
- ✅ Re-ranking after a requirement change updates all applicants.
- ✅ No applicant is auto-rejected by the system.

---

### UC-5 — Assessments: AI or Manual Test Creation, Proctored Delivery

**Actor:** HR / Team Lead (author), Applicant (taker), AI Proctoring Agent (monitor)
**Goal:** Assess candidates fairly inside the platform with credible integrity signals.

---

#### UC-5.1 — Create a Test

##### Main Flow
1. From a job opening, HR clicks **Create Test**.
2. HR chooses the authoring mode:
   - **Generate with AI** — the agent reads the job description and requirements and proposes a test.
   - **Manual** — HR writes questions directly.
   - **From template / question bank** — reuse a saved test or pull vetted questions.
3. For AI generation HR specifies: skills to cover, question count, difficulty mix, question types, time limit.
4. AI produces a draft test with, per question: text, type, options, correct answer, marks, model answer / rubric for written questions, and the skill it maps to.
5. HR reviews and edits: change wording, replace a question, regenerate one question, reorder, adjust marks, add their own.
6. HR sets delivery settings:
   - Total duration and per-question timer (optional)
   - Question and option shuffling
   - Passing threshold
   - Navigation: back-navigation allowed or one-way
   - Proctoring level (see UC-5.3)
   - Attempts allowed, validity window
7. HR saves as **Draft**, then **Publish** to make it assignable. Publishing to a question bank makes it reusable across openings.

##### Question Types
| Type | Scoring |
|------|---------|
| Single-choice MCQ | Auto |
| Multiple-choice MCQ | Auto (full/partial credit) |
| True / False | Auto |
| Short answer | AI-assisted against rubric, HR confirms |
| Long answer / essay | AI-assisted against rubric, HR confirms |
| Scenario / case question | AI-assisted, HR confirms |

##### Rules
- R1: AI-generated questions are always human-reviewable before publish; nothing goes live unreviewed.
- R2: Correct answers and rubrics are never sent to the applicant's browser.
- R3: Editing a published test creates a new version; in-flight attempts keep the version they started.

---

#### UC-5.2 — Assign & Take a Test

##### Main Flow
1. HR selects one or more applicants and clicks **Assign Test**, choosing the test and a completion deadline.
2. Applicant is notified and sees the test in their Candidate Portal with duration, question count, rules and proctoring notice.
3. Applicant gives **explicit consent** to monitoring (required to proceed), then runs a system check: camera, microphone, network, browser.
4. Applicant starts. The test runs in a restricted, full-screen window with a visible timer.
5. Answers auto-save continuously so a disconnect does not lose work.
6. Applicant submits, or the test auto-submits when time expires.
7. Auto-scored sections are graded instantly; written answers get an AI-suggested score and rationale for HR confirmation.
8. Results, per-skill breakdown and the integrity report are attached to the applicant profile.

##### Alternate Flows
- **A1 — Disconnection:** timer keeps running; on reconnect within the grace window the applicant resumes at the same question. The interruption is logged.
- **A2 — Deadline missed:** status becomes `Not attempted`; HR can extend or reassign.
- **A3 — Retake:** allowed only if HR grants an extra attempt; each attempt is stored separately.
- **A4 — Accessibility:** applicants may request extra time / screen-reader mode; HR grants it per assignment.

---

#### UC-5.3 — AI Proctoring & Integrity Monitoring

##### Monitored Signals
| Category | Signal |
|----------|--------|
| **Browser** | Tab switch, window blur, exiting full-screen, copy / paste / right-click, dev-tools open, second display connected |
| **Video (if enabled)** | No face detected, multiple faces, face not matching the check-in photo, prolonged look-away |
| **Audio (if enabled)** | Another voice detected, sustained background speech |
| **Behavioural** | Answer speed far outside the norm, long idle followed by a burst of answers, answer patterns suggesting external assistance |
| **Environment** | IP change mid-test, multiple sessions for the same attempt, VM / remote-desktop indicators |

##### Main Flow
1. Proctoring level is set by HR: **Off** / **Basic** (browser events only) / **Standard** (browser + camera) / **Strict** (browser + camera + audio + identity check).
2. On start, the applicant completes ID capture where the level requires it.
3. During the test the agent records events with a timestamp, severity and evidence (screenshot or clip, where consented).
4. On breach the applicant sees an in-test warning: *"Tab switch detected — this has been recorded."*
5. Repeated breaches escalate: warning → warning → flag for review → auto-submit (only if HR enabled that rule).
6. On submission the agent produces an **Integrity Report**:
   - Overall integrity level: `Clean` / `Minor concerns` / `Significant concerns`
   - Chronological event timeline aligned to the question being answered
   - Counts per event category with evidence links
   - A plain-language summary
7. The report is attached to the profile and flagged in the applicant list.
8. HR reviews the evidence and records a decision: `Accept result` / `Invalidate & retest` / `Reject`.

##### Rules
- R1: No monitoring without explicit, recorded applicant consent; consent text names every signal collected.
- R2: The system flags — it never auto-rejects a candidate on integrity grounds. A human decides.
- R3: Evidence media is access-controlled, watermarked, and deleted per the retention policy.
- R4: Detection is probabilistic; every flag shows a confidence level and the raw evidence.

##### Acceptance Criteria
- ✅ Tests can be created by AI or manually and are always human-reviewed before publish.
- ✅ MCQs auto-score; written answers get AI-suggested scores confirmed by a human.
- ✅ Every attempt produces an integrity report with a reviewable timeline.
- ✅ No candidate is auto-rejected by the proctoring agent.

---

### UC-6 — Applicant Profile: Unified Progress, Notes & Collaboration

**Actor:** HR, Team Lead, Management
**Goal:** Give every stakeholder one complete, auditable view of a candidate.

#### Description
The applicant profile is the system's centre of gravity — everything about the candidate for a given opening lives here: parsed CV, AI match report, test results and integrity flags, interview records, notes, ratings and full history.

#### Profile Layout

| Section | Contents |
|---------|----------|
| **Header** | Name, photo, title, current stage, relevance score, integrity flag, source channel, quick actions (advance / reject / schedule / assign test / message) |
| **Overview** | Contact details, location, notice period, expected salary, links, documents |
| **Match Report** | AI score breakdown, highlights, concerns, requirement-by-requirement coverage |
| **Assessments** | Every test attempt: score, per-skill breakdown, answer review, integrity report |
| **Interviews** | Scheduled and completed rounds, panel members, recordings/transcripts, per-interviewer scorecards |
| **Notes & Discussion** | Threaded notes with @mentions, visibility scope, attachments |
| **Ratings** | Structured scorecards per competency from each evaluator, plus an aggregate |
| **Timeline / Audit** | Immutable chronological log of every event and who caused it |
| **Documents** | CV versions, portfolio, certificates, ID (where collected) |

#### Pipeline Stages
`Applied → Screened → Shortlisted → Test Assigned → Test Completed → Interview Scheduled → Interviewed → Offer → Hired`
with `Rejected`, `On Hold` and `Withdrawn` available from any stage. Stages are configurable per organisation.

#### Main Flow
1. HR opens a profile from the applicant list.
2. HR reviews match report, test results and integrity flags in one scroll.
3. HR adds a note; visibility is chosen: **Private** (author only) / **Team** (hiring team) / **Management** (leads + management).
4. HR @mentions a team lead — the lead is notified and can reply in-thread.
5. Team lead completes a scorecard: rating per competency plus a written verdict.
6. HR advances the stage; the timeline records the change, the actor and the timestamp.
7. Management opens the profile and sees the full evidence chain behind the decision.

#### Alternate Flows
- **A1 — Rejection:** HR selects a reason, optionally sends a templated rejection email; the record is retained for reporting.
- **A2 — Move to another opening:** the candidate is transferred to a different requisition, carrying their profile and history.
- **A3 — Talent pool:** rejected-but-good candidates are tagged and resurfaced for future matching openings.
- **A4 — Conflict of interest:** an evaluator declares a conflict and is excluded from that candidate's evaluations.

#### Rules
- R1: The timeline is append-only. Nothing in it can be edited or deleted.
- R2: Notes can be edited by their author within a short window; edits keep a revision history.
- R3: Who sees notes, salary data, integrity evidence and documents is governed entirely by the permission and field-visibility settings the Company Admin configures in UC-0.
- R4: Every profile view and export is logged.

#### Acceptance Criteria
- ✅ All candidate activity is visible in one profile with no external tools required.
- ✅ Notes support visibility scopes, threading and @mentions.
- ✅ The timeline is complete, ordered and immutable.
- ✅ Management can reconstruct why any decision was made.

---

### UC-7 — Video Interviews

**Actor:** HR, Interview Panel, Applicant
**Goal:** Schedule and run interviews inside the platform, with the record attached to the profile.

#### Main Flow
1. HR clicks **Schedule Interview** on a profile.
2. HR sets round name, panel members, duration and proposed slots (calendar availability shown where calendars are connected).
3. Applicant receives the invite via their candidate portal and email, and confirms a slot.
4. Calendar invites go to everyone; reminders are sent ahead of the call.
5. At the scheduled time both sides join the built-in video room — no install, browser only.
6. In-call tools: screen share, chat, live private interviewer notes, a shared code/whiteboard pad for technical rounds, and optional recording + transcription (with consent).
7. After the call each interviewer completes their scorecard.
8. Recording, transcript, notes and scorecards attach to the profile automatically.

#### Alternate Flows
- **A1 — Reschedule / cancel:** either side requests a change; all parties are notified and the timeline records it.
- **A2 — No-show:** marked as such after a grace period; HR chooses to reschedule or reject.
- **A3 — Poor connectivity:** the call falls back to audio-only; the incident is logged.
- **A4 — Async video interview:** applicant records answers to preset questions on their own time; the panel reviews later.

#### Rules
- R1: Recording requires explicit consent from every participant and a visible recording indicator.
- R2: Interview links are unique per participant per session.
- R3: By default interviewers cannot see each other's scorecards until they submit their own (reduces anchoring). The Company Admin may disable blind scoring or grant "view others' scorecards" to specific roles.

#### Acceptance Criteria
- ✅ Interviews are scheduled, joined and recorded without any external meeting tool.
- ✅ All artefacts attach to the profile automatically.
- ✅ Scorecards are blind until submitted.

---

### UC-8 — Dashboards & Reporting

**Actor:** HR, Management

#### Reports
- **Pipeline funnel** per opening — count and conversion rate at each stage
- **Time metrics** — time-to-fill, time-to-hire, time-in-stage bottlenecks
- **Source effectiveness** — applicants, shortlist rate and hire rate per channel; cost per hire
- **Post performance** — views, clicks and applies per platform post
- **Assessment analytics** — score distribution, per-question difficulty and discrimination, flag rate
- **Team activity** — reviews, interviews and scorecards per evaluator, plus response-time SLA
- **Diversity reporting** — aggregate-only, where the jurisdiction permits collection

#### Acceptance Criteria
- ✅ Every report is filterable by date range, department, opening and channel.
- ✅ All reports export to CSV/PDF.
- ✅ Management sees a single cross-opening pipeline view.

---

## 5. End-to-End Walkthrough

> **Scenario:** Acme Tech needs a Senior React Developer in Lahore.

| Step | Actor | Action | Result |
|------|-------|--------|--------|
| 0 | Company Admin | Signs Acme Tech up, invites 6 users, picks the `Standard` preset, then grants the Team Lead permission to view salary bands | Workspace configured to Acme's rules |
| 1 | Company Admin | Connects LinkedIn, Indeed, Rozee.pk | 3 live channels |
| 2 | HR | Creates requisition with 8 must-have skills | Canonical job record |
| 3 | AI | Generates 3 platform-optimised posts | Drafts with SEO scores |
| 4 | HR | Tweaks the LinkedIn headline, clicks **Post Opening** | Live on 3 platforms in ~1 min |
| 5 | System | Ingests 140 applications over 10 days | Unified, deduplicated list |
| 6 | AI | Scores and ranks all 140 | 18 `Strong fit`, each explained |
| 7 | HR | Reviews the top 18, connects with 12 | 12 profiles + invitation links sent |
| 8 | HR | Generates a React + JS test with AI, edits 3 questions, publishes | 25-question test, Standard proctoring |
| 9 | Applicants | 11 of 12 take the test | Auto-scored; 2 flagged for tab switching |
| 10 | HR | Reviews both integrity reports — invalidates 1, accepts 1 | Decisions logged on profiles |
| 11 | HR | Schedules video interviews with the top 6 | Calendar invites sent |
| 12 | Team Lead | Interviews, completes scorecards | Recordings + verdicts on profiles |
| 13 | Management | Reviews the top 2 profiles end-to-end | Full evidence chain, one screen |
| 14 | HR | Marks the hire, closes the opening | Posts taken down; funnel report generated |

---

## 6. Functional Requirements Summary

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-00a | Company sign-up creating an isolated workspace with the signing-up user as Owner | Must |
| FR-00b | Admin Portal exposing **every** platform permission as an individually configurable toggle | Must |
| FR-00c | Custom roles: create, clone, rename, delete; permission presets and restore-to-default | Must |
| FR-00d | Data scoping per permission (All / Department / Assigned / Own) | Must |
| FR-00e | Field-level visibility control for sensitive data (salary, contact, evidence, recordings, notes) | Must |
| FR-00f | Per-user permission overrides with optional expiry | Should |
| FR-00g | Configurable approval chains on any gated action | Should |
| FR-00h | "View as role" permission preview | Should |
| FR-00i | Permission-change audit trail with rollback to a prior snapshot | Must |
| FR-00j | Delegated administration with anti-privilege-escalation limits | Should |
| FR-01 | OAuth-based multi-platform job-board integration | Must |
| FR-02 | Assisted (manual) publishing mode for API-less boards | Must |
| FR-03 | Single requisition → N platform-optimised AI post variants | Must |
| FR-04 | Inline post editing, regeneration, SEO scoring, scheduling | Must |
| FR-05 | One-click multi-channel publish with per-channel status | Must |
| FR-06 | Multi-source application ingestion + resume parsing | Must |
| FR-07 | Cross-channel duplicate detection and merge | Must |
| FR-08 | AI relevance scoring with per-criterion explanation | Must |
| FR-09 | Configurable scoring weights and re-ranking | Should |
| FR-10 | Applicant profile creation + expiring invitation links | Must |
| FR-11 | Candidate portal (profile, test, interview, status) | Must |
| FR-12 | AI and manual test authoring, MCQ + written | Must |
| FR-13 | Reusable question bank and test templates | Should |
| FR-14 | Auto-scoring + AI-assisted written grading with rubrics | Must |
| FR-15 | Tiered AI proctoring (browser / video / audio / identity) | Must |
| FR-16 | Integrity report with evidence timeline | Must |
| FR-17 | Built-in video interviews with recording + transcription | Must |
| FR-18 | Blind interviewer scorecards | Should |
| FR-19 | Unified profile with notes, visibility scopes, @mentions | Must |
| FR-20 | Immutable audit timeline | Must |
| FR-21 | Configurable pipeline stages | Should |
| FR-22 | Server-side enforcement of the configured permission model on every request | Must |
| FR-23 | Dashboards, funnel and source-of-hire reporting | Must |
| FR-24 | Talent pool and cross-opening candidate reuse | Could |
| FR-25 | Email/SMS/WhatsApp notifications with templates | Should |

---

## 7. Non-Functional Requirements

| Area | Requirement |
|------|-------------|
| **Usability** | Any core action reachable in ≤ 3 clicks; new HR user posts a job unaided within 15 minutes; guided empty states throughout |
| **Performance** | Page loads < 2s; AI post generation < 30s; applicant scoring < 2 min from arrival |
| **Scalability** | 10,000 applicants per opening; 500 concurrent proctored test sessions |
| **Availability** | 99.5% uptime; test sessions survive brief network loss without data loss |
| **Security** | Encryption in transit and at rest; encrypted OAuth token vault; permissions enforced server-side on every request (never UI-only); tenant isolation verified by automated tests; full audit logging; regular penetration testing |
| **Multi-tenancy** | Each company is a fully isolated workspace with its own users, roles, permission configuration, data and integrations; no cross-tenant read path exists |
| **Configurability** | A permission change takes effect for all affected users within seconds, without re-login or redeploy |
| **Privacy** | Explicit consent for monitoring and recording; configurable retention; candidate data export and deletion on request |
| **Accessibility** | WCAG 2.1 AA; keyboard navigation; screen-reader support; accommodations in tests |
| **Localisation** | English + Urdu at launch; per-region date, currency and salary formats; RTL-ready |
| **Compatibility** | Latest 2 versions of Chrome, Edge, Firefox, Safari; responsive down to tablet; mobile-friendly candidate portal |
| **Auditability** | Every AI decision records its model version, inputs and rationale |

---

## 8. Data Retention & Compliance

| Data | Default retention | Notes |
|------|-------------------|-------|
| Applicant profile & CV | 24 months after last activity | Configurable; candidate may request earlier deletion |
| Test answers & scores | 24 months | Kept for dispute resolution |
| Proctoring evidence (images/clips) | 90 days | Shortest useful window; deleted automatically |
| Interview recordings | 12 months | Consent-gated; deletable on request |
| Notes & scorecards | Life of the requisition + 24 months | Part of the decision record |
| Audit timeline | 7 years | Immutable |

**Compliance principles**
1. Consent before any monitoring or recording — always explicit, always logged.
2. Purpose limitation — recruitment data is not reused for anything else.
3. Human-in-the-loop — AI ranks, scores and flags; humans reject, hire and invalidate.
4. Bias controls — protected attributes excluded from scoring; periodic outcome audits.
5. Right of access, correction and erasure exposed through a candidate self-service request.

---

## 9. Permission Model

> **Every permission below is configurable by the Company Admin.** Nothing in this section is fixed by the vendor. The tables show the **shipped defaults** of the `Standard` preset only — a starting point so a new company is productive on day one. Any company may reassign, restrict or extend any of it from the Admin Portal (UC-0).

### 9.1 Permission Catalogue

Each item is an independent toggle per role, and can be narrowed by data scope (`All` / `Department` / `Assigned` / `Own`) where marked **⊞**.

| Module | Permissions |
|--------|-------------|
| **Administration** | Manage company profile · Manage users · Manage roles & permissions · Manage departments · Configure workflow & stages · Configure AI policy · Configure security & SSO · Manage billing · View audit log · Transfer ownership |
| **Integrations** | View channels · Connect channel · Disconnect channel · Re-authorise channel |
| **Job openings** ⊞ | View · Create · Edit · Delete · Approve · Publish to channels · Schedule posting · Close / reopen · Edit live post · Manage approval chain |
| **Post generation** | Generate AI post variants · Edit variants · Regenerate · Override SEO recommendations |
| **Applicants** ⊞ | View list · View full profile · Import / add manually · Connect with applicant (create profile) · Send invitation link · Merge duplicates · Transfer to another opening · Export applicant data |
| **Screening** ⊞ | View relevance score · View match report · Adjust scoring weights · Trigger re-rank · Override AI recommendation |
| **Assessments** ⊞ | View tests · Create test manually · Generate test with AI · Edit / publish test · Manage question bank · Assign test · Extend deadline · Grant retake · View answers · Confirm AI-suggested grades |
| **Proctoring** ⊞ | Set proctoring level · View integrity summary · View integrity evidence media · Invalidate a test attempt · Disable proctoring |
| **Interviews** ⊞ | View schedule · Schedule / reschedule · Join as panel member · Enable recording · View recording · View transcript · Submit scorecard · View others' scorecards |
| **Profile & collaboration** ⊞ | Add note · Edit own note · View team notes · View management notes · @mention users · Upload documents · View documents |
| **Pipeline decisions** ⊞ | Advance stage · Move backward · Put on hold · Reject candidate · Approve rejection · Mark hired · Add to talent pool |
| **Reporting** ⊞ | View own reports · View department reports · View company-wide reports · View diversity reports · Export reports |
| **Sensitive fields** | View salary band · View candidate contact details · View candidate documents/ID · View proctoring media · View interview recordings · View private notes · View audit log |

### 9.2 Shipped Defaults (`Standard` preset — fully editable)

| Capability | Owner | HR Manager | Recruiter | Team Lead | Management | Auditor | Applicant |
|------------|:-----:|:----------:|:---------:|:---------:|:----------:|:-------:|:---------:|
| Manage roles & permissions | ✅ | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ |
| Manage users | ✅ | ✅ | ➖ | ➖ | ➖ | ➖ | ➖ |
| Manage platform integrations | ✅ | ✅ | ➖ | ➖ | ➖ | ➖ | ➖ |
| Create / edit job opening | ✅ | ✅ | ✅ | ➖ | ➖ | ➖ | ➖ |
| Approve & publish posting | ✅ | ✅ | ➖ | ➖ | ➖ | ➖ | ➖ |
| View applicant list & scores | ✅ | ✅ (All) | ✅ (Assigned) | ✅ (Assigned) | ✅ (All) | ✅ (All) | ➖ |
| Connect with applicant | ✅ | ✅ | ✅ | ➖ | ➖ | ➖ | ➖ |
| Create / edit tests | ✅ | ✅ | ✅ | ✅ | ➖ | ➖ | ➖ |
| Assign tests | ✅ | ✅ | ✅ | ➖ | ➖ | ➖ | ➖ |
| View integrity evidence media | ✅ | ✅ | ✅ | ➖ summary only | ➖ summary only | ➖ | ➖ |
| Invalidate a test attempt | ✅ | ✅ | ➖ | ➖ | ➖ | ➖ | ➖ |
| Conduct interviews | ✅ | ✅ | ✅ | ✅ | ✅ | ➖ | participant |
| Add notes | ✅ | ✅ | ✅ | ✅ | ✅ | ➖ | ➖ |
| View salary band | ✅ | ✅ | ➖ | ➖ | ✅ | ➖ | ➖ |
| Advance stage | ✅ | ✅ | ✅ | ➖ | ➖ | ➖ | ➖ |
| Reject candidate | ✅ | ✅ | ✅ | ➖ | ➖ | ➖ | ➖ |
| Mark hired | ✅ | ✅ | ➖ | ➖ | ➖ | ➖ | ➖ |
| View company-wide reports | ✅ | ✅ | ➖ own | ➖ own reqs | ✅ | ✅ | ➖ |
| View audit log | ✅ | ✅ | ➖ | ➖ | ➖ | ✅ | ➖ |

✅ enabled by default ➖ disabled by default (Admin may enable) · scope shown in brackets

**Applicant** is not a configurable role — applicants are external and permanently limited to their own candidate portal.

### 9.3 Non-Configurable Guardrails

Only these are outside Admin control, and only because they protect the company legally rather than operationally:

1. Monitoring and recording always require recorded applicant consent.
2. The audit timeline is always append-only.
3. At least one Owner must exist, and the Owner always retains permission-management rights.
4. Workspace isolation between companies.

*(Item 1 is open for sign-off — see §12 Q9.)*

---

## 10. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Job-board APIs are restricted or change | Publishing breaks | Assisted mode fallback; adapter-per-channel architecture; connection health monitoring |
| AI ranking encodes bias | Unfair outcomes, legal exposure | Exclude protected attributes; require explanations; periodic outcome audits; human final decision |
| False proctoring flags | Good candidates unfairly harmed | Confidence levels, raw evidence, mandatory human review, no auto-rejection |
| Applicant refuses camera monitoring | Cannot assess | Offer lower proctoring tier or supervised on-site alternative |
| Privacy/regulatory pushback on monitoring | Adoption blocked | Explicit consent, minimal collection, short retention, clear disclosure |
| AI generates inaccurate job posts | Brand and legal risk | Mandatory human review before publish; content constrained to the canonical requisition |
| Test question leakage | Assessment invalidated | Large question banks, randomisation, per-candidate shuffling, leak monitoring |
| Video calls at scale | Poor interview experience | Proven WebRTC/SFU infrastructure; audio-only fallback; pre-call system checks |
| Admin misconfigures permissions and over-exposes salary or candidate data | Privacy incident | Least-privilege `Strict` preset available; warning prompts on high-risk toggles; "View as role" preview; full change log with one-click rollback |
| Permission sprawl as custom roles multiply | Unmaintainable access model | Role templates, clone-from-existing, unused-role report, periodic access review reminder |
| Cross-tenant data leakage | Critical breach | Tenant ID enforced at the data layer, not the application layer; automated isolation tests in CI |

---

## 11. Delivery Phases

| Phase | Scope | Outcome |
|-------|-------|---------|
| **P0 — Tenancy & Admin** | Company sign-up, workspace isolation, Owner role, user invites, permission catalogue, custom roles, scopes, server-side enforcement, audit log | UC-0 — **must land first; everything else is permission-gated by it** |
| **P1 — Foundation** | Job openings, manual posting, applicant list, resume parsing, basic profile | Usable ATS |
| **P2 — Distribution** | Platform integrations, AI post generation, SEO scoring, one-click multi-channel publish, source attribution | UC-1, UC-2 |
| **P3 — Intelligence** | AI screening agent, ranking, match reports, weights, filters | UC-4 |
| **P4 — Assessment** | Test authoring (AI + manual), question bank, delivery, auto + AI-assisted scoring, basic browser proctoring | UC-5.1, UC-5.2 |
| **P5 — Integrity & Interviews** | Video/audio proctoring, integrity reports, built-in video interviews, scorecards | UC-5.3, UC-7 |
| **P6 — Collaboration & Insight** | Notes, mentions, configurable stages, dashboards, reporting, talent pool | UC-6, UC-8 |

---

## 12. Open Questions

1. Which job boards are mandatory for v1 beyond LinkedIn, Indeed and Rozee.pk? Which of them expose a usable publishing API today?
2. Is a formal approval workflow required before a job goes live, or is HR authority sufficient?
3. What is the acceptable proctoring default — is camera monitoring on by default, or opt-in per test?
4. Which jurisdictions must be supported at launch (drives consent, retention and diversity-data rules)?
5. Should the candidate portal support a persistent candidate account across openings, or remain link-only per application?
6. ~~Is multi-tenancy required?~~ **Resolved:** yes — company sign-up creates an isolated tenant (UC-0).
7. ~~Who owns final rejection authority?~~ **Resolved:** configurable per company by the Admin; the `Standard` default gives it to Recruiter and above.
8. What is the expected peak concurrency for proctored tests (drives infrastructure sizing)?
9. **Sign-off needed:** are the four guardrails in §9.3 acceptable as non-configurable? Specifically, should a Company Admin ever be able to disable applicant consent for monitoring, or edit the audit timeline? Recommendation: no — but this is a business/legal call, not a technical one.
10. Should permission templates be shareable across companies (e.g. a published "Agency recruiting" preset), or does each company configure from scratch?
11. Does the Company Admin need a *sandbox* to trial permission changes before applying them to live users, or is "View as role" + rollback sufficient?

---

*End of document.*
