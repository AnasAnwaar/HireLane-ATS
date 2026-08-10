/**
 * AI Screening — storage, explainability payloads, RLS & guardrails (CP-13).
 *   node scripts/test-screening.cjs
 * One transaction, always rolled back.
 *
 * The Gemini call itself is exercised by scripts/test-screening-smoke.cjs; here
 * we prove the database contract: who can write/read a screening, that the
 * evidence payloads round-trip, and that scoring NEVER touches application.stage
 * (spec R2 — the agent recommends, humans decide).
 */
const path = require("path");
process.loadEnvFile(path.join(__dirname, "..", ".env.local"));
const { Client } = require("pg");

const OWNER = "66666666-0000-0000-0000-000000000001";
const TEAMLEAD = "66666666-0000-0000-0000-000000000002";
const AUDITOR = "66666666-0000-0000-0000-000000000003";
const OUTSIDER = "66666666-0000-0000-0000-000000000004";

let passed = 0,
  failed = 0;
const assert = (c, l) => (c ? (passed++, console.log(`  PASS  ${l}`)) : (failed++, console.log(`  FAIL  ${l}`)));

async function asUser(c, id) {
  await c.query("select set_config('role','authenticated',true)");
  await c.query("select set_config('request.jwt.claims',$1,true)", [
    JSON.stringify({ sub: id, role: "authenticated" }),
  ]);
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
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','o@scr.test',now(),now()),
              ($2,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','tl@scr.test',now(),now()),
              ($3,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','au@scr.test',now(),now()),
              ($4,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','out@scr.test',now(),now())
       on conflict (id) do nothing`,
      [OWNER, TEAMLEAD, AUDITOR, OUTSIDER],
    );

    await asUser(c, OWNER);
    const org = (await c.query("select public.provision_organization('Screen Co','standard','Owner') as id")).rows[0].id;

    await asPg(c);
    for (const [uid, key] of [[TEAMLEAD, "team_lead"], [AUDITOR, "auditor"]]) {
      const role = (await c.query("select id from public.roles where organization_id=$1 and key=$2", [org, key])).rows[0].id;
      await c.query("insert into public.memberships (organization_id,user_id,role_id,status) values ($1,$2,$3,'active')", [org, uid, role]);
    }
    const ownerMem = (
      await c.query("select id from public.memberships where organization_id=$1 and user_id=$2", [org, OWNER])
    ).rows[0].id;

    // Opening + candidate + application.
    const opening = (
      await c.query(
        "insert into public.job_openings (organization_id, created_by, title, status) values ($1,$2,'Senior React Developer','open') returning id",
        [org, ownerMem],
      )
    ).rows[0].id;
    const cand = (
      await c.query(
        "insert into public.candidates (organization_id, full_name, email, headline, years_experience, skills) values ($1,'Test Person','tp@scr.test','Senior React Engineer',6,ARRAY['React','TypeScript']) returning id",
        [org],
      )
    ).rows[0].id;
    const appId = (
      await c.query(
        "insert into public.applications (organization_id, candidate_id, job_opening_id, stage, source) values ($1,$2,$3,'applied','linkedin') returning id",
        [org, cand, opening],
      )
    ).rows[0].id;

    // Outsider's own org.
    await asUser(c, OUTSIDER);
    await c.query("select public.provision_organization('Rival Co','standard','Rival')");

    console.log("1 · Schema");
    await asPg(c);
    const tbl = (await c.query("select 1 from information_schema.tables where table_schema='public' and table_name='application_screenings'")).rowCount;
    assert(tbl === 1, "application_screenings table exists");
    const enums = (await c.query("select count(*)::int n from pg_type where typname in ('screening_status','screening_recommendation')")).rows[0].n;
    assert(enums === 2, "screening_status + screening_recommendation enums exist");

    console.log("\n2 · Owner writes a screening (rerank permission)");
    await asUser(c, OWNER);
    const mustHaves = JSON.stringify([
      { requirement: "React", status: "matched", evidence: "Skill: React; Headline: Senior React Engineer" },
      { requirement: "TypeScript", status: "matched", evidence: "Skill: TypeScript" },
    ]);
    const highlights = JSON.stringify([{ text: "6 years of React", evidence: "years_experience: 6" }]);
    const ins = await c.query(
      `insert into public.application_screenings
         (organization_id, application_id, job_opening_id, status, score, recommendation, summary,
          must_haves, highlights, model, scored_by)
       values ($1,$2,$3,'scored',88,'strong_fit','Strong React fit.', $4::jsonb, $5::jsonb, 'gemini-flash-latest', $6)
       returning id, score, recommendation`,
      [org, appId, opening, mustHaves, highlights, ownerMem],
    );
    assert(ins.rowCount === 1 && ins.rows[0].score === 88, "owner can write a screening (score 88)");
    assert(ins.rows[0].recommendation === "strong_fit", "recommendation persisted");

    console.log("\n3 · Explainability payloads round-trip (spec R1)");
    const back = (await c.query("select must_haves, highlights from public.application_screenings where application_id=$1", [appId])).rows[0];
    assert(Array.isArray(back.must_haves) && back.must_haves[0].status === "matched", "must-have coverage + evidence stored as jsonb");
    assert(back.highlights[0].evidence === "years_experience: 6", "highlight cites its evidence");

    console.log("\n4 · Agent never changes application.stage (spec R2)");
    const stage = (await c.query("select stage from public.applications where id=$1", [appId])).rows[0].stage;
    assert(stage === "applied", "application stage is untouched by scoring (no auto-reject/advance)");

    console.log("\n5 · view_score gate");
    await asUser(c, AUDITOR); // auditor lacks screening.view_score
    const auSees = (await c.query("select count(*)::int n from public.application_screenings where application_id=$1", [appId])).rows[0].n;
    assert(auSees === 0, "auditor (no view_score) cannot see the screening");

    console.log("\n6 · write gate");
    await asUser(c, TEAMLEAD); // team_lead has view_score but not rerank/override
    await expectBlocked(
      c,
      "update public.application_screenings set score=10 where application_id=$1",
      [appId],
      "team_lead (no rerank/override) cannot write a screening",
    );

    console.log("\n7 · Cross-org isolation");
    await asUser(c, OUTSIDER);
    const outSees = (await c.query("select count(*)::int n from public.application_screenings where application_id=$1", [appId])).rows[0].n;
    assert(outSees === 0, "another org cannot see the screening");
    await expectBlocked(
      c,
      "update public.application_screenings set score=1 where application_id=$1",
      [appId],
      "another org cannot modify the screening",
    );

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
