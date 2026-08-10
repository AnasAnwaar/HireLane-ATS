import "server-only";

import { randomUUID } from "node:crypto";

import { Type, type Schema } from "@google/genai";

import { QUESTION_TYPE_META } from "@/lib/assessments-display";
import { generateJson } from "@/server/ai/gemini";
import type {
  QuestionDifficulty,
  QuestionOption,
  QuestionType,
} from "@/types/database";

/**
 * AI test generation (spec §UC-5.1). Produces DRAFT questions from a job's
 * requirements — never published automatically (spec R1). Correct answers and
 * rubrics are generated here for HR review; they are stripped before delivery
 * (spec R2, enforced in CP-16).
 */

export type QuestionDraft = {
  type: QuestionType;
  prompt: string;
  options: QuestionOption[];
  correct_answers: string[];
  rubric: string | null;
  marks: number;
  skill: string | null;
  difficulty: QuestionDifficulty;
};

export type GenerateParams = {
  count: number;
  types: QuestionType[];
  difficulty: QuestionDifficulty | "mixed";
  skills?: string[];
  instruction?: string;
};

type RawQuestion = {
  type?: string;
  prompt?: string;
  options?: string[];
  correctIndexes?: number[];
  rubric?: string;
  marks?: number;
  skill?: string;
  difficulty?: string;
};

const QUESTION_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    questions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          type: {
            type: Type.STRING,
            description:
              "single_choice | multiple_choice | true_false | short_answer | long_answer | scenario",
          },
          prompt: { type: Type.STRING, description: "The question text." },
          options: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Answer options for choice questions; empty for written questions.",
          },
          correctIndexes: {
            type: Type.ARRAY,
            items: { type: Type.INTEGER },
            description:
              "0-based indexes of the correct option(s). Exactly one for single_choice/true_false; one or more for multiple_choice; empty for written.",
          },
          rubric: {
            type: Type.STRING,
            description: "Model answer / grading rubric — required for written questions.",
          },
          marks: { type: Type.INTEGER, description: "Marks for this question (1-10)." },
          skill: { type: Type.STRING, description: "The single skill/requirement this tests." },
          difficulty: { type: Type.STRING, description: "easy | medium | hard" },
        },
        required: ["type", "prompt", "options", "correctIndexes", "rubric", "marks", "skill", "difficulty"],
      },
    },
  },
  required: ["questions"],
};

function normType(v: string | undefined): QuestionType {
  const s = (v ?? "").toLowerCase().trim() as QuestionType;
  return s in QUESTION_TYPE_META ? s : "single_choice";
}
function normDifficulty(v: string | undefined): QuestionDifficulty {
  const s = (v ?? "").toLowerCase().trim();
  return s === "easy" || s === "hard" ? s : "medium";
}

/** Map a raw model question into a normalised, storable draft. */
function toDraft(raw: RawQuestion): QuestionDraft {
  let type = normType(raw.type);
  const marks = Math.max(1, Math.min(10, Math.round(Number(raw.marks) || 1)));
  const difficulty = normDifficulty(raw.difficulty);
  const skill = raw.skill?.trim() ? raw.skill.trim().slice(0, 120) : null;

  if (type === "true_false") {
    const correctIsTrue = (raw.correctIndexes ?? [])[0] === 0;
    const tId = randomUUID();
    const fId = randomUUID();
    return {
      type,
      prompt: String(raw.prompt ?? "").slice(0, 2000),
      options: [
        { id: tId, text: "True" },
        { id: fId, text: "False" },
      ],
      correct_answers: [correctIsTrue ? tId : fId],
      rubric: null,
      marks,
      skill,
      difficulty,
    };
  }

  if (QUESTION_TYPE_META[type].hasOptions) {
    const texts = (raw.options ?? []).map((o) => String(o).slice(0, 500)).filter(Boolean);
    // Need at least two options for a choice question; otherwise fall back to short answer.
    if (texts.length < 2) type = "short_answer";
    else {
      const options: QuestionOption[] = texts.map((text) => ({ id: randomUUID(), text }));
      const idx = (raw.correctIndexes ?? []).filter((i) => i >= 0 && i < options.length);
      const picked = (type === "single_choice" ? idx.slice(0, 1) : idx).map((i) => options[i].id);
      return {
        type,
        prompt: String(raw.prompt ?? "").slice(0, 2000),
        options,
        correct_answers: picked.length ? picked : [options[0].id],
        rubric: null,
        marks,
        skill,
        difficulty,
      };
    }
  }

  // Written types (short_answer / long_answer / scenario).
  return {
    type,
    prompt: String(raw.prompt ?? "").slice(0, 2000),
    options: [],
    correct_answers: [],
    rubric: raw.rubric?.trim() ? raw.rubric.trim().slice(0, 2000) : "Grade against the key points expected in a strong answer.",
    marks,
    skill,
    difficulty,
  };
}

type OpeningContext = {
  title: string;
  description: string | null;
  requirements: { kind: string; label: string }[];
};

function requirementsBlock(reqs: { kind: string; label: string }[]): string {
  const must = reqs.filter((r) => r.kind === "must_have").map((r) => r.label);
  const nice = reqs.filter((r) => r.kind === "nice_to_have").map((r) => r.label);
  return [
    must.length ? `Must-have skills: ${must.join(", ")}` : "",
    nice.length ? `Nice-to-have skills: ${nice.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildPrompt(opening: OpeningContext, params: GenerateParams): string {
  const typeList = params.types.length
    ? params.types.map((t) => QUESTION_TYPE_META[t].label).join(", ")
    : "a sensible mix";
  return [
    `You are an expert technical assessment author. Write a fair, job-relevant test for this role.`,
    ``,
    `ROLE: ${opening.title}`,
    opening.description ? `Description: ${opening.description}` : "",
    requirementsBlock(opening.requirements),
    params.skills?.length ? `Focus skills: ${params.skills.join(", ")}` : "",
    ``,
    `Produce exactly ${params.count} questions.`,
    `Allowed question types: ${typeList}. Use only these types.`,
    params.difficulty === "mixed"
      ? `Mix difficulties (easy / medium / hard).`
      : `Difficulty: ${params.difficulty}.`,
    `For choice questions give 3-4 plausible options with exactly the right correctIndexes.`,
    `For written questions (short_answer / long_answer / scenario) give a concise grading rubric and no options.`,
    `Assign each question the single skill it tests and reasonable marks (1-10).`,
    params.instruction ? `Extra instruction: ${params.instruction}` : "",
    `Keep questions unambiguous and free of trick wording.`,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function generateTestQuestions(
  opening: OpeningContext,
  params: GenerateParams,
): Promise<QuestionDraft[]> {
  const prompt = buildPrompt(opening, params);
  const res = await generateJson<{ questions: RawQuestion[] }>(prompt, QUESTION_SCHEMA, {
    temperature: 0.6,
  });
  return (res.questions ?? []).slice(0, params.count).map(toDraft);
}

/** Regenerate a single question, keeping its type and skill. */
export async function regenerateQuestion(
  opening: OpeningContext,
  current: { type: QuestionType; skill: string | null; difficulty: QuestionDifficulty },
  instruction?: string,
): Promise<QuestionDraft> {
  const drafts = await generateTestQuestions(opening, {
    count: 1,
    types: [current.type],
    difficulty: current.difficulty,
    skills: current.skill ? [current.skill] : undefined,
    instruction,
  });
  return drafts[0] ?? toDraft({ type: current.type, prompt: "", options: [], correctIndexes: [] });
}
