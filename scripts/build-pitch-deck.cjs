/**
 * Build HireLane-Pitch.pptx from the captured screenshots (pitch/shots/) plus
 * the step-by-step, per-role walkthroughs. Run after pitch:capture:
 *
 *   npm run pitch:deck
 *
 * Missing screenshots degrade to a labelled placeholder box (so the deck still
 * builds); re-run pitch:capture to fill them in. Super-admin is excluded.
 */
const fs = require("fs");
const path = require("path");
const pptxgen = require("pptxgenjs");

const SHOTS = path.join(__dirname, "..", "pitch", "shots");
const OUT = path.join(__dirname, "..", "HireLane-Pitch.pptx");

// Brand palette (hex without #).
const RED = "E0342C";
const INK = "1A1A1A";
const MUTED = "6B6B6B";
const BG = "FBF7F1";
const CARD = "FFFFFF";
const SOFT = "FBE3E0";
const FONT = "Arial";

const pptx = new pptxgen();
pptx.layout = "LAYOUT_WIDE"; // 13.333 x 7.5 in
pptx.author = "HireLane";
pptx.company = "HireLane";
pptx.title = "HireLane — AI-assisted ATS";

/** First existing screenshot among the candidates, else null. */
function pick(...names) {
  for (const n of names) {
    const p = path.join(SHOTS, `${n}.png`);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/** Screenshot panel on the right, or a labelled placeholder. */
function shot(slide, imgPath, label) {
  const x = 6.7;
  const y = 1.5;
  const w = 6.1;
  const h = 4.9;
  slide.addShape(pptx.ShapeType.roundRect, {
    x: x - 0.12, y: y - 0.12, w: w + 0.24, h: h + 0.24, rectRadius: 0.08,
    fill: { color: CARD }, line: { color: "E6DED3", width: 1 },
    shadow: { type: "outer", color: "999999", opacity: 0.28, blur: 10, offset: 3, angle: 90 },
  });
  if (imgPath) {
    slide.addImage({ path: imgPath, x, y, w, h, sizing: { type: "contain", w, h } });
  } else {
    slide.addText(`screenshot:\n${label}\n(run npm run pitch:capture)`, {
      x, y, w, h, align: "center", valign: "middle", color: MUTED, fontFace: FONT, fontSize: 12, italic: true,
    });
  }
}

function base(slide) {
  slide.background = { color: BG };
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.18, h: 7.5, fill: { color: RED } });
}

/** Section divider slide. */
function divider(kicker, title, sub) {
  const s = pptx.addSlide();
  s.background = { color: INK };
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 3.5, w: 13.333, h: 0.05, fill: { color: RED } });
  s.addText(kicker.toUpperCase(), { x: 0.9, y: 2.5, w: 11, h: 0.4, color: RED, fontFace: FONT, fontSize: 14, bold: true, charSpacing: 3 });
  s.addText(title, { x: 0.9, y: 2.9, w: 11.5, h: 1, color: "FFFFFF", fontFace: FONT, fontSize: 40, bold: true });
  if (sub) s.addText(sub, { x: 0.9, y: 3.7, w: 11, h: 0.8, color: "C9C4BD", fontFace: FONT, fontSize: 16 });
  return s;
}

