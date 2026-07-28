/**
 * Candidate portal invites — constraints + RLS (CP-9).
 *
 *   node scripts/test-portal.cjs
 *
 * Verifies: one live invite per candidate (reissue must revoke first), revoking
 * frees the slot, token-hash lookup, and cross-tenant isolation.
 *
 * Transaction, always rolled back.
 */
const path = require("path");
const crypto = require("crypto");
process.loadEnvFile(path.join(__dirname, "..", ".env.local"));
const { Client } = require("pg");

const OWNER = "77777777-0000-0000-0000-000000000001";
const OUTSIDER = "77777777-0000-0000-0000-000000000002";

let passed = 0, failed = 0;
const assert = (c, l) => (c ? (passed++, console.log(`  PASS  ${l}`)) : (failed++, console.log(`  FAIL  ${l}`)));
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

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
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','o@p.test',now(),now()),
              ($2,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','out@p.test',now(),now())
       on conflict (id) do nothing`,
      [OWNER, OUTSIDER],
    );

    await asUser(c, OWNER);
    const org = (await c.query("select public.provision_organization('Portal Co','standard','O') as id")).rows[0].id;
    const cand = (await c.query("insert into public.candidates (organization_id,full_name,email) values ($1,'Cand','cand@x.test') returning id", [org])).rows[0].id;

    const future = "now() + interval '14 days'";

    console.log("1 · Issue an invite");
    const t1 = "token-one-" + "x".repeat(20);
    const ins1 = await c.query(
      `insert into public.candidate_portal_invites (organization_id,candidate_id,token_hash,expires_at)
       values ($1,$2,$3, ${future}) returning id`,
      [org, cand, sha256(t1)],
    );
    assert(ins1.rowCount === 1, "owner can issue a portal invite");

    console.log("\n2 · Only one live invite per candidate");
    let blocked = false;
    await c.query("savepoint sp");
    try {
      await c.query(
        `insert into public.candidate_portal_invites (organization_id,candidate_id,token_hash,expires_at)
         values ($1,$2,$3, ${future})`,
        [org, cand, sha256("token-two-" + "y".repeat(20))],
      );
      await c.query("release savepoint sp");
    } catch {
      blocked = true;
      await c.query("rollback to savepoint sp");
    }
    assert(blocked, "a second live invite for the same candidate is rejected");

    console.log("\n3 · Revoking frees the slot");
    await c.query("update public.candidate_portal_invites set revoked_at = now() where candidate_id=$1 and revoked_at is null", [cand]);
    const t2 = "token-three-" + "z".repeat(20);
    const ins2 = await c.query(
      `insert into public.candidate_portal_invites (organization_id,candidate_id,token_hash,expires_at)
       values ($1,$2,$3, ${future}) returning id`,
      [org, cand, sha256(t2)],
    );
    assert(ins2.rowCount === 1, "a new invite can be issued after revoking the old one");

    console.log("\n4 · Token-hash lookup resolves the live invite");
    const found = await c.query(
      "select id from public.candidate_portal_invites where token_hash=$1 and revoked_at is null and expires_at > now()",
      [sha256(t2)],
    );
    assert(found.rowCount === 1, "the current token resolves to a live invite");
    const oldFound = await c.query(
      "select id from public.candidate_portal_invites where token_hash=$1 and revoked_at is null and expires_at > now()",
      [sha256(t1)],
    );
    assert(oldFound.rowCount === 0, "the revoked token no longer resolves");

    console.log("\n5 · Cross-tenant isolation");
    await asPg(c);
    await asUser(c, OUTSIDER);
    await c.query("select public.provision_organization('Other Co','standard','Out')");
    const outSees = (await c.query("select count(*)::int as n from public.candidate_portal_invites")).rows[0].n;
    assert(outSees === 0, "a different org sees no portal invites");
  } finally {
    await c.query("rollback").catch(() => {});
    await c.end();
  }
  console.log(`\n${passed} passed, ${failed} failed.`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error("\nRunner error:", e.message); process.exit(1); });
