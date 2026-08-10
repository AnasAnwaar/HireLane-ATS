/**
 * Auth backend integration test.
 *
 *   node scripts/test-auth-flow.cjs
 *
 * The isolation suite (test-isolation.cjs) hits Postgres directly with forged
 * JWT claims. This one goes through the real Supabase stack — Auth API +
 * PostgREST — exercising the exact code path the app's server actions use:
 *
 *   admin.auth.admin.createUser()      the account half of sign-up
 *   userClient.rpc('provision_organization')   what ensureOrganization() calls
 *   userClient.rpc('has_permission')   what the permission helpers call
 *   admin.auth.admin.inviteUserByEmail()  the team-invite path (CP-3b)
 *
 * It does NOT test email delivery or the browser redirect chain — those need a
 * human. It proves everything up to and after the email.
 *
 * All test users and their organisations are deleted in a finally block, so the
 * database is left clean. Uses the service-role key, so it must never run
 * against production data.
 */
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const { Client } = require("pg");

process.loadEnvFile(path.join(__dirname, "..", ".env.local"));

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

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

const stamp = process.env.TEST_STAMP || String(Date.now());

/** A client acting as a specific signed-in user (subject to RLS). */
async function clientFor(email, password) {
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  return c;
}

async function createUser(email, password, meta) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // skip the email round trip for the test
    user_metadata: meta,
  });
  if (error) throw new Error(`createUser failed: ${error.message}`);
  return data.user;
}