/** Step-by-step slide: numbered steps on the left, screenshot on the right. */
function steps(kicker, title, list, imgPath, label) {
  const s = pptx.addSlide();
  base(s);
  s.addText(kicker.toUpperCase(), { x: 0.6, y: 0.55, w: 6, h: 0.35, color: RED, fontFace: FONT, fontSize: 12, bold: true, charSpacing: 2 });
  s.addText(title, { x: 0.6, y: 0.88, w: 6, h: 0.7, color: INK, fontFace: FONT, fontSize: 26, bold: true });
  let y = 1.9;
  list.forEach((step, i) => {
    s.addShape(pptx.ShapeType.ellipse, { x: 0.6, y: y + 0.02, w: 0.42, h: 0.42, fill: { color: SOFT }, line: { color: RED, width: 1 } });
    s.addText(String(i + 1), { x: 0.6, y: y + 0.02, w: 0.42, h: 0.42, align: "center", valign: "middle", color: RED, fontFace: FONT, fontSize: 13, bold: true });
    s.addText(
      [
        { text: `${step.h}\n`, options: { bold: true, color: INK, fontSize: 13 } },
        { text: step.d, options: { color: MUTED, fontSize: 11 } },
      ],
      { x: 1.2, y: y - 0.05, w: 5.2, h: 0.9, fontFace: FONT, valign: "top", lineSpacingMultiple: 0.95 },
    );
    y += Math.max(0.82, 0.5 + Math.ceil(step.d.length / 60) * 0.22);
  });
  shot(s, imgPath, label);
  return s;
}

/** Plain bullet slide. */
function bullets(title, sub, list) {
  const s = pptx.addSlide();
  base(s);
  s.addText(title, { x: 0.7, y: 0.7, w: 12, h: 0.7, color: INK, fontFace: FONT, fontSize: 30, bold: true });
  if (sub) s.addText(sub, { x: 0.7, y: 1.45, w: 12, h: 0.5, color: MUTED, fontFace: FONT, fontSize: 15 });
  s.addText(
    list.map((t) => ({ text: t, options: { bullet: { code: "2022", indent: 18 }, color: INK, fontSize: 15, paraSpaceAfter: 10 } })),
    { x: 0.9, y: 2.3, w: 11.4, h: 4.6, fontFace: FONT, valign: "top" },
  );
  return s;
}

// ============================================================================
// Slides
// ============================================================================

// 1 — Title
{
  const s = pptx.addSlide();
  s.background = { color: BG };
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.333, h: 0.18, fill: { color: RED } });
  s.addShape(pptx.ShapeType.roundRect, { x: 0.9, y: 2.15, w: 0.9, h: 0.9, rectRadius: 0.14, fill: { color: RED } });
  s.addText("H", { x: 0.9, y: 2.15, w: 0.9, h: 0.9, align: "center", valign: "middle", color: "FFFFFF", fontFace: FONT, fontSize: 40, bold: true });
  s.addText(
    [
      { text: "Hire", options: { color: INK } },
      { text: "Lane", options: { color: RED } },
    ],
    { x: 2.0, y: 2.2, w: 9, h: 0.9, fontFace: FONT, fontSize: 44, bold: true, valign: "middle" },
  );
  s.addText("Every applicant, down to the right hire.", { x: 0.9, y: 3.4, w: 11.5, h: 0.8, color: INK, fontFace: FONT, fontSize: 26, bold: true });
  s.addText("An AI-assisted, multi-tenant applicant tracking system — post to every board, screen every applicant with explainable AI, run proctored assessments and interviews, and keep one auditable record per candidate.", {
    x: 0.9, y: 4.2, w: 10.5, h: 1.2, color: MUTED, fontFace: FONT, fontSize: 15,
  });
  s.addText("Product walkthrough · role-by-role", { x: 0.9, y: 6.4, w: 8, h: 0.4, color: RED, fontFace: FONT, fontSize: 13, bold: true });
}

// 2 — Problem
bullets("Hiring is slow, scattered, and gut-feel", "The pain HireLane removes", [
  "Job posts are copy-pasted across boards by hand — inconsistent and time-consuming.",
  "Applicants pile up in inboxes and spreadsheets — no single source of truth.",
  "Screening is manual and subjective — strong candidates get missed.",
  "Assessments and interviews live in separate tools with no shared record.",
  "No fine-grained control over who on the team can see or do what.",
]);

// 3 — Solution
bullets("One place, from application to hire", "What HireLane does", [
  "AI screening ranks every applicant against the role with explainable match reports.",
  "AI job-post generation drafts platform-tuned posts in seconds.",
  "Built-in proctored assessments — AI-generated or from a reusable library, auto-graded.",
  "In-app interviews with scheduling, a live room, and blind scorecards (no anchoring).",
  "One auditable candidate record; notes & @mentions keep the team aligned.",
  "Multi-tenant with role-based permissions enforced at the database (RLS) — not just hidden.",
]);

