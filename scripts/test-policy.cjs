/**
 * Assessment policy & accessibility — schema, RLS, retake cap (CP-18).
 *   node scripts/test-policy.cjs
 */
const path = require("path");
process.loadEnvFile(path.join(__dirname, "..", ".env.local"));
const { Client } = require("pg");

const OWNER = "11111111-0000-0000-0000-000000000001";
const RECRUITER = "11111111-0000-0000-0000-000000000002";
const OUTSIDER = "11111111-0000-0000-0000-000000000003";

let passed = 0, failed = 0;
const assert = (c, l) => (c ? (passed++, console.log(`  PASS  ${l}`)) : (failed++, console.log(`  FAIL  ${l}`)));

// Mirror of grantRetakeAction's cap check.
const canGrantRetake = (attemptsAllowed, maxAttempts) => attemptsAllowed < maxAttempts;

async function asUser(c, id) {
  await c.query("select set_config('role','authenticated',true)");
  await c.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: id, role: "authenticated" })]);
}
async function asPg(c) {
  await c.query("select set_config('role','postgres',true)");
  await c.query("select set_config('request.jwt.claims','',true)");
}
async function expectBlocked(c, sql, params, label) {
  await c.query("savepoint sp");
  try {
    const r = await c.query(sql, params);
    await c.query("rollback to savepoint sp");
    assert(r.rowCount === 0, r.rowCount === 0 ? label : `${label} — wrote ${r.rowCount}`);
  } catch { await c.query("rollback to savepoint sp"); assert(true, label); }
}

async function main() {
  console.log("0 · Retake cap logic");
  assert(canGrantRetake(1, 3) === true, "grant allowed below the cap (1 < 3)");
  assert(canGrantRetake(3, 3) === false, "grant blocked at the cap (3 = 3)");

  const c = new Client({ connectionString: process.env.DIRECT_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    await c.query("begin");
    await c.query(
      `insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','o@pol.test',now(),now()),
              ($2,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','re@pol.test',now(),now()),
              ($3,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','out@pol.test',now(),now())
       on conflict (id) do nothing`,
      [OWNER, RECRUITER, OUTSIDER],
    );
    await asUser(c, OWNER);
    const org = (await c.query("select public.provision_organization('Policy Co','standard','Owner') as id")).rows[0].id;
    await asPg(c);
    const recRole = (await c.query("select id from public.roles where organization_id=$1 and key='recruiter'", [org])).rows[0].id;
    await c.query("insert into public.memberships (organization_id,user_id,role_id,status) values ($1,$2,$3,'active')", [org, RECRUITER, recRole]);
    const ownerMem = (await c.query("select id from public.memberships where organization_id=$1 and user_id=$2", [org, OWNER])).rows[0].id;

    await asUser(c, OUTSIDER);
    await c.query("select public.provision_organization('Rival','standard','R')");

    console.log("\n1 · Schema");
    await asPg(c);
    const tbl = (await c.query("select 1 from information_schema.tables where table_schema='public' and table_name='assessment_policies'")).rowCount;
    assert(tbl === 1, "assessment_policies table exists");

    console.log("\n2 · Owner (configure_ai_policy) sets the policy");
    await asUser(c, OWNER);
    const up = await c.query(
      "insert into public.assessment_policies (organization_id, default_proctoring_level, default_duration_minutes, default_attempts, max_attempts, updated_by) values ($1,'strict',45,1,2,$2) returning default_proctoring_level, max_attempts",
      [org, ownerMem],
    );
    assert(up.rows[0].default_proctoring_level === "strict" && up.rows[0].max_attempts === 2, "owner can write the policy");

    console.log("\n3 · Any member reads it; only admin writes");
    await asUser(c, RECRUITER);
    const recSees = (await c.query("select default_duration_minutes from public.assessment_policies where organization_id=$1", [org])).rows[0];
    assert(recSees && recSees.default_duration_minutes === 45, "recruiter can read the policy (to seed test defaults)");
    await expectBlocked(c, "update public.assessment_policies set max_attempts=9 where organization_id=$1", [org], "recruiter (no configure_ai_policy) cannot change the policy");

    console.log("\n4 · Constraints");
    await asUser(c, OWNER);
    await expectBlocked(c, "update public.assessment_policies set max_attempts=0 where organization_id=$1", [org], "max_attempts must be >= 1");

    console.log("\n5 · Cross-org isolation");
    await asUser(c, OUTSIDER);
    const outSees = (await c.query("select count(*)::int n from public.assessment_policies where organization_id=$1", [org])).rows[0].n;
    assert(outSees === 0, "another org cannot see the policy");

    await c.query("rollback");
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
  } catch (e) {
    await c.query("rollback").catch(() => {});
    console.error("ERROR:", e.message);
    process.exit(1);
  } finally { await c.end(); }
}

main();
