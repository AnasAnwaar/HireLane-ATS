/**
 * Remove all test data left by integration runs.
 *
 *   node scripts/purge-test-data.cjs
 *
 * Why this is done in SQL, not the Supabase admin API:
 *
 * The `guard_last_owner` trigger refuses to delete an organisation's last owner
 * — correct in production, but it also blocks the CASCADE that fires when an
 * auth user (→ profile → owner membership) is deleted. So `deleteUser` silently
 * fails on any account that owns a workspace.
 *
 * Here we connect as `postgres` (superuser) and set `session_replication_role =
 * replica` for the duration, which suspends user triggers so the deletes go
 * through. Real accounts are protected by a strict pattern match: only test
 * fixtures (@hirelane.test / @example.com, "Acme"/"Globex" orgs) are touched.
 */
const path = require("path");
const { Client } = require("pg");

process.loadEnvFile(path.join(__dirname, "..", ".env.local"));

const EMAIL_PATTERN = "@(hirelane\\.test|example\\.com)$";
const ORG_PATTERN = "^(Acme|Globex|Second Co|Test)\\M";

async function main() {
  const client = new Client({
    connectionString: process.env.DIRECT_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    const before = await client.query(
      `select
         (select count(*) from auth.users where email ~ $1) as users,
         (select count(*) from public.organizations where name ~ $2) as orgs`,
      [EMAIL_PATTERN, ORG_PATTERN],
    );
    console.log(
      `Found ${before.rows[0].users} test user(s), ${before.rows[0].orgs} test org(s).`,
    );

    // Disable exactly the three guard triggers that block org/owner/audit
    // deletion, keeping FK cascades active so children clean up properly.
    // (replica mode would skip the cascades and orphan rows.) All in one
    // transaction; a rollback restores the triggers.
    const guards = [
      ["public.memberships", "memberships_guard_last_owner"],
      ["public.roles", "roles_guard_in_use"],
      ["public.audit_log", "audit_log_no_delete"],
    ];
    await client.query("begin");
    for (const [tbl, trg] of guards) {
      await client.query(`alter table ${tbl} disable trigger ${trg}`);
    }

    const o = await client.query("delete from public.organizations where name ~ $1", [ORG_PATTERN]);
    const m = { rowCount: "(cascaded)" };
    const u = await client.query("delete from auth.users where email ~ $1", [EMAIL_PATTERN]);
    await client.query(
      "delete from public.profiles p where p.email ~ $1 and not exists (select 1 from auth.users u where u.id = p.id)",
      [EMAIL_PATTERN],
    );
    await client.query(
      "delete from auth.identities i where i.email ~ $1 and not exists (select 1 from auth.users u where u.id = i.user_id)",
      [EMAIL_PATTERN],
    );

    for (const [tbl, trg] of guards) {
      await client.query(`alter table ${tbl} enable trigger ${trg}`);
    }
    await client.query("commit");

    console.log(
      `Deleted ${u.rowCount} user(s), ${o.rowCount} org(s), ${m.rowCount} membership(s).`,
    );

    const after = await client.query(
      `select
         (select count(*) from auth.users) as users,
         (select count(*) from public.organizations) as orgs,
         (select count(*) from public.memberships) as memberships`,
    );
    console.log(
      `Remaining total: ${after.rows[0].users} user(s), ${after.rows[0].orgs} org(s), ${after.rows[0].memberships} membership(s).`,
    );
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Purge failed:", err.message);
  process.exit(1);
});
