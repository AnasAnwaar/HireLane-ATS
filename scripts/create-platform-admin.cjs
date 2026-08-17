/**
 * Create a dedicated platform super-admin account (CP-28).
 *
 *   node scripts/create-platform-admin.cjs superadmin@hirelane.com "a-strong-password"
 *   DIRECT_URL="postgres://…prod…" node scripts/create-platform-admin.cjs <email> <password>
 *
 * Creates a confirmed auth user (no company/org — a pure platform operator) and
 * sets profiles.is_platform_admin = true. If the user already exists, it just
 * (re)sets the password and grants the flag. Needs NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY and DIRECT_URL in .env.local.
 */
const path = require("path");
const shellDirectUrl = process.env.DIRECT_URL;
process.loadEnvFile(path.join(__dirname, "..", ".env.local"));
if (shellDirectUrl) process.env.DIRECT_URL = shellDirectUrl;

const { createClient } = require("@supabase/supabase-js");
const { Client } = require("pg");

async function main() {
  const email = process.argv[2];
  const password = process.argv[3];
  if (!email || !password) {
    console.error('Usage: node scripts/create-platform-admin.cjs <email> "<password>"');
    process.exit(1);
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey || !process.env.DIRECT_URL) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / DIRECT_URL in .env.local.");
    process.exit(1);
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // Create the confirmed user, or find + update the password if it already exists.
  let userId;
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) {
    if (!/already|registered|exist/i.test(error.message)) throw error;
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existing = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (!existing) throw new Error(`User ${email} reported as existing but not found.`);
    userId = existing.id;
    await admin.auth.admin.updateUser(userId, { password, email_confirm: true });
    console.log(`= reused existing user ${email}, password reset`);
  } else {
    userId = created.user.id;
    console.log(`+ created user ${email}`);
  }

  // Grant the platform-admin flag (the profile is created by a DB trigger).
  const db = new Client({ connectionString: process.env.DIRECT_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  try {
    const { rows } = await db.query(
      "update public.profiles set is_platform_admin = true where id = $1 returning email, is_platform_admin",
      [userId],
    );
    if (!rows.length) {
      // Trigger may not have fired yet — insert a minimal profile.
      await db.query(
        "insert into public.profiles (id, email, full_name, is_platform_admin) values ($1,$2,$3,true) on conflict (id) do update set is_platform_admin = true",
        [userId, email, "Platform Admin"],
      );
    }
    console.log(`Granted platform admin to ${email}. Sign in normally — you'll land on /platform.`);
  } finally {
    await db.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
