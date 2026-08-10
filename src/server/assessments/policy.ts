import "server-only";

import type { createClient } from "@/lib/supabase/server";
import type { AssessmentPolicy, ProctoringLevel } from "@/types/database";

/**
 * Org-wide assessment policy (spec §UC-5, CP-18). The defaults every new test
 * inherits, plus the cap on retakes. Falls back to sensible defaults when an
 * org hasn't configured one.
 */

export type PolicyDefaults = {
  proctoringLevel: ProctoringLevel;
  durationMinutes: number;
  passingThreshold: number | null;
  attempts: number;
  allowBacktrack: boolean;
  shuffleQuestions: boolean;
  maxAttempts: number;
};

export const DEFAULT_POLICY: PolicyDefaults = {
  proctoringLevel: "standard",
  durationMinutes: 30,
  passingThreshold: null,
  attempts: 1,
  allowBacktrack: true,
  shuffleQuestions: false,
  maxAttempts: 3,
};

export async function getAssessmentPolicy(
  db: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
): Promise<PolicyDefaults> {
  const { data } = await db
    .from("assessment_policies")
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!data) return DEFAULT_POLICY;
  const p = data as AssessmentPolicy;
  return {
    proctoringLevel: p.default_proctoring_level,
    durationMinutes: p.default_duration_minutes,
    passingThreshold: p.default_passing_threshold,
    attempts: p.default_attempts,
    allowBacktrack: p.default_allow_backtrack,
    shuffleQuestions: p.default_shuffle_questions,
    maxAttempts: p.max_attempts,
  };
}
