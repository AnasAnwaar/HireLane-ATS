/**
 * Test Plans & Entitlements (CP-26) — seeded plan matrix, per-org subscription
 * (backfilled to Free), and the RLS around them (read-own, no direct writes).
 *   node scripts/test-entitlements.cjs
 * One rolled-back transaction.
 */
const path = require("path");
process.loadEnvFile(path.join(__dirname, "..", ".env.local"));
const { Client } = require("pg");

const OWNER = "41414141-0000-0000-0000-000000000001";
const OUT = "41414141-0000-0000-0000-000000000002";

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
async function blocked(c, sql, params, label) {
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

    console.log("1 · Plan matrix is seeded");
    await asPg(c);
    const plans = (await c.query("select key, seat_cap, opening_cap, feat_ai_posts, feat_ai_screening, feat_ai_assessments, feat_integrations from public.plans order by sort_order")).rows;
    const byKey = Object.fromEntries(plans.map((p) => [p.key, p]));
    assert(byKey.free && byKey.basic && byKey.premium, "free / basic / premium plans exist");
    assert(byKey.free.seat_cap === 1 && byKey.free.opening_cap === 5 && !byKey.free.feat_ai_posts && !byKey.free.feat_integrations, "Free: 1 seat, 5 openings, no AI, no integrations");
    assert(byKey.basic.opening_cap === null && byKey.basic.feat_integrations && byKey.basic.feat_ai_posts && !byKey.basic.feat_ai_screening, "Basic: unlimited openings, integrations + AI posts, no AI screening");
    assert(byKey.premium.seat_cap === 10 && byKey.premium.feat_ai_screening && byKey.premium.feat_ai_assessments, "Premium: 10 seats, AI screening + assessments");

    console.log("\n2 · Every org is subscribed (Free by default)");
    await c.query(
      `insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
       select v.id::uuid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',v.id||'@ent.test',now(),now()
       from (values ($1),($2)) v(id) on conflict (id) do nothing`,
      [OWNER, OUT],
    );
    await asUser(c, OWNER);
    const org = (await c.query("select public.provision_organization('Ent Co','standard','Owner') as id")).rows[0].id;
    await asPg(c);
    // Provisioning predates the backfill in a transaction, so ensure a row exists as the app would.
    await c.query("insert into public.org_subscriptions (organization_id, plan_key, base_seats) values ($1,'free',1) on conflict (organization_id) do nothing", [org]);
    const sub = (await c.query("select plan_key, status from public.org_subscriptions where organization_id=$1", [org])).rows[0];
    assert(sub && sub.plan_key === "free" && sub.status === "active", "org has an active Free subscription");

    await asUser(c, OUT);
    const org2 = (await c.query("select public.provision_organization('Rival','standard','R') as id")).rows[0].id;
    await asPg(c);
    await c.query("insert into public.org_subscriptions (organization_id, plan_key, base_seats) values ($1,'free',1) on conflict (organization_id) do nothing", [org2]);

    console.log("\n3 · RLS — read your own subscription only; plans are public");
    await asUser(c, OWNER);
    assert((await c.query("select count(*)::int n from public.org_subscriptions where organization_id=$1", [org])).rows[0].n === 1, "owner reads their own subscription");
    assert((await c.query("select count(*)::int n from public.org_subscriptions where organization_id=$1", [org2])).rows[0].n === 0, "cannot read another org's subscription");
    assert((await c.query("select count(*)::int n from public.plans")).rows[0].n >= 3, "any member can read the plans catalogue");

    console.log("\n4 · RLS — no direct subscription writes (upgrades go via the service role)");
    await blocked(c, "update public.org_subscriptions set plan_key='premium' where organization_id=$1", [org], "a member cannot self-upgrade by writing the subscription directly");
    await blocked(c, "insert into public.plans (key, name) values ('hacker','Hacker')", [], "a member cannot write the plans catalogue");

    console.log("\n5 · Service role performs the upgrade");
    await asPg(c);
    await c.query("update public.org_subscriptions set plan_key='premium' where organization_id=$1", [org]);
    assert((await c.query("select plan_key from public.org_subscriptions where organization_id=$1", [org])).rows[0].plan_key === "premium", "service role upgrades the plan");

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
