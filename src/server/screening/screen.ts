import "server-only";

import { Type, type Schema } from "@google/genai";

import type { createClient } from "@/lib/supabase/server";
import { coerceWeights, skillsScore, weightedScore } from "@/lib/scoring-weights";
import { AiError, GEMINI_MODEL, generateJson, isAiConfigured } from "@/server/ai/gemini";
import type {
  CoverageItem,
  CoverageStatus,
  CriterionScore,
  ScoringWeights,
  ScreeningConcern,
  ScreeningHighlight,
  ScreeningRecommendation,
} from "@/types/database";

/**
 * AI Screening engine (spec §UC-4, CP-13).
 *
 * Evaluates one application against its opening's requirements and writes an
 * explainable screening: score, per-criterion breakdown, must/nice coverage,
 * and cited highlights + concerns.
 *
 * Guardrails:
 *  R1  Evidence travels with every claim — the prompt demands a citation per
 *      highlight and coverage item, drawn only from the supplied data.
 *  R2  The engine NEVER writes application.stage. It recommends; humans decide.
 *  R3  Protected attributes are never sent. `buildCandidateView` includes only
 *      job-relevant fields (no name, gender, age, nationality, marital status
 *      or photo), and the prompt forbids inferring them.
 *  R4  The model id and the exact inputs are persisted on the row.
 *
 * Note: CVs are stored as files, not parsed text, so evidence cites the
 * candidate's structured profile and application answers.
 */

type Db = Awaited<ReturnType<typeof createClient>>;

type ScreeningResult =
  | { ok: true; status: "scored" | "needs_manual_review"; score: number | null }
  | { ok: false; error: string };

// -- Model output shape (normalised server-side after parsing) ----------------
type RawCoverage = { requirement?: string; status?: string; evidence?: string };
type RawCriterion = { key?: string; label?: string; score?: number; note?: string };
type RawHighlight = { text?: string; evidence?: string };
type RawConcern = { text?: string };
type RawScreening = {
  score?: number;
  recommendation?: string;
  summary?: string;
  mustHaves?: RawCoverage[];
  niceToHaves?: RawCoverage[];
  criteria?: RawCriterion[];
  highlights?: RawHighlight[];
  concerns?: RawConcern[];
};

const SCREENING_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    score: { type: Type.INTEGER, description: "Overall relevance to the role, 0-100." },
    recommendation: {
      type: Type.STRING,
      description: "One of: strong_fit, possible_fit, weak_fit.",
    },
    summary: { type: Type.STRING, description: "One or two sentences on overall fit." },
    mustHaves: {
      type: Type.ARRAY,
      description: "One entry per must-have requirement.",
      items: {
        type: Type.OBJECT,
        properties: {
          requirement: { type: Type.STRING },
          status: { type: Type.STRING, description: "matched | partial | missing" },
          evidence: { type: Type.STRING, description: "The specific data point that supports this, or why it's missing." },
        },
        required: ["requirement", "status", "evidence"],
      },
    },
    niceToHaves: {
      type: Type.ARRAY,
      description: "One entry per nice-to-have requirement.",
      items: {
        type: Type.OBJECT,
        properties: {
          requirement: { type: Type.STRING },
          status: { type: Type.STRING, description: "matched | partial | missing" },
          evidence: { type: Type.STRING },
        },
        required: ["requirement", "status", "evidence"],
      },
    },
    criteria: {
      type: Type.ARRAY,
      description: "Scores for: experience, qualification, stability, logistics.",
      items: {
        type: Type.OBJECT,
        properties: {
          key: { type: Type.STRING, description: "experience | qualification | stability | logistics" },
          label: { type: Type.STRING },
          score: { type: Type.INTEGER, description: "0-100 for this criterion." },
          note: { type: Type.STRING },
        },
        required: ["key", "label", "score", "note"],
      },
    },
    highlights: {
      type: Type.ARRAY,
      description: "3-5 concrete strengths, each citing the data it came from.",
      items: {
        type: Type.OBJECT,
        properties: {
          text: { type: Type.STRING },
          evidence: { type: Type.STRING },
        },
        required: ["text", "evidence"],
      },
    },
    concerns: {
      type: Type.ARRAY,
      description: "Gaps, contradictions or unexplained risks. Empty if none.",
      items: {
        type: Type.OBJECT,
        properties: { text: { type: Type.STRING } },
        required: ["text"],
      },
    },
  },
  required: ["score", "recommendation", "summary", "mustHaves", "niceToHaves", "criteria", "highlights", "concerns"],
};

