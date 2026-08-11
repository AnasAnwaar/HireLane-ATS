"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient, createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/validation/auth";
import { authorize } from "@/server/auth/authorize";
import { getSessionContext } from "@/server/auth/session";
import type {
  InterviewMode,
  InterviewStatus,
  ScorecardRecommendation,
} from "@/types/database";

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
