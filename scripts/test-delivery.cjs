/**
 * Test assignment & delivery — RLS, version pinning, key-stripping (R2) and
 * auto-scoring (CP-16).
 *   node scripts/test-delivery.cjs
 * DB portion in one rolled-back transaction; pure portions check the shared
 * scoring / key-stripping logic.
 */
const path = require("path");
process.loadEnvFile(path.join(__dirname, "..", ".env.local"));
const { Client } = require("pg");

const OWNER = "33333333-0000-0000-0000-000000000001";
const AUDITOR = "33333333-0000-0000-0000-000000000002";
const OUTSIDER = "33333333-0000-0000-0000-000000000003";

let passed = 0,
  failed = 0;
const assert = (c, l) => (c ? (passed++, console.log(`  PASS  ${l}`)) : (failed++, console.log(`  FAIL  ${l}`)));

// ---- Mirrors of src/server/assessments/delivery.ts (lock the behaviour) -----
function toDeliveryQuestions(questions, order, optionOrders) {
  const byId = new Map(questions.map((q) => [q.id, q]));
  return order
    .map((qid) => byId.get(qid))
    .filter(Boolean)
    .map((q) => {
      const ord = optionOrders[q.id];
      const options = ord ? ord.map((oid) => q.options.find((o) => o.id === oid)) : q.options;
      return { id: q.id, type: q.type, prompt: q.prompt, marks: q.marks, options: options.map((o) => ({ id: o.id, text: o.text })) };
    });
}
function scoreChoice(q, selected) {
  const key = new Set(q.correct_answers);
  const picked = new Set(selected);
  if (q.type === "single_choice" || q.type === "true_false") {
    const correct = picked.size === 1 && key.has([...picked][0]);
    return { marks: correct ? q.marks : 0, correct };
  }
  let right = 0, wrong = 0;
  for (const id of picked) { if (key.has(id)) right++; else wrong++; }
  const ratio = key.size ? Math.max(0, (right - wrong) / key.size) : 0;
  return { marks: Math.round(ratio * q.marks * 100) / 100, correct: right === key.size && wrong === 0 };
}

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

