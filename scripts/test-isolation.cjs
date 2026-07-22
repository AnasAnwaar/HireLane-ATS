/**
 * Tenant isolation + permission resolution tests.
 *
 *   node scripts/test-isolation.cjs
 *
 * Spec CP-2 acceptance: "org A cannot read org B under any query."
 *
 * Everything runs inside one transaction that is always rolled back, so the
 * database is left exactly as it was found.
 *
 * The interesting part is role switching. Connecting as `postgres` bypasses RLS,
 * so each assertion runs after `SET LOCAL ROLE authenticated` with a forged
 * `request.jwt.claims` — which is precisely what PostgREST does for a real
 * request. Without that, every one of these tests would pass vacuously.
 */
const path = require("path");

process.loadEnvFile(path.join(__dirname, "..", ".env.local"));

const { Client } = require("pg");

const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";
const USER_R = "33333333-3333-3333-3333-333333333333";

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    console.log(`  FAIL  ${label}`);
  }
}

async function asUser(client, userId) {
  await client.query("select set_config('role', 'authenticated', true)");
  await client.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: userId, role: "authenticated" }),
  ]);
}

async function asPostgres(client) {
  await client.query("select set_config('role', 'postgres', true)");
  await client.query("select set_config('request.jwt.claims', '', true)");
}

/** Run a statement expecting it to be rejected; returns the error code. */
async function expectFailure(client, sql, label) {
  try {
    await client.query(sql);
    assert(false, `${label} — expected rejection, but it succeeded`);
    return null;
  } catch (err) {
    assert(true, `${label} (${err.code})`);
    // The transaction is now aborted; callers must recover.
    return err.code;
  }
}

