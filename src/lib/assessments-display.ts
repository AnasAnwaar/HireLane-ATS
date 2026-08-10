import type {
  ProctoringLevel,
  QuestionDifficulty,
  QuestionType,
  TestStatus,
} from "@/types/database";

export const QUESTION_TYPE_META: Record<
  QuestionType,
  { label: string; scoring: "auto" | "ai"; hasOptions: boolean; multi: boolean }
> = {
  single_choice: { label: "Single choice", scoring: "auto", hasOptions: true, multi: false },
  multiple_choice: { label: "Multiple choice", scoring: "auto", hasOptions: true, multi: true },
  true_false: { label: "True / False", scoring: "auto", hasOptions: true, multi: false },
  short_answer: { label: "Short answer", scoring: "ai", hasOptions: false, multi: false },
  long_answer: { label: "Long answer", scoring: "ai", hasOptions: false, multi: false },
  scenario: { label: "Scenario", scoring: "ai", hasOptions: false, multi: false },
};

export const QUESTION_TYPES = Object.keys(QUESTION_TYPE_META) as QuestionType[];

export const isChoice = (t: QuestionType) => QUESTION_TYPE_META[t].hasOptions;
export const isWritten = (t: QuestionType) => !QUESTION_TYPE_META[t].hasOptions;

export const TEST_STATUS_META: Record<
  TestStatus,
  { label: string; variant: "secondary" | "success" | "warning" }
> = {
  draft: { label: "Draft", variant: "secondary" },
  published: { label: "Published", variant: "success" },
  archived: { label: "Archived", variant: "secondary" },
};

export const DIFFICULTY_META: Record<
  QuestionDifficulty,
  { label: string; variant: "success" | "warning" | "destructive" }
> = {
  easy: { label: "Easy", variant: "success" },
  medium: { label: "Medium", variant: "warning" },
  hard: { label: "Hard", variant: "destructive" },
};

export const PROCTORING_META: Record<ProctoringLevel, { label: string; hint: string }> = {
  off: { label: "Off", hint: "No monitoring" },
  basic: { label: "Basic", hint: "Tab-switch + fullscreen checks" },
  standard: { label: "Standard", hint: "Webcam snapshots + activity" },
  strict: { label: "Strict", hint: "Continuous webcam, screen + audio" },
};
