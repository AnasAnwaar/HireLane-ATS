# Hirelane — ATS Portal

**AI-assisted applicant tracking, from job post to hire.**

Hirelane takes a hiring team from *"we need a person"* to *"we hired the right person"*
without leaving one tool — publishing to every job board, screening every applicant,
running proctored assessments and video interviews, and keeping one auditable record per
candidate.

Every permission in the platform is configured by the company that signs up. Nothing is
hard-coded by the vendor.

- **Full specification:** [ATS-Portal-UseCase.md](ATS-Portal-UseCase.md)
- **Build progress:** [BUILD-CHECKLIST.md](BUILD-CHECKLIST.md)

---

## What makes it different

Four things ordinary ATS products make you do by hand:

| | |
|---|---|
| **Publish once, everywhere** | One requisition is auto-rewritten into platform-native, SEO-optimised posts for LinkedIn, Indeed, Rozee.pk and others — then published in a single click. |
| **Ranking that explains itself** | An AI agent reads every application against your actual requirements and returns a 0–100 score with the CV line behind each point. It recommends; a human always decides. |
| **Assessment you can defend** | AI-generated or hand-written tests, delivered in a proctored session that produces a reviewable evidence timeline — not a verdict. |
| **One source of truth** | Every post, score, test, flag, interview, note and decision lives on the candidate profile, behind an append-only audit trail. |

---

## The flow

```
┌─ ADMIN SETS UP ───────────────────────────────────────────────────────────┐
│  Sign up  →  workspace created, you are Owner                             │
│  Configure roles, permissions, scopes, approvals   (nothing is fixed)     │
│  Connect LinkedIn · Indeed · Rozee.pk · careers page                      │
└───────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─ OPEN A ROLE ─────────────────────────────────────────────────────────────┐
│  Write the requisition ONCE                                               │
│      ↓                                                                    │
│  AI writes one tuned post per platform  →  review, edit, SEO score        │
│      ↓                                                                    │
│  Publish everywhere  ·  or schedule  ·  per-channel status tracked        │
└───────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─ APPLICANTS ARRIVE ───────────────────────────────────────────────────────┐
│  Pulled from every channel  →  CV parsed  →  duplicates merged            │
│      ↓                                                                    │
│  AI ranks all of them: score + highlights + concerns + evidence           │
│      ↓                                                                    │
│  You review the shortlist and "Connect" with the ones you want            │
│      ↓                                                                    │
│  Profile created  →  invitation link sent  →  candidate portal opens      │
└───────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─ ASSESS ──────────────────────────────────────────────────────────────────┐
│  Build a test: AI-generated from the JD, manual, or from the bank         │
│      ↓                                                                    │
│  Candidate takes it in-platform, proctored                                │
│      ↓                                                                    │
│  MCQs auto-scored · written answers AI-graded, you confirm                │
│      ↓                                                                    │
│  Integrity report: event timeline + evidence  →  YOU decide the outcome   │
└───────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─ INTERVIEW & DECIDE ──────────────────────────────────────────────────────┐
│  Schedule → built-in video call → recording, transcript, scorecards       │
│      ↓                                                                    │
│  Everything lands on the candidate profile                                │
│      ↓                                                                    │
│  Notes · @mentions · ratings · stage moves — all audited                  │
│      ↓                                                                    │
│  Hire  →  posts taken down  →  funnel + source-of-hire reporting          │
└───────────────────────────────────────────────────────────────────────────┘
```

**Pipeline stages** (configurable per company):

`Applied → Screened → Shortlisted → Test Assigned → Test Completed → Interview Scheduled → Interviewed → Offer → Hired`
plus `Rejected` · `On Hold` · `Withdrawn` from any stage.

---

## Features

### 1 · Multi-platform publishing
- OAuth connections to LinkedIn, Indeed, Rozee.pk and more, each with its own capabilities
- **Assisted mode** for boards with no public API — generate, copy, mark as posted
- Connection health monitoring with re-authorisation prompts
- Per-channel publish status, scheduling, partial-failure retry, takedown on close
- Channel-tagged apply links, so source-of-hire is measurable

### 2 · AI job posts
- One canonical requisition → a tuned variant per platform
- Respects each platform's length limits, formatting and skill taxonomy
- SEO scoring with concrete improvement hints
- Side-by-side editor; regenerate a single variant with a tone instruction
- Guardrail: AI may rephrase and optimise, never invent requirements

### 3 · Applicant management
- Ingestion from every channel plus a branded public apply form
- CV parsing into structured fields
- Cross-channel duplicate detection and merge
- Candidate portal via a signed, expiring invitation link
- Transfer between openings; talent pool for strong near-misses

### 4 · AI screening
- Scored on must-haves, nice-to-haves, experience, qualifications, trajectory, logistics
- Every score cites the CV evidence behind it
- Highlights, concerns, and a `Strong / Possible / Weak fit` recommendation
- Configurable criterion weights; re-rank when requirements change
- Protected attributes excluded from scoring inputs
- **The agent never auto-rejects.** Rejection is a human action.

