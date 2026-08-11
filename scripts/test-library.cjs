/**
 * Test the assessment library (reusable templates) — the template row shape,
 * the copy-into-opening semantics (independent, not linked), and the RLS gate
 * on authoring.
 *   node scripts/test-library.cjs
 * One rolled-back transaction.
 */
const path = require("path");
process.loadEnvFile(path.join(__dirname, "..", ".env.local"));
const { Client } = require("pg");

const OWNER = "37373737-0000-0000-0000-000000000001"; // owner short-circuits → author
const AUDITOR = "37373737-0000-0000-0000-000000000002"; // assessments.view only, not author
const OUTSIDER = "37373737-0000-0000-0000-000000000003";

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
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','o@lib.test',now(),now()),
              ($2,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','au@lib.test',now(),now()),
              ($3,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','out@lib.test',now(),now())
       on conflict (id) do nothing`,
      [OWNER, AUDITOR, OUTSIDER],
    );
    await asUser(c, OWNER);
    const org = (await c.query("select public.provision_organization('Library Co','standard','Owner') as id")).rows[0].id;
    await asPg(c);
    const auRole = (await c.query("select id from public.roles where organization_id=$1 and key='auditor'", [org])).rows[0].id;
    await c.query("insert into public.memberships (organization_id,user_id,role_id,status) values ($1,$2,$3,'active')", [org, AUDITOR, auRole]);
    const opening = (await c.query("insert into public.job_openings (organization_id, created_by, title, status) values ($1,(select id from public.memberships where organization_id=$1 and user_id=$2),'React Dev','open') returning id", [org, OWNER])).rows[0].id;

    await asUser(c, OUTSIDER);
    await c.query("select public.provision_organization('Rival','standard','R')");

    console.log("1 · Author creates a library template (no opening)");
    await asUser(c, OWNER);
    const tmpl = (await c.query(
      "insert into public.tests (organization_id, title, is_bank_template, job_opening_id) values ($1,'Frontend Fundamentals', true, null) returning id, is_bank_template, job_opening_id",
      [org],
    )).rows[0];
    assert(tmpl.is_bank_template === true && tmpl.job_opening_id === null, "template has is_bank_template=true and no opening");
    for (const [i, prompt] of [[0, "What is a closure?"], [1, "Explain the box model."]]) {
      await c.query(
        "insert into public.test_questions (organization_id, test_id, sort_order, type, prompt, rubric, marks) values ($1,$2,$3,'short_answer',$4,'key points',2)",
        [org, tmpl.id, i, prompt],
      );
    }
    assert((await c.query("select count(*)::int n from public.test_questions where test_id=$1", [tmpl.id])).rows[0].n === 2, "template carries its 2 questions");

    console.log("\n2 · Copy into an opening (independent, not linked)");
    const copy = (await c.query(
      "insert into public.tests (organization_id, title, is_bank_template, job_opening_id, status) values ($1,'Frontend Fundamentals', false, $2, 'draft') returning id",
      [org, opening],
    )).rows[0].id;
    // Copy the template's questions into the new opening-scoped test.
    await c.query(
      `insert into public.test_questions (organization_id, test_id, sort_order, type, prompt, rubric, marks)
       select organization_id, $2, sort_order, type, prompt, rubric, marks
       from public.test_questions where test_id=$1`,
      [tmpl.id, copy],
    );
    assert((await c.query("select count(*)::int n from public.test_questions where test_id=$1", [copy])).rows[0].n === 2, "the copy has its own 2 questions");
    const copyLink = (await c.query("select is_bank_template, job_opening_id from public.tests where id=$1", [copy])).rows[0];
    assert(copyLink.is_bank_template === false && copyLink.job_opening_id === opening, "the copy is opening-scoped, not a template");

    console.log("\n3 · Editing the copy never touches the template");
    await c.query("update public.test_questions set prompt='EDITED in the role' where test_id=$1 and sort_order=0", [copy]);
    const tmplPrompt = (await c.query("select prompt from public.test_questions where test_id=$1 and sort_order=0", [tmpl.id])).rows[0].prompt;
    assert(tmplPrompt === "What is a closure?", "the template question is unchanged after editing the copy");

    console.log("\n4 · RLS — a non-author cannot create tests");
    await asUser(c, AUDITOR);
    await expectBlocked(c, "insert into public.tests (organization_id, title, is_bank_template) values ($1,'Sneaky', true)", [org], "auditor (no create_manual/generate_ai/edit) cannot author");

    console.log("\n5 · Cross-org isolation");
    await asUser(c, OUTSIDER);
    assert((await c.query("select count(*)::int n from public.tests where id=$1", [tmpl.id])).rows[0].n === 0, "another org cannot see the template");

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