type OpeningView = {
  title: string;
  employment_type: string;
  work_mode: string;
  location: string | null;
  experience_min: number | null;
  experience_max: number | null;
  description: string | null;
};

type CandidateView = {
  headline: string | null;
  yearsExperience: number | null;
  skills: string[];
  location: string | null;
};

/**
 * The ONLY candidate fields the model may see (spec R3). Name, email, phone and
 * anything that could carry gender/age/nationality/marital status are excluded.
 */
function buildCandidateView(candidate: {
  headline: string | null;
  years_experience: number | null;
  skills: string[] | null;
  location: string | null;
}): CandidateView {
  return {
    headline: candidate.headline,
    yearsExperience: candidate.years_experience,
    skills: candidate.skills ?? [],
    location: candidate.location,
  };
}

function buildPrompt(
  opening: OpeningView,
  requirements: { kind: string; label: string }[],
  candidate: CandidateView,
  application: { coverNote: string | null; screeningAnswers: Record<string, string> | null },
): string {
  const must = requirements.filter((r) => r.kind === "must_have").map((r) => r.label);
  const nice = requirements.filter((r) => r.kind === "nice_to_have").map((r) => r.label);
  const quals = requirements.filter((r) => r.kind === "qualification").map((r) => r.label);

  const answers = application.screeningAnswers
    ? Object.entries(application.screeningAnswers).map(([q, a]) => `  - ${q}: ${a}`).join("\n")
    : "";

  return [
    `You are a fair, evidence-based recruitment screening assistant. Score how well ONE candidate fits ONE role.`,
    ``,
    `FAIRNESS RULES (must follow):`,
    `- Judge only professional, job-relevant merit.`,
    `- You are given only job-relevant fields. Do NOT infer or use gender, age, nationality, ethnicity, religion, marital status or appearance. If you catch yourself doing so, stop.`,
    `- Every strength and every requirement verdict MUST cite a specific supplied data point. Do not invent experience the data doesn't show.`,
    `- Missing data is a "missing" or "partial" verdict with a note — never a fabricated match.`,
    ``,
    `ROLE`,
    `- Title: ${opening.title}`,
    `- Employment: ${opening.employment_type.replace("_", " ")}, ${opening.work_mode.replace("_", " ")}`,
    opening.location ? `- Location: ${opening.location}` : ``,
    opening.experience_min || opening.experience_max
      ? `- Experience wanted: ${opening.experience_min ?? 0}${opening.experience_max ? `–${opening.experience_max}` : "+"} years`
      : ``,
    opening.description ? `- Description: ${opening.description}` : ``,
    must.length ? `- MUST-HAVE requirements: ${must.join(", ")}` : `- MUST-HAVE requirements: (none specified)`,
    nice.length ? `- NICE-TO-HAVE: ${nice.join(", ")}` : ``,
    quals.length ? `- QUALIFICATIONS wanted: ${quals.join(", ")}` : ``,
    ``,
    `CANDIDATE (job-relevant fields only)`,
    `- Headline: ${candidate.headline ?? "(none)"}`,
    `- Years of experience: ${candidate.yearsExperience ?? "(unknown)"}`,
    `- Skills: ${candidate.skills.length ? candidate.skills.join(", ") : "(none listed)"}`,
    `- Location: ${candidate.location ?? "(unknown)"}`,
    application.coverNote ? `- Cover note: ${application.coverNote}` : ``,
    answers ? `- Screening answers:\n${answers}` : ``,
    ``,
    `TASK`,
    `- Produce one entry per MUST-HAVE and per NICE-TO-HAVE with a matched/partial/missing verdict and its evidence.`,
    `- Score the four criteria (experience, qualification, stability, logistics) 0-100 with a short note each.`,
    `- Give an overall 0-100 score and a recommendation: strong_fit (>=75), possible_fit (50-74), weak_fit (<50).`,
    `- List 3-5 highlights (each with evidence) and any concerns.`,
  ]
    .filter(Boolean)
    .join("\n");
}

