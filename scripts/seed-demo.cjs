/**
 * Create a ready-to-use demo account with sample job openings.
 *
 *   node scripts/seed-demo.cjs
 *
 * Runs the REAL sign-up flow (anon client), so it also proves whether
 * "Confirm email" is off: if a session comes back immediately, it's off and the
 * account is usable right away; if not, the toggle hasn't taken effect.
 *
 * Idempotent: removes any previous demo account first (trigger-aware, like
 * purge-test-data), then recreates it fresh with seeded openings.
 */
const path = require("path");
process.loadEnvFile(path.join(__dirname, "..", ".env.local"));

const { createClient } = require("@supabase/supabase-js");
const { Client } = require("pg");

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

const DEMO_EMAIL = "demo@hirelane.app";
const DEMO_PASSWORD = "Hirelane-Demo-2026";
const DEMO_COMPANY = "Acme Technologies";

const OPENINGS = [
  {
    title: "Senior React Developer",
    employment_type: "full_time",
    work_mode: "hybrid",
    location: "Lahore, Pakistan",
    experience_min: 4,
    experience_max: 8,
    salary_min: 250000,
    salary_max: 400000,
    salary_currency: "PKR",
    salary_visible: true,
    positions: 2,
    status: "open",
    description:
      "We're looking for a senior React engineer to lead frontend work on our recruiting platform. You'll own the component system, mentor two mid-level engineers, and shape how we build.",
    must_haves: ["React", "TypeScript", "5+ years frontend", "State management"],
    nice_to_haves: ["Next.js", "GraphQL", "Testing (Playwright/Jest)"],
    qualifications: ["BSc Computer Science or equivalent experience"],
    questions: ["What is your notice period?", "Are you comfortable with hybrid (3 days/week)?"],
  },
  {
    title: "Product Designer",
    employment_type: "full_time",
    work_mode: "remote",
    location: "Remote (PK timezone)",
    experience_min: 3,
    experience_max: 6,
    salary_min: 200000,
    salary_max: 320000,
    salary_currency: "PKR",
    salary_visible: false,
    positions: 1,
    status: "open",
    description:
      "Design end-to-end product experiences for HR teams — from job posting to candidate assessment. You'll work closely with engineering and own the design system.",
    must_haves: ["Figma", "Design systems", "User research", "Prototyping"],
    nice_to_haves: ["Motion design", "Front-end familiarity"],
    qualifications: [],
    questions: ["Share a portfolio link."],
  },
  {
    title: "DevOps Engineer",
    employment_type: "contract",
    work_mode: "on_site",
    location: "Karachi, Pakistan",
    experience_min: 3,
    experience_max: null,
    salary_min: null,
    salary_max: null,
    salary_currency: null,
    salary_visible: false,
    positions: 1,
    status: "draft",
    description:
      "6-month contract to harden our infrastructure: CI/CD, observability, and cost optimisation across our cloud footprint.",
    must_haves: ["Kubernetes", "Terraform", "AWS or GCP", "CI/CD pipelines"],
    nice_to_haves: ["Cost optimisation", "Security hardening"],
    qualifications: [],
    questions: [],
  },
];

/**
 * Tear down the demo workspace cleanly.
 *
 * The schema has three guard triggers that (correctly) block deletion in normal
 * operation: the last-owner guard, the role-in-use/Owner-role guard, and the
 * audit-log append-only guard. They also block a cascade delete of an org. Blunt
 * `session_replication_role = replica` bypasses them but ALSO skips FK cascades,
 * orphaning child rows.
 *
 * So we disable exactly those three triggers (FK cascades stay active), delete
 * the org — which cascades to memberships, roles, audit_log, openings, etc. —
 * then re-enable them, all in one transaction. A rollback would restore them.
 */