// 4 — Roles
bullets("Built for the whole hiring team", "Who uses HireLane (and what this deck covers)", [
  "Company Admin / Owner — sets up the workspace, team, roles, and billing.",
  "Recruiter — creates openings, sources & screens candidates, runs the pipeline.",
  "Hiring Lead / Manager — reviews shortlists, assigns assessments, decides.",
  "Interviewer — runs interviews and submits blind scorecards.",
  "Candidate — applies and completes assessments through the external portal.",
]);

// ---- Company Admin ----
divider("Role 1", "Company Admin / Owner", "Set up and run the workspace");
steps("Company Admin · Step 1", "Set up your company profile", [
  { h: "Open Admin → Company", d: "Everything admin lives under one Administration tab bar." },
  { h: "Set identity", d: "Company name, logo, brand colour and careers URL." },
  { h: "It flows everywhere", d: "Your brand appears on job posts, candidate portals and emails." },
  { h: "Danger zone", d: "Deactivate (pause) or delete the workspace — protected by 2FA + name confirm." },
], pick("admin--admin-company"), "admin-company");

steps("Company Admin · Step 2", "Invite your team & set roles", [
  { h: "Admin → Users", d: "Invite teammates by email; they set a password and join." },
  { h: "Admin → Roles & Permissions", d: "Choose exactly what each role can see and do." },
  { h: "Fine-grained & enforced", d: "Permissions are enforced in the database (RLS), not just hidden in the UI." },
], pick("admin--admin-users", "admin--admin-roles"), "admin-users");

steps("Company Admin · Step 3", "Choose a plan & manage billing", [
  { h: "Admin → Plans & billing", d: "Compare Free / Basic / Premium and see usage vs limits." },
  { h: "Pay in-app", d: "Secure Stripe card entry embedded on the page — no redirect." },
  { h: "Scale & control", d: "Add seats, switch or cancel any time; over-limit alerts guide upgrades." },
], pick("admin--admin-billing"), "admin-billing");

steps("Company Admin · Step 4", "Full accountability", [
  { h: "Admin → Audit Log", d: "A complete trail of who changed what, and when." },
  { h: "Assessment policy", d: "Set default proctoring and retake rules for every new test." },
], pick("admin--admin-audit", "admin--admin-assessments"), "admin-audit");

// ---- Recruiter ----
divider("Role 2", "Recruiter", "Source, screen, and move candidates");
steps("Recruiter · Step 1", "Start from the dashboard", [
  { h: "Open Dashboard", d: "Pipeline funnel, upcoming interviews and recent activity at a glance." },
  { h: "Live, not sample", d: "Every number is your real data, scoped to your workspace." },
], pick("recruiter--dashboard", "admin--dashboard"), "dashboard");

steps("Recruiter · Step 2", "Create a job opening", [
  { h: "Openings → New", d: "Add the title, department, and must-have requirements." },
  { h: "Set screening weights", d: "Tell the AI what matters most for this role." },
  { h: "Publish", d: "Open the role and share the apply link with candidates." },
], pick("recruiter--openings-new", "admin--openings-new", "recruiter--openings"), "openings-new");

steps("Recruiter · Step 3", "Generate AI job posts", [
  { h: "Opening → Posts", d: "AI writes a platform-tuned post for each channel in seconds." },
  { h: "Review & publish", d: "Edit, then publish in assisted mode." },
  { h: "Coming soon", d: "One-click posting to LinkedIn/Indeed via integrations is on the way." },
], pick("recruiter--openings", "admin--openings"), "openings");