async function main() {
  const client = new Client({
    connectionString: process.env.DIRECT_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    await client.query("begin");

    // --- Fixtures ---------------------------------------------------------
    await client.query(
      `insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
       values
         ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner-a@acme.test','{"full_name":"Owner A"}',now(),now()),
         ($2,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner-b@globex.test','{"full_name":"Owner B"}',now(),now()),
         ($3,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','rec-a@acme.test','{"full_name":"Recruiter A"}',now(),now())
       on conflict (id) do nothing`,
      [USER_A, USER_B, USER_R],
    );

    await asUser(client, USER_A);
    const { rows: orgARows } = await client.query(
      "select public.provision_organization('Acme Tech','standard','Owner A') as id",
    );
    const orgA = orgARows[0].id;

    await asUser(client, USER_B);
    const { rows: orgBRows } = await client.query(
      "select public.provision_organization('Globex Inc','standard','Owner B') as id",
    );
    const orgB = orgBRows[0].id;

    console.log(`\nProvisioned org A=${orgA.slice(0, 8)}… org B=${orgB.slice(0, 8)}…`);

    await asPostgres(client);
    await client.query(
      `insert into public.memberships (organization_id, user_id, role_id, status)
       select $1, $2, r.id, 'active'
       from public.roles r
       where r.organization_id = $1 and r.key = 'recruiter'`,
      [orgA, USER_R],
    );

    // --- 1. Isolation -----------------------------------------------------
    console.log("\n1 · Tenant isolation");
    await asUser(client, USER_A);

    const q = async (sql, params) => (await client.query(sql, params)).rows;

    assert(
      (await q("select count(*)::int as n from public.organizations"))[0].n === 1,
      "Owner A sees exactly one organisation",
    );
    assert(
      (await q("select count(*)::int as n from public.organizations where id=$1", [orgB]))[0].n === 0,
      "Owner A cannot read org B directly by id",
    );
    assert(
      (await q("select count(*)::int as n from public.memberships where organization_id=$1", [orgB]))[0].n === 0,
      "Owner A cannot read org B memberships",
    );
    assert(
      (await q("select count(*)::int as n from public.roles where organization_id=$1", [orgB]))[0].n === 0,
      "Owner A cannot read org B roles",
    );
    assert(
      (
        await q(
          `select count(*)::int as n from public.role_permissions rp
           join public.roles r on r.id = rp.role_id
           where r.organization_id = $1`,
          [orgB],
        )
      )[0].n === 0,
      "Owner A cannot reach org B grants through a join",
    );
    assert(
      (await q("select count(*)::int as n from public.audit_log where organization_id=$1", [orgB]))[0].n === 0,
      "Owner A cannot read org B audit entries",
    );

    const upd = await client.query(
      "update public.organizations set name='Hijacked' where id=$1",
      [orgB],
    );
    assert(upd.rowCount === 0, "Owner A cannot update org B (0 rows affected)");

    await asPostgres(client);
    assert(
      (await q("select name from public.organizations where id=$1", [orgB]))[0].name === "Globex Inc",
      "Org B name is untouched",
    );

    // --- 2. Owner privilege ----------------------------------------------
    console.log("\n2 · Owner privilege");
    await asUser(client, USER_A);

    assert((await q("select public.is_org_owner() as v"))[0].v === true, "Owner A is an owner");
    assert(
      (await q("select public.has_permission('administration.manage_roles') as v"))[0].v === true,
      "Owner holds manage_roles",
    );
    assert(
      (await q("select public.has_permission('fields.view_salary') as v"))[0].v === true,
      "Owner holds sensitive field permissions",
    );

    const ownerPerms = (await q("select count(*)::int as n from public.my_permissions()"))[0].n;
    const allPerms = (await q("select count(*)::int as n from public.permissions"))[0].n;
    assert(ownerPerms === allPerms, `Owner my_permissions() = full catalogue (${ownerPerms}/${allPerms})`);

    // --- 3. Role grants and scopes ---------------------------------------
    console.log("\n3 · Role grants and scopes");
    await asUser(client, USER_R);

    assert((await q("select public.is_org_owner() as v"))[0].v === false, "Recruiter is not an owner");
    assert(
      (await q("select public.has_permission('applicants.view_list') as v"))[0].v === true,
      "Recruiter holds applicants.view_list",
    );
    assert(
      (await q("select public.permission_scope_of('applicants.view_list') as v"))[0].v === "assigned",
      "Recruiter applicants.view_list is scoped to 'assigned'",
    );
    assert(
      (await q("select public.has_permission('administration.manage_roles') as v"))[0].v === false,
      "Recruiter does NOT hold manage_roles",
    );
    assert(
      (await q("select public.has_permission('fields.view_salary') as v"))[0].v === false,
      "Recruiter does NOT hold view_salary",
    );
    assert(
      (await q("select public.permission_scope_of('administration.manage_roles') as v"))[0].v === null,
      "Scope of an ungranted permission is null",
    );

    // --- 4. Per-user overrides -------------------------------------------
    console.log("\n4 · Per-user overrides");
    await asPostgres(client);
    await client.query(
      `insert into public.user_permission_overrides
         (organization_id, membership_id, permission_key, allowed, scope, reason)
       select $1, m.id, 'fields.view_salary', true, 'all', 'Trusted senior recruiter'
       from public.memberships m
       where m.organization_id = $1 and m.user_id = $2`,
      [orgA, USER_R],
    );

    await asUser(client, USER_R);
    assert(
      (await q("select public.has_permission('fields.view_salary') as v"))[0].v === true,
      "Override grants a permission the role lacks",
    );

    await asPostgres(client);
    await client.query(
      "update public.user_permission_overrides set expires_at = now() - interval '1 day' where permission_key='fields.view_salary'",
    );
    await asUser(client, USER_R);
    assert(
      (await q("select public.has_permission('fields.view_salary') as v"))[0].v === false,
      "Expired override no longer applies",
    );

    await asPostgres(client);
    await client.query(
      "update public.user_permission_overrides set permission_key='applicants.view_list', allowed=false, expires_at=null where permission_key='fields.view_salary'",
    );
    await asUser(client, USER_R);
    assert(
      (await q("select public.has_permission('applicants.view_list') as v"))[0].v === false,
      "Revoking override beats the role grant",
    );

    // --- 5. Guardrails ----------------------------------------------------
    console.log("\n5 · Non-configurable guardrails");
    await asPostgres(client);

    // Each expected failure aborts the transaction, so use savepoints.
    const { rows: auditRows } = await client.query("select id from public.audit_log limit 1");
    const auditId = auditRows[0]?.id;

    await client.query("savepoint sp");
    await expectFailure(
      client,
      `update public.audit_log set summary='tampered' where id=${auditId}`,
      "audit_log rejects UPDATE",
    );
    await client.query("rollback to savepoint sp");

    await expectFailure(
      client,
      `delete from public.audit_log where id=${auditId}`,
      "audit_log rejects DELETE",
    );
    await client.query("rollback to savepoint sp");

    await expectFailure(
      client,
      `update public.memberships set is_owner=false where user_id='${USER_A}'`,
      "last owner cannot be demoted",
    );
    await client.query("rollback to savepoint sp");

    const { rows: roleRows } = await client.query(
      `select r.id from public.roles r
       join public.memberships m on m.role_id = r.id
       where not r.is_owner_role limit 1`,
    );
    await expectFailure(
      client,
      `delete from public.roles where id='${roleRows[0].id}'`,
      "in-use role cannot be deleted",
    );
    await client.query("rollback to savepoint sp");

    await expectFailure(
      client,
      `delete from public.roles where is_owner_role`,
      "Owner role cannot be deleted",
    );
    await client.query("rollback to savepoint sp");
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
