/**
 * Test Video Interviews (spec §UC-7, CP-22) — scheduling RLS, the lifecycle, and
 * the BLIND scorecard rule (you see a peer's scorecard only once it's submitted
 * AND your own is submitted, unless you hold view_others_scorecards).
 *   node scripts/test-interviews.cjs
 * One rolled-back transaction.
 */
const path = require("path");
process.loadEnvFile(path.join(__dirname, "..", ".env.local"));
const { Client } = require("pg");

const OWNER = "39393939-0000-0000-0000-000000000001"; // owner → view_others via short-circuit
const RECRUITER_A = "39393939-0000-0000-0000-000000000002"; // submit_scorecard, no view_others
const RECRUITER_B = "39393939-0000-0000-0000-000000000003"; // submit_scorecard, no view_others
const AUDITOR = "39393939-0000-0000-0000-000000000004"; // view_schedule only

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
async function expectBlocked(c, sql, params, label) {
  await c.query("savepoint sp");
  try {
    const r = await c.query(sql, params);
    await c.query("rollback to savepoint sp");
    assert(r.rowCount === 0, r.rowCount === 0 ? label : `${label} — wrote ${r.rowCount}`);
  } catch {
    await c.query("rollback to savepoint sp");
    assert(true, label);
  }
}
async function countCards(c, iv, author) {
  return (await c.query("select count(*)::int n from public.interview_scorecards where interview_id=$1 and membership_id=$2", [iv, author])).rows[0].n;
}

async function main() {
  const c = new Client({ connectionString: process.env.DIRECT_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    await c.query("begin");
    await c.query(
      `insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
       select v.id::uuid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',v.id||'@iv.test',now(),now()
       from (values ($1),($2),($3),($4)) as v(id)
       on conflict (id) do nothing`,
      [OWNER, RECRUITER_A, RECRUITER_B, AUDITOR],
    );
    await asUser(c, OWNER);
    const org = (await c.query("select public.provision_organization('Interview Co','standard','Owner') as id")).rows[0].id;
    await asPg(c);
    const recRole = (await c.query("select id from public.roles where organization_id=$1 and key='recruiter'", [org])).rows[0].id;
    const auRole = (await c.query("select id from public.roles where organization_id=$1 and key='auditor'", [org])).rows[0].id;
    await c.query("insert into public.memberships (organization_id,user_id,role_id,status) values ($1,$2,$3,'active'),($1,$4,$3,'active'),($1,$5,$6,'active')", [org, RECRUITER_A, recRole, RECRUITER_B, AUDITOR, auRole]);
    const memA = (await c.query("select id from public.memberships where organization_id=$1 and user_id=$2", [org, RECRUITER_A])).rows[0].id;
    const memB = (await c.query("select id from public.memberships where organization_id=$1 and user_id=$2", [org, RECRUITER_B])).rows[0].id;
    const ownerMem = (await c.query("select id from public.memberships where organization_id=$1 and user_id=$2", [org, OWNER])).rows[0].id;
    const opening = (await c.query("insert into public.job_openings (organization_id, created_by, title, status) values ($1,$2,'Dev','open') returning id", [org, ownerMem])).rows[0].id;
    const cand = (await c.query("insert into public.candidates (organization_id, full_name, email) values ($1,'Taker','t@iv.test') returning id", [org])).rows[0].id;
    const appId = (await c.query("insert into public.applications (organization_id, candidate_id, job_opening_id, stage) values ($1,$2,$3,'applied') returning id", [org, cand, opening])).rows[0].id;

    console.log("1 · Schema + scheduling RLS");
    await asPg(c);
    const tbls = (await c.query("select count(*)::int n from information_schema.tables where table_schema='public' and table_name in ('interviews','interview_panelists','interview_scorecards')")).rows[0].n;
    assert(tbls === 3, "interviews / panelists / scorecards tables exist");

    await asUser(c, RECRUITER_A); // recruiter has interviews.schedule
    const iv = (await c.query("insert into public.interviews (organization_id, application_id, candidate_id, job_opening_id, scheduled_at) values ($1,$2,$3,$4, now()+interval '1 day') returning id, status", [org, appId, cand, opening])).rows[0];
    assert(iv.status === "scheduled", "recruiter can schedule an interview");
    await asUser(c, AUDITOR); // view_schedule only
    await expectBlocked(c, "insert into public.interviews (organization_id, application_id, candidate_id, scheduled_at) values ($1,$2,$3, now())", [org, appId, cand], "auditor (no schedule) cannot create interviews");

    console.log("\n2 · A scorecard is private to its author while unsubmitted");
    await asUser(c, RECRUITER_A);
    await c.query("insert into public.interview_scorecards (organization_id, interview_id, membership_id, recommendation, rating, submitted) values ($1,$2,$3,'yes',4,false)", [org, iv.id, memA]);
    assert((await countCards(c, iv.id, memA)) === 1, "A sees their own draft");
    await asUser(c, RECRUITER_B);
    assert((await countCards(c, iv.id, memA)) === 0, "B cannot see A's unsubmitted scorecard");
    await asUser(c, OWNER);
    assert((await countCards(c, iv.id, memA)) === 0, "even an owner cannot see an unsubmitted scorecard");

    console.log("\n3 · Blind after submit — a peer still can't see it until they submit theirs");
    await asUser(c, RECRUITER_A);
    await c.query("update public.interview_scorecards set submitted=true, submitted_at=now() where interview_id=$1 and membership_id=$2", [iv.id, memA]);
    await asUser(c, RECRUITER_B);
    assert((await countCards(c, iv.id, memA)) === 0, "B (own not submitted, no view_others) still can't see A's submitted card");
    await asUser(c, OWNER);
    assert((await countCards(c, iv.id, memA)) === 1, "owner (view_others_scorecards) sees A's submitted card without submitting");

    console.log("\n4 · Once B submits, the panel is mutually visible");
    await asUser(c, RECRUITER_B);
    await c.query("insert into public.interview_scorecards (organization_id, interview_id, membership_id, recommendation, submitted, submitted_at) values ($1,$2,$3,'no',true,now())", [org, iv.id, memB]);
    assert((await countCards(c, iv.id, memA)) === 1, "B now sees A's submitted card");
    await asUser(c, RECRUITER_A);
    assert((await countCards(c, iv.id, memB)) === 1, "A sees B's submitted card");

    console.log("\n5 · You may only write your OWN scorecard");
    await asUser(c, RECRUITER_A);
    await expectBlocked(c, "insert into public.interview_scorecards (organization_id, interview_id, membership_id, recommendation) values ($1,$2,$3,'yes')", [org, iv.id, ownerMem], "A cannot write a scorecard under someone else's identity");

    console.log("\n6 · Lifecycle");
    await c.query("update public.interviews set status='completed' where id=$1", [iv.id]);
    assert((await c.query("select status from public.interviews where id=$1", [iv.id])).rows[0].status === "completed", "interview can be marked completed");

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
