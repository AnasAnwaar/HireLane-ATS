"use server";

import { revalidatePath } from "next/cache";

import { QUESTION_TYPE_META } from "@/lib/assessments-display";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/validation/auth";
import { can } from "@/server/auth/authorize";
import { getSessionContext } from "@/server/auth/session";
import { isAiConfigured } from "@/server/ai/gemini";
import type {
  ProctoringLevel,
  QuestionDifficulty,
  QuestionType,
  Test,
  TestQuestion,
} from "@/types/database";

import { generateTestQuestions, regenerateQuestion, type QuestionDraft } from "./generate";

type Session = { organizationId: string; membershipId: string };

async function session(): Promise<Session | null> {
  const s = await getSessionContext();
  return s ? { organizationId: s.organizationId, membershipId: s.membershipId } : null;
}

/** Any of the given permissions grants authoring access. */
async function canAuthor(): Promise<boolean> {
  const [a, b, c] = await Promise.all([
    can("assessments.create_manual"),
    can("assessments.generate_ai"),
    can("assessments.edit"),
  ]);
  return a || b || c;
}

async function loadOpeningContext(db: Awaited<ReturnType<typeof createClient>>, openingId: string) {
  const [{ data: opening }, { data: requirements }] = await Promise.all([
    db.from("job_openings").select("title, description").eq("id", openingId).maybeSingle(),
    db.from("job_requirements").select("kind, label").eq("job_opening_id", openingId),
  ]);
  if (!opening) return null;
  return {
    title: opening.title,
    description: opening.description,
    requirements: requirements ?? [],
  };
}

// -- Create -------------------------------------------------------------------

type CreateResult = { ok: true; testId: string } | { ok: false; error: string };

