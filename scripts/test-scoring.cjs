/**
 * Weighted scoring, re-rank-on-change & human override (CP-14).
 *   node scripts/test-scoring.cjs
 * One transaction, always rolled back — plus a pure check of the weight formula.
 */
const path = require("path");
process.loadEnvFile(path.join(__dirname, "..", ".env.local"));
const { Client } = require("pg");

const OWNER = "55555555-0000-0000-0000-000000000001";
const TEAMLEAD = "55555555-0000-0000-0000-000000000002";

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

// Mirror of src/lib/scoring-weights.ts weightedScore, to lock the formula.
function weightedScore(dims, weights) {
  const parts = [];
  if (dims.skills != null) parts.push([dims.skills, weights.skills]);
  if (dims.experience != null) parts.push([dims.experience, weights.experience]);
  if (dims.qualification != null) parts.push([dims.qualification, weights.qualification]);
  if (!parts.length) return 0;
  const tw = parts.reduce((s, [, w]) => s + w, 0);
  if (tw <= 0) return Math.round(parts.reduce((s, [v]) => s + v, 0) / parts.length);
  return Math.round(parts.reduce((s, [v, w]) => s + v * w, 0) / tw);
}

async function main() {
  console.log("0 · Weight formula");
  assert(weightedScore({ skills: 100, experience: 80, qualification: 60 }, { skills: 50, experience: 30, qualification: 20 }) === 86, "50/30/20 of 100/80/60 = 86");
  assert(weightedScore({ skills: 100, experience: 80, qualification: 60 }, { skills: 100, experience: 0, qualification: 0 }) === 100, "skills-only weighting = 100");
  assert(weightedScore({ skills: 100, experience: 80, qualification: null }, { skills: 50, experience: 30, qualification: 20 }) === 93, "missing dimension renormalises (=> 93, not dragged to 0)");

  const c = new Client({ connectionString: process.env.DIRECT_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    await c.query("begin");
    await c.query(
      `insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','o@sc2.test',now(),now()),
              ($2,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','tl@sc2.test',now(),now())
       on conflict (id) do nothing`,
      [OWNER, TEAMLEAD],
    );

    await asUser(c, OWNER);
    const org = (await c.query("select public.provision_organization('Scoring Co','standard','Owner') as id")).rows[0].id;

    await asPg(c);
    const tlRole = (await c.query("select id from public.roles where organization_id=$1 and key='team_lead'", [org])).rows[0].id;
    await c.query("insert into public.memberships (organization_id,user_id,role_id,status) values ($1,$2,$3,'active')", [org, TEAMLEAD, tlRole]);
    const ownerMem = (await c.query("select id from public.memberships where organization_id=$1 and user_id=$2", [org, OWNER])).rows[0].id;

    const opening = (await c.query("insert into public.job_openings (organization_id, created_by, title, status) values ($1,$2,'Senior React Developer','open') returning id", [org, ownerMem])).rows[0].id;
    const cand = (await c.query("insert into public.candidates (organization_id, full_name, email) values ($1,'W Candidate','wc@sc2.test') returning id", [org])).rows[0].id;
    const appId = (await c.query("insert into public.applications (organization_id, candidate_id, job_opening_id, stage) values ($1,$2,$3,'applied') returning id", [org, cand, opening])).rows[0].id;
    const screening = (await c.query(
      `insert into public.application_screenings (organization_id, application_id, job_opening_id, status, score, recommendation, criteria)
       values ($1,$2,$3,'scored',86,'strong_fit','[]'::jsonb) returning id`,
      [org, appId, opening],
    )).rows[0].id;

    console.log("\n1 · scoring_weights persists on the opening");
    await asUser(c, OWNER);
    await c.query("update public.job_openings set scoring_weights=$2 where id=$1", [opening, JSON.stringify({ skills: 60, experience: 25, qualification: 15 })]);
    const w = (await c.query("select scoring_weights from public.job_openings where id=$1", [opening])).rows[0].scoring_weights;
    assert(w && w.skills === 60, "weights saved on job_openings");

    console.log("\n2 · Re-rank on requirement change (stale trigger)");
    await asPg(c);
    await c.query("update public.application_screenings set stale=false where id=$1", [screening]);
    // insert
    const req = (await c.query("insert into public.job_requirements (job_opening_id, kind, label) values ($1,'must_have','React') returning id", [opening])).rows[0].id;
    let stale = (await c.query("select stale from public.application_screenings where id=$1", [screening])).rows[0].stale;
    assert(stale === true, "adding a requirement marks the screening stale");
    // update
    await c.query("update public.application_screenings set stale=false where id=$1", [screening]);
    await c.query("update public.job_requirements set label='React 18' where id=$1", [req]);
    stale = (await c.query("select stale from public.application_screenings where id=$1", [screening])).rows[0].stale;
    assert(stale === true, "editing a requirement marks it stale");
    // delete
    await c.query("update public.application_screenings set stale=false where id=$1", [screening]);
    await c.query("delete from public.job_requirements where id=$1", [req]);
    stale = (await c.query("select stale from public.application_screenings where id=$1", [screening])).rows[0].stale;
    assert(stale === true, "removing a requirement marks it stale");

    console.log("\n3 · Human override (owner has screening.override)");
    await asUser(c, OWNER);
    const ov = await c.query(
      "update public.application_screenings set override_recommendation='possible_fit', override_reason='Prefer more backend depth', overridden_by=$2, overridden_at=now() where id=$1 returning override_recommendation, override_reason",
      [screening, ownerMem],
    );
    assert(ov.rowCount === 1 && ov.rows[0].override_recommendation === "possible_fit", "owner can override the recommendation");
    assert(ov.rows[0].override_reason === "Prefer more backend depth", "override reason recorded");

    console.log("\n4 · Override write gate");
    await asUser(c, TEAMLEAD); // no rerank/override
    await c.query("savepoint sp");
    const blocked = await c.query("update public.application_screenings set override_recommendation='strong_fit' where id=$1", [screening]);
    await c.query("rollback to savepoint sp");
    assert(blocked.rowCount === 0, "team_lead (no override) cannot override");

    console.log("\n5 · Override never changes application stage (spec R2)");
    await asPg(c);
    const stage = (await c.query("select stage from public.applications where id=$1", [appId])).rows[0].stage;
    assert(stage === "applied", "overriding leaves the pipeline stage untouched");

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
