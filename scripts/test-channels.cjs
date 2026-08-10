/**
 * Channels & connections — catalogue + RLS (CP-10).
 *   node scripts/test-channels.cjs
 * Transaction, always rolled back.
 */
const path = require("path");
process.loadEnvFile(path.join(__dirname, "..", ".env.local"));
const { Client } = require("pg");

const OWNER = "88888888-0000-0000-0000-000000000001";
const RECRUITER = "88888888-0000-0000-0000-000000000002";
const OUTSIDER = "88888888-0000-0000-0000-000000000003";

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
async function expectBlocked(c, sql, params, label) {
  await c.query("savepoint sp");
  try { await c.query(sql, params); await c.query("release savepoint sp"); assert(false, `${label} — expected block`); }
  catch { await c.query("rollback to savepoint sp"); assert(true, label); }
}

async function main() {
  const c = new Client({ connectionString: process.env.DIRECT_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    await c.query("begin");
    await c.query(
      `insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','o@ch.test',now(),now()),
              ($2,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','r@ch.test',now(),now()),
              ($3,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','out@ch.test',now(),now())
       on conflict (id) do nothing`,
      [OWNER, RECRUITER, OUTSIDER],
    );

    await asUser(c, OWNER);
    const org = (await c.query("select public.provision_organization('Channels Co','standard','O') as id")).rows[0].id;

    await asPg(c);
    const recRole = (await c.query("select id from public.roles where organization_id=$1 and key='recruiter'", [org])).rows[0].id;
    await c.query("insert into public.memberships (organization_id,user_id,role_id,status) values ($1,$2,$3,'active')", [org, RECRUITER, recRole]);

    console.log("1 · Catalogue is global");
    await asUser(c, OWNER);
    const n = (await c.query("select count(*)::int as n from public.channels")).rows[0].n;
    assert(n >= 8, `owner can read the channel catalogue (${n} channels)`);

    console.log("\n2 · Owner connects a channel");
    const ins = await c.query(
      "insert into public.channel_connections (organization_id,channel_key,mode,status) values ($1,'linkedin','assisted','connected') returning id",
      [org],
    );
    assert(ins.rowCount === 1, "owner can connect a channel");

    console.log("\n3 · Recruiter has view but not connect");
    await asUser(c, RECRUITER);
    const recSees = (await c.query("select count(*)::int as n from public.channel_connections")).rows[0].n;
    assert(recSees === 1, "recruiter can view connections (has integrations.view)");
    await expectBlocked(
      c,
      "insert into public.channel_connections (organization_id,channel_key,status) values ($1,'indeed','connected')",
      [org],
      "recruiter cannot connect a channel (no integrations.connect)",
    );

    console.log("\n4 · Cross-tenant isolation");
    await asPg(c);
    await asUser(c, OUTSIDER);
    await c.query("select public.provision_organization('Other Co','standard','Out')");
    const outSees = (await c.query("select count(*)::int as n from public.channel_connections")).rows[0].n;
    assert(outSees === 0, "a different org sees no connections");
    const outCatalogue = (await c.query("select count(*)::int as n from public.channels")).rows[0].n;
    assert(outCatalogue >= 8, "but the global catalogue is still readable");
  } finally {
    await c.query("rollback").catch(() => {});
    await c.end();
  }
  console.log(`\n${passed} passed, ${failed} failed.`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error("\nRunner error:", e.message); process.exit(1); });
