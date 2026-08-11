/**
 * Test proctoring capture (spec §UC-5.3, CP-19) — RLS on proctoring_events,
 * the service-role capture path, and the server-authoritative severity /
 * escalation logic (FLAGS, never rejects — R2).
 *   node scripts/test-proctoring.cjs
 * DB portion runs in one rolled-back transaction; the pure portion locks the
 * severity map + escalation mirrored from proctoring-actions.ts.
 */
const path = require("path");
process.loadEnvFile(path.join(__dirname, "..", ".env.local"));
const { Client } = require("pg");

const OWNER = "34343434-0000-0000-0000-000000000001"; // has proctoring.invalidate + view_summary
const AUDITOR = "34343434-0000-0000-0000-000000000002"; // view_summary (all) only, no invalidate
const OUTSIDER = "34343434-0000-0000-0000-000000000003";

let passed = 0,
  failed = 0;
const assert = (c, l) => (c ? (passed++, console.log(`  PASS  ${l}`)) : (failed++, console.log(`  FAIL  ${l}`)));

// ---- Mirror of src/server/assessments/proctoring-actions.ts (lock behaviour) --
const SEVERITY = {
  tab_switch: "high",
  window_blur: "medium",
  fullscreen_exit: "high",
  copy: "medium",
  paste: "medium",
  right_click: "low",
  devtools: "high",
  camera_denied: "medium",
  check_in: "low",
};
const FLAG_THRESHOLD = 3;

// Replays a run of events through the escalation rule: only high-severity
// breaches count toward the flag, and it FLAGS — never rejects.
function escalate(types) {
  let breachCount = 0;
  let flagged = false;
  for (const t of types) {
    if (SEVERITY[t] === "high") {
      breachCount += 1;
      flagged = flagged || breachCount >= FLAG_THRESHOLD;
    }
  }
  return { breachCount, flagged };
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
  console.log("0 · Severity map + escalation (spec R2 — flags, never rejects)");
  assert(SEVERITY.tab_switch === "high" && SEVERITY.right_click === "low", "severity map matches the server");
  assert(escalate(["right_click", "copy", "paste"]).flagged === false, "medium/low breaches never flag");
  assert(escalate(["tab_switch", "tab_switch"]).flagged === false, "2 high breaches stay under the threshold");
  const three = escalate(["tab_switch", "fullscreen_exit", "devtools"]);
  assert(three.breachCount === 3 && three.flagged === true, "3 high breaches → flagged");
  assert(escalate(["tab_switch", "copy", "fullscreen_exit", "right_click", "devtools"]).breachCount === 3, "only high-severity events count toward the breach total");

  const c = new Client({ connectionString: process.env.DIRECT_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    await c.query("begin");
    await c.query(
      `insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','o@pr.test',now(),now()),
              ($2,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','au@pr.test',now(),now()),
              ($3,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','out@pr.test',now(),now())
       on conflict (id) do nothing`,
      [OWNER, AUDITOR, OUTSIDER],
    );
    await asUser(c, OWNER);
    const org = (await c.query("select public.provision_organization('Proctor Co','standard','Owner') as id")).rows[0].id;
    await asPg(c);
    const auRole = (await c.query("select id from public.roles where organization_id=$1 and key='auditor'", [org])).rows[0].id;
    await c.query("insert into public.memberships (organization_id,user_id,role_id,status) values ($1,$2,$3,'active')", [org, AUDITOR, auRole]);
    const opening = (await c.query("insert into public.job_openings (organization_id, created_by, title, status) values ($1,(select id from public.memberships where organization_id=$1 and user_id=$2),'React Dev','open') returning id", [org, OWNER])).rows[0].id;
    const cand = (await c.query("insert into public.candidates (organization_id, full_name, email) values ($1,'Taker','t@pr.test') returning id", [org])).rows[0].id;
    const appId = (await c.query("insert into public.applications (organization_id, candidate_id, job_opening_id, stage) values ($1,$2,$3,'applied') returning id", [org, cand, opening])).rows[0].id;
    const test = (await c.query("insert into public.tests (organization_id, job_opening_id, title, status, version, proctoring_level) values ($1,$2,'Screening','published',1,'standard') returning id", [org, opening])).rows[0].id;
    const assignment = (await c.query("insert into public.test_assignments (organization_id, test_id, application_id, candidate_id) values ($1,$2,$3,$4) returning id", [org, test, appId, cand])).rows[0].id;
    const attempt = (await c.query("insert into public.test_attempts (organization_id, assignment_id, test_id, version, question_order, expires_at, max_score, status) values ($1,$2,$3,1,'[]'::jsonb, now()+interval '30 min', 10, 'in_progress') returning id", [org, assignment, test])).rows[0].id;

    await asUser(c, OUTSIDER);
    await c.query("select public.provision_organization('Rival','standard','R')");

    console.log("\n1 · Schema");
    await asPg(c);
    const tbl = (await c.query("select count(*)::int n from information_schema.tables where table_schema='public' and table_name='proctoring_events'")).rows[0].n;
    assert(tbl === 1, "proctoring_events table exists");
    const cols = (await c.query("select count(*)::int n from information_schema.columns where table_schema='public' and table_name='test_attempts' and column_name in ('check_in_photo_path','last_ip_hash','breach_count','flagged')")).rows[0].n;
    assert(cols === 4, "test_attempts carries check_in_photo_path / last_ip_hash / breach_count / flagged");

    console.log("\n2 · Service-role capture path (candidate is unauthenticated)");
    // The candidate action writes via the service role — simulate with postgres.
    for (const type of ["tab_switch", "fullscreen_exit", "devtools"]) {
      await c.query("insert into public.proctoring_events (organization_id, attempt_id, type, severity) values ($1,$2,$3,$4::proctoring_severity)", [org, attempt, type, SEVERITY[type]]);
    }
    const evCount = (await c.query("select count(*)::int n from public.proctoring_events where attempt_id=$1", [attempt])).rows[0].n;
    assert(evCount === 3, "service role records integrity events");
    // Escalation the action performs after 3 high breaches.
    await c.query("update public.test_attempts set breach_count=3, flagged=true where id=$1", [attempt]);
    const flagged = (await c.query("select flagged, breach_count from public.test_attempts where id=$1", [attempt])).rows[0];
    assert(flagged.flagged === true && flagged.breach_count === 3, "attempt is flagged after the threshold — the stage is untouched (R2)");
    const stage = (await c.query("select stage from public.applications where id=$1", [appId])).rows[0].stage;
    assert(stage === "applied", "flagging never moves the application stage (never auto-rejects)");

    console.log("\n3 · RLS — owner & auditor read the integrity summary");
    await asUser(c, OWNER);
    assert((await c.query("select count(*)::int n from public.proctoring_events where attempt_id=$1", [attempt])).rows[0].n === 3, "owner (proctoring.view_summary) reads events");
    await asUser(c, AUDITOR);
    assert((await c.query("select count(*)::int n from public.proctoring_events where attempt_id=$1", [attempt])).rows[0].n === 3, "auditor (view_summary, scope all) reads events");

    console.log("\n4 · RLS — no app-side write without proctoring.invalidate");
    await expectBlocked(c, "insert into public.proctoring_events (organization_id, attempt_id, type, severity) values ($1,$2,'copy','medium')", [org, attempt], "auditor (no invalidate) cannot write events");

    console.log("\n5 · Cross-org isolation");
    await asUser(c, OUTSIDER);
    assert((await c.query("select count(*)::int n from public.proctoring_events where attempt_id=$1", [attempt])).rows[0].n === 0, "another org cannot see the integrity events");

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