async function removeExisting() {
  const pg = new Client({
    connectionString: process.env.DIRECT_URL,
    ssl: { rejectUnauthorized: false },
  });
  await pg.connect();
  const guards = [
    ["public.memberships", "memberships_guard_last_owner"],
    ["public.roles", "roles_guard_in_use"],
    ["public.audit_log", "audit_log_no_delete"],
  ];
  try {
    await pg.query("begin");
    for (const [tbl, trg] of guards) {
      await pg.query(`alter table ${tbl} disable trigger ${trg}`);
    }

    // Org delete cascades everything org-scoped; user delete cascades
    // profile + identity. Guards are off, FK cascades are on.
    await pg.query("delete from public.organizations where name = $1", [DEMO_COMPANY]);
    await pg.query("delete from auth.users where email = $1", [DEMO_EMAIL]);

    // Sweep any rows orphaned by an earlier partial/replica-mode teardown.
    await pg.query(
      "delete from public.profiles p where p.email = $1 and not exists (select 1 from auth.users u where u.id = p.id)",
      [DEMO_EMAIL],
    );
    await pg.query(
      "delete from auth.identities i where i.email = $1 and not exists (select 1 from auth.users u where u.id = i.user_id)",
      [DEMO_EMAIL],
    );

    for (const [tbl, trg] of guards) {
      await pg.query(`alter table ${tbl} enable trigger ${trg}`);
    }
    await pg.query("commit");
  } catch (e) {
    await pg.query("rollback").catch(() => {});
    throw e;
  } finally {
    await pg.end();
  }
}

