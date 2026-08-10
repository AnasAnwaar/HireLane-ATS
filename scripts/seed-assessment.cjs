/**
 * Seed one complete demo assessment so Phase 4 (CP-15..18) is demoable end to
 * end: a published test, an assignment, and a SUBMITTED attempt with auto-scored
 * answers + AI-suggested written grades left pending human confirmation.
 *
 *   node scripts/seed-assessment.cjs
 *
 * Idempotent: removes any prior copy of this test first.
 */
const path = require("path");
const crypto = require("node:crypto");
process.loadEnvFile(path.join(__dirname, "..", ".env.local"));
const { Client } = require("pg");

const uid = () => crypto.randomUUID();
const TEST_TITLE = "React Frontend Screening";
const OPENING_ID = "fc7489b7-6f65-4a4a-8e7c-27dfdbcdcb47"; // Senior React Developer (populated)

// --- Question set (auto + written) -------------------------------------------
function buildQuestions() {
  const o = (text) => ({ id: uid(), text });

  const q1opts = [o("It memoises a computed value between renders"), o("It fetches data from an API"), o("It replaces useState"), o("It schedules a re-render")];
  const q2opts = [o("True"), o("False")];
  const q3opts = [o("useState"), o("useEffect"), o("useContext"), o("useFetch")];

  return [
    {
      id: uid(), type: "single_choice", sort: 0, marks: 2, skill: "React", difficulty: "easy",
      prompt: "What does the React `useMemo` hook do?",
      options: q1opts, correct_answers: [q1opts[0].id], rubric: null,
    },
    {
      id: uid(), type: "true_false", sort: 1, marks: 1, skill: "TypeScript", difficulty: "easy",
      prompt: "TypeScript is a typed superset of JavaScript.",
      options: q2opts, correct_answers: [q2opts[0].id], rubric: null,
    },
    {
      id: uid(), type: "multiple_choice", sort: 2, marks: 3, skill: "React", difficulty: "medium",
      prompt: "Which of the following are built-in React hooks? (Select all that apply.)",
      options: q3opts, correct_answers: [q3opts[0].id, q3opts[1].id, q3opts[2].id], rubric: null,
    },
    {
      id: uid(), type: "short_answer", sort: 3, marks: 5, skill: "State management", difficulty: "medium",
      prompt: "In one or two sentences, explain why lifting state up is sometimes preferable to prop drilling.",
      options: [], correct_answers: [],
      rubric: "Full marks: identifies that shared state belongs at the nearest common ancestor so siblings stay in sync, and notes context/state libraries as an alternative to deep prop drilling.",
    },
    {
      id: uid(), type: "scenario", sort: 4, marks: 5, skill: "Performance", difficulty: "hard",
      prompt: "A list of 5,000 rows re-renders slowly on every keystroke in a search box. Describe how you'd diagnose and fix it.",
      options: [], correct_answers: [],
      rubric: "Strong answer: debounce the input, memoise the filtered list (useMemo), virtualise the list (react-window), and avoid re-creating callbacks/objects each render (useCallback/memo). Diagnosis via React Profiler.",
    },
  ];
}

// scoreChoice mirror (from delivery.ts) for the completed attempt.
function scoreChoice(q, selected) {
  const key = new Set(q.correct_answers);
  const picked = new Set(selected);
  if (q.type === "single_choice" || q.type === "true_false") {
    return { marks: picked.size === 1 && key.has([...picked][0]) ? q.marks : 0, correct: picked.size === 1 && key.has([...picked][0]) };
  }
  let right = 0, wrong = 0;
  for (const id of picked) (key.has(id) ? right++ : wrong++);
  const ratio = key.size ? Math.max(0, (right - wrong) / key.size) : 0;
  return { marks: Math.round(ratio * q.marks * 100) / 100, correct: right === key.size && wrong === 0 };
}

