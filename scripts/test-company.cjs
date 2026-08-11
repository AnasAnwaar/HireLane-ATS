/**
 * Test the company profile (admin → Company) — the new columns + the RLS gate
 * that only administration.manage_company_profile may write them, and the
 * brand-colour check constraint.
 *   node scripts/test-company.cjs
 * One rolled-back transaction.
 */
const path = require("path");
process.loadEnvFile(path.join(__dirname, "..", ".env.local"));
const { Client } = require("pg");

const OWNER = "36363636-0000-0000-0000-000000000001"; // owner short-circuits every permission
const AUDITOR = "36363636-0000-0000-0000-000000000002"; // no manage_company_profile
const OUTSIDER = "36363636-0000-0000-0000-000000000003";

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

async function main() {
  const c = new Client({ connectionString: process.env.DIRECT_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    await c.query("begin");
    await c.query(
      `insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','o@co.test',now(),now()),
              ($2,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','au@co.test',now(),now()),
              ($3,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','out@co.test',now(),now())
       on conflict (id) do nothing`,
      [OWNER, AUDITOR, OUTSIDER],
    );
    await asUser(c, OWNER);
    const org = (await c.query("select public.provision_organization('Brand Co','standard','Owner') as id")).rows[0].id;
    await asPg(c);
    const auRole = (await c.query("select id from public.roles where organization_id=$1 and key='auditor'", [org])).rows[0].id;
    await c.query("insert into public.memberships (organization_id,user_id,role_id,status) values ($1,$2,$3,'active')", [org, AUDITOR, auRole]);

    await asUser(c, OUTSIDER);
    const org2 = (await c.query("select public.provision_organization('Rival','standard','R') as id")).rows[0].id;

    console.log("1 · Schema");
    await asPg(c);
    const cols = (await c.query("select count(*)::int n from information_schema.columns where table_schema='public' and table_name='organizations' and column_name in ('tagline','description','brand_color','email_from_name','email_reply_to','careers_url')")).rows[0].n;
    assert(cols === 6, "organizations carries the six new profile columns");

    console.log("\n2 · Owner (manage_company_profile) can edit");
    await asUser(c, OWNER);
    const r = await c.query("update public.organizations set name='Brand Co Renamed', tagline='We hire well', brand_color='#4f46e5' where id=$1", [org]);
    assert(r.rowCount === 1, "owner updates the company profile");
    const saved = (await c.query("select name, brand_color from public.organizations where id=$1", [org])).rows[0];
    assert(saved.name === "Brand Co Renamed" && saved.brand_color === "#4f46e5", "the change persisted");

    console.log("\n3 · A member without the permission cannot edit");
    await asUser(c, AUDITOR);
    const blocked = await c.query("update public.organizations set tagline='sneaky' where id=$1", [org]);
    assert(blocked.rowCount === 0, "auditor (no manage_company_profile) update is a no-op under RLS");
    await asPg(c);
    const still = (await c.query("select tagline from public.organizations where id=$1", [org])).rows[0].tagline;
    assert(still === "We hire well", "the profile is unchanged after the blocked write");

    console.log("\n4 · Cross-org — cannot edit another tenant");
    await asUser(c, OWNER);
    const cross = await c.query("update public.organizations set tagline='hijack' where id=$1", [org2]);
    assert(cross.rowCount === 0, "an owner cannot edit another organisation");

    console.log("\n5 · Brand colour must be a hex triplet");
    await asPg(c);
    await c.query("savepoint sp");
    let rejected = false;
    try {
      await c.query("update public.organizations set brand_color='indigo' where id=$1", [org]);
    } catch {
      rejected = true;
    }
    await c.query("rollback to savepoint sp");
    assert(rejected, "a non-hex brand colour is rejected by the check constraint");

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