async function main() {
  console.log("0 · Key-stripping (spec R2) + auto-scoring");
  const q = { id: "q1", type: "single_choice", prompt: "2+2?", marks: 2, correct_answers: ["b"], rubric: "n/a", options: [{ id: "a", text: "3" }, { id: "b", text: "4" }] };
  const delivered = toDeliveryQuestions([q], ["q1"], {})[0];
  assert(!("correct_answers" in delivered) && !("rubric" in delivered), "delivery payload omits correct_answers and rubric");
  assert(delivered.options.length === 2 && !("correct" in delivered.options[0]), "options carry no correctness flag");
  assert(scoreChoice(q, ["b"]).marks === 2, "single-choice correct → full marks");
  assert(scoreChoice(q, ["a"]).marks === 0, "single-choice wrong → 0");
  const mq = { id: "m", type: "multiple_choice", marks: 4, correct_answers: ["a", "b"] };
  assert(scoreChoice(mq, ["a", "b"]).marks === 4, "multi all-correct → full marks");
  assert(scoreChoice(mq, ["a"]).marks === 2, "multi half-correct → partial (2/4)");
  assert(scoreChoice(mq, ["a", "b", "c"]).marks === 2, "multi with a wrong pick → penalised (2/4)");

  const c = new Client({ connectionString: process.env.DIRECT_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    await c.query("begin");
    await c.query(
      `insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','o@dl.test',now(),now()),
              ($2,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','au@dl.test',now(),now()),
              ($3,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','out@dl.test',now(),now())
       on conflict (id) do nothing`,
      [OWNER, AUDITOR, OUTSIDER],
    );
    await asUser(c, OWNER);
    const org = (await c.query("select public.provision_organization('Deliver Co','standard','Owner') as id")).rows[0].id;
    await asPg(c);
    const auRole = (await c.query("select id from public.roles where organization_id=$1 and key='auditor'", [org])).rows[0].id;
    await c.query("insert into public.memberships (organization_id,user_id,role_id,status) values ($1,$2,$3,'active')", [org, AUDITOR, auRole]);
    const ownerMem = (await c.query("select id from public.memberships where organization_id=$1 and user_id=$2", [org, OWNER])).rows[0].id;
    const opening = (await c.query("insert into public.job_openings (organization_id, created_by, title, status) values ($1,$2,'React Dev','open') returning id", [org, ownerMem])).rows[0].id;
    const cand = (await c.query("insert into public.candidates (organization_id, full_name, email) values ($1,'Taker','t@dl.test') returning id", [org])).rows[0].id;
    const appId = (await c.query("insert into public.applications (organization_id, candidate_id, job_opening_id, stage) values ($1,$2,$3,'applied') returning id", [org, cand, opening])).rows[0].id;
    const test = (await c.query("insert into public.tests (organization_id, job_opening_id, title, status, version, duration_minutes) values ($1,$2,'Screening','published',1,30) returning id", [org, opening])).rows[0].id;
    await c.query("insert into public.test_versions (organization_id, test_id, version, snapshot) values ($1,$2,1,$3::jsonb)", [org, test, JSON.stringify({ test: { title: "Screening" }, questions: [q] })]);

    await asUser(c, OUTSIDER);
    await c.query("select public.provision_organization('Rival','standard','R')");

    console.log("\n1 · Schema");
    await asPg(c);
    const tbls = (await c.query("select count(*)::int n from information_schema.tables where table_schema='public' and table_name in ('test_assignments','test_attempts','test_answers')")).rows[0].n;
    assert(tbls === 3, "test_assignments / test_attempts / test_answers exist");

    console.log("\n2 · HR assigns (assessments.assign)");
    await asUser(c, OWNER);
    const assignment = (await c.query("insert into public.test_assignments (organization_id, test_id, application_id, candidate_id, deadline) values ($1,$2,$3,$4, now()+interval '2 days') returning id, status", [org, test, appId, cand])).rows[0];
    assert(assignment.status === "assigned", "owner can assign a test");

    console.log("\n3 · Attempt pins the published version (spec R3)");
    // (Candidate writes go via the service role; simulate that with postgres.)
    await asPg(c);
    const attempt = (await c.query("insert into public.test_attempts (organization_id, assignment_id, test_id, version, question_order, expires_at, max_score) values ($1,$2,$3,1,$4::jsonb, now()+interval '30 min', 2) returning id, version", [org, assignment.id, test, JSON.stringify(["q1"])])).rows[0];
    assert(attempt.version === 1, "attempt records the version taken");
    const snapVer = (await c.query("select 1 from public.test_versions where test_id=$1 and version=$2", [test, attempt.version])).rowCount;
    assert(snapVer === 1, "the pinned version snapshot exists to score against");

    console.log("\n4 · RLS — auditor may view but not assign");
    await asUser(c, AUDITOR);
    const auSees = (await c.query("select count(*)::int n from public.test_assignments where id=$1", [assignment.id])).rows[0].n;
    assert(auSees === 1, "auditor (assessments.view) can read assignments");
    await expectBlocked(c, "insert into public.test_assignments (organization_id, test_id, application_id, candidate_id) values ($1,$2,$3,$4)", [org, test, appId, cand], "auditor (no assessments.assign) cannot assign");

    console.log("\n5 · Answer reads gated on view_answers");
    await asPg(c);
    await c.query("insert into public.test_answers (organization_id, attempt_id, question_id, response) values ($1,$2,gen_random_uuid(), $3::jsonb)", [org, attempt.id, JSON.stringify({ selected: ["b"] })]);
    await asUser(c, AUDITOR); // auditor lacks assessments.view_answers
    const auAns = (await c.query("select count(*)::int n from public.test_answers where attempt_id=$1", [attempt.id])).rows[0].n;
    assert(auAns === 0, "auditor (no view_answers) cannot read candidate answers");

    console.log("\n6 · Cross-org isolation");
    await asUser(c, OUTSIDER);
    const outSees = (await c.query("select count(*)::int n from public.test_assignments where id=$1", [assignment.id])).rows[0].n;
    assert(outSees === 0, "another org cannot see the assignment");

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