export async function createManualTestAction(
  openingId: string,
  title: string,
): Promise<CreateResult> {
  const s = await session();
  if (!s) return { ok: false, error: "Your session has expired." };
  if (!(await can("assessments.create_manual"))) {
    return { ok: false, error: "You can't create tests." };
  }

  const db = await createClient();
  const { data, error } = await db
    .from("tests")
    .insert({
      organization_id: s.organizationId,
      job_opening_id: openingId,
      title: title.trim() || "Untitled test",
      created_by: s.membershipId,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Couldn't create the test." };

  revalidatePath(`/openings/${openingId}/tests`);
  return { ok: true, testId: data.id };
}

export async function createAiTestAction(
  openingId: string,
  params: {
    title: string;
    count: number;
    types: QuestionType[];
    difficulty: QuestionDifficulty | "mixed";
    skills?: string[];
    instruction?: string;
    durationMinutes?: number;
  },
): Promise<CreateResult> {
  const s = await session();
  if (!s) return { ok: false, error: "Your session has expired." };
  if (!(await can("assessments.generate_ai"))) {
    return { ok: false, error: "You can't generate tests with AI." };
  }
  if (!isAiConfigured()) {
    return { ok: false, error: "AI generation isn't set up yet — a Gemini API key is required." };
  }

  const db = await createClient();
  const ctx = await loadOpeningContext(db, openingId);
  if (!ctx) return { ok: false, error: "Opening not found." };

  const count = Math.max(1, Math.min(30, Math.round(params.count || 10)));
  let drafts: QuestionDraft[];
  try {
    drafts = await generateTestQuestions(ctx, {
      count,
      types: params.types.length ? params.types : ["single_choice", "short_answer"],
      difficulty: params.difficulty,
      skills: params.skills,
      instruction: params.instruction,
    });
  } catch {
    return { ok: false, error: "The AI couldn't generate the test. Please try again." };
  }
  if (drafts.length === 0) return { ok: false, error: "The AI returned no questions. Try again." };

  const { data: test, error } = await db
    .from("tests")
    .insert({
      organization_id: s.organizationId,
      job_opening_id: openingId,
      title: params.title.trim() || `${ctx.title} — Assessment`,
      duration_minutes: params.durationMinutes ?? null,
      created_by: s.membershipId,
    })
    .select("id")
    .single();
  if (error || !test) return { ok: false, error: error?.message ?? "Couldn't create the test." };

  await db.from("test_questions").insert(
    drafts.map((d, i) => ({
      organization_id: s.organizationId,
      test_id: test.id,
      sort_order: i,
      type: d.type,
      prompt: d.prompt,
      options: d.options,
      correct_answers: d.correct_answers,
      rubric: d.rubric,
      marks: d.marks,
      skill: d.skill,
      difficulty: d.difficulty,
    })),
  );

  revalidatePath(`/openings/${openingId}/tests`);
  return { ok: true, testId: test.id };
}

// -- Test-level edits ---------------------------------------------------------

/** Mark a published test as having unpublished changes after any edit. */
async function touchTest(db: Awaited<ReturnType<typeof createClient>>, testId: string) {
  const { data: t } = await db.from("tests").select("status").eq("id", testId).maybeSingle();
  if (t?.status === "published") {
    await db.from("tests").update({ has_unpublished_changes: true }).eq("id", testId);
  }
}

export async function updateTestSettingsAction(
  testId: string,
  settings: {
    title?: string;
    instructions?: string | null;
    durationMinutes?: number | null;
    passingThreshold?: number | null;
    shuffleQuestions?: boolean;
    shuffleOptions?: boolean;
    allowBacktrack?: boolean;
    attemptsAllowed?: number;
    proctoringLevel?: ProctoringLevel;
  },
): Promise<ActionResult> {
  const s = await session();
  if (!s) return { ok: false, error: "Your session has expired." };
  if (!(await canAuthor())) return { ok: false, error: "You can't edit tests." };

  const patch: Partial<Test> = {};
  if (settings.title !== undefined) patch.title = settings.title.trim().slice(0, 200) || "Untitled test";
  if (settings.instructions !== undefined) patch.instructions = settings.instructions?.slice(0, 4000) || null;
  if (settings.durationMinutes !== undefined) patch.duration_minutes = settings.durationMinutes;
  if (settings.passingThreshold !== undefined) patch.passing_threshold = settings.passingThreshold;
  if (settings.shuffleQuestions !== undefined) patch.shuffle_questions = settings.shuffleQuestions;
  if (settings.shuffleOptions !== undefined) patch.shuffle_options = settings.shuffleOptions;
  if (settings.allowBacktrack !== undefined) patch.allow_backtrack = settings.allowBacktrack;
  if (settings.attemptsAllowed !== undefined) patch.attempts_allowed = Math.max(1, settings.attemptsAllowed);
  if (settings.proctoringLevel !== undefined) patch.proctoring_level = settings.proctoringLevel;

  const db = await createClient();
  const { data: updated, error } = await db
    .from("tests")
    .update(patch)
    .eq("id", testId)
    .select("job_opening_id, status")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (updated?.status === "published") {
    await db.from("tests").update({ has_unpublished_changes: true }).eq("id", testId);
  }
  if (updated?.job_opening_id) revalidatePath(`/openings/${updated.job_opening_id}/tests/${testId}`);
  return { ok: true, message: "Saved." };
}

// -- Question edits -----------------------------------------------------------

export async function addQuestionAction(testId: string, type: QuestionType): Promise<ActionResult> {
  const s = await session();
  if (!s) return { ok: false, error: "Your session has expired." };
  if (!(await canAuthor())) return { ok: false, error: "You can't edit tests." };

  const db = await createClient();
  const { data: last } = await db
    .from("test_questions")
    .select("sort_order")
    .eq("test_id", testId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const options = QUESTION_TYPE_META[type].hasOptions
    ? type === "true_false"
      ? [{ id: crypto.randomUUID(), text: "True" }, { id: crypto.randomUUID(), text: "False" }]
      : [{ id: crypto.randomUUID(), text: "" }, { id: crypto.randomUUID(), text: "" }]
    : [];

  const { error } = await db.from("test_questions").insert({
    organization_id: s.organizationId,
    test_id: testId,
    sort_order: (last?.sort_order ?? -1) + 1,
    type,
    prompt: "",
    options,
    correct_answers: [],
    rubric: QUESTION_TYPE_META[type].hasOptions ? null : "",
    marks: 1,
  });
  if (error) return { ok: false, error: error.message };
  await touchTest(db, testId);
  return { ok: true, message: "Question added." };
}

export async function updateQuestionAction(
  questionId: string,
  fields: Partial<
    Pick<TestQuestion, "prompt" | "options" | "correct_answers" | "rubric" | "marks" | "skill" | "difficulty">
  >,
): Promise<ActionResult> {
  const s = await session();
  if (!s) return { ok: false, error: "Your session has expired." };
  if (!(await canAuthor())) return { ok: false, error: "You can't edit tests." };

  const patch: Partial<TestQuestion> = {};
  if (fields.prompt !== undefined) patch.prompt = fields.prompt.slice(0, 2000);
  if (fields.options !== undefined) patch.options = fields.options;
  if (fields.correct_answers !== undefined) patch.correct_answers = fields.correct_answers;
  if (fields.rubric !== undefined) patch.rubric = fields.rubric?.slice(0, 2000) ?? null;
  if (fields.marks !== undefined) patch.marks = Math.max(0, Math.round(fields.marks));
  if (fields.skill !== undefined) patch.skill = fields.skill?.slice(0, 120) ?? null;
  if (fields.difficulty !== undefined) patch.difficulty = fields.difficulty;

  const db = await createClient();
  const { data: q, error } = await db
    .from("test_questions")
    .update(patch)
    .eq("id", questionId)
    .select("test_id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (q) await touchTest(db, q.test_id);
  return { ok: true, message: "Saved." };
}

export async function deleteQuestionAction(questionId: string): Promise<ActionResult> {
  const s = await session();
  if (!s) return { ok: false, error: "Your session has expired." };
  if (!(await canAuthor())) return { ok: false, error: "You can't edit tests." };

  const db = await createClient();
  const { data: q } = await db.from("test_questions").select("test_id").eq("id", questionId).maybeSingle();
  const { error } = await db.from("test_questions").delete().eq("id", questionId);
  if (error) return { ok: false, error: error.message };
  if (q) await touchTest(db, q.test_id);
  return { ok: true, message: "Question removed." };
}

export async function reorderQuestionsAction(testId: string, orderedIds: string[]): Promise<ActionResult> {
  const s = await session();
  if (!s) return { ok: false, error: "Your session has expired." };
  if (!(await canAuthor())) return { ok: false, error: "You can't edit tests." };

  const db = await createClient();
  for (let i = 0; i < orderedIds.length; i++) {
    await db.from("test_questions").update({ sort_order: i }).eq("id", orderedIds[i]).eq("test_id", testId);
  }
  await touchTest(db, testId);
  return { ok: true };
}

export async function regenerateQuestionAction(
  questionId: string,
  instruction?: string,
): Promise<ActionResult> {
  const s = await session();
  if (!s) return { ok: false, error: "Your session has expired." };
  if (!(await can("assessments.generate_ai"))) {
    return { ok: false, error: "You can't use AI generation." };
  }
  if (!isAiConfigured()) return { ok: false, error: "AI generation isn't set up yet." };

  const db = await createClient();
  const { data: q } = await db
    .from("test_questions")
    .select("test_id, type, skill, difficulty")
    .eq("id", questionId)
    .maybeSingle();
  if (!q) return { ok: false, error: "Question not found." };

  const { data: test } = await db.from("tests").select("job_opening_id").eq("id", q.test_id).maybeSingle();
  if (!test?.job_opening_id) return { ok: false, error: "This test isn't linked to an opening." };
  const ctx = await loadOpeningContext(db, test.job_opening_id);
  if (!ctx) return { ok: false, error: "Opening not found." };

  let draft: QuestionDraft;
  try {
    draft = await regenerateQuestion(
      ctx,
      { type: q.type as QuestionType, skill: q.skill, difficulty: q.difficulty as QuestionDifficulty },
      instruction,
    );
  } catch {
    return { ok: false, error: "The AI couldn't regenerate this question." };
  }

  const { error } = await db
    .from("test_questions")
    .update({
      prompt: draft.prompt,
      options: draft.options,
      correct_answers: draft.correct_answers,
      rubric: draft.rubric,
      difficulty: draft.difficulty,
    })
    .eq("id", questionId);
  if (error) return { ok: false, error: error.message };
  await touchTest(db, q.test_id);
  return { ok: true, message: "Question regenerated." };
}

// -- Publish (versioning, spec R3) --------------------------------------------

function validateForPublish(questions: TestQuestion[]): string | null {
  if (questions.length === 0) return "Add at least one question before publishing.";
  for (const [i, q] of questions.entries()) {
    const n = i + 1;
    if (!q.prompt.trim()) return `Question ${n} has no prompt.`;
    if (QUESTION_TYPE_META[q.type].hasOptions) {
      const opts = (q.options ?? []).filter((o) => o.text.trim());
      if (opts.length < 2) return `Question ${n} needs at least two options.`;
      if ((q.correct_answers ?? []).length === 0) return `Question ${n} has no correct answer marked.`;
    } else if (!q.rubric?.trim()) {
      return `Question ${n} needs a grading rubric.`;
    }
  }
  return null;
}

export async function publishTestAction(testId: string): Promise<ActionResult> {
  const s = await session();
  if (!s) return { ok: false, error: "Your session has expired." };
  if (!(await can("assessments.edit"))) {
    return { ok: false, error: "You don't have permission to publish tests." };
  }

  const db = await createClient();
  const [{ data: test }, { data: questions }] = await Promise.all([
    db.from("tests").select("*").eq("id", testId).maybeSingle(),
    db.from("test_questions").select("*").eq("test_id", testId).order("sort_order"),
  ]);
  if (!test) return { ok: false, error: "Test not found." };

  const problem = validateForPublish((questions ?? []) as TestQuestion[]);
  if (problem) return { ok: false, error: problem };

  const nextVersion = test.version + 1;
  const { error: verErr } = await db.from("test_versions").insert({
    organization_id: s.organizationId,
    test_id: testId,
    version: nextVersion,
    snapshot: { test, questions },
    published_by: s.membershipId,
  });
  if (verErr) return { ok: false, error: verErr.message };

  const { error } = await db
    .from("tests")
    .update({
      status: "published",
      version: nextVersion,
      has_unpublished_changes: false,
      published_at: new Date().toISOString(),
    })
    .eq("id", testId);
  if (error) return { ok: false, error: error.message };

  await db.from("audit_log").insert({
    organization_id: s.organizationId,
    actor_membership_id: s.membershipId,
    action: "test.published",
    entity_type: "test",
    entity_id: testId,
    summary: `Published “${test.title}” v${nextVersion}`,
  });

  if (test.job_opening_id) {
    revalidatePath(`/openings/${test.job_opening_id}/tests`);
    revalidatePath(`/openings/${test.job_opening_id}/tests/${testId}`);
  }
  return { ok: true, message: `Published version ${nextVersion}.` };
}

export async function archiveTestAction(testId: string): Promise<ActionResult> {
  const s = await session();
  if (!s) return { ok: false, error: "Your session has expired." };
  if (!(await can("assessments.edit"))) return { ok: false, error: "You can't archive tests." };

  const db = await createClient();
  const { data: t, error } = await db
    .from("tests")
    .update({ status: "archived" })
    .eq("id", testId)
    .select("job_opening_id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (t?.job_opening_id) revalidatePath(`/openings/${t.job_opening_id}/tests`);
  return { ok: true, message: "Test archived." };
}

export async function deleteTestAction(testId: string): Promise<ActionResult> {
  const s = await session();
  if (!s) return { ok: false, error: "Your session has expired." };
  if (!(await can("assessments.edit"))) return { ok: false, error: "You can't delete tests." };

  const db = await createClient();
  const { data: t } = await db.from("tests").select("job_opening_id").eq("id", testId).maybeSingle();
  const { error } = await db.from("tests").delete().eq("id", testId);
  if (error) return { ok: false, error: error.message };
  if (t?.job_opening_id) revalidatePath(`/openings/${t.job_opening_id}/tests`);
  return { ok: true, message: "Test deleted." };
}

// -- Question bank ------------------------------------------------------------

export async function saveQuestionToBankAction(questionId: string): Promise<ActionResult> {
  const s = await session();
  if (!s) return { ok: false, error: "Your session has expired." };
  if (!(await can("assessments.manage_bank"))) {
    return { ok: false, error: "You can't manage the question bank." };
  }

  const db = await createClient();
  const { data: q } = await db
    .from("test_questions")
    .select("type, prompt, options, correct_answers, rubric, marks, skill, difficulty")
    .eq("id", questionId)
    .maybeSingle();
  if (!q) return { ok: false, error: "Question not found." };

  const { error } = await db.from("question_bank").insert({
    organization_id: s.organizationId,
    type: q.type,
    prompt: q.prompt,
    options: q.options,
    correct_answers: q.correct_answers,
    rubric: q.rubric,
    marks: q.marks,
    skill: q.skill,
    difficulty: q.difficulty,
    tags: q.skill ? [q.skill] : [],
    created_by: s.membershipId,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, message: "Saved to question bank." };
}