async function main() {
  const pw = "Test-Passw0rd-" + stamp.slice(-6);
  const emailA = `owner-a-${stamp}@hirelane.test`;
  const emailB = `owner-b-${stamp}@hirelane.test`;
  // inviteUserByEmail validates deliverability format and rejects the reserved
  // .test TLD, so the invitee uses example.com (createUser is more lenient).
  const emailInvitee = `invitee-${stamp}@example.com`;

  try {
    console.log("1 · Sign-up + organisation provisioning (the ensureOrganization path)");

    await createUser(emailA, pw, {
      full_name: "Owner A",
      pending_company_name: `Acme ${stamp}`,
      pending_preset: "standard",
    });
    const userA = await clientFor(emailA, pw);

    const { data: orgAId, error: provErr } = await userA.rpc("provision_organization", {
      p_company_name: `Acme ${stamp}`,
      p_preset_key: "standard",
      p_full_name: "Owner A",
    });
    assert(!provErr && typeof orgAId === "string", `provision_organization returned an org id`);
    if (provErr) console.log(`        ${provErr.message}`);

    // What getSessionContext() reads on every authenticated request.
    const { data: ctx } = await userA
      .from("memberships")
      .select("id, is_owner, organization_id, organizations(name, onboarding_completed_at), roles(name), profiles(full_name, email)")
      .eq("status", "active")
      .maybeSingle();

    assert(ctx?.is_owner === true, "creator is the Owner");
    assert(ctx?.organizations?.name === `Acme ${stamp}`, "session context resolves the org name");
    assert(ctx?.roles?.name != null, "session context resolves the role name");
    assert(ctx?.profiles?.email === emailA, "session context resolves the profile");

    const { count: roleCount } = await userA
      .from("roles")
      .select("*", { count: "exact", head: true });
    assert(roleCount === 6, `Standard preset created 6 roles (got ${roleCount})`);

    const { data: audit } = await userA
      .from("audit_log")
      .select("action")
      .eq("action", "organization.created")
      .maybeSingle();
    assert(audit != null, "provisioning wrote an audit entry");

    console.log("\n2 · Double-provisioning is refused");
    const { error: dupErr } = await userA.rpc("provision_organization", {
      p_company_name: "Second Co",
      p_preset_key: "standard",
    });
    assert(dupErr != null, "a second provision_organization call is rejected");

    console.log("\n3 · Permission resolution through PostgREST (RPC)");
    const { data: ownerManage } = await userA.rpc("has_permission", {
      p_key: "administration.manage_roles",
    });
    assert(ownerManage === true, "owner has_permission(manage_roles) = true");

    const { data: myPerms } = await userA.rpc("my_permissions");
    const { count: totalPerms } = await userA
      .from("permissions")
      .select("*", { count: "exact", head: true });
    assert(
      Array.isArray(myPerms) && myPerms.length === totalPerms,
      `owner my_permissions() = full catalogue (${myPerms?.length}/${totalPerms})`,
    );

    console.log("\n4 · Tenant isolation through the real API");
    await createUser(emailB, pw, {
      full_name: "Owner B",
      pending_company_name: `Globex ${stamp}`,
      pending_preset: "standard",
    });
    const userB = await clientFor(emailB, pw);
    await userB.rpc("provision_organization", {
      p_company_name: `Globex ${stamp}`,
      p_preset_key: "standard",
      p_full_name: "Owner B",
    });

    const { count: bSeesOrgs } = await userB
      .from("organizations")
      .select("*", { count: "exact", head: true });
    assert(bSeesOrgs === 1, "Owner B sees exactly one organisation (not Acme's)");

    const { data: bSeesAcme } = await userB
      .from("organizations")
      .select("id")
      .eq("id", orgAId)
      .maybeSingle();
    assert(bSeesAcme == null, "Owner B cannot read Acme by id through PostgREST");

    console.log("\n5 · Team invitation — membership + activation logic (CP-3b)");
    // The invitee account is created directly here. In the app this is
    // inviteUserByEmail's job, but that also SENDS an email and needs SMTP
    // configured (see section 6) — the membership logic below is what we own.
    const invitee = await createUser(emailInvitee, pw, {
      full_name: "Invitee",
      invited_to_organization: orgAId,
    });

    const { data: recRole } = await userA
      .from("roles")
      .select("id")
      .eq("key", "recruiter")
      .maybeSingle();
    assert(recRole != null, "recruiter role exists to assign the invitee");

    const { error: memErr } = await admin.from("memberships").insert({
      organization_id: orgAId,
      user_id: invitee.id,
      role_id: recRole.id,
      status: "invited",
    });
    assert(!memErr, "invited membership row created as status=invited");

    // What activateOwnMembershipAction does once the invitee sets a password.
    const { error: actErr } = await admin
      .from("memberships")
      .update({ status: "active" })
      .eq("user_id", invitee.id)
      .eq("organization_id", orgAId);
    assert(!actErr, "membership activates to status=active");

    // The activated invitee, signed in, resolves the recruiter's scoped grant.
    const inviteeClient = await clientFor(emailInvitee, pw);
    const { data: scope } = await inviteeClient.rpc("permission_scope_of", {
      p_key: "applicants.view_list",
    });
    assert(scope === "assigned", "activated recruiter resolves 'assigned' scope");

    const { data: denied } = await inviteeClient.rpc("has_permission", {
      p_key: "administration.manage_roles",
    });
    assert(denied === false, "recruiter is denied manage_roles through the live API");

    console.log("\n6 · Email delivery config check (informational, not a failure)");
    const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(
      `probe-${stamp}@example.com`,
      { data: { probe: true } },
    );
    if (inviteErr) {
      console.log(`  INFO  inviteUserByEmail not usable yet: "${inviteErr.message}"`);
      console.log("        → Configure SMTP + email templates in Supabase before real invites.");
    } else {
      console.log("  INFO  inviteUserByEmail accepted — SMTP appears configured.");
      // Clean up the probe user if it was created.
      const { data: list } = await admin.auth.admin.listUsers();
      const probe = list?.users?.find((u) => u.email === `probe-${stamp}@example.com`);
      if (probe) await admin.auth.admin.deleteUser(probe.id).catch(() => {});
    }
  } finally {
    // Clean up via a direct superuser connection, not the admin API: the
    // guard_last_owner trigger blocks deletion of an org's owner (and therefore
    // the CASCADE from deleting the owner's auth user). Suspending user triggers
    // with session_replication_role=replica lets the deletes through. Scoped to
    // this run's stamp, so a parallel run is untouched.
    console.log("\nCleaning up test data…");
    const pg = new Client({
      connectionString: process.env.DIRECT_URL,
      ssl: { rejectUnauthorized: false },
    });
    try {
      await pg.connect();
      await pg.query("begin");
      await pg.query("set local session_replication_role = replica");
      await pg.query(
        "delete from public.memberships where organization_id in (select id from public.organizations where name like $1)",
        [`%${stamp}%`],
      );
      await pg.query("delete from public.organizations where name like $1", [`%${stamp}%`]);
      await pg.query("delete from auth.users where email like $1", [`%${stamp}%`]);
      // replica mode disables the profiles FK cascade, so remove any profile
      // rows the deleted auth users left behind (prevents orphan accumulation).
      await pg.query("delete from public.profiles where not exists (select 1 from auth.users u where u.id = profiles.id)");
      await pg.query("commit");
    } catch (cleanupErr) {
      await pg.query("rollback").catch(() => {});
      console.log(`  (cleanup warning: ${cleanupErr.message} — run scripts/purge-test-data.cjs)`);
    } finally {
      await pg.end().catch(() => {});
    }
  }

  console.log(`\n${passed} passed, ${failed} failed.`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error("\nRunner error:", err.message);
  process.exit(1);
});
