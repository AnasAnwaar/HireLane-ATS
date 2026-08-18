/**
 * Pitch-deck screenshot capture (CP-N/A). Logs in as each seed role against a
 * RUNNING app and captures every key screen into pitch/shots/ as real PNGs.
 * The deck builder (build-pitch-deck.cjs) then embeds them.
 *
 *   1. Start the app:            npm run dev
 *   2. Install the browser once: npx playwright install chromium
 *   3. Capture:                  npm run pitch:capture
 *
 * Env overrides: PITCH_BASE_URL (default http://localhost:3000),
 *                PITCH_PASSWORD (default the demo seed password).
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const BASE = (process.env.PITCH_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const PASSWORD = process.env.PITCH_PASSWORD || "Hirelane-Demo-2026";
const OUT = path.join(__dirname, "..", "pitch", "shots");

// Seed accounts (created by scripts/seed-demo.cjs / seed-team.cjs). Super-admin
// is intentionally excluded from the deck.
const ROLES = [
  { key: "admin", email: "hr@hirelane.app", label: "Company Admin (Owner)" },
  { key: "recruiter", email: "recruiter@hirelane.app", label: "Recruiter" },
  { key: "lead", email: "lead@hirelane.app", label: "Hiring Lead" },
  { key: "manager", email: "manager@hirelane.app", label: "Hiring Manager" },
];

// Each screen to capture. Roles that lack access still produce a screenshot
// (the "no access" state), which we simply don't reference in the deck.
const ROUTES = [
  { path: "/dashboard", name: "dashboard" },
  { path: "/openings", name: "openings" },
  { path: "/openings/new", name: "openings-new" },
  { path: "/candidates", name: "candidates" },
  { path: "/assessments", name: "assessments" },
  { path: "/interviews", name: "interviews" },
  { path: "/reports", name: "reports" },
  { path: "/admin/company", name: "admin-company" },
  { path: "/admin/billing", name: "admin-billing" },
  { path: "/admin/users", name: "admin-users" },
  { path: "/admin/roles", name: "admin-roles" },
  { path: "/admin/audit", name: "admin-audit" },
  { path: "/admin/integrations", name: "admin-integrations" },
  { path: "/admin/assessments", name: "admin-assessments" },
];

async function login(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  // Wait for the app shell (or an mfa/setup redirect) to settle.
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(2000);
  const url = page.url();
  if (url.includes("/mfa")) throw new Error("account has 2FA enabled — capture needs a non-2FA seed account");
  if (url.includes("/login")) throw new Error("login failed (check password / seed account exists)");
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  let shots = 0;

  for (const role of ROLES) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    try {
      await login(page, role.email);
      console.log(`\n[${role.key}] ${role.email} — logged in`);
      for (const r of ROUTES) {
        try {
          await page.goto(`${BASE}${r.path}`, { waitUntil: "domcontentloaded" });
          await page.waitForLoadState("networkidle").catch(() => {});
          await page.waitForTimeout(1200);
          const file = path.join(OUT, `${role.key}--${r.name}.png`);
          await page.screenshot({ path: file });
          shots += 1;
          console.log(`  ✓ ${r.name}`);
        } catch (e) {
          console.warn(`  · skip ${r.name}: ${e.message}`);
        }
      }
    } catch (e) {
      console.warn(`[${role.key}] skipped: ${e.message}`);
    }
    await ctx.close();
  }

  await browser.close();
  console.log(`\nDone — ${shots} screenshots in ${OUT}`);
  console.log("Next: npm run pitch:deck");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
