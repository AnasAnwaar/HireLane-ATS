/**
 * Admin portal write-path verification (CP-5).
 *
 *   node scripts/test-admin.cjs
 *
 * The permission *resolution* is covered by test-isolation. This proves the
 * *editing* surface the admin UI drives: creating roles, granting/revoking
 * permissions, per-user overrides — and that RLS blocks the things it must
 * (editing the Owner role, a non-admin writing permissions).
 *
 * Runs in a transaction that always rolls back.
 */
const path = require("path");
process.loadEnvFile(path.join(__dirname, "..", ".env.local"));

const { Client } = require("pg");

const OWNER = "cccccccc-0000-0000-0000-000000000001";
const RECRUITER = "cccccccc-0000-0000-0000-000000000002";

let passed = 0;
let failed = 0;
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
    await c.query(sql, params);
    await c.query("release savepoint sp");
    assert(false, `${label} — expected block, but it succeeded`);
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
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','o@a.test',now(),now()),
              ($2,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','r@a.test',now(),now())
       on conflict (id) do nothing`,
      [OWNER, RECRUITER],
    );

    await asUser(c, OWNER);
    const { rows: o } = await c.query("select public.provision_organization('Admin Co','standard','O') as id");
    const org = o[0].id;

    await asPg(c);
    const { rows: rec } = await c.query("select id from public.roles where organization_id=$1 and key='recruiter'", [org]);
    await c.query(
      "insert into public.memberships (organization_id, user_id, role_id, status) values ($1,$2,$3,'active')",
      [org, RECRUITER, rec[0].id],
    );
    const { rows: recMem } = await c.query("select id from public.memberships where user_id=$1", [RECRUITER]);
    const recMembershipId = recMem[0].id;

    console.log("1 · Owner edits role permissions");
    await asUser(c, OWNER);

    // Create a custom role.
    const { rows: newRole } = await c.query(
      `insert into public.roles (organization_id, key, name, is_system, sort_order)
       values ($1,'sourcer','Sourcer',false,99) returning id`,
      [org],
    );
    assert(newRole.length === 1, "owner can create a custom role");
    const sourcerId = newRole[0].id;

    // Grant a permission to it.
    const grant = await c.query(
      `insert into public.role_permissions (role_id, permission_key, allowed, scope)
       values ($1,'applicants.view_list',true,'all') returning role_id`,
      [sourcerId],
    );
    assert(grant.rowCount === 1, "owner can grant a permission to a custom role");

    // Grant a permission the recruiter role lacks by default (view_salary).
    await c.query(
      `insert into public.role_permissions (role_id, permission_key, allowed, scope)
       values ($1,'fields.view_salary',true,'all')`,
      [rec[0].id],
    );

    console.log("\n2 · The change takes effect for members of that role");
    await asUser(c, RECRUITER);
    const salaryNow = (await c.query("select public.has_permission('fields.view_salary') as v")).rows[0].v;
    assert(salaryNow === true, "recruiter now resolves the newly-granted permission");

    console.log("\n3 · Owner revokes it (delete the grant row)");
    await asUser(c, OWNER);
    await c.query("delete from public.role_permissions where role_id=$1 and permission_key='fields.view_salary'", [rec[0].id]);
    await asUser(c, RECRUITER);
    const salaryGone = (await c.query("select public.has_permission('fields.view_salary') as v")).rows[0].v;
    assert(salaryGone === false, "revoking the grant removes the permission");

    console.log("\n4 · Per-user override");
    await asUser(c, OWNER);
    await c.query(
      `insert into public.user_permission_overrides (organization_id, membership_id, permission_key, allowed, scope)
       values ($1,$2,'administration.view_audit_log',true,'all')`,
      [org, recMembershipId],
    );
    await asUser(c, RECRUITER);
    const overrideGrant = (await c.query("select public.has_permission('administration.view_audit_log') as v")).rows[0].v;
    assert(overrideGrant === true, "per-user override grants a permission the role lacks");

    console.log("\n5 · RLS guards the write surface");
    // Owner cannot edit the Owner role's permissions.
    await asUser(c, OWNER);
    const { rows: ownerRole } = await c.query("select id from public.roles where organization_id=$1 and is_owner_role", [org]);
    await expectBlocked(
      c,
      "insert into public.role_permissions (role_id, permission_key, allowed) values ($1,'applicants.view_list',true)",
      [ownerRole[0].id],
      "Owner role's permissions cannot be edited (RLS)",
    );

    // A recruiter (no manage_roles) cannot grant themselves a permission.
    await asUser(c, RECRUITER);
    await expectBlocked(
      c,
      "insert into public.role_permissions (role_id, permission_key, allowed) values ($1,'administration.manage_billing',true)",
      [rec[0].id],
      "non-admin cannot write role permissions (RLS)",
    );

    // A recruiter cannot create a role.
    await expectBlocked(
      c,
      "insert into public.roles (organization_id, key, name) values ($1,'sneaky','Sneaky')",
      [org],
      "non-admin cannot create a role (RLS)",
    );

    console.log("\n6 · Permission edits are audited");
    await asPg(c);
    const { rows: audit } = await c.query(
      "select count(*)::int as n from public.audit_log where organization_id=$1 and action like 'role.permission_%'",
      [org],
    );
    assert(audit[0].n >= 2, `permission grants/revokes were audited (${audit[0].n} entries)`);
  } finally {
    await c.query("rollback").catch(() => {});
    await c.end();
  }
  console.log(`\n${passed} passed, ${failed} failed.`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error("\nRunner error:", e.message);
  process.exit(1);
});
