"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { resolvePortalSession } from "@/server/candidates/portal-access";
import type { AsyncQuestion, Interview } from "@/types/database";

/**
 * Candidate-side async video interview (spec §UC-7, CP-22). The candidate is
 * unauthenticated — their portal token is the authorisation. Videos upload
 * straight to storage via a short-lived signed upload URL (server-action bodies
 * can't carry a video), then the answer is registered via the service role.
 */

const BUCKET = "interview-recordings";

type Resolved = { candidateId: string; organizationId: string; interview: Interview };

async function resolve(rawToken: string, interviewId: string): Promise<Resolved | null> {
  const session = await resolvePortalSession(rawToken);
  if (!session) return null;
  const admin = createAdminClient();
  const { data: iv } = await admin.from("interviews").select("*").eq("id", interviewId).maybeSingle();
  if (!iv) return null;
  const interview = iv as Interview;
  if (
    interview.candidate_id !== session.candidateId ||
    interview.organization_id !== session.organizationId ||
    !interview.is_async
  ) {
    return null;
  }
  return { candidateId: session.candidateId, organizationId: session.organizationId, interview };
}

/** Get a signed URL to upload one answer video directly to storage. */
export async function startAsyncAnswerUploadAction(
  rawToken: string,
  interviewId: string,
  questionIndex: number,
): Promise<{ ok: true; path: string; token: string } | { ok: false; error: string }> {
  const r = await resolve(rawToken, interviewId);
  if (!r) return { ok: false, error: "This link is no longer valid." };
  const questions = (r.interview.async_questions ?? []) as AsyncQuestion[];
  if (questionIndex < 0 || questionIndex >= questions.length) {
    return { ok: false, error: "Unknown question." };
  }

  const admin = createAdminClient();
  const path = `${r.organizationId}/async/${interviewId}/q${questionIndex}.webm`;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: true });
  if (error || !data) return { ok: false, error: "Couldn't start the upload. Please try again." };
  return { ok: true, path: data.path, token: data.token };
}

/** Register a finished answer upload against the interview. */
export async function registerAsyncAnswerAction(
  rawToken: string,
  interviewId: string,
  questionIndex: number,
  path: string,
  durationSeconds: number,
): Promise<{ ok: boolean; error?: string }> {
  const r = await resolve(rawToken, interviewId);
  if (!r) return { ok: false, error: "This link is no longer valid." };

  const admin = createAdminClient();
  const { error } = await admin.from("interview_answers").upsert(
    {
      organization_id: r.organizationId,
      interview_id: interviewId,
      question_index: questionIndex,
      video_path: path,
      duration_seconds: Math.max(0, Math.round(durationSeconds)) || null,
    },
    { onConflict: "interview_id,question_index" },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
