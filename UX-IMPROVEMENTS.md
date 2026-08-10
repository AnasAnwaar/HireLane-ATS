# Hirelane — UX Improvement Report

**Reviewer role:** Senior product-design / UX reviewer (heuristic evaluation, accessibility, conversion, content design, responsiveness)
**Surfaces:** (1) Landing page + brand system, (2) Authenticated app shell, (3) Candidate portal (incl. consent screen + timed test runner)
**Date:** 2026-08-10
**Method:** **Code + design-token review only.** The UI was not rendered in a browser, so every finding that depends on pixels, real contrast ratios, or interaction feel is explicitly tagged **[needs visual confirmation]**. Findings provable from the source/tokens are tagged **[code-verified]**. Contrast figures are **estimated from oklch lightness** and must be confirmed with a contrast tool.

---

## 1. Executive summary

Hirelane's UI is **well above the usual "vibe-coded" baseline**. The design system is deliberate: a single considered light theme, oklch semantic tokens, a restrained red/sand/charcoal palette, layered shadows, consistent lucide iconography, thoughtful component variants with `active:` feedback, and genuinely good marketing copy that is specific rather than generic ("the CV line behind each score", "the agent recommends; a human always decides"). The candidate portal has a warm, non-internal tone, server-authoritative timing, autosave reassurance, and destructive-action confirmations. This is a credible product surface.

The improvements fall into a few clusters:

1. **Accessibility gaps that matter** — the heavily-used `muted-foreground` body text and white-on-red primary buttons are likely **below WCAG AA contrast**; several custom interactive elements (test-runner options, question palette, portal withdraw link) have **no visible focus ring**; and the timed-test option list isn't a proper keyboard `radiogroup`. These affect real users, including candidates under time pressure.
2. **A few "looks broken in a demo" affordances** — the topbar **search, ⌘K hint, and notification bell are decorative and non-functional**, and the sidebar shows a hardcoded "Free plan". These erode credibility fast in a live walkthrough.
3. **Two genuine defects** — the mobile nav **drawer doesn't close after you tap a link**, and **rejected/withdrawn candidates render with green "success" styling** in the portal (a check mark + success badge for "Not moving forward").
4. **Missing feedback scaffolding** — there are **no route-level `loading.tsx` skeletons** anywhere, so RSC navigations show no pending state; and `EmptyState` is re-implemented per page rather than shared.
5. **Trust/microcopy** — the hero's **5-star rating + avatar stack is fabricated social proof** for a product with no customers yet; and the primary CTA label changes three times ("Get started" / "Create your workspace" / "Get started free").

None of these block a demo, but the Top 10 below are high-impact / low-effort and would visibly raise the polish.

### Counts by severity
- **High: 6** · **Medium: 15** · **Low: 11** (32 findings total across the three surfaces + accessibility + design-system sections)

---

## 2. Top 10 quick wins (highest impact / lowest effort first)

| # | Win | Why it matters | Where | Sev |
|---|-----|----------------|-------|-----|
| 1 | Add a visible **focus ring** to the test-runner answer options and question-palette buttons | Keyboard/AT candidates currently can't see what's focused **during a timed exam** — an equity and defensibility problem | `test-runner.tsx:181, 229` | High |
| 2 | Fix **rejected/withdrawn showing green "success"** styling in the portal | A rejection currently renders a green check + success badge — reads as good news | `candidate/[token]/page.tsx:17-30, 99-112` | High |
| 3 | Close the **mobile nav drawer on link tap** (and on route change) | On mobile the drawer stays open over the page you navigated to | `app-shell.tsx:16-38`, `app-sidebar.tsx` | High |
| 4 | Either wire up or **remove the non-functional topbar search / ⌘K / bell** | Dead controls read as "broken" in a demo | `app-topbar.tsx:44-62` | Med |
| 5 | Darken **`--muted-foreground`** (and re-check white-on-`--primary`) for **WCAG AA** | Estimated ~3.5–3.7:1 for the most-used secondary text color | `globals.css:45, 31` | High |
| 6 | Replace the hero's **fake 5-star + avatar social proof** with an honest signal | Fabricated reviews are a trust/ethics risk pre-launch | `page.tsx:79, 143-162` | Med |
| 7 | Standardize the **primary CTA label** ("Create your workspace") across nav/hero/CTA | Three labels for one action dilutes the funnel | `page.tsx:99, 133, 286` | Low |
| 8 | Add **route-level `loading.tsx` skeletons** for the main app sections | RSC navigations currently show no pending feedback | `src/app/(app)/**` | Med |
| 9 | Give the timed-test option list proper **`radiogroup` semantics** + arrow-key nav | Custom radios/checkboxes miss expected keyboard model | `test-runner.tsx:176-205` | Med |
| 10 | Enlarge small **touch targets** (question palette `size-7`, sidebar org "Free plan" chip) toward 44px on mobile | Below the 44px guideline; palette can hold 30+ dots | `test-runner.tsx:229-246` | Med |

