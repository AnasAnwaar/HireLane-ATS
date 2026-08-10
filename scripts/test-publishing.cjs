/**
 * Publishing — state machine + RLS + attribution (CP-12).
 *   node scripts/test-publishing.cjs
 * One transaction, always rolled back.
 *
 * Covers what the database guarantees. The per-action `job_openings.publish`
 * gate lives in the server action layer (authorize()); RLS only requires
 * generate OR publish to write a posting, which is exercised here.
 */
const path = require("path");
process.loadEnvFile(path.join(__dirname, "..", ".env.local"));
const { Client } = require("pg");

const OWNER = "77777777-0000-0000-0000-000000000001";
const TEAMLEAD = "77777777-0000-0000-0000-000000000002";
const OUTSIDER = "77777777-0000-0000-0000-000000000003";

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
    // A blocked write on an existing row returns 0 rows affected (RLS filters it).
    if (r.rowCount === 0) {
      await c.query("rollback to savepoint sp");
      assert(true, label);
    } else {
      await c.query("rollback to savepoint sp");
      assert(false, `${label} — expected block, wrote ${r.rowCount}`);
    }
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
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','o@pub.test',now(),now()),
              ($2,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','tl@pub.test',now(),now()),
              ($3,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','out@pub.test',now(),now())
       on conflict (id) do nothing`,
      [OWNER, TEAMLEAD, OUTSIDER],
    );

    await asUser(c, OWNER);
    const org = (await c.query("select public.provision_organization('Publish Co','standard','Owner') as id")).rows[0].id;

    await asPg(c);
    const tlRole = (await c.query("select id from public.roles where organization_id=$1 and key='team_lead'", [org])).rows[0].id;
    await c.query(
      "insert into public.memberships (organization_id,user_id,role_id,status) values ($1,$2,$3,'active')",
      [org, TEAMLEAD, tlRole],
    );
    const ownerMem = (
      await c.query("select id from public.memberships where organization_id=$1 and user_id=$2", [org, OWNER])
    ).rows[0].id;

    // Open opening + connected channel + a posting with content.
    const opening = (
      await c.query(
        "insert into public.job_openings (organization_id, created_by, title, status) values ($1,$2,'DevOps Engineer','open') returning id",
        [org, ownerMem],
      )
    ).rows[0].id;
    await c.query(
      "insert into public.channel_connections (organization_id, channel_key, mode, status) values ($1,'linkedin','assisted','connected')",
      [org],
    );
    const posting = (
      await c.query(
        `insert into public.job_postings (organization_id, job_opening_id, channel_key, title, body, seo_score, status, created_by)
         values ($1,$2,'linkedin','DevOps Engineer','Come build with us.',88,'draft',$3) returning id`,
        [org, opening, ownerMem],
      )
    ).rows[0].id;

    // Outsider's own org (isolation).
    await asUser(c, OUTSIDER);
    await c.query("select public.provision_organization('Rival Co','standard','Rival')");

    console.log("1 · Schema");
    await asPg(c);
    const col = (
      await c.query(
        "select 1 from information_schema.columns where table_schema='public' and table_name='job_postings' and column_name='published_by'",
      )
    ).rowCount;
    assert(col === 1, "job_postings.published_by column exists");
    const idx = (await c.query("select 1 from pg_indexes where indexname='job_postings_scheduled_idx'")).rowCount;
    assert(idx === 1, "scheduled-due partial index exists");

    console.log("\n2 · Publish transition (owner)");
    await asUser(c, OWNER);
    const pub = await c.query(
      "update public.job_postings set status='published', published_at=now(), published_by=$2, error=null where id=$1 returning status, published_at, published_by",
      [posting, ownerMem],
    );
    assert(pub.rowCount === 1 && pub.rows[0].status === "published", "owner can publish (status → published)");
    assert(pub.rows[0].published_at !== null, "published_at is recorded");
    assert(pub.rows[0].published_by === ownerMem, "published_by attributes the publisher");

    console.log("\n3 · Schedule + due sweep");
    const future = new Date(Date.now() + 3600_000).toISOString();
    await c.query("update public.job_postings set status='scheduled', scheduled_for=$2, published_at=null where id=$1", [posting, future]);
    let s = (await c.query("select status, scheduled_for from public.job_postings where id=$1", [posting])).rows[0];
    assert(s.status === "scheduled" && s.scheduled_for !== null, "owner can schedule a post");
    // A future post is NOT yet due.
    const dueNow = (
      await c.query("select count(*)::int n from public.job_postings where id=$1 and status='scheduled' and scheduled_for <= now()", [posting])
    ).rows[0].n;
    assert(dueNow === 0, "future-scheduled post is not due yet");

    console.log("\n4 · Takedown on close (spec §UC-2)");
    // Put it back to published, then close the opening + run the takedown sweep.
    await c.query("update public.job_postings set status='published', scheduled_for=null, published_at=now() where id=$1", [posting]);
    await c.query("update public.job_openings set status='closed', closed_at=now() where id=$1", [opening]);
    const td = await c.query(
      "update public.job_postings set status='closed', scheduled_for=null where job_opening_id=$1 and status in ('published','scheduled') returning id",
      [opening],
    );
    assert(td.rowCount === 1, "closing the opening takes its live posts down");
    const closed = (await c.query("select status from public.job_postings where id=$1", [posting])).rows[0].status;
    assert(closed === "closed", "post is marked closed (unmanaged), not deleted");

    console.log("\n5 · RLS write gate");
    // team_lead has neither publish nor generate → cannot touch postings.
    await asUser(c, TEAMLEAD);
    await expectBlocked(
      c,
      "update public.job_postings set status='published' where id=$1",
      [posting],
      "team_lead (no publish/generate) is blocked from writing a posting",
    );

    console.log("\n6 · Cross-org isolation");
    await asUser(c, OUTSIDER);
    const outSees = (await c.query("select count(*)::int n from public.job_postings where id=$1", [posting])).rows[0].n;
    assert(outSees === 0, "another org cannot see the posting");
    await expectBlocked(
      c,
      "update public.job_postings set status='draft' where id=$1",
      [posting],
      "another org cannot modify the posting",
    );

    console.log("\n7 · Source attribution (spec §UC-2 R3)");
    await asPg(c);
    const cand = (
      await c.query(
        "insert into public.candidates (organization_id, full_name, email) values ($1,'Ada Lovelace','ada@pub.test') returning id",
        [org],
      )
    ).rows[0].id;
    await c.query(
      "insert into public.applications (organization_id, candidate_id, job_opening_id, stage, source) values ($1,$2,$3,'applied','linkedin')",
      [org, cand, opening],
    );
    const src = (
      await c.query("select source from public.applications where candidate_id=$1 and job_opening_id=$2", [cand, opening])
    ).rows[0].source;
    assert(src === "linkedin", "application records the channel source for source-of-hire");

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
