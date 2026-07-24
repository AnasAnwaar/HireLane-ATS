/**
 * Applicants — RLS + scope-inheritance verification (CP-7).
 *
 *   node scripts/test-applicants.cjs
 *
 * The key new behaviour: application visibility FOLLOWS the parent opening. A
 * recruiter whose openings scope is 'assigned' should see applicants only on
 * openings they can see. Plus tenant isolation and dedup.
 *
 * Transaction, always rolled back.
 */
const path = require("path");
process.loadEnvFile(path.join(__dirname, "..", ".env.local"));
const { Client } = require("pg");

const OWNER = "dddddddd-0000-0000-0000-000000000001";
const RECRUITER = "dddddddd-0000-0000-0000-000000000002";
const OUTSIDER = "dddddddd-0000-0000-0000-000000000003";

let passed = 0, failed = 0;
const assert = (c, l) => (c ? (passed++, console.log(`  PASS  ${l}`)) : (failed++, console.log(`  FAIL  ${l}`)));

async function asUser(c, id) {
  await c.query("select set_config('role','authenticated',true)");
  await c.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: id, role: "authenticated" })]);
}
async function asPg(c) {
  await c.query("select set_config('role','postgres',true)");
  await c.query("select set_config('request.jwt.claims','',true)");
}

async function main() {
  const c = new Client({ connectionString: process.env.DIRECT_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    await c.query("begin");
    await c.query(
      `insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','o@x.test',now(),now()),
              ($2,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','r@x.test',now(),now()),
              ($3,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','out@y.test',now(),now())
       on conflict (id) do nothing`,
      [OWNER, RECRUITER, OUTSIDER],
    );

    await asUser(c, OWNER);
    const org = (await c.query("select public.provision_organization('Applicants Co','standard','O') as id")).rows[0].id;

    await asPg(c);
    const recRole = (await c.query("select id from public.roles where organization_id=$1 and key='recruiter'", [org])).rows[0].id;
    await c.query("insert into public.memberships (organization_id,user_id,role_id,status) values ($1,$2,$3,'active')", [org, RECRUITER, recRole]);
    const mem = (await c.query("select id,user_id from public.memberships where organization_id=$1", [org])).rows;
    const ownerMem = mem.find((m) => m.user_id === OWNER).id;
    const recMem = mem.find((m) => m.user_id === RECRUITER).id;

    // A second org for the outsider.
    await asUser(c, OUTSIDER);
    await c.query("select public.provision_organization('Other Co','standard','Out')");

    // Owner creates an opening; recruiter creates their own.
    await asUser(c, OWNER);
    const ownerOpening = (await c.query(
      "insert into public.job_openings (organization_id,created_by,title,status) values ($1,$2,'Owner Role','open') returning id",
      [org, ownerMem],
    )).rows[0].id;
    await asUser(c, RECRUITER);
    const recOpening = (await c.query(
      "insert into public.job_openings (organization_id,created_by,title,status) values ($1,$2,'Rec Role','open') returning id",
      [org, recMem],
    )).rows[0].id;

    console.log("1 · Candidates + applications (as owner)");
    await asUser(c, OWNER);
    const cand1 = (await c.query(
      "insert into public.candidates (organization_id,full_name,email) values ($1,'Alice','alice@c.test') returning id",
      [org],
    )).rows[0].id;
    assert(!!cand1, "owner can create a candidate");

    await c.query(
      "insert into public.applications (organization_id,candidate_id,job_opening_id,stage) values ($1,$2,$3,'applied')",
      [org, cand1, ownerOpening],
    );
    // Same candidate applies to the recruiter's opening too.
    await c.query(
      "insert into public.applications (organization_id,candidate_id,job_opening_id,stage) values ($1,$2,$3,'applied')",
      [org, cand1, recOpening],
    );
    assert(true, "candidate can apply to two openings (one identity)");

    console.log("\n2 · Dedup — unique (org, email)");
    let dup = false;
    await c.query("savepoint sp");
    try {
      await c.query("insert into public.candidates (organization_id,full_name,email) values ($1,'Alice 2','alice@c.test')", [org]);
      await c.query("release savepoint sp");
    } catch {
      dup = true;
      await c.query("rollback to savepoint sp");
    }
    assert(dup, "duplicate email in the same org is rejected");

    console.log("\n3 · Application visibility follows the opening scope");
    // Owner (scope all) sees both applications.
    await asUser(c, OWNER);
    const ownerSees = (await c.query("select count(*)::int as n from public.applications")).rows[0].n;
    assert(ownerSees === 2, `owner sees all applications (${ownerSees})`);

    // Recruiter (openings scope 'assigned') sees only the application on the
    // opening they created — the other opening isn't visible to them, so its
    // application isn't either.
    await asUser(c, RECRUITER);
    const recApps = (await c.query("select job_opening_id from public.applications")).rows;
    assert(
      recApps.length === 1 && recApps[0].job_opening_id === recOpening,
      `recruiter sees only the application on their own opening (${recApps.length})`,
    );

    console.log("\n4 · Stage change is audited");
    await asUser(c, OWNER);
    const appId = (await c.query("select id from public.applications where job_opening_id=$1", [ownerOpening])).rows[0].id;
    await c.query("update public.applications set stage='screened' where id=$1", [appId]);
    const aud = (await c.query("select count(*)::int as n from public.audit_log where action='application.stage_changed' and organization_id=$1", [org])).rows[0].n;
    assert(aud === 1, "stage change wrote an audit entry");

    console.log("\n5 · Cross-tenant isolation");
    await asUser(c, OUTSIDER);
    const outSees = (await c.query("select count(*)::int as n from public.candidates")).rows[0].n;
    assert(outSees === 0, "a different org sees none of these candidates");
    const outApps = (await c.query("select count(*)::int as n from public.applications")).rows[0].n;
    assert(outApps === 0, "a different org sees none of these applications");
  } finally {
    await c.query("rollback").catch(() => {});
    await c.end();
  }
  console.log(`\n${passed} passed, ${failed} failed.`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error("\nRunner error:", e.message); process.exit(1); });