const COVERAGE_VALUES: CoverageStatus[] = ["matched", "partial", "missing"];
function normStatus(v: string | undefined): CoverageStatus {
  const s = (v ?? "").toLowerCase().trim();
  return COVERAGE_VALUES.includes(s as CoverageStatus) ? (s as CoverageStatus) : "missing";
}
function clampScore(n: number | undefined): number {
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(n) ? (n as number) : 0)));
}
function recommendationFor(score: number, raw: string | undefined): ScreeningRecommendation {
  const s = (raw ?? "").toLowerCase().replace(/[\s-]/g, "_").trim();
  if (s === "strong_fit" || s === "possible_fit" || s === "weak_fit") return s;
  return score >= 75 ? "strong_fit" : score >= 50 ? "possible_fit" : "weak_fit";
}

function mapCoverage(rows: RawCoverage[] | undefined): CoverageItem[] {
  return (rows ?? [])
    .filter((r) => r.requirement)
    .map((r) => ({
      requirement: String(r.requirement).slice(0, 200),
      status: normStatus(r.status),
      evidence: String(r.evidence ?? "").slice(0, 500),
    }));
}
function mapCriteria(rows: RawCriterion[] | undefined): CriterionScore[] {
  return (rows ?? [])
    .filter((r) => r.key)
    .map((r) => ({
      key: String(r.key).slice(0, 40),
      label: String(r.label ?? r.key).slice(0, 80),
      score: clampScore(r.score),
      note: String(r.note ?? "").slice(0, 500),
    }));
}
function mapHighlights(rows: RawHighlight[] | undefined): ScreeningHighlight[] {
  return (rows ?? [])
    .filter((r) => r.text)
    .map((r) => ({ text: String(r.text).slice(0, 400), evidence: String(r.evidence ?? "").slice(0, 400) }));
}
function mapConcerns(rows: RawConcern[] | undefined): ScreeningConcern[] {
  return (rows ?? []).filter((r) => r.text).map((r) => ({ text: String(r.text).slice(0, 400) }));
}

/**
 * Screen one application and upsert its screening row. `db` is the caller's
 * client: the RLS client for a user-triggered re-rank, or the service-role
 * client for the automatic on-arrival run.
 */
export async function screenApplication(
  db: Db,
  organizationId: string,
  applicationId: string,
  scoredBy: string | null,
): Promise<ScreeningResult> {
  if (!isAiConfigured()) {
    return { ok: false, error: "AI screening isn't configured — a Gemini API key is required." };
  }

  const { data: application } = await db
    .from("applications")
    .select("id, job_opening_id, cover_note, screening_answers, candidate_id")
    .eq("id", applicationId)
    .maybeSingle();
  if (!application) return { ok: false, error: "Application not found." };

  const [{ data: opening }, { data: requirements }, { data: candidate }] = await Promise.all([
    db
      .from("job_openings")
      .select("title, employment_type, work_mode, location, experience_min, experience_max, description, scoring_weights")
      .eq("id", application.job_opening_id)
      .maybeSingle(),
    db.from("job_requirements").select("kind, label").eq("job_opening_id", application.job_opening_id),
    db
      .from("candidates")
      .select("headline, years_experience, skills, location")
      .eq("id", application.candidate_id)
      .maybeSingle(),
  ]);

  if (!opening || !candidate) return { ok: false, error: "Opening or candidate missing." };

  const candidateView = buildCandidateView(candidate);
  const screeningAnswers = (application.screening_answers as Record<string, string> | null) ?? null;

  // A2 — too little to judge fairly → flag for manual review, don't score low.
  const hasSignal =
    Boolean(candidateView.headline) ||
    candidateView.skills.length > 0 ||
    candidateView.yearsExperience != null ||
    Boolean(application.cover_note) ||
    Boolean(screeningAnswers && Object.keys(screeningAnswers).length);

  if (!hasSignal) {
    return upsert(db, {
      organizationId,
      application,
      status: "needs_manual_review",
      score: null,
      scoredBy,
      inputs: { reason: "insufficient_candidate_data" },
    });
  }

  const prompt = buildPrompt(opening, requirements ?? [], candidateView, {
    coverNote: application.cover_note,
    screeningAnswers,
  });

  let raw: RawScreening;
  try {
    raw = await generateJson<RawScreening>(prompt, SCREENING_SCHEMA, { temperature: 0.2 });
  } catch (err) {
    const message = err instanceof AiError ? err.message : "Screening failed.";
    await upsert(db, {
      organizationId,
      application,
      status: "failed",
      score: null,
      scoredBy,
      error: message,
      inputs: { model: GEMINI_MODEL },
    });
    return { ok: false, error: message };
  }

  // Weighted overall score (spec §UC-4 A3): blend must-have coverage (skills),
  // experience and qualification by the opening's configured weights, rather
  // than trusting the model's own gestalt number. This makes the score
  // deterministic and re-weightable.
  const mustHaves = mapCoverage(raw.mustHaves);
  const niceToHaves = mapCoverage(raw.niceToHaves);
  const modelCriteria = mapCriteria(raw.criteria);
  const weights = coerceWeights(opening.scoring_weights as ScoringWeights | null);

  const skills = skillsScore(mustHaves);
  const experience = modelCriteria.find((c) => c.key === "experience")?.score ?? null;
  const qualification = modelCriteria.find((c) => c.key === "qualification")?.score ?? null;

  const score = weightedScore({ skills, experience, qualification }, weights);
  const recommendation = recommendationFor(score, undefined);
  const criteria = buildWeightedCriteria(skills, modelCriteria, weights);

  return upsert(db, {
    organizationId,
    application,
    status: "scored",
    score,
    recommendation,
    scoredBy,
    summary: String(raw.summary ?? "").slice(0, 1000),
    mustHaves,
    niceToHaves,
    criteria,
    highlights: mapHighlights(raw.highlights),
    concerns: mapConcerns(raw.concerns),
    inputs: {
      model: GEMINI_MODEL,
      weights,
      requirements: requirements ?? [],
      candidate: candidateView,
      application: { coverNote: application.cover_note, screeningAnswers },
    },
  });
}

