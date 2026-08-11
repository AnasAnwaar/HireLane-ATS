/**
 * Test Integrity Reports (spec §UC-5.3, CP-21) — the decision columns + enum,
 * the default state, RLS reads scoped to the org, and R2 (a decision never moves
 * the application stage).
 *   node scripts/test-integrity.cjs
 * One rolled-back transaction.
 */
const path = require("path");
process.loadEnvFile(path.join(__dirname, "..", ".env.local"));
const { Client } = require("pg");

const OWNER = "38383838-0000-0000-0000-000000000001";
const AUDITOR = "38383838-0000-0000-0000-000000000002"; // assessments.view
const OUTSIDER = "38383838-0000-0000-0000-000000000003";

let passed = 0,
  failed = 0;
const assert = (c, l) => (c ? (passed++, console.log(`  PASS  ${l}`)) : (failed++, console.log(`  FAIL  ${l}`)));

async function asUser(c, id) {
  await c.query("select set_config('role','authenticated',true)");
  await c.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: id, role: "authenticated" })]);
}
async function asPg(c) {
  await c.query("select set_config('role','postgres',true)");
  await c.query("select set_config('request.jwt.claims','',true)");
}

async function main() {
  const c = new Client({ connectionString: process.env.DIRECT_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    await c.query("begin");
    await c.query(
      `insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','o@it.test',now(),now()),
              ($2,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','au@it.test',now(),now()),
              ($3,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','out@it.test',now(),now())
       on conflict (id) do nothing`,
      [OWNER, AUDITOR, OUTSIDER],
    );
    await asUser(c, OWNER);
    const org = (await c.query("select public.provision_organization('Integrity Co','standard','Owner') as id")).rows[0].id;
    await asPg(c);
    const auRole = (await c.query("select id from public.roles where organization_id=$1 and key='auditor'", [org])).rows[0].id;
    await c.query("insert into public.memberships (organization_id,user_id,role_id,status) values ($1,$2,$3,'active')", [org, AUDITOR, auRole]);
    const ownerMem = (await c.query("select id from public.memberships where organization_id=$1 and user_id=$2", [org, OWNER])).rows[0].id;
    const opening = (await c.query("insert into public.job_openings (organization_id, created_by, title, status) values ($1,$2,'Dev','open') returning id", [org, ownerMem])).rows[0].id;
    const cand = (await c.query("insert into public.candidates (organization_id, full_name, email) values ($1,'Taker','t@it.test') returning id", [org])).rows[0].id;
    const appId = (await c.query("insert into public.applications (organization_id, candidate_id, job_opening_id, stage) values ($1,$2,$3,'applied') returning id", [org, cand, opening])).rows[0].id;
    const test = (await c.query("insert into public.tests (organization_id, job_opening_id, title, status, version) values ($1,$2,'Screening','published',1) returning id", [org, opening])).rows[0].id;
    const assignment = (await c.query("insert into public.test_assignments (organization_id, test_id, application_id, candidate_id) values ($1,$2,$3,$4) returning id", [org, test, appId, cand])).rows[0].id;
    const attempt = (await c.query("insert into public.test_attempts (organization_id, assignment_id, test_id, version, question_order, expires_at, max_score, status) values ($1,$2,$3,1,'[]'::jsonb, now()+interval '30 min', 10, 'submitted') returning id, integrity_decision", [org, assignment, test])).rows[0];

    await asUser(c, OUTSIDER);
    await c.query("select public.provision_organization('Rival','standard','R')");

    console.log("1 · Schema + default");
    assert(attempt.integrity_decision === "pending", "a new attempt starts 'pending' review");
    await asPg(c);
    const enumOk = (await c.query("select count(*)::int n from pg_type where typname='integrity_decision'")).rows[0].n;
    assert(enumOk === 1, "integrity_decision enum type exists");
    const cols = (await c.query("select count(*)::int n from information_schema.columns where table_schema='public' and table_name='test_attempts' and column_name in ('integrity_decision','integrity_reason','integrity_decided_by','integrity_decided_at')")).rows[0].n;
    assert(cols === 4, "test_attempts carries the decision columns");

    console.log("\n2 · Recording a decision (service-side) never moves the stage (R2)");
    await c.query(
      "update public.test_attempts set integrity_decision='rejected', integrity_reason='Repeated tab switches + IP change', integrity_decided_by=$2, integrity_decided_at=now() where id=$1",
      [attempt.id, ownerMem],
    );
    const dec = (await c.query("select integrity_decision, integrity_reason, integrity_decided_by from public.test_attempts where id=$1", [attempt.id])).rows[0];
    assert(dec.integrity_decision === "rejected" && dec.integrity_decided_by === ownerMem, "decision + reviewer persist");
    const stage = (await c.query("select stage from public.applications where id=$1", [appId])).rows[0].stage;
    assert(stage === "applied", "the application stage is untouched by the integrity decision (R2)");

    console.log("\n3 · RLS — assessments.view holders read the decision");
    await asUser(c, OWNER);
    assert((await c.query("select integrity_decision from public.test_attempts where id=$1", [attempt.id])).rows[0]?.integrity_decision === "rejected", "owner reads the decision");
    await asUser(c, AUDITOR);
    assert((await c.query("select count(*)::int n from public.test_attempts where id=$1", [attempt.id])).rows[0].n === 1, "auditor (assessments.view) reads the attempt");

    console.log("\n4 · Cross-org isolation");
    await asUser(c, OUTSIDER);
    assert((await c.query("select count(*)::int n from public.test_attempts where id=$1", [attempt.id])).rows[0].n === 0, "another org cannot see the attempt or its decision");

    await c.query("rollback");
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
  } catch (e) {
    await c.query("rollback").catch(() => {});
    console.error("ERROR:", e.message);
    process.exit(1);
  } finally {
    await c.end();
  }
}

main();
