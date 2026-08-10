import "server-only";

import { Type, type Schema } from "@google/genai";

import { isWritten } from "@/lib/assessments-display";
import type { createClient } from "@/lib/supabase/server";
import { generateJson } from "@/server/ai/gemini";
import type { TestAnswerResponse } from "@/types/database";

import type { SnapshotQuestion } from "./delivery";

/**
 * AI grading of written answers (spec §UC-5.2 step 7). The model grades each
 * short/long/scenario answer against its rubric and SUGGESTS a mark + rationale.
 * A human confirms or amends before it counts (spec: HR confirms). Auto-scored
 * questions are untouched here.
 */

type Db = Awaited<ReturnType<typeof createClient>>;

const GRADE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    marks: { type: Type.INTEGER, description: "Marks to award, from 0 to the maximum." },
    rationale: { type: Type.STRING, description: "One or two sentences: what earned or lost marks." },
  },
  required: ["marks", "rationale"],
};

function clamp(n: number, max: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(max, Math.round(n)));
}

async function gradeOne(
  question: SnapshotQuestion,
  answer: string,
): Promise<{ marks: number; rationale: string }> {
  const prompt = [
    `You are a fair, consistent grader. Grade a candidate's answer against the rubric.`,
    `Judge only substance and correctness — not spelling, length or style. Never award marks for content the rubric doesn't call for.`,
    ``,
    `QUESTION: ${question.prompt}`,
    `MAXIMUM MARKS: ${question.marks}`,
    `RUBRIC / MODEL ANSWER: ${question.rubric ?? "Award marks for a correct, complete answer."}`,
    ``,
    `CANDIDATE ANSWER: ${answer}`,
    ``,
    `Award an integer from 0 to ${question.marks} and give a short rationale.`,
  ].join("\n");

  const res = await generateJson<{ marks: number; rationale: string }>(prompt, GRADE_SCHEMA, {
    temperature: 0.1,
  });
  return {
    marks: clamp(Number(res.marks), question.marks),
    rationale: String(res.rationale ?? "").slice(0, 1000),
  };
}

/**
 * AI-grade every not-yet-confirmed written answer in an attempt, storing the
 * suggestion (not the final mark). Returns how many were graded.
 */
export async function gradeAttempt(
  db: Db,
  attempt: { id: string; test_id: string; version: number; organization_id: string },
): Promise<{ graded: number; error?: string }> {
  const { data: ver } = await db
    .from("test_versions")
    .select("snapshot")
    .eq("test_id", attempt.test_id)
    .eq("version", attempt.version)
    .maybeSingle();
  const snapshot = ver?.snapshot as { questions?: SnapshotQuestion[] } | undefined;
  const written = (snapshot?.questions ?? []).filter((q) => isWritten(q.type));
  if (written.length === 0) return { graded: 0 };

  const { data: answerRows } = await db
    .from("test_answers")
    .select("id, question_id, response, confirmed")
    .eq("attempt_id", attempt.id);
  const answerByQ = new Map(
    (answerRows ?? []).map((a) => [a.question_id, a as { id: string; response: TestAnswerResponse; confirmed: boolean }]),
  );

  let graded = 0;
  for (const q of written) {
    const existing = answerByQ.get(q.id);
    if (existing?.confirmed) continue; // never override a human decision

    const text = (existing?.response?.text ?? "").trim();
    let marks = 0;
    let rationale = "No answer was provided.";
    if (text) {
      try {
        const r = await gradeOne(q, text);
        marks = r.marks;
        rationale = r.rationale;
      } catch {
        return { graded, error: "AI grading failed partway through. Please try again." };
      }
    }

    if (existing) {
      await db
        .from("test_answers")
        .update({ ai_suggested_marks: marks, ai_rationale: rationale })
        .eq("id", existing.id);
    } else {
      await db.from("test_answers").insert({
        organization_id: attempt.organization_id,
        attempt_id: attempt.id,
        question_id: q.id,
        response: {},
        ai_suggested_marks: marks,
        ai_rationale: rationale,
      });
    }
    graded++;
  }

  return { graded };
}
