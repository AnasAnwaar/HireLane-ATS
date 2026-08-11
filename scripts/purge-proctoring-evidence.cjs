/**
 * Auto-delete check-in evidence past its retention window (spec §UC-5.3, CP-21).
 * Finds attempts whose check-in photo is older than EVIDENCE_RETENTION_DAYS
 * (measured from submitted_at, falling back to expires_at), removes the storage
 * object, and clears check_in_photo_path.
 *
 *   node scripts/purge-proctoring-evidence.cjs           # delete
 *   node scripts/purge-proctoring-evidence.cjs --dry-run  # list only
 *
 * Intended to run on a schedule (cron / platform job).
 */
const path = require("path");
process.loadEnvFile(path.join(__dirname, "..", ".env.local"));
const { Client } = require("pg");
const { createClient } = require("@supabase/supabase-js");

const RETENTION_DAYS = 180; // keep in step with EVIDENCE_RETENTION_DAYS
const BUCKET = "candidate-documents";
const DRY = process.argv.includes("--dry-run");

async function main() {
  const db = new Client({ connectionString: process.env.DIRECT_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  );

  try {
    const { rows } = await db.query(
      `select id, check_in_photo_path
         from public.test_attempts
        where check_in_photo_path is not null
          and coalesce(submitted_at, expires_at) < now() - ($1 || ' days')::interval`,
      [RETENTION_DAYS],
    );

    if (rows.length === 0) {
      console.log("Nothing past retention. Evidence store is clean.");
      return;
    }
    console.log(`${rows.length} attempt(s) past ${RETENTION_DAYS}-day retention${DRY ? " (dry run)" : ""}:`);

    let purged = 0;
    for (const r of rows) {
      console.log(`  ${DRY ? "would purge" : "purging"}  ${r.check_in_photo_path}`);
      if (DRY) continue;
      const { error } = await admin.storage.from(BUCKET).remove([r.check_in_photo_path]);
      if (error) {
        console.error(`    ! storage remove failed: ${error.message}`);
        continue;
      }
      await db.query("update public.test_attempts set check_in_photo_path = null where id = $1", [r.id]);
      purged++;
    }

    console.log(DRY ? "\nDry run — nothing deleted." : `\nPurged ${purged} evidence file(s).`);
  } finally {
    await db.end();
  }
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
