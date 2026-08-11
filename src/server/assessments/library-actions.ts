"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { can } from "@/server/auth/authorize";
import { getSessionContext } from "@/server/auth/session";
import { isAiConfigured } from "@/server/ai/gemini";
import type { QuestionDifficulty, QuestionType, Test, TestQuestion } from "@/types/database";

import { generateTestQuestions, type QuestionDraft } from "./generate";
import { getAssessmentPolicy, type PolicyDefaults } from "./policy";

/**
 * Assessment library (reusable templates). A library assessment is a `tests` row
 * with is_bank_template = true and no opening. It's authored once in the hub and
 * later COPIED into a job opening ("Use in a role"), so each role gets its own
 * independent, separately-versioned test — edits never ripple back to the master.
 */

type CreateResult = { ok: true; testId: string } | { ok: false; error: string };

function policyColumns(policy: PolicyDefaults) {
  return {
    proctoring_level: policy.proctoringLevel,
    duration_minutes: policy.durationMinutes,
    passing_threshold: policy.passingThreshold,
    attempts_allowed: policy.attempts,
    allow_backtrack: policy.allowBacktrack,
    shuffle_questions: policy.shuffleQuestions,
  };
}

async function session() {
  const s = await getSessionContext();
  return s ? { organizationId: s.organizationId, membershipId: s.membershipId } : null;
}

/** Create an empty library assessment to author by hand. */
export async function createLibraryManualTestAction(title: string): Promise<CreateResult> {
  const s = await session();
  if (!s) return { ok: false, error: "Your session has expired." };
  if (!(await can("assessments.create_manual"))) {
    return { ok: false, error: "You can't create assessments." };
  }

  const db = await createClient();
  const policy = await getAssessmentPolicy(db, s.organizationId);
  const { data, error } = await db
    .from("tests")
    .insert({
      organization_id: s.organizationId,
      job_opening_id: null,
      is_bank_template: true,
      title: title.trim() || "Untitled assessment",
      created_by: s.membershipId,
      ...policyColumns(policy),
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Couldn't create the assessment." };

  revalidatePath("/assessments");
  return { ok: true, testId: data.id };
}

/** Create a library assessment with AI, drafting questions from typed topics. */
export async function createLibraryAiTestAction(params: {
  title: string;
  topics: string[];
  count: number;
  types: QuestionType[];
  difficulty: QuestionDifficulty | "mixed";
  durationMinutes?: number;
}): Promise<CreateResult> {
  const s = await session();
  if (!s) return { ok: false, error: "Your session has expired." };
  if (!(await can("assessments.generate_ai"))) {
    return { ok: false, error: "You can't generate assessments with AI." };
  }
  if (!isAiConfigured()) {
    return { ok: false, error: "AI generation isn't set up yet — a Gemini API key is required." };
  }

  const topics = params.topics.map((t) => t.trim()).filter(Boolean).slice(0, 20);
  if (topics.length === 0) return { ok: false, error: "Add at least one topic or skill to generate from." };

  const title = params.title.trim() || `${topics[0]} Assessment`;
  // Synthesize an opening-like context from the typed topics so the existing
  // generator can draft against them.
  const ctx = {
    title,
    description: null,
    requirements: topics.map((label) => ({ kind: "must_have", label })),
  };

  const count = Math.max(1, Math.min(30, Math.round(params.count || 10)));
  let drafts: QuestionDraft[];
  try {
    drafts = await generateTestQuestions(ctx, {
      count,
      types: params.types.length ? params.types : ["single_choice", "short_answer"],
      difficulty: params.difficulty,
      skills: topics,
    });
  } catch {
    return { ok: false, error: "The AI couldn't generate the assessment. Please try again." };
  }
  if (drafts.length === 0) return { ok: false, error: "The AI returned no questions. Try again." };

  const db = await createClient();
  const policy = await getAssessmentPolicy(db, s.organizationId);
  const { data: test, error } = await db
    .from("tests")
    .insert({
      organization_id: s.organizationId,
      job_opening_id: null,
      is_bank_template: true,
      title,
      created_by: s.membershipId,
      ...policyColumns(policy),
      duration_minutes: params.durationMinutes ?? policy.durationMinutes,
    })
    .select("id")
    .single();
  if (error || !test) return { ok: false, error: error?.message ?? "Couldn't create the assessment." };

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

  revalidatePath("/assessments");
  return { ok: true, testId: test.id };
}

/**
 * Copy a library assessment into a job opening as a fresh draft test. The new
 * test is fully independent: its own version history, unaffected by later edits
 * to the template.
 */
export async function attachLibraryTestToOpeningAction(
  templateTestId: string,
  openingId: string,
): Promise<CreateResult> {
  const s = await session();
  if (!s) return { ok: false, error: "Your session has expired." };
  if (!(await can("assessments.create_manual"))) {
    return { ok: false, error: "You can't add assessments to openings." };
  }

  const db = await createClient();
  const [{ data: template }, { data: questions }, { data: opening }] = await Promise.all([
    db.from("tests").select("*").eq("id", templateTestId).maybeSingle(),
    db.from("test_questions").select("*").eq("test_id", templateTestId).order("sort_order"),
    db.from("job_openings").select("id").eq("id", openingId).maybeSingle(),
  ]);
  if (!template || !(template as Test).is_bank_template) {
    return { ok: false, error: "Library assessment not found." };
  }
  if (!opening) return { ok: false, error: "Opening not found." };

  const t = template as Test;
  const { data: copy, error } = await db
    .from("tests")
    .insert({
      organization_id: s.organizationId,
      job_opening_id: openingId,
      is_bank_template: false,
      status: "draft",
      version: 0,
      title: t.title,
      instructions: t.instructions,
      duration_minutes: t.duration_minutes,
      passing_threshold: t.passing_threshold,
      shuffle_questions: t.shuffle_questions,
      shuffle_options: t.shuffle_options,
      allow_backtrack: t.allow_backtrack,
      attempts_allowed: t.attempts_allowed,
      proctoring_level: t.proctoring_level,
      created_by: s.membershipId,
    })
    .select("id")
    .single();
  if (error || !copy) return { ok: false, error: error?.message ?? "Couldn't add the assessment." };

  const qs = (questions ?? []) as TestQuestion[];
  if (qs.length) {
    await db.from("test_questions").insert(
      qs.map((q, i) => ({
        organization_id: s.organizationId,
        test_id: copy.id,
        sort_order: i,
        type: q.type,
        prompt: q.prompt,
        options: q.options,
        correct_answers: q.correct_answers,
        rubric: q.rubric,
        marks: q.marks,
        skill: q.skill,
        difficulty: q.difficulty,
      })),
    );
  }

  revalidatePath(`/openings/${openingId}/tests`);
  revalidatePath("/assessments");
  return { ok: true, testId: copy.id };
}
