import type { ScreeningRecommendation, ScreeningStatus } from "@/types/database";

export const RECOMMENDATION_META: Record<
  ScreeningRecommendation,
  { label: string; variant: "success" | "warning" | "secondary" }
> = {
  strong_fit: { label: "Strong fit", variant: "success" },
  possible_fit: { label: "Possible fit", variant: "warning" },
  weak_fit: { label: "Weak fit", variant: "secondary" },
};

export const SCREENING_STATUS_LABEL: Record<ScreeningStatus, string> = {
  scored: "Scored",
  needs_manual_review: "Needs manual review",
  failed: "Screening failed",
};

/** Human label for a per-criterion coverage verdict. */
export const COVERAGE_LABEL = {
  matched: "Matched",
  partial: "Partial",
  missing: "Missing",
} as const;
