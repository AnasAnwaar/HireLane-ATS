/**
 * Issue a candidate-portal link for the demo's top candidate and print the URL,
 * so the candidate portal can be tried without the HR-side click flow.
 *   node scripts/demo-portal-link.cjs
 */
const path = require("path");
const crypto = require("crypto");
process.loadEnvFile(path.join(__dirname, "..", ".env.local"));
const { createClient } = require("@supabase/supabase-js");

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
const token = () =>
  Buffer.from(crypto.randomBytes(32)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

(async () => {
  const { data: cand } = await admin
    .from("candidates")
    .select("id, full_name, organization_id")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!cand) {
    console.error("No candidates found — run npm run db:seed-demo first.");
    process.exit(1);
  }

  // Revoke existing live invites, then issue a fresh one.
  await admin
    .from("candidate_portal_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("candidate_id", cand.id)
    .is("revoked_at", null);

  const raw = token();
  await admin.from("candidate_portal_invites").insert({
    organization_id: cand.organization_id,
    candidate_id: cand.id,
    token_hash: sha256(raw),
    expires_at: new Date(Date.now() + 14 * 86400_000).toISOString(),
  });

  console.log("\n────────────────────────────────────────");
  console.log(`Candidate portal link for ${cand.full_name}:`);
  console.log(`  ${appUrl}/candidate/${raw}`);
  console.log("Open it in a new tab / incognito — no login needed.");
  console.log("────────────────────────────────────────");
})();
