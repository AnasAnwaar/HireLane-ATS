"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient, createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/validation/auth";
import { AiError, isAiConfigured } from "@/server/ai/gemini";
import { authorize } from "@/server/auth/authorize";
import { getSessionContext } from "@/server/auth/session";
import type { InlineImage } from "@/server/ai/gemini";
import type { ProctoringEvent, TestAttempt } from "@/types/database";

import { analyzeAttemptIntegrity, GEMINI_MODEL } from "./proctoring-analysis";

const CANDIDATE_BUCKET = "candidate-documents";

/** Pull the check-in photo (if any) as a base64 inline image for the model. */
async function loadCheckInPhoto(path: string | null): Promise<InlineImage | null> {
  if (!path) return null;
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(CANDIDATE_BUCKET).download(path);
  if (error || !data) return null;
  const bytes = Buffer.from(await data.arrayBuffer());
  if (bytes.length === 0) return null;
  const mimeType = path.endsWith(".png") ? "image/png" : "image/jpeg";
  return { data: bytes.toString("base64"), mimeType };
}

/**
 * Generate (or refresh) the AI integrity verdict for one attempt. Gated on
 * proctoring.view_summary; the analysis is advisory and never changes the
 * candidate's application stage (spec R2).
 */
export async function analyzeProctoringAction(attemptId: string): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Your session has expired." };
  const auth = await authorize("proctoring.view_summary");
  if (!auth.ok) return { ok: false, error: auth.error };

  if (!isAiConfigured()) {
    return { ok: false, error: "AI analysis isn't set up yet — a Gemini API key is required." };
  }

  const db = await createClient();
  const { data: attemptRow } = await db
    .from("test_attempts")
    .select("*")
    .eq("id", attemptId)
    .maybeSingle();
  if (!attemptRow) return { ok: false, error: "Attempt not found." };
  const attempt = attemptRow as TestAttempt;

  // RLS on proctoring_events already restricts this to summary/evidence holders.
  const { data: eventRows } = await db
    .from("proctoring_events")
    .select("*")
    .eq("attempt_id", attemptId)
    .order("occurred_at", { ascending: true });
  const events = (eventRows ?? []) as ProctoringEvent[];

  const { data: assignment } = await db
    .from("test_assignments")
    .select("tests(title)")
    .eq("id", attempt.assignment_id)
    .maybeSingle();
  const testTitle =
    (assignment?.tests as { title?: string } | null)?.title ?? "Assessment";

  const end = attempt.submitted_at ?? attempt.expires_at;
  const durationSeconds = attempt.started_at
    ? Math.max(0, Math.round((new Date(end).getTime() - new Date(attempt.started_at).getTime()) / 1000))
    : null;

  const photo = await loadCheckInPhoto(attempt.check_in_photo_path);

  let result;
  try {
    result = await analyzeAttemptIntegrity({
      events,
      breachCount: attempt.breach_count,
      flagged: attempt.flagged,
      durationSeconds,
      photo,
      testTitle,
    });
  } catch (err) {
    if (err instanceof AiError) return { ok: false, error: err.message };
    return { ok: false, error: "The AI couldn't complete the analysis. Please try again." };
  }

  const { error } = await db.from("proctoring_analyses").upsert(
    {
      organization_id: attempt.organization_id,
      attempt_id: attemptId,
      integrity_level: result.integrityLevel,
      confidence: result.confidence,
      summary: result.summary,
      findings: result.findings,
      face: result.face,
      model: GEMINI_MODEL,
      analyzed_by: session.membershipId,
      analyzed_at: new Date().toISOString(),
    },
    { onConflict: "attempt_id" },
  );
  if (error) return { ok: false, error: error.message };

  const { data: assign2 } = await db
    .from("test_assignments")
    .select("candidate_id")
    .eq("id", attempt.assignment_id)
    .maybeSingle();
  if (assign2?.candidate_id) {
    revalidatePath(`/candidates/${assign2.candidate_id}/attempt/${attemptId}`);
  }

  return { ok: true, message: "Integrity analysis complete." };
}
