import "server-only";

import { Type, type Schema } from "@google/genai";

import { PROCTORING_EVENT_META } from "@/lib/assessments-display";
import { generateJson, GEMINI_MODEL, type InlineImage } from "@/server/ai/gemini";
import type {
  IntegrityLevel,
  ProctoringEvent,
  ProctoringFace,
  ProctoringFinding,
} from "@/types/database";

/**
 * AI proctoring analysis (spec §UC-5.3, CP-20). Turns the CP-19 evidence — the
 * browser/environment event timeline plus the check-in photo — into ONE advisory
 * integrity verdict, with a confidence on every finding (R4). It never decides:
 * the verdict is advisory and a human acts on it in the Integrity Report (R2).
 */

const LEVELS: IntegrityLevel[] = ["clear", "low", "medium", "high"];
const SEVERITIES = ["low", "medium", "high"];

const ANALYSIS_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    integrity_level: {
      type: Type.STRING,
      enum: LEVELS,
      description: "Overall integrity concern: clear | low | medium | high.",
    },
    confidence: {
      type: Type.NUMBER,
      description: "Overall confidence in the verdict, 0.0 to 1.0.",
    },
    summary: {
      type: Type.STRING,
      description: "2-3 plain-language sentences a recruiter can act on. No jargon.",
    },
    findings: {
      type: Type.ARRAY,
      description: "One entry per notable behavioural signal. Empty if nothing stands out.",
      items: {
        type: Type.OBJECT,
        properties: {
          signal: { type: Type.STRING, description: "Short machine key, e.g. tab_switching." },
          label: { type: Type.STRING, description: "Short human label." },
          severity: { type: Type.STRING, enum: SEVERITIES },
          confidence: { type: Type.NUMBER, description: "0.0 to 1.0 for THIS signal." },
          detail: { type: Type.STRING, description: "One sentence of reasoning." },
        },
        required: ["signal", "label", "severity", "confidence", "detail"],
      },
    },
    face: {
      type: Type.OBJECT,
      description: "Only meaningful when a check-in photo was provided.",
      properties: {
        face_present: { type: Type.BOOLEAN },
        face_count: { type: Type.INTEGER, description: "Number of distinct faces visible." },
        note: { type: Type.STRING, description: "One short observation about the check-in photo." },
      },
      required: ["face_present", "face_count", "note"],
    },
  },
  required: ["integrity_level", "confidence", "summary", "findings"],
};

type RawAnalysis = {
  integrity_level: string;
  confidence: number;
  summary: string;
  findings: Partial<ProctoringFinding>[];
  face?: { face_present?: boolean; face_count?: number; note?: string };
};

export type AttemptIntegrityInput = {
  events: ProctoringEvent[];
  breachCount: number;
  flagged: boolean;
  durationSeconds: number | null;
  photo: InlineImage | null;
  testTitle: string;
};

export type AttemptIntegrityResult = {
  integrityLevel: IntegrityLevel;
  confidence: number;
  summary: string;
  findings: ProctoringFinding[];
  face: ProctoringFace | null;
};

const clamp01 = (n: number): number => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);
const asLevel = (s: string): IntegrityLevel =>
  (LEVELS as string[]).includes(s) ? (s as IntegrityLevel) : "low";
const asSeverity = (s: string | undefined): ProctoringFinding["severity"] =>
  s === "high" || s === "medium" ? s : "low";

/**
 * Compact, deterministic digest of the event timeline for the prompt. Grouped by
 * type with counts + severity + the window they spanned, so the model reasons
 * over patterns (frequency, clustering) rather than a raw dump.
 */
export function summariseEvents(events: ProctoringEvent[], durationSeconds: number | null): string {
  if (events.length === 0) return "No integrity events were captured during the attempt.";
  const groups = new Map<string, { count: number; severity: string; first: string; last: string }>();
  for (const e of events) {
    const g = groups.get(e.type);
    if (g) {
      g.count += 1;
      if (e.occurred_at < g.first) g.first = e.occurred_at;
      if (e.occurred_at > g.last) g.last = e.occurred_at;
    } else {
      groups.set(e.type, { count: 1, severity: e.severity, first: e.occurred_at, last: e.occurred_at });
    }
  }
  const lines = [...groups.entries()].map(([type, g]) => {
    const label = PROCTORING_EVENT_META[type]?.label ?? type;
    const span =
      g.count > 1
        ? ` over ${Math.max(1, Math.round((new Date(g.last).getTime() - new Date(g.first).getTime()) / 1000))}s`
        : "";
    return `- ${label} (${type}): ${g.count}× · captured severity ${g.severity}${span}`;
  });
  const header = durationSeconds
    ? `Attempt lasted ~${Math.round(durationSeconds / 60)} min. ${events.length} events captured:`
    : `${events.length} events captured:`;
  return [header, ...lines].join("\n");
}

function buildPrompt(input: AttemptIntegrityInput): string {
  return [
    `You are an exam-integrity analyst. Assess ONE candidate's monitored test attempt from the captured evidence.`,
    `You are ADVISORY ONLY — you flag concerns for a human reviewer; you never decide the outcome. Be calibrated: a single, isolated benign event is not misconduct. Look for PATTERNS (frequency, clustering, escalation).`,
    ``,
    `TEST: ${input.testTitle}`,
    `System flag state: breach_count=${input.breachCount}, already_flagged=${input.flagged}. (These are heuristic counters — weigh them, don't just echo them.)`,
    ``,
    `EVENT TIMELINE:`,
    summariseEvents(input.events, input.durationSeconds),
    ``,
    input.photo
      ? `A check-in photo is attached. Assess whether exactly one person is present and note anything unusual (no face, multiple faces, screen-of-a-screen).`
      : `No check-in photo was captured — omit the "face" object.`,
    ``,
    `Return: an overall integrity_level (clear/low/medium/high), an overall confidence (0-1), a short plain-language summary, and a findings array where EVERY finding carries its own confidence (0-1) and one sentence of reasoning. If nothing stands out, return integrity_level "clear" with an empty findings array.`,
  ].join("\n");
}

/** Run the model over one attempt's evidence and normalise its output. */
export async function analyzeAttemptIntegrity(
  input: AttemptIntegrityInput,
): Promise<AttemptIntegrityResult> {
  const raw = await generateJson<RawAnalysis>(buildPrompt(input), ANALYSIS_SCHEMA, {
    temperature: 0.2,
    images: input.photo ? [input.photo] : undefined,
  });

  const findings: ProctoringFinding[] = (raw.findings ?? []).map((f) => ({
    signal: String(f.signal ?? "signal").slice(0, 64),
    label: String(f.label ?? "Signal").slice(0, 120),
    severity: asSeverity(f.severity),
    confidence: clamp01(Number(f.confidence)),
    detail: String(f.detail ?? "").slice(0, 500),
  }));

  const face: ProctoringFace | null =
    input.photo && raw.face
      ? {
          analyzed: true,
          face_present: Boolean(raw.face.face_present),
          face_count: Math.max(0, Math.round(Number(raw.face.face_count ?? 0)) || 0),
          note: String(raw.face.note ?? "").slice(0, 300),
        }
      : null;

  return {
    integrityLevel: asLevel(String(raw.integrity_level)),
    confidence: clamp01(Number(raw.confidence)),
    summary: String(raw.summary ?? "").slice(0, 1200),
    findings,
    face,
  };
}

export { GEMINI_MODEL };
