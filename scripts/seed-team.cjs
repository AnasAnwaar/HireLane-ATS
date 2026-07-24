/**
 * Prepare the demo workspace for testing user & role management.
 *
 *   node scripts/seed-team.cjs
 *
 *  - Removes any enrolled 2FA factor from the demo owner (so the /mfa gate never
 *    triggers while testing).
 *  - Adds several pre-confirmed team members with different roles, so the admin
 *    portal (users, roles, overrides) has real people to manage without needing
 *    email/invitations working.
 *
 * All accounts share the demo password. Idempotent: re-running refreshes them.
 */
const path = require("path");
process.loadEnvFile(path.join(__dirname, "..", ".env.local"));

const { createClient } = require("@supabase/supabase-js");

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

const DEMO_OWNER = "demo@hirelane.app";
const PASSWORD = "Hirelane-Demo-2026";
const COMPANY = "Acme Technologies";

const TEAM = [
  { email: "hr@hirelane.app", name: "Hina Raza", roleKey: "hr_manager" },
  { email: "recruiter@hirelane.app", name: "Bilal Ahmed", roleKey: "recruiter" },
  { email: "lead@hirelane.app", name: "Usman Tariq", roleKey: "team_lead" },
  { email: "manager@hirelane.app", name: "Sara Malik", roleKey: "management" },
];

async function findUserByEmail(email) {
  // listUsers is paginated; the demo set is tiny, so one page is plenty.
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  return data.users.find((u) => u.email === email) ?? null;
}

async function clearMfa(userId, label) {
  const { data } = await admin.auth.admin.mfa.listFactors({ userId }).catch(() => ({ data: null }));
  const factors = data?.factors ?? [];
  for (const f of factors) {
    await admin.auth.admin.mfa
      .deleteFactor({ id: f.id, userId })
      .catch(() => {});
  }
  if (factors.length) console.log(`  cleared ${factors.length} 2FA factor(s) from ${label}`);
}

async function main() {
  // --- 1. Clear 2FA on the owner --------------------------------------------
  console.log("Disabling 2FA on the demo owner…");
  const owner = await findUserByEmail(DEMO_OWNER);
  if (!owner) {
    console.error(`Demo owner ${DEMO_OWNER} not found — run 'npm run db:seed-demo' first.`);
    process.exit(1);
  }
  await clearMfa(owner.id, DEMO_OWNER);

  // Resolve the org + its roles.
  const { data: membership } = await admin
    .from("memberships")
    .select("organization_id")
    .eq("user_id", owner.id)
    .maybeSingle();
  const orgId = membership.organization_id;

  const { data: roles } = await admin
    .from("roles")
    .select("id, key")
    .eq("organization_id", orgId);
  const roleByKey = new Map((roles ?? []).map((r) => [r.key, r.id]));

  // --- 2. Add team members ---------------------------------------------------
  console.log("Adding team members…");
  for (const member of TEAM) {
    let user = await findUserByEmail(member.email);
    if (!user) {
      const { data, error } = await admin.auth.admin.createUser({
        email: member.email,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: member.name },
      });
      if (error) {
        console.error(`  failed to create ${member.email}: ${error.message}`);
        continue;
      }
      user = data.user;
    }
    await clearMfa(user.id, member.email);

    const roleId = roleByKey.get(member.roleKey);
    // Upsert the membership (active).
    const { data: existing } = await admin
      .from("memberships")
      .select("id")
      .eq("organization_id", orgId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing) {
      await admin
        .from("memberships")
        .update({ role_id: roleId, status: "active" })
        .eq("id", existing.id);
    } else {
      await admin.from("memberships").insert({
        organization_id: orgId,
        user_id: user.id,
        role_id: roleId,
        status: "active",
      });
    }
    console.log(`  ✓ ${member.name} — ${member.roleKey}`);
  }

  console.log("\n────────────────────────────────────────");
  console.log(`Team ready in ${COMPANY}. All accounts use password: ${PASSWORD}`);
  console.log("You can sign in as any of them to see role-scoped views:");
  console.log(`  ${DEMO_OWNER}        (Owner — sees everything)`);
  TEAM.forEach((m) => console.log(`  ${m.email.padEnd(24)} (${m.roleKey})`));
  console.log("────────────────────────────────────────");
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