---

## 3. Landing page (LP)

**First impression & conversion — strong overall.** Clear value prop, good above-the-fold hierarchy (badge → balanced H1 with brand-gradient emphasis → specific subhead → dual CTA → trust row → 3D funnel), credible feature copy, a real-looking product mockup built from actual primitives, and a logical scroll (product → stats → features → how → CTA). The copy does **not** read vibe-coded.

| ID | Sev | Area | Finding | Recommendation | Effort | file:line |
|----|-----|------|---------|----------------|--------|-----------|
| LP-1 | Med | Trust / ethics | Hero shows five filled stars + a stack of 5 avatars implying real reviews/customers that don't exist yet. **[code-verified]** | Replace with honest signal ("New · built for modern hiring teams", a security/GDPR line, or "Multi-tenant · role-based access") and drop the star rating until real reviews exist. | S | `page.tsx:79, 143-162` |
| LP-2 | Low | Conversion | Primary CTA label is inconsistent: nav "Get started", hero "Create your workspace", CTA "Get started free". **[code-verified]** | Pick one verb-first label ("Create your workspace") everywhere; keep "free" only if it's truthfully free. | XS | `page.tsx:99, 133, 286` |
| LP-3 | Med | Conversion | The single most impressive proof — `ProductShowcase` — sits below the fold behind the funnel. **[needs visual confirmation]** | Consider surfacing a slimmer product peek higher, or make the hero's "See the product" the visual anchor. Confirm fold behavior at common viewport heights. | M | `page.tsx:178-199` |
| LP-4 | Low | Content | Stat strip ("One post / 0–100 score / One record") restates features rather than showing metrics. **[code-verified]** | Fine as-is, but real numbers (channels supported, question types, permission keys) would read as more concrete. | S | `page.tsx:201-215` |
| LP-5 | Med | A11y / motion | The R3F funnel reads `prefers-reduced-motion` **once at mount** and never listens for changes; also renders a 2200-point WebGL canvas on mobile. **[code-verified]** | Add a `matchMedia` change listener; consider a lighter particle count or a static SVG fallback on small/low-power devices (perf + battery). | M | `hiring-funnel.tsx:185-207` |
| LP-6 | Low | A11y | In-page nav anchors (Product/Features/How) simply disappear below `md` with no mobile menu. **[code-verified]** | Acceptable for anchor jumps, but a small mobile menu or a "jump to" would help orientation. | S | `page.tsx:90-94` |
| LP-7 | Low | Visual | Hero H1 uses hard `<br/>` line breaks; at some widths this can orphan awkwardly. **[needs visual confirmation]** | Let `text-balance` (already present) handle wrapping; verify the two-line intent holds at 320px and 1440px. | XS | `page.tsx:120-124` |
| LP-8 | Low | Consistency | Footer is minimal (brand + copyright) — no links to login, privacy, or contact. **[code-verified]** | Add a thin link row (Sign in, Privacy, Contact) for credibility and SEO. | S | `page.tsx:295-302` |

---

## 4. App shell (sidebar / topbar / page frame)

**Solid, conventional, permission-aware.** The sidebar filters by permission and hides empty sections, has an active rail (not color-alone), and a clean org footer. The `PageHeader`/`PageBody` pattern is consistent and the earlier `PageBody` class-merge bug is fixed and documented in a comment.

