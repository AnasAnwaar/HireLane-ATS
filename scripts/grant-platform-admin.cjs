/**
 * Grant (or revoke) platform super-admin to a user by email. CP-28.
 *
 *   node scripts/grant-platform-admin.cjs you@example.com          # grant
 *   node scripts/grant-platform-admin.cjs you@example.com --revoke # revoke
 *   DIRECT_URL="postgres://…prod…" node scripts/grant-platform-admin.cjs you@… # prod
 *
 * Platform admin is a cross-tenant flag on public.profiles — deliberately not an
 * org role. Keep this list tiny (ideally just you).
 */
const path = require("path");
const shellDirectUrl = process.env.DIRECT_URL;
process.loadEnvFile(path.join(__dirname, "..", ".env.local"));
if (shellDirectUrl) process.env.DIRECT_URL = shellDirectUrl;

const { Client } = require("pg");

async function main() {
  const email = process.argv[2];
  const revoke = process.argv.includes("--revoke");
  if (!email || email.startsWith("--")) {
    console.error("Usage: node scripts/grant-platform-admin.cjs <email> [--revoke]");
    process.exit(1);
  }

  const db = new Client({ connectionString: process.env.DIRECT_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  try {
    const { rows } = await db.query(
      "update public.profiles set is_platform_admin = $2 where lower(email) = lower($1) returning id, email, is_platform_admin",
      [email, !revoke],
    );
    if (!rows.length) {
      console.error(`No profile found for ${email}. Sign up/log in once first, then re-run.`);
      process.exit(1);
    }
    console.log(`${revoke ? "Revoked" : "Granted"} platform admin:`, rows[0]);
  } finally {
    await db.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
