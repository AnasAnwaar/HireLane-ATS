/**
 * Test authoring — schema, versioning & RLS (CP-15).
 *   node scripts/test-assessments.cjs
 * One transaction, always rolled back. (AI generation is smoked separately in
 * scripts/test-assessments-smoke.cjs.)
 */
const path = require("path");
process.loadEnvFile(path.join(__dirname, "..", ".env.local"));
const { Client } = require("pg");

const OWNER = "44444444-0000-0000-0000-000000000001";
const AUDITOR = "44444444-0000-0000-0000-000000000002";
const TEAMLEAD = "44444444-0000-0000-0000-000000000003";
const OUTSIDER = "44444444-0000-0000-0000-000000000004";

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

async function main() {
  const c = new Client({ connectionString: process.env.DIRECT_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    await c.query("begin");
    await c.query(
      `insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','o@as.test',now(),now()),
              ($2,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','au@as.test',now(),now()),
              ($3,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','tl@as.test',now(),now()),
              ($4,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','out@as.test',now(),now())
       on conflict (id) do nothing`,
      [OWNER, AUDITOR, TEAMLEAD, OUTSIDER],
    );

    await asUser(c, OWNER);
    const org = (await c.query("select public.provision_organization('Assess Co','standard','Owner') as id")).rows[0].id;

    await asPg(c);
    for (const [uid, key] of [[AUDITOR, "auditor"], [TEAMLEAD, "team_lead"]]) {
      const role = (await c.query("select id from public.roles where organization_id=$1 and key=$2", [org, key])).rows[0].id;
      await c.query("insert into public.memberships (organization_id,user_id,role_id,status) values ($1,$2,$3,'active')", [org, uid, role]);
    }
    const ownerMem = (await c.query("select id from public.memberships where organization_id=$1 and user_id=$2", [org, OWNER])).rows[0].id;
    const opening = (await c.query("insert into public.job_openings (organization_id, created_by, title, status) values ($1,$2,'Senior React Developer','open') returning id", [org, ownerMem])).rows[0].id;

    await asUser(c, OUTSIDER);
    await c.query("select public.provision_organization('Rival Co','standard','Rival')");

    console.log("1 · Schema");
    await asPg(c);
    const tbls = (await c.query("select count(*)::int n from information_schema.tables where table_schema='public' and table_name in ('tests','test_questions','test_versions','question_bank')")).rows[0].n;
    assert(tbls === 4, "tests / test_questions / test_versions / question_bank tables exist");
    const enums = (await c.query("select count(*)::int n from pg_type where typname in ('question_type','test_status','question_difficulty','proctoring_level')")).rows[0].n;
    assert(enums === 4, "question_type / test_status / question_difficulty / proctoring_level enums exist");

    console.log("\n2 · Owner authors a test");
    await asUser(c, OWNER);
    const test = (await c.query(
      "insert into public.tests (organization_id, job_opening_id, title, created_by) values ($1,$2,'Frontend screening',$3) returning id, status, version",
      [org, opening, ownerMem],
    )).rows[0];
    assert(test.status === "draft" && test.version === 0, "new test starts as draft v0");
    const q1 = (await c.query(
      `insert into public.test_questions (organization_id, test_id, sort_order, type, prompt, options, correct_answers, marks)
       values ($1,$2,0,'single_choice','What does useMemo do?', $3::jsonb, $4::jsonb, 2) returning id`,
      [org, test.id, JSON.stringify([{ id: "a", text: "Memoises a value" }, { id: "b", text: "Fetches data" }]), JSON.stringify(["a"])],
    )).rows[0].id;
    assert(!!q1, "owner can add a question");

    console.log("\n3 · Publishing snapshots a version (spec R3)");
    await c.query("insert into public.test_versions (organization_id, test_id, version, snapshot, published_by) values ($1,$2,1,$3::jsonb,$4)", [org, test.id, JSON.stringify({ test, questions: [{ id: q1 }] }), ownerMem]);
    await c.query("update public.tests set status='published', version=1, published_at=now(), has_unpublished_changes=false where id=$1", [test.id]);
    // edit after publish, then re-publish as v2
    await c.query("update public.test_questions set prompt='What does useMemo return?' where id=$1", [q1]);
    await c.query("update public.tests set has_unpublished_changes=true where id=$1", [test.id]);
    await c.query("insert into public.test_versions (organization_id, test_id, version, snapshot, published_by) values ($1,$2,2,$3::jsonb,$4)", [org, test.id, JSON.stringify({ v: 2 }), ownerMem]);
    await c.query("update public.tests set version=2, has_unpublished_changes=false where id=$1", [test.id]);
    const vers = (await c.query("select count(*)::int n from public.test_versions where test_id=$1", [test.id])).rows[0].n;
    assert(vers === 2, "each publish appends an immutable version snapshot (2 versions)");
    const curVer = (await c.query("select version from public.tests where id=$1", [test.id])).rows[0].version;
    assert(curVer === 2, "test tracks the latest published version");
    await expectBlocked(c, "insert into public.test_versions (organization_id, test_id, version, snapshot) values ($1,$2,2,'{}'::jsonb)", [org, test.id], "duplicate version number is rejected");

    console.log("\n4 · RLS write gate");
    await asUser(c, AUDITOR); // view only
    const auSees = (await c.query("select count(*)::int n from public.tests where id=$1", [test.id])).rows[0].n;
    assert(auSees === 1, "auditor (assessments.view) can read tests");
    await expectBlocked(c, "insert into public.test_questions (organization_id, test_id, type, prompt) values ($1,$2,'true_false','x')", [org, test.id], "auditor (no create/edit) cannot add a question");
    await expectBlocked(c, "update public.tests set title='hacked' where id=$1", [test.id], "auditor cannot edit a test");

    console.log("\n5 · Question bank gate");
    await asUser(c, OWNER);
    const bank = (await c.query("insert into public.question_bank (organization_id, type, prompt) values ($1,'short_answer','Explain hydration') returning id", [org])).rows[0].id;
    assert(!!bank, "owner (manage_bank) can add to the question bank");
    await asUser(c, TEAMLEAD); // author but no manage_bank
    await expectBlocked(c, "insert into public.question_bank (organization_id, type, prompt) values ($1,'short_answer','y')", [org], "team_lead (no manage_bank) cannot write the bank");

    console.log("\n6 · Cross-org isolation");
    await asUser(c, OUTSIDER);
    const outSees = (await c.query("select count(*)::int n from public.tests where id=$1", [test.id])).rows[0].n;
    assert(outSees === 0, "another org cannot see the test");

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
