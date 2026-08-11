import type {
  ProctoringLevel,
  ProctoringSeverity,
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

/** Metadata for each captured integrity signal (spec §UC-5.3 monitored signals). */
export const PROCTORING_EVENT_META: Record<string, { label: string; severity: ProctoringSeverity }> = {
  tab_switch: { label: "Switched tab or app", severity: "high" },
  window_blur: { label: "Left the test window", severity: "medium" },
  fullscreen_exit: { label: "Exited full-screen", severity: "high" },
  copy: { label: "Copied text", severity: "medium" },
  paste: { label: "Pasted text", severity: "medium" },
  right_click: { label: "Opened the context menu", severity: "low" },
  devtools: { label: "Opened developer tools", severity: "high" },
  ip_change: { label: "Network / IP changed mid-test", severity: "high" },
  multi_session: { label: "A second session was detected", severity: "high" },
  camera_denied: { label: "Camera was unavailable", severity: "medium" },
  check_in: { label: "Identity check-in captured", severity: "low" },
};

export const PROCTORING_SEVERITY_META: Record<
  ProctoringSeverity,
  { label: string; variant: "secondary" | "warning" | "destructive" }
> = {
  low: { label: "Low", variant: "secondary" },
  medium: { label: "Medium", variant: "warning" },
  high: { label: "High", variant: "destructive" },
};

const BROWSER_SIGNALS = [
  "Switching tabs or leaving the test window",
  "Exiting full-screen",
  "Copy, paste and right-click",
  "Developer-tools activity",
  "Network/IP changes and duplicate sessions",
];

/** Exactly what each level records — shown verbatim in the consent copy (R1). */
export const PROCTORING_SIGNALS: Record<ProctoringLevel, string[]> = {
  off: [],
  basic: BROWSER_SIGNALS,
  standard: [...BROWSER_SIGNALS, "A camera check-in photo at the start"],
  strict: [
    ...BROWSER_SIGNALS,
    "A camera check-in photo at the start",
    "Microphone audio, to detect background voices",
    "An identity match against your check-in photo",
  ],
};

/** Whether the level needs a camera / mic at system-check time. */
export const proctoringNeedsCamera = (l: ProctoringLevel) => l === "standard" || l === "strict";
export const proctoringNeedsMic = (l: ProctoringLevel) => l === "strict";