| ID | Sev | Area | Finding | Recommendation | Effort | file:line |
|----|-----|------|---------|----------------|--------|-----------|
| AS-1 | High | Interaction / mobile | The mobile drawer's state lives in `AppShell`; tapping a nav `Link` doesn't close it and it isn't reset on route change, so the drawer **stays open over the destination page**. **[code-verified]** | Pass an `onNavigate`/`onClose` to `AppSidebar` and call it on link click; also close on `pathname` change via effect. | S | `app-shell.tsx:16-38`, `app-sidebar.tsx:85` |
| AS-2 | Med | Credibility | Topbar **search input is non-functional** (no form/handler), the **⌘K hint has no keybinding**, and the **bell shows an unread dot with no notifications system**. **[code-verified]** | For the demo, either wire minimal behavior or hide them. A visible-but-dead search is the #1 "is this real?" tell. | S–M | `app-topbar.tsx:44-62` |
| AS-3 | Med | Content | Sidebar org footer hardcodes **"Free plan"** though no billing exists. **[code-verified]** | Show the actual role/workspace or remove the plan line until billing ships. | XS | `app-sidebar.tsx:136` |
| AS-4 | Med | A11y | Mobile drawer has an overlay `<button>` labelled "Close navigation" (good) but **no `role="dialog"`/`aria-modal`, no focus trap, no Escape-to-close**. **[code-verified]** | Add dialog semantics, trap focus while open, close on Escape. | M | `app-shell.tsx:22-32` |
| AS-5 | Med | Feedback | **No route-level `loading.tsx`** in `(app)` — server navigations render nothing until data resolves. A `Skeleton` primitive exists but is unused for navigation. **[code-verified]** | Add `loading.tsx` skeletons for openings, candidates, profile, posts, tests. | M | `src/app/(app)/**` |
| AS-6 | Low | A11y | Notification unread dot conveys state by a colored dot with no accessible text. **[code-verified]** | Add visually-hidden text ("3 unread") or `aria-label` reflecting count. | XS | `app-topbar.tsx:59-62` |
| AS-7 | Low | Consistency | Account menu links to `/settings/profile` and `/admin/users`; ensure these are permission-gated so a limited role doesn't see "Users & roles". **[needs visual confirmation]** | Gate the "Users & roles" item behind the same permission the nav uses. | S | `app-topbar.tsx:97-101` |
| AS-8 | Low | Touch target | Sidebar nav rows are `py-2` (~36px) — fine on desktop but tight for touch. **[code-verified]** | Bump vertical padding on the mobile drawer instance toward 44px. | XS | `app-sidebar.tsx:89` |

---

## 5. Candidate portal (status page, consent, timed runner, expired wall)

**The strongest-written surface.** Candidate-facing labels are encouraging and non-internal; the consent screen is clear about timer/autosave/monitoring; the runner has a server-authoritative clock, a red <60s stress state, autosave "Saving…/Saved", a question palette, backtrack rules, unanswered-count in the submit confirm, and graceful auto-submit. The expired-link wall is friendly and correctly worded.

