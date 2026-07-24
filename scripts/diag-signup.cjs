/**
 * Diagnose why sign-up fails, with a full error dump.
 *   node scripts/diag-signup.cjs
 */
const path = require("path");
process.loadEnvFile(path.join(__dirname, "..", ".env.local"));

const { createClient } = require("@supabase/supabase-js");
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false } },
);

(async () => {
  const email = `diag-${Date.now()}@hirelane.app`;
  const { data, error } = await supabase.auth.signUp({
    email,
    password: "Hirelane-Demo-2026",
    options: { data: { full_name: "Diag" } },
  });

  if (error) {
    console.log("SIGN-UP FAILED");
    console.log("  name  :", error.name);
    console.log("  status:", error.status);
    console.log("  code  :", error.code);
    console.log("  message:", JSON.stringify(error.message));
    console.log(
      "\nMost likely: 'Confirm email' is still ON, so Supabase tries to send a",
      "\nconfirmation email through Resend, which rejects an unverified-domain",
      "\nrecipient and returns a 500.",
    );
    return;
  }

  if (data.session) {
    console.log("OK — session returned immediately. 'Confirm email' is OFF. ✅");
  } else {
    console.log("Sign-up returned a user but no session → 'Confirm email' is ON.");
    console.log("(No error means the email send didn't fail — but you still need it off");
    console.log(" for password-based testing without clicking a link.)");
  }
})();