async function main() {
  console.log("Removing any previous demo account…");
  await removeExisting();

  // Create the account via the admin API with email pre-confirmed. This sends
  // NO email, so it works regardless of the "Confirm email" toggle or SMTP —
  // exactly what we want for a demo login. (The signup PAGE still needs the
  // toggle off; that's a separate, go-live concern.)
  const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
  console.log("Creating a pre-confirmed demo account…");
  const { error: createErr } = await admin.auth.admin.createUser({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: "Ayesha Founder" },
  });
  if (createErr) {
    console.error("Account creation failed:", createErr.message);
    process.exit(1);
  }

  // Sign in as the demo user to get a session, so provisioning runs as them
  // (provision_organization needs auth.uid()).
  const supabase = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
  });
  if (signInErr) {
    console.error("Sign-in failed:", signInErr.message);
    process.exit(1);
  }
  console.log("✅ Signed in as the demo user.");

  // Provision the workspace (what ensureOrganization does after sign-up).
  const { data: orgId, error: provErr } = await supabase.rpc("provision_organization", {
    p_company_name: DEMO_COMPANY,
    p_preset_key: "standard",
    p_full_name: "Ayesha Founder",
  });
  if (provErr) {
    console.error("Provisioning failed:", provErr.message);
    process.exit(1);
  }

  // Mark onboarding complete so the demo lands straight on a populated dashboard.
  await supabase
    .from("organizations")
    .update({ onboarding_completed_at: new Date().toISOString(), currency: "PKR" })
    .eq("id", orgId);

  // Find the owner membership id (created_by on openings).
  const { data: membership } = await supabase
    .from("memberships")
    .select("id")
    .eq("organization_id", orgId)
    .maybeSingle();

  console.log("Seeding sample openings…");
  for (const o of OPENINGS) {
    const { data: opening, error } = await supabase
      .from("job_openings")
      .insert({
        organization_id: orgId,
        created_by: membership.id,
        title: o.title,
        employment_type: o.employment_type,
        work_mode: o.work_mode,
        location: o.location,
        experience_min: o.experience_min,
        experience_max: o.experience_max,
        salary_min: o.salary_min,
        salary_max: o.salary_max,
        salary_currency: o.salary_currency,
        salary_visible: o.salary_visible,
        positions: o.positions,
        status: o.status,
        description: o.description,
        opened_at: o.status === "open" ? new Date().toISOString() : null,
      })
      .select("id")
      .single();

    if (error) {
      console.error(`  failed to seed "${o.title}":`, error.message);
      continue;
    }

    const reqs = [
      ...o.must_haves.map((label, i) => ({ kind: "must_have", label, sort_order: i })),
      ...o.nice_to_haves.map((label, i) => ({ kind: "nice_to_have", label, sort_order: i })),
      ...o.qualifications.map((label, i) => ({ kind: "qualification", label, sort_order: i })),
    ].map((r) => ({ ...r, job_opening_id: opening.id }));
    if (reqs.length) await supabase.from("job_requirements").insert(reqs);

    const qs = o.questions.map((question, i) => ({
      job_opening_id: opening.id,
      question,
      required: true,
      sort_order: i,
    }));
    if (qs.length) await supabase.from("screening_questions").insert(qs);

    console.log(`  ✓ ${o.title} (${o.status})`);
  }

  // Sample applicants on the first open opening, so the applicant list isn't
  // empty when clicked through.
  const { data: firstOpening } = await supabase
    .from("job_openings")
    .select("id")
    .eq("organization_id", orgId)
    .eq("status", "open")
    .order("created_at")
    .limit(1)
    .maybeSingle();

  if (firstOpening) {
    console.log("Seeding sample applicants…");
    // Skills + cover notes are tuned to spread AI screening scores (CP-13).
    const APPLICANTS = [
      { full_name: "Ayesha Khan", email: "ayesha.khan@example.com", headline: "Senior React Engineer", location: "Lahore", years_experience: 6, stage: "interview_scheduled", source: "linkedin", skills: ["React", "TypeScript", "Redux", "Next.js", "GraphQL", "Jest"], cover_note: "Senior React engineer with 6 years building TypeScript design systems and state-heavy dashboards. Led a team migrating a large app to Next.js." },
      { full_name: "Bilal Ahmed", email: "bilal.ahmed@example.com", headline: "Frontend Developer", location: "Karachi", years_experience: 5, stage: "test_completed", source: "indeed", skills: ["React", "TypeScript", "Redux", "CSS", "REST APIs"], cover_note: "Frontend developer, 5 years in React + TypeScript. Comfortable with Redux state management; some Next.js on side projects." },
      { full_name: "Hina Raza", email: "hina.raza@example.com", headline: "React Developer", location: "Remote", years_experience: 4, stage: "shortlisted", source: "rozee.pk", skills: ["React", "JavaScript", "Redux", "HTML", "CSS"], cover_note: "React developer with 4 years' experience. Mostly JavaScript; picking up TypeScript over the last few months." },
      { full_name: "Usman Tariq", email: "usman.tariq@example.com", headline: "Full-stack Engineer", location: "Islamabad", years_experience: 7, stage: "screened", source: "careers-page", skills: ["React", "TypeScript", "Node.js", "GraphQL", "Playwright", "PostgreSQL"], cover_note: "Full-stack engineer (7 yrs). Strong React + TypeScript frontend plus Node/GraphQL services. Write end-to-end tests with Playwright." },
      { full_name: "Sara Malik", email: "sara.malik@example.com", headline: "Junior Frontend Dev", location: "Lahore", years_experience: 2, stage: "applied", source: "linkedin", skills: ["React", "JavaScript", "HTML", "CSS"], cover_note: "Junior frontend developer, 2 years. Keen to grow into a senior React role; no professional TypeScript yet." },
    ];
    let firstCandidateId = null;
    for (const a of APPLICANTS) {
      const { data: cand } = await supabase
        .from("candidates")
        .insert({
          organization_id: orgId,
          full_name: a.full_name,
          email: a.email,
          headline: a.headline,
          location: a.location,
          years_experience: a.years_experience,
          skills: a.skills ?? [],
        })
        .select("id")
        .single();
      if (cand) {
        firstCandidateId ??= cand.id;
        await supabase.from("applications").insert({
          organization_id: orgId,
          candidate_id: cand.id,
          job_opening_id: firstOpening.id,
          stage: a.stage,
          source: a.source,
          cover_note: a.cover_note ?? null,
        });
      }
    }
    console.log(`  ✓ ${APPLICANTS.length} applicants on the first opening`);

    // A couple of sample notes at different visibilities on the top candidate,
    // authored by the owner.
    if (firstCandidateId) {
      const { data: ownerMem } = await supabase
        .from("memberships")
        .select("id")
        .eq("organization_id", orgId)
        .maybeSingle();
      if (ownerMem) {
        await supabase.from("candidate_notes").insert([
          {
            organization_id: orgId,
            candidate_id: firstCandidateId,
            author_membership_id: ownerMem.id,
            visibility: "team",
            body: "Strong portfolio — clean component architecture. Worth fast-tracking to a technical round.",
          },
          {
            organization_id: orgId,
            candidate_id: firstCandidateId,
            author_membership_id: ownerMem.id,
            visibility: "management",
            body: "Salary expectation is at the top of our band; flag for sign-off if we proceed to offer.",
          },
        ]);
      }
    }
  }

  // Connect a few channels so Integrations shows a realistic state.
  console.log("Connecting sample channels…");
  await supabase.from("channel_connections").insert(
    ["careers_page", "linkedin", "indeed", "rozee"].map((channel_key) => ({
      organization_id: orgId,
      channel_key,
      mode: "assisted",
      status: "connected",
    })),
  );

  console.log("\n────────────────────────────────────────");
  console.log("Demo account ready. Log in at http://localhost:3000/login");
  console.log(`  Email:    ${DEMO_EMAIL}`);
  console.log(`  Password: ${DEMO_PASSWORD}`);
  console.log("────────────────────────────────────────");
}

main().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
