import type { CoverageItem, ScoringWeights } from "@/types/database";

/**
 * Scoring weights (spec §UC-4 A3, CP-14).
 *
 * The overall relevance score is a weighted blend of three dimensions:
 *   - skills        — must-have coverage (matched / partial / missing)
 *   - experience    — years + relevance
 *   - qualification — degree / equivalent
 * HR can retune these per opening; the default mirrors the spec's example.
 */
export const DEFAULT_WEIGHTS: ScoringWeights = { skills: 50, experience: 30, qualification: 20 };

export const WEIGHT_LABELS: Record<keyof ScoringWeights, string> = {
  skills: "Skills",
  experience: "Experience",
  qualification: "Qualification",
};

function clampWeight(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Normalise arbitrary input to a valid weights object; never all-zero. */
export function coerceWeights(w: Partial<ScoringWeights> | null | undefined): ScoringWeights {
  if (!w) return DEFAULT_WEIGHTS;
  const out: ScoringWeights = {
    skills: clampWeight(w.skills, DEFAULT_WEIGHTS.skills),
    experience: clampWeight(w.experience, DEFAULT_WEIGHTS.experience),
    qualification: clampWeight(w.qualification, DEFAULT_WEIGHTS.qualification),
  };
  if (out.skills + out.experience + out.qualification === 0) return DEFAULT_WEIGHTS;
  return out;
}

/** Skills sub-score (0-100) from must-have coverage: matched 100, partial 50. */
export function skillsScore(mustHaves: CoverageItem[]): number | null {
  if (!mustHaves.length) return null;
  const per: number[] = mustHaves.map((m) =>
    m.status === "matched" ? 100 : m.status === "partial" ? 50 : 0,
  );
  return Math.round(per.reduce((a, b) => a + b, 0) / per.length);
}

/**
 * Weighted overall score. Dimensions with no data are dropped and the weights
 * renormalised over what remains, so a missing dimension never drags the score
 * to zero — it simply doesn't count.
 */
export function weightedScore(
  dims: { skills: number | null; experience: number | null; qualification: number | null },
  weights: ScoringWeights,
): number {
  const parts: [number, number][] = [];
  if (dims.skills != null) parts.push([dims.skills, weights.skills]);
  if (dims.experience != null) parts.push([dims.experience, weights.experience]);
  if (dims.qualification != null) parts.push([dims.qualification, weights.qualification]);

  if (parts.length === 0) return 0;
  const totalW = parts.reduce((s, [, w]) => s + w, 0);
  if (totalW <= 0) {
    // All present dimensions have zero weight → fall back to a plain average.
    return Math.round(parts.reduce((s, [v]) => s + v, 0) / parts.length);
  }
  return Math.round(parts.reduce((s, [v, w]) => s + v * w, 0) / totalW);
}