(async () => {
  const c = new Client({ connectionString: process.env.DIRECT_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    const opening = (await c.query("select organization_id from public.job_openings where id=$1", [OPENING_ID])).rows[0];
    if (!opening) throw new Error("Demo opening not found — run seed-demo first.");
    const org = opening.organization_id;

    const ownerMem = (await c.query(
      "select m.id from public.memberships m join auth.users u on u.id=m.user_id where m.organization_id=$1 and u.email='demo@hirelane.app'",
      [org],
    )).rows[0].id;

    const app = (await c.query(
      "select a.id as application_id, a.candidate_id from public.applications a join public.candidates ca on ca.id=a.candidate_id where a.job_opening_id=$1 and ca.full_name='Bilal Ahmed'",
      [OPENING_ID],
    )).rows[0];
    if (!app) throw new Error("Applicant 'Bilal Ahmed' not found on the demo opening.");

    // Ayesha gets the SAME test unstarted, so the candidate-portal "take a test"
    // flow is demoable (her portal link is the one issued by demo-portal-link).
    const ayesha = (await c.query(
      "select a.id as application_id, a.candidate_id from public.applications a join public.candidates ca on ca.id=a.candidate_id where a.job_opening_id=$1 and ca.full_name='Ayesha Khan'",
      [OPENING_ID],
    )).rows[0];

    // Idempotent: drop any prior copy of this test (cascades to questions,
    // versions, assignments, attempts, answers).
    await c.query("delete from public.tests where organization_id=$1 and job_opening_id=$2 and title=$3", [org, OPENING_ID, TEST_TITLE]);

    const questions = buildQuestions();
    const testId = uid();
    const maxScore = questions.reduce((s, q) => s + q.marks, 0);

    await c.query(
      `insert into public.tests (id, organization_id, job_opening_id, title, instructions, status, version,
         duration_minutes, passing_threshold, attempts_allowed, allow_backtrack, shuffle_questions, proctoring_level, created_by, published_at)
       values ($1,$2,$3,$4,$5,'published',1, 30, 60, 1, true, false, 'standard', $6, now())`,
      [testId, org, OPENING_ID, TEST_TITLE, "Answer all questions. Auto-scored questions are marked instantly; written answers are reviewed by our team.", ownerMem],
    );

    for (const q of questions) {
      await c.query(
        `insert into public.test_questions (id, organization_id, test_id, sort_order, type, prompt, options, correct_answers, rubric, marks, skill, difficulty)
         values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11,$12)`,
        [q.id, org, testId, q.sort, q.type, q.prompt, JSON.stringify(q.options), JSON.stringify(q.correct_answers), q.rubric, q.marks, q.skill, q.difficulty],
      );
    }

    // Version snapshot (what publish would store).
    const snapshot = {
      test: { title: TEST_TITLE, instructions: "Answer all questions.", allow_backtrack: true },
      questions,
    };
    await c.query(
      "insert into public.test_versions (organization_id, test_id, version, snapshot, published_by) values ($1,$2,1,$3::jsonb,$4)",
      [org, testId, JSON.stringify(snapshot), ownerMem],
    );

    // Assignment (submitted) + a completed attempt.
    const assignmentId = uid();
    await c.query(
      "insert into public.test_assignments (id, organization_id, test_id, application_id, candidate_id, status, attempts_allowed, attempts_used, assigned_by) values ($1,$2,$3,$4,$5,'submitted',1,1,$6)",
      [assignmentId, org, testId, app.application_id, app.candidate_id, ownerMem],
    );

    const attemptId = uid();
    // Candidate answers.
    const responses = {
      [questions[0].id]: { selected: [questions[0].correct_answers[0]] }, // correct
      [questions[1].id]: { selected: [questions[1].correct_answers[0]] }, // correct
      [questions[2].id]: { selected: [questions[2].correct_answers[0], questions[2].correct_answers[1]] }, // partial (2 of 3)
      [questions[3].id]: { text: "Lifting state to the nearest common parent keeps sibling components in sync from a single source of truth, instead of threading the same props through many intermediate layers." },
      [questions[4].id]: { text: "I'd profile with React DevTools to confirm the list is the bottleneck, debounce the search input, memoise the filtered array with useMemo, and virtualise the rows so only visible ones render." },
    };

    let autoScore = 0;
    for (const q of questions) {
      if (["single_choice", "true_false", "multiple_choice"].includes(q.type)) {
        const s = scoreChoice(q, responses[q.id].selected);
        autoScore += s.marks;
      }
    }

    await c.query(
      `insert into public.test_attempts (id, organization_id, assignment_id, test_id, version, question_order, option_orders, status, started_at, expires_at, submitted_at, consent_at, auto_score, max_score)
       values ($1,$2,$3,$4,1,$5::jsonb,'{}'::jsonb,'submitted', now()-interval '25 min', now()-interval '5 min', now()-interval '6 min', now()-interval '25 min', $6, $7)`,
      [attemptId, org, assignmentId, testId, JSON.stringify(questions.map((q) => q.id)), autoScore, maxScore],
    );

    for (const q of questions) {
      const r = responses[q.id];
      if (["single_choice", "true_false", "multiple_choice"].includes(q.type)) {
        const s = scoreChoice(q, r.selected);
        await c.query(
          "insert into public.test_answers (organization_id, attempt_id, question_id, response, awarded_marks, is_correct, confirmed) values ($1,$2,$3,$4::jsonb,$5,$6,true)",
          [org, attemptId, q.id, JSON.stringify(r), s.marks, s.correct],
        );
      } else {
        // Written: AI suggestion present, left UNCONFIRMED so HR can demo the confirm flow.
        const suggested = q.sort === 3 ? 4 : 3;
        const rationale = q.sort === 3
          ? "Correctly identifies the single-source-of-truth benefit; could mention context/state libraries as the alternative to deep drilling."
          : "Good instinct (profiling, debounce, memoisation, virtualisation) but doesn't mention avoiding re-created callbacks/objects each render.";
        await c.query(
          "insert into public.test_answers (organization_id, attempt_id, question_id, response, ai_suggested_marks, ai_rationale, confirmed) values ($1,$2,$3,$4::jsonb,$5,$6,false)",
          [org, attemptId, q.id, JSON.stringify(r), suggested, rationale],
        );
      }
    }

    // Ayesha: an unstarted assignment (with a deadline) so the portal shows
    // "Start test" and the timed runner is demoable.
    if (ayesha) {
      await c.query(
        "insert into public.test_assignments (organization_id, test_id, application_id, candidate_id, status, deadline, attempts_allowed, assigned_by) values ($1,$2,$3,$4,'assigned', now()+interval '7 days', 1, $5)",
        [org, testId, ayesha.application_id, ayesha.candidate_id, ownerMem],
      );
    }

    console.log(`✓ Seeded '${TEST_TITLE}' (published v1, ${questions.length} questions, ${maxScore} marks)`);
    console.log(`  → Bilal Ahmed: one SUBMITTED attempt (auto ${autoScore}/${maxScore}; 2 written answers AI-graded, pending confirmation)`);
    if (ayesha) console.log(`  → Ayesha Khan: assigned + UNSTARTED (demo the candidate take-a-test flow via her portal link)`);
  } finally {
    await c.end();
  }
})().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