/** Prepend a synthetic "skills" criterion and tag the weighted dimensions. */
function buildWeightedCriteria(
  skills: number | null,
  modelCriteria: CriterionScore[],
  weights: ScoringWeights,
): CriterionScore[] {
  const out: CriterionScore[] = [];
  if (skills != null) {
    out.push({
      key: "skills",
      label: "Skills (must-haves)",
      score: skills,
      note: "Weighted from must-have coverage.",
      weight: weights.skills,
    });
  }
  for (const c of modelCriteria) {
    if (c.key === "experience") out.push({ ...c, weight: weights.experience });
    else if (c.key === "qualification") out.push({ ...c, weight: weights.qualification });
    else out.push(c);
  }
  return out;
}

type UpsertArgs = {
  organizationId: string;
  application: { id: string; job_opening_id: string };
  status: "scored" | "needs_manual_review" | "failed";
  score: number | null;
  scoredBy: string | null;
  recommendation?: ScreeningRecommendation;
  summary?: string;
  mustHaves?: CoverageItem[];
  niceToHaves?: CoverageItem[];
  criteria?: CriterionScore[];
  highlights?: ScreeningHighlight[];
  concerns?: ScreeningConcern[];
  error?: string;
  inputs?: unknown;
};

async function upsert(db: Db, a: UpsertArgs): Promise<ScreeningResult> {
  const { error } = await db.from("application_screenings").upsert(
    {
      organization_id: a.organizationId,
      application_id: a.application.id,
      job_opening_id: a.application.job_opening_id,
      status: a.status,
      score: a.score,
      recommendation: a.recommendation ?? null,
      summary: a.summary ?? null,
      must_haves: a.mustHaves ?? [],
      nice_to_haves: a.niceToHaves ?? [],
      criteria: a.criteria ?? [],
      highlights: a.highlights ?? [],
      concerns: a.concerns ?? [],
      model: GEMINI_MODEL,
      inputs: a.inputs ?? null,
      error: a.error ?? null,
      scored_by: a.scoredBy,
      stale: false,
    },
    { onConflict: "application_id" },
  );

  if (error) return { ok: false, error: error.message };
  if (a.status === "failed") return { ok: false, error: a.error ?? "Screening failed." };
  return { ok: true, status: a.status, score: a.score };
}