### 5 · Assessments
- Authoring: **AI-generated** from the job description, **manual**, or **from a question bank**
- Six question types — single/multi MCQ, true-false, short answer, essay, scenario
- MCQs auto-score; written answers get an AI-suggested grade against a rubric that a human confirms
- Timers, shuffling, navigation rules, attempt limits, accessibility accommodations
- Auto-save and disconnect-resume so no work is lost
- Versioning: editing a live test never disturbs an in-flight attempt

### 6 · Proctoring & integrity
- Four levels: **Off · Basic · Standard · Strict**
- Signals: tab switches, window blur, fullscreen exit, copy/paste, dev-tools, second display, face presence, multiple faces, additional voices, answer-pattern anomalies, IP change, VM indicators
- Consent is captured before any monitoring — always, non-negotiable
- Produces an **integrity report**: severity, confidence, and an event timeline aligned to the question being answered
- Flags for human review; **never auto-rejects a candidate**

### 7 · Interviews
- Scheduling with availability and calendar invites
- Browser-based video — no installs — with screen share, chat, private notes and a shared code pad
- Consent-gated recording and transcription
- Blind scorecards: panellists can't see each other's until they submit their own
- Async video interviews for time-zone spread

### 8 · Candidate profile
- Match report · assessments · integrity reports · interviews · documents in one place
- Threaded notes with visibility scopes (Private / Team / Management) and @mentions
- Structured competency scorecards with an aggregate view
- **Append-only timeline** — every event, who caused it, when

### 9 · Admin portal — *your rules, not ours*
- Every capability in the platform is an individual toggle
- Custom roles: create, clone, rename, delete
- **Data scopes** per permission: All / Department / Assigned / Own
- **Field-level visibility**: salary, contact details, proctoring footage, recordings, private notes
- Per-user overrides with optional expiry
- Any action can be made approval-gated
- "View as role" preview before rolling changes out
- Full change log with rollback

### 10 · Reporting
- Pipeline funnel with stage conversion rates
- Time-to-fill, time-to-hire, time-in-stage bottlenecks
- Source effectiveness and cost per hire
- Assessment analytics: score distribution, question difficulty, flag rates
- Aggregate-only diversity reporting where the jurisdiction permits
- CSV / PDF export

---

## Principles

1. **Human-in-the-loop.** AI ranks, scores, drafts and flags. Humans reject, hire and invalidate.
2. **Explainability.** A score with no cited evidence is never shown.
3. **Consent first.** No monitoring or recording without explicit, recorded consent.
4. **Server-side enforcement.** Hiding UI is never the security boundary.
5. **Configurable by default.** If the spec says "HR can…", that is a default an admin may change.

Four guardrails are deliberately *not* configurable, because they protect the company
rather than merely being convenient: consent capture, the append-only audit log,
at-least-one-Owner, and tenant isolation.

---

## Tech stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 (App Router, React 19, TypeScript) |
| Styling | Tailwind CSS v4 with CSS-variable design tokens |
| UI | Radix primitives, shadcn-style components in `src/components/ui` |
| Backend | Supabase — Postgres, Auth, Storage, Row-Level Security |
| Forms | react-hook-form + zod |
| AI | Claude (post generation, screening, test authoring, grading) |

**Brand palette:** red `#E43A38` · cream `#F4EBD0` · khaki `#E0DDB0` · black `#000000`.
All colours are tokens in [globals.css](src/app/globals.css) — rebranding is a one-file change.

---

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in your Supabase keys
npm run dev
```

Runs at http://localhost:3000.

> The landing page and app shell render without Supabase credentials. Any route touching
> the database fails fast with a descriptive error until `.env.local` is populated.

### Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript, no emit |

---

## Project structure

```
src/
  app/
    (app)/            Authenticated routes, sharing the app shell
    layout.tsx        Root layout: fonts, theme, toaster
    page.tsx          Public landing page
  components/
    ui/               Design-system primitives
    layout/           App shell: sidebar, topbar, page header
    brand-mark.tsx    Logo + wordmark
  lib/
    env.ts            Environment validation (fails fast, client/server split)
    navigation.ts     Sidebar config — each item carries its permission key
    supabase/         Browser, server and middleware clients
  types/              Supabase generated types
  proxy.ts            Session refresh + route protection

supabase/
  migrations/         Schema, permission catalogue, RLS policies
```

---

## Architectural notes

**Permissions are the backbone.** The permission catalogue lives in the database, not in
code. Resolution is `owner → per-user override → role grant`, with the most restrictive
data scope winning — implemented once in SQL (`has_permission()`, `permission_scope_of()`)
so the API and RLS policies can never disagree about who may do what.

**Tenant isolation is enforced at the data layer.** Every tenant table carries
`organization_id` and is protected by `FORCE ROW LEVEL SECURITY`, so a missing
application-level filter cannot leak across companies.

**Two Supabase clients, deliberately.** `createClient()` runs as the signed-in user and is
subject to RLS — reach for it by default. `createAdminClient()` bypasses RLS and exists
only for provisioning and background jobs; every call site must scope its own queries.

---

## Status

Under active development — see [BUILD-CHECKLIST.md](BUILD-CHECKLIST.md) for the current
checkpoint. Work proceeds in reviewable checkpoints; each one is verified (lint, typecheck,
build, runtime smoke test) before the next begins.
