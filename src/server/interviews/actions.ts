"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient, createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/validation/auth";
import { AiError, generateText, isAiConfigured } from "@/server/ai/gemini";
import { authorize } from "@/server/auth/authorize";
import { getSessionContext } from "@/server/auth/session";
import type {
  InterviewMode,
  InterviewStatus,
  ScorecardRecommendation,
} from "@/types/database";

const RECORDING_BUCKET = "interview-recordings";
const INLINE_TRANSCRIBE_LIMIT = 18 * 1024 * 1024; // Gemini inline request ceiling

function mimeFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    aac: "audio/aac",
    ogg: "audio/ogg",
    wav: "audio/wav",
    webm: "audio/webm",
    mp4: "video/mp4",
  };
  return map[ext ?? ""] ?? "audio/mpeg";
}

const MODES: InterviewMode[] = ["video", "phone", "onsite"];
const TERMINAL: InterviewStatus[] = ["completed", "cancelled", "no_show"];

type ScheduleInput = {
  applicationId: string;
  title: string;
  round?: string;
  mode: InterviewMode;
  scheduledAt: string; // ISO
  durationMinutes: number;
  timezone: string;
  videoLink?: string;
  location?: string;
  panelistIds: string[];
  isAsync?: boolean;
  asyncQuestions?: { prompt: string; max_seconds: number }[];
};

type ScheduleResult = { ok: true; interviewId: string } | { ok: false; error: string };

/** Schedule an interview for an application and set its panel. */
export async function scheduleInterviewAction(input: ScheduleInput): Promise<ScheduleResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Your session has expired." };
  const auth = await authorize("interviews.schedule");
  if (!auth.ok) return { ok: false, error: auth.error };

  const when = new Date(input.scheduledAt);
  if (Number.isNaN(when.getTime())) return { ok: false, error: "Pick a valid date and time." };
  const mode = MODES.includes(input.mode) ? input.mode : "video";
  const duration = Math.max(5, Math.min(480, Math.round(input.durationMinutes || 45)));

  const db = await createClient();
  const { data: application } = await db
    .from("applications")
    .select("candidate_id, job_opening_id")
    .eq("id", input.applicationId)
    .maybeSingle();
  if (!application) return { ok: false, error: "Application not found." };

  const asyncQuestions = input.isAsync
    ? (input.asyncQuestions ?? [])
        .map((q) => ({
          prompt: q.prompt.trim().slice(0, 500),
          max_seconds: Math.max(30, Math.min(600, Math.round(q.max_seconds) || 120)),
        }))
        .filter((q) => q.prompt)
        .slice(0, 20)
    : [];
  if (input.isAsync && asyncQuestions.length === 0) {
    return { ok: false, error: "Add at least one question for an async interview." };
  }

  const { data: interview, error } = await db
    .from("interviews")
    .insert({
      organization_id: session.organizationId,
      application_id: input.applicationId,
      candidate_id: application.candidate_id,
      job_opening_id: application.job_opening_id,
      title: input.title.trim() || "Interview",
      round: input.round?.trim() || null,
      mode,
      scheduled_at: when.toISOString(),
      duration_minutes: duration,
      timezone: input.timezone || "UTC",
      video_link: input.videoLink?.trim() || null,
      location: input.location?.trim() || null,
      is_async: Boolean(input.isAsync),
      async_questions: asyncQuestions,
      created_by: session.membershipId,
    })
    .select("id")
    .single();
  if (error || !interview) return { ok: false, error: error?.message ?? "Couldn't schedule the interview." };

  // Panel — dedupe, always include the organiser.
  const ids = [...new Set([session.membershipId, ...input.panelistIds])];
  if (ids.length) {
    await db.from("interview_panelists").insert(
      ids.map((membership_id) => ({
        organization_id: session.organizationId,
        interview_id: interview.id,
        membership_id,
      })),
    );
  }

  revalidatePath("/interviews");
  return { ok: true, interviewId: interview.id };
}

/** Move an interview to a new time (stays 'scheduled'). */
export async function rescheduleInterviewAction(
  interviewId: string,
  scheduledAt: string,
): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Your session has expired." };
  const auth = await authorize("interviews.schedule");
  if (!auth.ok) return { ok: false, error: auth.error };

  const when = new Date(scheduledAt);
  if (Number.isNaN(when.getTime())) return { ok: false, error: "Pick a valid date and time." };

  const db = await createClient();
  const { error } = await db
    .from("interviews")
    .update({ scheduled_at: when.toISOString(), status: "scheduled" })
    .eq("id", interviewId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/interviews");
  revalidatePath(`/interviews/${interviewId}`);
  return { ok: true, message: "Interview rescheduled." };
}

/** Mark completed / cancelled / no-show. */
export async function setInterviewStatusAction(
  interviewId: string,
  status: InterviewStatus,
): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Your session has expired." };
  const auth = await authorize("interviews.schedule");
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!TERMINAL.includes(status) && status !== "scheduled") {
    return { ok: false, error: "Invalid status." };
  }

  const db = await createClient();
  const { error } = await db.from("interviews").update({ status }).eq("id", interviewId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/interviews");
  revalidatePath(`/interviews/${interviewId}`);
  return { ok: true, message: "Interview updated." };
}

