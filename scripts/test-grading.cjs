/**
 * Scoring — grading columns, human confirmation, RLS & per-skill math (CP-17).
 *   node scripts/test-grading.cjs
 */
const path = require("path");
process.loadEnvFile(path.join(__dirname, "..", ".env.local"));
const { Client } = require("pg");

const OWNER = "22222222-0000-0000-0000-000000000001";
const AUDITOR = "22222222-0000-0000-0000-000000000002";
const OUTSIDER = "22222222-0000-0000-0000-000000000003";

let passed = 0, failed = 0;
const assert = (c, l) => (c ? (passed++, console.log(`  PASS  ${l}`)) : (failed++, console.log(`  FAIL  ${l}`)));

// Mirror of the results page: total = sum of confirmed awarded; per-skill group.
function summarise(results) {
  const total = results.reduce((s, r) => s + (r.confirmed ? r.awarded : 0), 0);
  const bySkill = new Map();
  for (const r of results) {
    const k = r.skill || "General";
    const cur = bySkill.get(k) || { awarded: 0, max: 0 };
    cur.max += r.marks;
    if (r.confirmed) cur.awarded += r.awarded;
    bySkill.set(k, cur);
  }
  return { total, bySkill };
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
  } catch { await c.query("rollback to savepoint sp"); assert(true, label); }
}

async function main() {
  console.log("0 · Total + per-skill math");
  const r = summarise([
    { skill: "React", marks: 2, awarded: 2, confirmed: true },
    { skill: "React", marks: 3, awarded: 1, confirmed: true },
    { skill: "TypeScript", marks: 5, awarded: 4, confirmed: true },
    { skill: "TypeScript", marks: 5, awarded: 0, confirmed: false }, // ungraded → excluded
  ]);
  assert(r.total === 7, "total counts only confirmed marks (2+1+4 = 7)");
  assert(r.bySkill.get("React").awarded === 3 && r.bySkill.get("React").max === 5, "React skill = 3/5");
  assert(r.bySkill.get("TypeScript").awarded === 4 && r.bySkill.get("TypeScript").max === 10, "TypeScript = 4/10 (ungraded excluded from awarded)");

  const c = new Client({ connectionString: process.env.DIRECT_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    await c.query("begin");
    await c.query(
      `insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','o@gr.test',now(),now()),
              ($2,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','au@gr.test',now(),now()),
              ($3,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','out@gr.test',now(),now())
       on conflict (id) do nothing`,
      [OWNER, AUDITOR, OUTSIDER],
    );
    await asUser(c, OWNER);
    const org = (await c.query("select public.provision_organization('Grade Co','standard','Owner') as id")).rows[0].id;
    await asPg(c);
    const auRole = (await c.query("select id from public.roles where organization_id=$1 and key='auditor'", [org])).rows[0].id;
    await c.query("insert into public.memberships (organization_id,user_id,role_id,status) values ($1,$2,$3,'active')", [org, AUDITOR, auRole]);
    const ownerMem = (await c.query("select id from public.memberships where organization_id=$1 and user_id=$2", [org, OWNER])).rows[0].id;
    const opening = (await c.query("insert into public.job_openings (organization_id, created_by, title, status) values ($1,$2,'Dev','open') returning id", [org, ownerMem])).rows[0].id;
    const cand = (await c.query("insert into public.candidates (organization_id, full_name, email) values ($1,'T','t@gr.test') returning id", [org])).rows[0].id;
    const app = (await c.query("insert into public.applications (organization_id, candidate_id, job_opening_id, stage) values ($1,$2,$3,'applied') returning id", [org, cand, opening])).rows[0].id;
    const test = (await c.query("insert into public.tests (organization_id, job_opening_id, title, status, version) values ($1,$2,'T','published',1) returning id", [org, opening])).rows[0].id;
    await c.query("insert into public.test_versions (organization_id, test_id, version, snapshot) values ($1,$2,1,'{}'::jsonb)", [org, test]);
    const assign = (await c.query("insert into public.test_assignments (organization_id, test_id, application_id, candidate_id) values ($1,$2,$3,$4) returning id", [org, test, app, cand])).rows[0].id;
    const attempt = (await c.query("insert into public.test_attempts (organization_id, assignment_id, test_id, version, expires_at, max_score) values ($1,$2,$3,1, now()+interval '1 hour', 7) returning id", [org, assign, test])).rows[0].id;
    // auto answer (confirmed by construction) + written answer (unconfirmed)
    const autoAns = (await c.query("insert into public.test_answers (organization_id, attempt_id, question_id, response, awarded_marks, is_correct, confirmed) values ($1,$2,gen_random_uuid(),'{}'::jsonb,2,true,true) returning id", [org, attempt])).rows[0].id;
    const writtenAns = (await c.query("insert into public.test_answers (organization_id, attempt_id, question_id, response, ai_suggested_marks, ai_rationale) values ($1,$2,gen_random_uuid(),$3::jsonb,4,'Covers hydration well.') returning id, confirmed", [org, attempt, JSON.stringify({ text: "..." })])).rows[0];

    console.log("\n1 · Schema");
    await asPg(c);
    const cols = (await c.query("select count(*)::int n from information_schema.columns where table_schema='public' and table_name='test_answers' and column_name in ('ai_suggested_marks','ai_rationale','confirmed','graded_by','graded_at')")).rows[0].n;
    assert(cols === 5, "grading columns exist on test_answers");
    assert(writtenAns.confirmed === false, "written answer starts unconfirmed");

    console.log("\n2 · AI suggestion stored, not counted until confirmed");
    const beforeTotal = (await c.query("select coalesce(sum(awarded_marks),0)::numeric as t from public.test_answers where attempt_id=$1 and confirmed", [attempt])).rows[0].t;
    assert(Number(beforeTotal) === 2, "only the auto mark counts before confirmation (=2)");

    console.log("\n3 · HR confirms a grade (assessments.confirm_grades)");
    await asUser(c, OWNER);
    const conf = await c.query("update public.test_answers set awarded_marks=4, confirmed=true, graded_by=$2, graded_at=now() where id=$1 returning confirmed, awarded_marks", [writtenAns.id, ownerMem]);
    assert(conf.rows[0].confirmed === true && Number(conf.rows[0].awarded_marks) === 4, "owner can confirm a written grade (4 marks)");
    const afterTotal = (await c.query("select coalesce(sum(awarded_marks),0)::numeric as t from public.test_answers where attempt_id=$1 and confirmed", [attempt])).rows[0].t;
    assert(Number(afterTotal) === 6, "confirmed written mark now counts (2+4 = 6)");

    console.log("\n4 · RLS write gate");
    await asUser(c, AUDITOR); // no confirm_grades
    await expectBlocked(c, "update public.test_answers set awarded_marks=0 where id=$1", [autoAns], "auditor (no confirm_grades) cannot change grades");

    console.log("\n5 · Cross-org isolation");
    await asUser(c, OUTSIDER);
    await c.query("select public.provision_organization('Rival','standard','R')");
    const outSees = (await c.query("select count(*)::int n from public.test_answers where attempt_id=$1", [attempt])).rows[0].n;
    assert(outSees === 0, "another org cannot read the answers");

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