| ID | Sev | Area | Finding | Recommendation | Effort | file:line |
|----|-----|------|---------|----------------|--------|-----------|
| CP-1 | High | Content / visual | `CANDIDATE_STATUS` marks `rejected` and `withdrawn` as `done: true`, which renders a **green success icon + success badge** ("Not moving forward" looks like good news). **[code-verified]** | Introduce a third tone (neutral/negative) so terminal-negative stages use a muted/neutral treatment, not success green. | S | `page.tsx:17-30, 97-112` |
| CP-2 | High | A11y | Runner answer options (`role="radio"`/`"checkbox"` on `<button>`) and the question-palette buttons have **no `focus-visible` ring** — keyboard/AT candidates can't see focus mid-exam. **[code-verified]** | Add `focus-visible:ring-2 focus-visible:ring-ring` to both; ensure ring contrasts on `primary-soft`. | S | `test-runner.tsx:181-205, 229-246` |
| CP-3 | Med | A11y | The options are individual `role="radio"`/`"checkbox"` buttons with **no wrapping `role="radiogroup"`/`"group"` and no arrow-key model**; the prompt isn't programmatically the group label. **[code-verified]** | Wrap in a `radiogroup`/`group` with `aria-labelledby` pointing at the prompt; implement arrow-key selection for single-choice. | M | `test-runner.tsx:176-216` |
| CP-4 | Med | Touch / a11y | Question-palette cells are `size-7` (~28px) and can number 30+ — **below the 44px touch target** and dense on mobile. **[code-verified]** | Enlarge to ~36–40px on mobile, add spacing; consider a compact "n unanswered" summary instead of raw dots for long tests. | S | `test-runner.tsx:229-246` |
| CP-5 | Med | Interaction | Text answers autosave on a 700ms debounce and on blur/navigation, but there is **no explicit "last saved" timestamp** — only a transient "Saved". Under exam stress, reassurance matters. **[code-verified]** | Show "Saved • just now" / "Saved HH:MM"; consider a subtle saved-tick per question in the palette. | S | `test-runner.tsx:99-112, 148-150` |
| CP-6 | Med | Interaction | On a save failure that is **not** an expiry (e.g., network blip), `persist` sets `saving=false` but shows **no error** — the candidate believes work saved. **[code-verified]** | Toast a non-blocking "Couldn't save — retrying" and retry; only the `expired` branch is currently handled. | S | `test-runner.tsx:74-83` |
| CP-7 | Med | Reduced motion | The timer relies on a 1s `setInterval`; fine, but the low-time state change is purely color (red). **[code-verified]** | Reinforce the <60s state with a non-color cue (e.g., "1:00 left" label or icon change) for color-blind users. | S | `test-runner.tsx:135, 151-160` |
| CP-8 | Low | A11y | Consent checkbox is a bare native `<input type="checkbox">` with `accent-primary`; label association is via wrapping `<label>` (ok) but there's no `id`/`aria-describedby` tying it to the rules list. **[code-verified]** | Associate the checkbox with the rules list via `aria-describedby` for AT clarity. | XS | `consent-screen.tsx:75-85` |
| CP-9 | Low | Content | Portal "Assessments" empty path: when there are assignments none, the section is hidden entirely — a candidate with a test that later expires sees it flip to "Expired/Missed" with no next-step guidance. **[code-verified]** | For expired/missed, add a line "Contact the employer if you need another attempt." | XS | `page.tsx:119-164` |
| CP-10 | Low | Interaction | Withdraw is a text link styled as a `<button>` with `text-destructive underline` — **no focus ring**, and it sits inline in a paragraph. **[code-verified]** | Give it a focus-visible ring; consider a small outline/ghost destructive button for a clearer affordance. | XS | `portal-client.tsx:171-176` |
| CP-11 | Low | Feedback | CV upload only reveals the Upload button after a file is chosen; there's no size/type hint until the server rejects it. **[code-verified]** | Add helper text "PDF or Word, up to 10 MB" under the dropzone. | XS | `portal-client.tsx:141-162` |
| CP-12 | Low | Consistency | Runner header packs title + SR badge + "Saving…" + timer into one flex row; on ~320px this may crowd/truncate the title heavily. **[needs visual confirmation]** | Verify at 320–360px; consider dropping the "Saved" text to an icon on xs. | S | `test-runner.tsx:141-161` |

---

## 6. Accessibility (WCAG-oriented)

Contrast values below are **estimated from oklch `L` values** and **must be confirmed with a contrast checker on rendered pixels** — treat as "likely fails / verify", not final. Focus, aria, and keyboard findings are **[code-verified]** from source.

