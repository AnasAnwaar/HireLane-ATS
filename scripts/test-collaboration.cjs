/**
 * Test Notes & Collaboration (spec §UC-6, CP-23) — note threading, notification
 * recipient isolation, blind candidate scorecards, and conflict declarations.
 *   node scripts/test-collaboration.cjs
 * One rolled-back transaction.
 */
const path = require("path");
process.loadEnvFile(path.join(__dirname, "..", ".env.local"));
const { Client } = require("pg");

const OWNER = "40404040-0000-0000-0000-000000000001"; // sees all (short-circuit)
const REC = "40404040-0000-0000-0000-000000000002"; // recruiter: submit_scorecard etc.
const OUT = "40404040-0000-0000-0000-000000000003";

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
async function blocked(c, sql, params, label) {
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

async function main() {
  const c = new Client({ connectionString: process.env.DIRECT_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    await c.query("begin");
    await c.query(
      `insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
       select v.id::uuid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',v.id||'@co.test',now(),now()
       from (values ($1),($2),($3)) v(id) on conflict (id) do nothing`,
      [OWNER, REC, OUT],
    );
    await asUser(c, OWNER);
    const org = (await c.query("select public.provision_organization('Collab Co','standard','Owner') as id")).rows[0].id;
    await asPg(c);
    const recRole = (await c.query("select id from public.roles where organization_id=$1 and key='recruiter'", [org])).rows[0].id;
    await c.query("insert into public.memberships (organization_id,user_id,role_id,status) values ($1,$2,$3,'active')", [org, REC, recRole]);
    const ownerMem = (await c.query("select id from public.memberships where organization_id=$1 and user_id=$2", [org, OWNER])).rows[0].id;
    const recMem = (await c.query("select id from public.memberships where organization_id=$1 and user_id=$2", [org, REC])).rows[0].id;
    const cand = (await c.query("insert into public.candidates (organization_id, full_name, email) values ($1,'Taker','t@co.test') returning id", [org])).rows[0].id;

    await asUser(c, OUT);
    await c.query("select public.provision_organization('Rival','standard','R')");

    console.log("1 · Threaded notes");
    await asPg(c);
    const note = (await c.query("insert into public.candidate_notes (organization_id, candidate_id, author_membership_id, body, visibility) values ($1,$2,$3,'Top pick','team') returning id", [org, cand, ownerMem])).rows[0].id;
    const reply = (await c.query("insert into public.candidate_notes (organization_id, candidate_id, author_membership_id, body, visibility, parent_id) values ($1,$2,$3,'Agree','team',$4) returning id, parent_id", [org, cand, recMem, note])).rows[0];
    assert(reply.parent_id === note, "a reply stores its parent_id");

    console.log("\n2 · Notifications are recipient-scoped");
    await c.query("insert into public.notifications (organization_id, recipient_membership_id, actor_membership_id, type, candidate_id) values ($1,$2,$3,'mention',$4)", [org, ownerMem, recMem, cand]);
    await asUser(c, OWNER);
    assert((await c.query("select count(*)::int n from public.notifications where candidate_id=$1", [cand])).rows[0].n === 1, "recipient (owner) sees their notification");
    await asUser(c, REC);
    assert((await c.query("select count(*)::int n from public.notifications where candidate_id=$1", [cand])).rows[0].n === 0, "a non-recipient never sees it");

    console.log("\n3 · Candidate scorecards are blind until submitted");
    await asUser(c, REC); // recruiter has interviews.submit_scorecard
    await c.query("insert into public.candidate_scorecards (organization_id, candidate_id, author_membership_id, overall, recommendation, submitted) values ($1,$2,$3,4,'yes',false)", [org, cand, recMem]);
    assert((await c.query("select count(*)::int n from public.candidate_scorecards where candidate_id=$1", [cand])).rows[0].n === 1, "author sees their own draft");
    await asUser(c, OWNER);
    assert((await c.query("select count(*)::int n from public.candidate_scorecards where candidate_id=$1", [cand])).rows[0].n === 0, "others (even owner) can't see an unsubmitted scorecard");
    await asUser(c, REC);
    await c.query("update public.candidate_scorecards set submitted=true, submitted_at=now() where candidate_id=$1 and author_membership_id=$2", [cand, recMem]);
    await asUser(c, OWNER);
    assert((await c.query("select count(*)::int n from public.candidate_scorecards where candidate_id=$1", [cand])).rows[0].n === 1, "once submitted, it's visible to the panel");

    console.log("\n4 · You may only write your OWN scorecard");
    await asUser(c, REC);
    await blocked(c, "insert into public.candidate_scorecards (organization_id, candidate_id, author_membership_id, overall) values ($1,$2,$3,3)", [org, cand, ownerMem], "recruiter cannot write a scorecard under another member's id");

    console.log("\n5 · Conflict declarations — visible to profile viewers, write-your-own");
    await c.query("insert into public.conflict_declarations (organization_id, candidate_id, membership_id, reason) values ($1,$2,$3,'former colleague')", [org, cand, recMem]);
    await asUser(c, OWNER);
    assert((await c.query("select count(*)::int n from public.conflict_declarations where candidate_id=$1", [cand])).rows[0].n === 1, "a profile viewer sees declared conflicts");
    // Recruiter declaring on the owner's behalf (owner has none yet) → blocked by RLS.
    await asUser(c, REC);
    await blocked(c, "insert into public.conflict_declarations (organization_id, candidate_id, membership_id, reason) values ($1,$2,$3,'x')", [org, cand, ownerMem], "cannot declare a conflict under another member's id");

    console.log("\n6 · Cross-org isolation");
    await asUser(c, OUT);
    assert((await c.query("select count(*)::int n from public.candidate_scorecards where candidate_id=$1", [cand])).rows[0].n === 0, "another org sees none of it");

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