/** Save the room's shared notes (any panellist who can join). */
export async function saveSharedNotesAction(
  interviewId: string,
  notes: string,
): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Your session has expired." };
  const auth = await authorize("interviews.join");
  if (!auth.ok) return { ok: false, error: auth.error };

  // Written service-side: the interviews write policy gates on interviews.schedule,
  // but any joiner may edit the shared notes.
  const db = await createClient();
  const { data: iv } = await db
    .from("interviews")
    .select("organization_id")
    .eq("id", interviewId)
    .maybeSingle();
  if (!iv) return { ok: false, error: "Interview not found." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("interviews")
    .update({ shared_notes: notes.slice(0, 8000) })
    .eq("id", interviewId)
    .eq("organization_id", session.organizationId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Record the candidate's consent to be recorded (spec §UC-7 — consent-gated). */
export async function setRecordingConsentAction(
  interviewId: string,
  consent: boolean,
): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Your session has expired." };
  const auth = await authorize("interviews.enable_recording");
  if (!auth.ok) return { ok: false, error: auth.error };

  const admin = createAdminClient();
  const { error } = await admin
    .from("interviews")
    .update({ recording_consent: consent })
    .eq("id", interviewId)
    .eq("organization_id", session.organizationId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/interviews/${interviewId}`);
  return { ok: true, message: consent ? "Consent recorded." : "Consent withdrawn." };
}

/** Register an uploaded recording (the client uploads to storage first). */
export async function saveRecordingAction(
  interviewId: string,
  storagePath: string,
): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Your session has expired." };
  const auth = await authorize("interviews.enable_recording");
  if (!auth.ok) return { ok: false, error: auth.error };

  const db = await createClient();
  const { data: iv } = await db
    .from("interviews")
    .select("recording_consent")
    .eq("id", interviewId)
    .maybeSingle();
  if (!iv) return { ok: false, error: "Interview not found." };
  if (!iv.recording_consent) return { ok: false, error: "Record consent before storing a recording." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("interviews")
    .update({ recording_path: storagePath, recording_uploaded_at: new Date().toISOString(), transcript: null })
    .eq("id", interviewId)
    .eq("organization_id", session.organizationId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/interviews/${interviewId}`);
  return { ok: true, message: "Recording saved." };
}

/** Transcribe the uploaded recording with Gemini. */
export async function transcribeRecordingAction(interviewId: string): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Your session has expired." };
  const auth = await authorize("interviews.view_transcript");
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!isAiConfigured()) return { ok: false, error: "AI isn't set up — a Gemini API key is required." };

  const db = await createClient();
  const { data: iv } = await db
    .from("interviews")
    .select("recording_path")
    .eq("id", interviewId)
    .maybeSingle();
  if (!iv?.recording_path) return { ok: false, error: "No recording to transcribe." };

  const admin = createAdminClient();
  const { data: blob, error: dlErr } = await admin.storage
    .from(RECORDING_BUCKET)
    .download(iv.recording_path);
  if (dlErr || !blob) return { ok: false, error: "Couldn't read the recording." };

  const bytes = Buffer.from(await blob.arrayBuffer());
  if (bytes.length > INLINE_TRANSCRIBE_LIMIT) {
    return { ok: false, error: "Recording is too large to transcribe here (~18 MB limit). Upload a shorter clip." };
  }

  let transcript: string;
  try {
    transcript = await generateText(
      "Transcribe this interview recording verbatim. Where you can tell speakers apart, label lines as Interviewer: or Candidate:. Return plain text only.",
      { media: [{ data: bytes.toString("base64"), mimeType: mimeFromPath(iv.recording_path) }] },
    );
  } catch (err) {
    if (err instanceof AiError) return { ok: false, error: err.message };
    return { ok: false, error: "Transcription failed. Please try again." };
  }
  if (!transcript.trim()) return { ok: false, error: "The AI returned an empty transcript." };

  const { error } = await admin
    .from("interviews")
    .update({ transcript: transcript.slice(0, 100_000) })
    .eq("id", interviewId)
    .eq("organization_id", session.organizationId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/interviews/${interviewId}`);
  return { ok: true, message: "Transcript ready." };
}

type ScorecardInput = {
  recommendation?: ScorecardRecommendation | null;
  rating?: number | null;
  strengths?: string;
  concerns?: string;
  notes?: string;
};

/**
 * Save (and optionally submit) the caller's own scorecard. RLS enforces that a
 * caller may only write their own row, and blind visibility for reading.
 */
export async function saveScorecardAction(
  interviewId: string,
  fields: ScorecardInput,
  submit: boolean,
): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Your session has expired." };
  const auth = await authorize("interviews.submit_scorecard");
  if (!auth.ok) return { ok: false, error: auth.error };

  const rating = fields.rating != null ? Math.max(1, Math.min(5, Math.round(fields.rating))) : null;

  const db = await createClient();
  const { data: existing } = await db
    .from("interview_scorecards")
    .select("id, submitted, submitted_at")
    .eq("interview_id", interviewId)
    .eq("membership_id", session.membershipId)
    .maybeSingle();

  const submitted = submit || Boolean(existing?.submitted);
  const submitted_at = submitted
    ? (existing?.submitted_at ?? new Date().toISOString())
    : null;

  const row = {
    organization_id: session.organizationId,
    interview_id: interviewId,
    membership_id: session.membershipId,
    recommendation: fields.recommendation ?? null,
    rating,
    strengths: fields.strengths?.slice(0, 4000) || null,
    concerns: fields.concerns?.slice(0, 4000) || null,
    notes: fields.notes?.slice(0, 4000) || null,
    submitted,
    submitted_at,
  };

  const { error } = await db
    .from("interview_scorecards")
    .upsert(row, { onConflict: "interview_id,membership_id" });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/interviews/${interviewId}`);
  return { ok: true, message: submit ? "Scorecard submitted." : "Draft saved." };
}
