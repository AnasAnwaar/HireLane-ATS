/**
 * Diagnose the invite/email path with a full error dump.
 *
 *   node scripts/probe-smtp.cjs [recipient-email]
 *
 * Sends a real invite through Supabase (which uses the configured SMTP). With no
 * argument it uses a fake address, useful only to read the error. Pass your own
 * verified email to confirm delivery end to end.
 *
 * Deletes the created user afterwards so it leaves nothing behind.
 */
const path = require("path");
process.loadEnvFile(path.join(__dirname, "..", ".env.local"));

const { createClient } = require("@supabase/supabase-js");
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

(async () => {
  const to = process.argv[2] || `probe-${Date.now()}@example.com`;
  console.log(`Sending an invite to ${to} …\n`);

  const { data, error } = await admin.auth.admin.inviteUserByEmail(to);

  if (error) {
    console.log("FAILED");
    console.log("  message:", JSON.stringify(error.message));
    console.log("  status :", error.status, " code:", error.code);
    console.log(
      "  full   :",
      JSON.stringify(error, Object.getOwnPropertyNames(error)).slice(0, 600),
    );
    process.exit(1);
  }

  console.log("SENT — Supabase accepted the invite and handed it to SMTP.");
  console.log("  user id:", data?.user?.id);
  console.log(`  Check the ${to} inbox (and spam) for the invitation email.`);
  if (data?.user?.id) {
    await admin.auth.admin.deleteUser(data.user.id).catch(() => {});
    console.log("  (test user cleaned up)");
  }
})();
