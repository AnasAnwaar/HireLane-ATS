/**
 * Candidate notes — visibility-scope RLS (CP-8).
 *
 *   node scripts/test-notes.cjs
 *
 * The interesting behaviour: a note is only returned if the caller can see the
 * candidate AND the note's visibility grants them access (or they wrote it).
 * We seed private/team/management notes and check who sees what.
 *
 * Standard preset grants: HR Manager holds view_team_notes + view_management_notes;
 * Recruiter holds view_team_notes but NOT management; neither holds
 * fields.view_private_notes by default.
 *
 * Transaction, always rolled back.
 */
const path = require("path");
process.loadEnvFile(path.join(__dirname, "..", ".env.local"));
const { Client } = require("pg");

const OWNER = "eeeeeeee-0000-0000-0000-000000000001";
const HR = "eeeeeeee-0000-0000-0000-000000000002";
const RECRUITER = "eeeeeeee-0000-0000-0000-000000000003";

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
async function count(c) {
  return (await c.query("select count(*)::int as n from public.candidate_notes")).rows[0].n;
}

async function main() {
  const c = new Client({ connectionString: process.env.DIRECT_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    await c.query("begin");
    await c.query(
      `insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','o@n.test',now(),now()),
              ($2,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','hr@n.test',now(),now()),
              ($3,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','rec@n.test',now(),now())
       on conflict (id) do nothing`,
      [OWNER, HR, RECRUITER],
    );

    await asUser(c, OWNER);
    const org = (await c.query("select public.provision_organization('Notes Co','standard','O') as id")).rows[0].id;

    await asPg(c);
    const roles = (await c.query("select id,key from public.roles where organization_id=$1", [org])).rows;
    const hrRole = roles.find((r) => r.key === "hr_manager").id;
    const recRole = roles.find((r) => r.key === "recruiter").id;
    await c.query("insert into public.memberships (organization_id,user_id,role_id,status) values ($1,$2,$3,'active'),($1,$4,$5,'active')",
      [org, HR, hrRole, RECRUITER, recRole]);
    const mem = (await c.query("select id,user_id from public.memberships where organization_id=$1", [org])).rows;
    const hrMem = mem.find((m) => m.user_id === HR).id;

    // A candidate every member can see (recruiter's applicants scope is 'assigned',
    // but candidates.view_list is granted; the candidate has no application, and
    // candidate SELECT only needs applicants.view_list — recruiter has it).
    const cand = (await c.query("insert into public.candidates (organization_id,full_name,email) values ($1,'Cand','cand@x.test') returning id", [org])).rows[0].id;

    // HR writes three notes at different visibilities.
    console.log("1 · HR writes private / team / management notes");
    await asUser(c, HR);
    for (const vis of ["private", "team", "management"]) {
      await c.query(
        "insert into public.candidate_notes (organization_id,candidate_id,author_membership_id,body,visibility) values ($1,$2,$3,$4,$5)",
        [org, cand, hrMem, `${vis} note`, vis],
      );
    }
    assert((await count(c)) === 3, "author (HR) sees all three of their own notes");

    console.log("\n2 · Recruiter (team yes, management no, private no)");
    await asUser(c, RECRUITER);
    const recNotes = (await c.query("select visibility from public.candidate_notes")).rows.map((r) => r.visibility);
    assert(recNotes.includes("team"), "recruiter sees the team note");
    assert(!recNotes.includes("management"), "recruiter does NOT see the management note");
    assert(!recNotes.includes("private"), "recruiter does NOT see the private note");
    assert(recNotes.length === 1, `recruiter sees exactly 1 note (${recNotes.length})`);

    console.log("\n3 · Owner sees everything");
    await asUser(c, OWNER);
    assert((await count(c)) === 3, "owner sees all three notes");

    console.log("\n4 · Recruiter cannot edit HR's note");
    await asUser(c, RECRUITER);
    const teamNoteId = (await c.query("select id from public.candidate_notes where visibility='team'")).rows[0].id;
    const upd = await c.query("update public.candidate_notes set body='hacked' where id=$1", [teamNoteId]);
    assert(upd.rowCount === 0, "recruiter cannot edit a note they didn't author");

    console.log("\n5 · Recruiter can add their own note");
    const recMem = mem.find((m) => m.user_id === RECRUITER).id;
    const ins = await c.query(
      "insert into public.candidate_notes (organization_id,candidate_id,author_membership_id,body,visibility) values ($1,$2,$3,'my note','team') returning id",
      [org, cand, recMem],
    );
    assert(ins.rowCount === 1, "recruiter can add their own note");

    console.log("\n6 · Cross-tenant isolation");
    await asPg(c);
    await c.query(`insert into auth.users (id,instance_id,aud,role,email,created_at,updated_at)
      values ('ffffffff-0000-0000-0000-000000000009','00000000-0000-0000-0000-000000000000','authenticated','authenticated','out@z.test',now(),now())
      on conflict (id) do nothing`);
    await asUser(c, "ffffffff-0000-0000-0000-000000000009");
    await c.query("select public.provision_organization('Outsider Co','standard','Out')");
    assert((await count(c)) === 0, "a different org sees none of these notes");
  } finally {
    await c.query("rollback").catch(() => {});
    await c.end();
  }
  console.log(`\n${passed} passed, ${failed} failed.`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error("\nRunner error:", e.message); process.exit(1); });
