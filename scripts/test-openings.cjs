/**
 * Job openings — RLS + data-scope verification.
 *
 *   node scripts/test-openings.cjs
 *
 * This is the first feature table, so it proves the pattern every later feature
 * relies on: that can_access_record() correctly scopes a real table.
 *
 * Fixtures: one org, an Owner, and a Recruiter whose Standard-preset grant on
 * job_openings.view is scoped to 'assigned'. We create two openings — one by the
 * owner, one by the recruiter — and assert who can see what.
 *
 * Runs in a transaction that always rolls back.
 */
const path = require("path");
const { Client } = require("pg");

process.loadEnvFile(path.join(__dirname, "..", ".env.local"));

const OWNER = "aaaaaaaa-0000-0000-0000-000000000001";
const RECRUITER = "aaaaaaaa-0000-0000-0000-000000000002";

let passed = 0;
let failed = 0;

function assert(cond, label) {
  if (cond) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    console.log(`  FAIL  ${label}`);
  }
}

async function asUser(client, id) {
  await client.query("select set_config('role','authenticated',true)");
  await client.query("select set_config('request.jwt.claims',$1,true)", [
    JSON.stringify({ sub: id, role: "authenticated" }),
  ]);
}
async function asPostgres(client) {
  await client.query("select set_config('role','postgres',true)");
  await client.query("select set_config('request.jwt.claims','',true)");
}

async function main() {
  const client = new Client({
    connectionString: process.env.DIRECT_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    await client.query("begin");

    // Fixtures
    await client.query(
      `insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','own@t.test',now(),now()),
              ($2,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','rec@t.test',now(),now())
       on conflict (id) do nothing`,
      [OWNER, RECRUITER],
    );

    await asUser(client, OWNER);
    const { rows: o } = await client.query(
      "select public.provision_organization('Openings Co','standard','Owner') as id",
    );
    const org = o[0].id;

    await asPostgres(client);
    const { rows: rec } = await client.query(
      "select id from public.roles where organization_id=$1 and key='recruiter'",
      [org],
    );
    await client.query(
      `insert into public.memberships (organization_id, user_id, role_id, status)
       values ($1,$2,$3,'active')`,
      [org, RECRUITER, rec[0].id],
    );

    const { rows: mem } = await client.query(
      "select id, user_id from public.memberships where organization_id=$1",
      [org],
    );
    const ownerMem = mem.find((m) => m.user_id === OWNER).id;
    const recMem = mem.find((m) => m.user_id === RECRUITER).id;

    console.log("1 · Create openings");
    // Owner creates one (created_by = owner membership).
    await asUser(client, OWNER);
    const { rows: op1 } = await client.query(
      `insert into public.job_openings (organization_id, created_by, title, status)
       values ($1,$2,'Senior React Developer','open') returning id`,
      [org, ownerMem],
    );
    assert(op1.length === 1, "owner can create an opening (has job_openings.create)");

    // Recruiter creates one (created_by = recruiter membership).
    await asUser(client, RECRUITER);
    const { rows: op2 } = await client.query(
      `insert into public.job_openings (organization_id, created_by, title, status)
       values ($1,$2,'DevOps Engineer','open') returning id`,
      [org, recMem],
    );
    assert(op2.length === 1, "recruiter can create an opening (Standard grants create)");
    const recOpeningId = op2[0].id;

    console.log("\n2 · Scope: recruiter is 'assigned', owner is 'all'");
    // Owner sees both.
    await asUser(client, OWNER);
    const { rows: ownerSees } = await client.query(
      "select count(*)::int as n from public.job_openings",
    );
    assert(ownerSees[0].n === 2, `owner (scope 'all') sees both openings (${ownerSees[0].n})`);

    // Recruiter's job_openings.view is 'assigned'; can_access_record treats the
    // creator as assigned, so the recruiter sees only the one they created.
    await asUser(client, RECRUITER);
    const { rows: recSees } = await client.query(
      "select id from public.job_openings",
    );
    assert(
      recSees.length === 1 && recSees[0].id === recOpeningId,
      `recruiter (scope 'assigned') sees only their own opening (${recSees.length})`,
    );

    console.log("\n3 · Scoped edit");
    // Recruiter cannot edit the owner's opening (not assigned to them).
    const ownerOpeningId = op1[0].id;
    const upd = await client.query(
      "update public.job_openings set title='hacked' where id=$1",
      [ownerOpeningId],
    );
    assert(upd.rowCount === 0, "recruiter cannot edit an opening outside their scope");

    // Recruiter can edit their own.
    const updOwn = await client.query(
      "update public.job_openings set location='Lahore' where id=$1",
      [recOpeningId],
    );
    assert(updOwn.rowCount === 1, "recruiter can edit their own opening");

    console.log("\n4 · Child records inherit access");
    await client.query(
      `insert into public.job_requirements (job_opening_id, kind, label)
       values ($1,'must_have','Kubernetes')`,
      [recOpeningId],
    );
    const { rows: reqs } = await client.query(
      "select count(*)::int as n from public.job_requirements where job_opening_id=$1",
      [recOpeningId],
    );
    assert(reqs[0].n === 1, "recruiter can add a requirement to their own opening");

    // But not to the owner's opening (parent not visible → RLS raises, which
    // aborts the transaction; a savepoint lets us recover and keep testing).
    let blocked = false;
    await client.query("savepoint sp_req");
    try {
      await client.query(
        `insert into public.job_requirements (job_opening_id, kind, label)
         values ($1,'must_have','X')`,
        [ownerOpeningId],
      );
      await client.query("release savepoint sp_req");
    } catch {
      blocked = true;
      await client.query("rollback to savepoint sp_req");
    }
    assert(blocked, "recruiter cannot add a requirement to an opening they can't see");

    console.log("\n5 · Status change is audited");
    await asUser(client, OWNER);
    await client.query("update public.job_openings set status='on_hold' where id=$1", [
      ownerOpeningId,
    ]);
    const { rows: aud } = await client.query(
      "select count(*)::int as n from public.audit_log where action='opening.status_changed' and organization_id=$1",
      [org],
    );
    assert(aud[0].n === 1, "status change wrote an audit entry");

    console.log("\n6 · Cross-tenant isolation");
    await asPostgres(client);
    await client.query(
      `insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
       values ('bbbbbbbb-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','other@t.test',now(),now())
       on conflict (id) do nothing`,
    );
    await asUser(client, "bbbbbbbb-0000-0000-0000-000000000001");
    await client.query(
      "select public.provision_organization('Other Co','standard','Other')",
    );
    const { rows: otherSees } = await client.query(
      "select count(*)::int as n from public.job_openings",
    );
    assert(otherSees[0].n === 0, "a different org sees none of these openings");
  } finally {
    await client.query("rollback").catch(() => {});
    await client.end();
  }

  console.log(`\n${passed} passed, ${failed} failed.`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error("\nRunner error:", err.message);
  process.exit(1);
});
