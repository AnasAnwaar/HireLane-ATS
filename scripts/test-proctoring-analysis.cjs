/**
 * Test AI proctoring analysis (spec §UC-5.3, CP-20) — the proctoring_analyses
 * table + RLS, upsert-per-attempt, and the pure normalisation the engine applies
 * to the model's output.
 *   node scripts/test-proctoring-analysis.cjs
 * DB portion runs in one rolled-back transaction.
 */
const path = require("path");
process.loadEnvFile(path.join(__dirname, "..", ".env.local"));
const { Client } = require("pg");

const OWNER = "35353535-0000-0000-0000-000000000001"; // view_summary (owner short-circuits)
const AUDITOR = "35353535-0000-0000-0000-000000000002"; // view_summary, scope all
const OUTSIDER = "35353535-0000-0000-0000-000000000003";

let passed = 0,
  failed = 0;
const assert = (c, l) => (c ? (passed++, console.log(`  PASS  ${l}`)) : (failed++, console.log(`  FAIL  ${l}`)));

// ---- Mirror of the normalisation in proctoring-analysis.ts (lock behaviour) --
const LEVELS = ["clear", "low", "medium", "high"];
const clamp01 = (n) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);
const asLevel = (s) => (LEVELS.includes(s) ? s : "low");

async function asUser(c, id) {
  await c.query("select set_config('role','authenticated',true)");
  await c.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: id, role: "authenticated" })]);
}
async function asPg(c) {
  await c.query("select set_config('role','postgres',true)");
  await c.query("select set_config('request.jwt.claims','',true)");
}

async function main() {
  console.log("0 · Output normalisation (spec R4 — bounded confidences)");
  assert(clamp01(1.7) === 1 && clamp01(-0.2) === 0 && clamp01(NaN) === 0, "confidence clamps into 0..1");
  assert(asLevel("high") === "high" && asLevel("bogus") === "low", "integrity level falls back to 'low' when unknown");

  const c = new Client({ connectionString: process.env.DIRECT_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    await c.query("begin");
    await c.query(
      `insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','o@pa.test',now(),now()),
              ($2,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','au@pa.test',now(),now()),
              ($3,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','out@pa.test',now(),now())
       on conflict (id) do nothing`,
      [OWNER, AUDITOR, OUTSIDER],
    );
    await asUser(c, OWNER);
    const org = (await c.query("select public.provision_organization('Analyse Co','standard','Owner') as id")).rows[0].id;
    await asPg(c);
    const auRole = (await c.query("select id from public.roles where organization_id=$1 and key='auditor'", [org])).rows[0].id;
    await c.query("insert into public.memberships (organization_id,user_id,role_id,status) values ($1,$2,$3,'active')", [org, AUDITOR, auRole]);
    const opening = (await c.query("insert into public.job_openings (organization_id, created_by, title, status) values ($1,(select id from public.memberships where organization_id=$1 and user_id=$2),'Dev','open') returning id", [org, OWNER])).rows[0].id;
    const cand = (await c.query("insert into public.candidates (organization_id, full_name, email) values ($1,'Taker','t@pa.test') returning id", [org])).rows[0].id;
    const appId = (await c.query("insert into public.applications (organization_id, candidate_id, job_opening_id, stage) values ($1,$2,$3,'applied') returning id", [org, cand, opening])).rows[0].id;
    const test = (await c.query("insert into public.tests (organization_id, job_opening_id, title, status, version, proctoring_level) values ($1,$2,'Screening','published',1,'standard') returning id", [org, opening])).rows[0].id;
    const assignment = (await c.query("insert into public.test_assignments (organization_id, test_id, application_id, candidate_id) values ($1,$2,$3,$4) returning id", [org, test, appId, cand])).rows[0].id;
    const attempt = (await c.query("insert into public.test_attempts (organization_id, assignment_id, test_id, version, question_order, expires_at, max_score, status) values ($1,$2,$3,1,'[]'::jsonb, now()+interval '30 min', 10, 'submitted') returning id", [org, assignment, test])).rows[0].id;

    await asUser(c, OUTSIDER);
    await c.query("select public.provision_organization('Rival','standard','R')");

    console.log("\n1 · Schema");
    await asPg(c);
    const tbl = (await c.query("select count(*)::int n from information_schema.tables where table_schema='public' and table_name='proctoring_analyses'")).rows[0].n;
    assert(tbl === 1, "proctoring_analyses table exists");
    const enumOk = (await c.query("select count(*)::int n from pg_type where typname='integrity_level'")).rows[0].n;
    assert(enumOk === 1, "integrity_level enum type exists");

    console.log("\n2 · Service-role writes the verdict; no stage change (R2)");
    await c.query(
      `insert into public.proctoring_analyses (organization_id, attempt_id, integrity_level, confidence, summary, findings, model)
       values ($1,$2,'medium',0.72,'Two tab switches clustered near a hard question.',
               '[{"signal":"tab_switching","label":"Tab switching","severity":"medium","confidence":0.7,"detail":"Twice in 40s."}]'::jsonb,'gemini-flash-latest')`,
      [org, attempt],
    );
    const stored = (await c.query("select integrity_level, confidence from public.proctoring_analyses where attempt_id=$1", [attempt])).rows[0];
    assert(stored.integrity_level === "medium" && Number(stored.confidence) === 0.72, "verdict is stored with its confidence");
    const stage = (await c.query("select stage from public.applications where id=$1", [appId])).rows[0].stage;
    assert(stage === "applied", "generating a verdict never moves the application stage");

    console.log("\n3 · One verdict per attempt (upsert target)");
    await c.query("savepoint sp");
    let dup = false;
    try {
      await c.query("insert into public.proctoring_analyses (organization_id, attempt_id, integrity_level, summary, model) values ($1,$2,'low','x','m')", [org, attempt]);
    } catch {
      dup = true;
    }
    await c.query("rollback to savepoint sp");
    assert(dup, "attempt_id is unique — a re-analysis upserts, never duplicates");

    console.log("\n4 · RLS — summary holders read the verdict");
    await asUser(c, OWNER);
    assert((await c.query("select count(*)::int n from public.proctoring_analyses where attempt_id=$1", [attempt])).rows[0].n === 1, "owner (view_summary) reads the verdict");
    await asUser(c, AUDITOR);
    assert((await c.query("select count(*)::int n from public.proctoring_analyses where attempt_id=$1", [attempt])).rows[0].n === 1, "auditor (view_summary, scope all) reads the verdict");

    console.log("\n5 · RLS — a summary holder may (re)generate it");
    await asUser(c, AUDITOR);
    await c.query("savepoint sp2");
    let wrote = false;
    try {
      const r = await c.query("update public.proctoring_analyses set integrity_level='high' where attempt_id=$1", [attempt]);
      wrote = r.rowCount === 1;
    } catch {
      wrote = false;
    }
    await c.query("rollback to savepoint sp2");
    assert(wrote, "view_summary holder can write the verdict (read-side artifact)");

    console.log("\n6 · Cross-org isolation");
    await asUser(c, OUTSIDER);
    assert((await c.query("select count(*)::int n from public.proctoring_analyses where attempt_id=$1", [attempt])).rows[0].n === 0, "another org cannot see the verdict");

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