| ID | Sev | Type | Finding (estimate) | Recommendation | file:line |
|----|-----|------|--------------------|----------------|-----------|
| A11Y-1 | High | Contrast | **`--muted-foreground` = oklch(0.52 …)** on `--background` oklch(0.981) ≈ **~3.5–3.7:1** — used pervasively for body/secondary text, likely **fails AA (4.5:1)** for normal text. **[estimate — verify]** | Darken to ~oklch(0.44–0.46) or reserve the current value for large text only. | `globals.css:45` |
| A11Y-2 | High | Contrast | **White (`--primary-foreground` ~oklch(0.99)) on `--primary` red oklch(0.585)** ≈ **~3.2–3.4:1** — primary button labels at 14px likely **fail AA**. **[estimate — verify]** | Darken `--primary` slightly for text use, or use a larger/bolder button label, or a darker on-red text token. | `globals.css:31, 32` |
| A11Y-3 | Med | Contrast | **`text-primary` (red) on `primary-soft`** (badges, eyebrows, uppercase 11px) ≈ **~2.9–3.3:1** — small uppercase labels most at risk. **[estimate — verify]** | Use a darker red for on-soft text, or increase label size/weight. | `page.tsx:183, 220`; `app-shell.tsx:60` |
| A11Y-4 | High | Focus | Custom interactive elements with **no `focus-visible` ring**: runner options, question palette, portal withdraw link. **[code-verified]** | Add `focus-visible:ring-2 ring-ring ring-offset-2`. The shared `Button` already does this — route custom controls through it or mirror its ring. | `test-runner.tsx:181,229`; `portal-client.tsx:171` |
| A11Y-5 | Med | Keyboard | Timed-test single/multi choice lacks `radiogroup`/`group` semantics and arrow-key selection. **[code-verified]** | See CP-3. | `test-runner.tsx:176-205` |
| A11Y-6 | Med | Touch target | Question palette `size-7` (~28px) and topbar/sidebar chips below 44px. **[code-verified]** | Enlarge on touch; see CP-4 / AS-8. | `test-runner.tsx:229` |
| A11Y-7 | Low | Reduced motion | Global CSS reduced-motion rule is excellent (kills CTA drift, logo sheen). The **R3F funnel** honors it at mount but ignores runtime changes. **[code-verified]** | Add a media-query change listener (LP-5). | `globals.css:177-184`; `hiring-funnel.tsx:185` |
| A11Y-8 | Low | Semantics | Decorative canvases/gradients correctly use `aria-hidden`; the funnel `<Canvas aria-hidden>` is right. Confirm the LP hero conveys meaning without it (it does — text-first). **[code-verified]** | No change; noted as done well. | `hiring-funnel.tsx:196` |
| A11Y-9 | Low | Forms | Portal profile fields use a `Field` wrapper with `id`/`label` — good. Verify every `Field` `id` matches its input `name`/`id` so labels are programmatically associated. **[needs visual confirmation]** | Spot-check label `htmlFor` ↔ input `id`. | `portal-client.tsx:98-116` |

**Done well (keep):** color is never the sole signal in the sidebar active state (rail + weight) or status badges (dot + text); `role="timer"` with an `aria-label`; `aria-live="polite"` on the save indicator; global reduced-motion handling; `aria-current="page"` on active nav.

---

## 7. Design-system observations

- **Tokens are a real strength.** oklch throughout, semantic naming, a single intentional light theme (documented decision — no half-built dark mode to maintain), layered shadow scale, and a coherent radius scale. Keep this.
- **Contrast is the one systemic risk.** `muted-foreground` and on-red text recur everywhere, so fixing A11Y-1/2/3 at the **token** level fixes dozens of screens at once. Highest leverage change in this report.
- **`EmptyState` is re-implemented per page** (`openings/page.tsx:162`, `match-report.tsx:365`) rather than shared. Extract a single `<EmptyState icon title description action/>` in `components/ui` for consistency and to cover the pages that currently have none.
- **No loading skeletons in navigation.** A `Skeleton` primitive exists (`components/ui/skeleton.tsx`) but there are **zero `loading.tsx`** files. Add them per section so RSC transitions feel instant.
- **Focus treatment isn't uniform.** The `Button` component has an excellent `focus-visible` ring, but hand-rolled `<button>`s (runner options, palette, withdraw, some cards) bypass it. Standardize: either use `Button`/`buttonVariants` or a shared `focusRing` utility class.
- **Button variant set is thorough** (default/sand/contrast/destructive/outline/secondary/ghost/link) with good `active:translate-y-px` feedback and correct `disabled` handling. No change needed.
- **Iconography** is consistently lucide-react at coherent sizes. Good.
- **CTA label + "Free plan"** are the two content inconsistencies (LP-2, AS-3) worth standardizing.
- **Brand system** (AnimatedLogo tile + wordmark + four-stripe `brand-rule`) is consistent across LP, portal, consent, and shell — a nice cohesion win.

---

## 8. Verification legend & caveats

- **[code-verified]** — provable from source/tokens without rendering (focus rings, aria, drawer state, status-tone logic, non-functional controls, token values).
- **[estimate — verify]** — contrast figures derived from oklch lightness; **confirm with a contrast tool on rendered pixels** before acting. The *direction* (muted text and on-red text are the risks) is reliable; the exact ratios are not.
- **[needs visual confirmation]** — anything about spacing rhythm, fold position, truncation at specific widths, and responsive breakpoints (the LP's 4K→mobile behavior, runner header at 320px, product-showcase overlap of the floating glass cards). No browser was available in this review.

**Recommended next step for the items above:** a 30-minute pass in a browser at 320px / 768px / 1440px / 2560px with a contrast checker and keyboard-only navigation would confirm/close every `[estimate]` and `[needs visual confirmation]` item and validate the fixes for the `[code-verified]` ones.