steps("Recruiter · Step 4", "Add & AI-screen candidates", [
  { h: "Candidates / Applicants", d: "Add candidates manually or let them apply via the link." },
  { h: "AI ranking", d: "Every applicant is scored against the role with an explainable match report." },
  { h: "Work the pipeline", d: "Applied → Screened → Shortlisted → Assessed → Interviewed → Offer → Hired." },
], pick("recruiter--candidates", "admin--candidates"), "candidates");

// ---- Hiring Manager / Interviewer ----
divider("Role 3", "Hiring Lead / Manager & Interviewer", "Review, assess, interview, decide");
steps("Hiring Manager · Step 1", "Assign assessments", [
  { h: "Assessments", d: "Generate a role-specific test with AI, or reuse one from the library." },
  { h: "Auto-graded + proctored", d: "Objective questions grade instantly; integrity signals are flagged." },
], pick("manager--assessments", "admin--admin-assessments", "recruiter--assessments"), "assessments");

steps("Hiring Manager · Step 2", "Schedule & run interviews", [
  { h: "Interviews → Schedule", d: "Pick an applicant (candidate + role), time, and panel." },
  { h: "Run in-app", d: "A built-in interview room — no external tool." },
  { h: "Blind scorecards", d: "Panelists score independently; peers' ratings unlock only after you submit — no anchoring." },
], pick("manager--interviews", "admin--interviews"), "interviews");

steps("Hiring Manager · Step 3", "Decide with the full picture", [
  { h: "Reports", d: "Funnel, time-to-hire and source metrics across the org." },
  { h: "One record", d: "Scores, assessments, interviews and notes all live on the candidate." },
  { h: "Collaborate", d: "Notes and @mentions keep the whole panel aligned." },
], pick("manager--reports", "admin--reports"), "reports");

// ---- Candidate ----
divider("Role 4", "Candidate", "The external experience");
steps("Candidate · Step 1", "Apply in minutes", [
  { h: "Public apply link", d: "No account needed — add profile details and upload a CV." },
  { h: "Branded & clear", d: "Candidates see your company's brand, not a generic form." },
], pick("candidate--apply", "admin--openings"), "candidate-apply");

steps("Candidate · Step 2", "Take assessments & track status", [
  { h: "Distraction-free runner", d: "A timed test with autosave and a question palette." },
  { h: "Integrity", d: "Tab-switch/copy detection; question text can't be copied." },
  { h: "Candidate portal", d: "Track application status and next steps from one link." },
], pick("candidate--portal", "candidate--test"), "candidate-portal");

// ---- Plans / Security / Close ----
bullets("Plans & pricing", "Simple, transparent tiers — enforced server-side", [
  "Free — 1 seat, up to 5 openings, applicant tracking & pipeline.",
  "Basic ($49/mo) — 3 seats, unlimited openings, AI job-post generation.",
  "Premium ($149/mo) — up to 10 seats, AI screening & match reports, AI assessments + grading, proctoring & interviews.",
  "Custom — bespoke limits & all features, assigned by our team.",
  "Add-on seats, prorated. Limits and locked features are enforced in the database — not just hidden.",
]);

bullets("Secure & multi-tenant by design", "Trust built in", [
  "Row-Level Security isolates every tenant's data at the database layer.",
  "Role-based permissions from a central catalogue — the UI and DB never disagree.",
  "Optional two-factor authentication (TOTP / Google Authenticator).",
  "Full audit log of privileged actions; proctoring evidence with retention limits.",
]);

{
  const s = pptx.addSlide();
  s.background = { color: INK };
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.333, h: 0.18, fill: { color: RED } });
  s.addText("Hire smarter, together.", { x: 0.9, y: 2.9, w: 11.5, h: 1, color: "FFFFFF", fontFace: FONT, fontSize: 40, bold: true });
  s.addText("HireLane — every applicant, down to the right hire.", { x: 0.9, y: 3.8, w: 11, h: 0.6, color: "C9C4BD", fontFace: FONT, fontSize: 18 });
}

pptx.writeFile({ fileName: OUT }).then(() => {
  console.log(`Deck written: ${OUT}`);
});
