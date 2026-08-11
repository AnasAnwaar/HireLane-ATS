"use server";

import { createHash } from "node:crypto";

import { headers } from "next/headers";

import { createAdminClient } from "@/lib/supabase/server";
import { resolveAttempt } from "./delivery";

/**
 * Proctoring capture (spec §UC-5.3, CP-19). Candidate-side, portal-token gated,
 * service-role writes. The client reports browser events; the server stamps
 * severity (never trusting the client), derives environment signals (IP change),
 * and escalates — but only FLAGS. It never rejects (spec R2).
 */

const SEVERITY: Record<string, "low" | "medium" | "high"> = {
  tab_switch: "high",
  window_blur: "medium",
  fullscreen_exit: "high",
  copy: "medium",
  paste: "medium",
  right_click: "low",
  devtools: "high",
  camera_denied: "medium",
  check_in: "low",
};

const FLAG_THRESHOLD = 3; // high-severity breaches before the attempt is flagged

type RecordResult = { ok: true; breachCount: number; flagged: boolean } | { ok: false };

async function clientIpHash(): Promise<string> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim();
  if (!ip) return "";
  return createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

/** Record one browser integrity event; returns the running breach state. */
export async function recordProctoringEventAction(
  rawToken: string,
  attemptId: string,
  type: string,
  detail: Record<string, unknown> = {},
): Promise<RecordResult> {
  const severity = SEVERITY[type];
  if (!severity) return { ok: false };

  const r = await resolveAttempt(rawToken, attemptId);
  if (!r || r.attempt.status !== "in_progress") return { ok: false };

  const admin = createAdminClient();

  // Environment signal: IP changed mid-test.
  const ipHash = await clientIpHash();
  if (ipHash) {
    if (r.attempt.last_ip_hash && r.attempt.last_ip_hash !== ipHash) {
      await admin.from("proctoring_events").insert({
        organization_id: r.organizationId,
        attempt_id: attemptId,
        type: "ip_change",
        severity: "high",
        detail: {},
      });
    }
    if (r.attempt.last_ip_hash !== ipHash) {
      await admin.from("test_attempts").update({ last_ip_hash: ipHash }).eq("id", attemptId);
    }
  }

  await admin.from("proctoring_events").insert({
    organization_id: r.organizationId,
    attempt_id: attemptId,
    type,
    severity,
    detail,
  });

  // Escalate on high-severity breaches.
  let breachCount = r.attempt.breach_count;
  let flagged = r.attempt.flagged;
  if (severity === "high") {
    breachCount = r.attempt.breach_count + 1;
    flagged = flagged || breachCount >= FLAG_THRESHOLD;
    await admin
      .from("test_attempts")
      .update({ breach_count: breachCount, flagged })
      .eq("id", attemptId);
  }

  return { ok: true, breachCount, flagged };
}

/**
 * Store a short exam-room audio sample (Standard/Strict). Analysed later for
 * additional voices (spec §UC-5.3, CP-20). Best-effort; a few rotating clips are
 * kept per attempt. Never blocks the test.
 */
export async function submitAudioSampleAction(
  rawToken: string,
  attemptId: string,
  dataUrl: string,
  index: number,
): Promise<{ ok: boolean }> {
  const r = await resolveAttempt(rawToken, attemptId);
  if (!r || r.attempt.status !== "in_progress") return { ok: false };

  const m = /^data:(audio\/[\w.+-]+);base64,(.+)$/.exec(dataUrl ?? "");
  if (!m) return { ok: false };

  const admin = createAdminClient();
  const slot = Math.max(0, Math.min(2, Math.floor(index))); // keep at most 3 clips
  const path = `${r.organizationId}/proctoring/${attemptId}/audio/${slot}.webm`;
  const { error } = await admin.storage
    .from("candidate-documents")
    .upload(path, Buffer.from(m[2], "base64"), { contentType: m[1], upsert: true });
  return { ok: !error };
}

/**
 * Store the check-in photo (Standard/Strict identity capture). Best-effort: a
 * failed upload records a `camera_denied` event but never blocks the test.
 */
export async function submitCheckInAction(
  rawToken: string,
  attemptId: string,
  dataUrl: string,
): Promise<{ ok: boolean }> {
  const r = await resolveAttempt(rawToken, attemptId);
  if (!r) return { ok: false };

  const admin = createAdminClient();

  const m = /^data:(image\/\w+);base64,(.+)$/.exec(dataUrl ?? "");
  if (!m) {
    await admin.from("proctoring_events").insert({
      organization_id: r.organizationId,
      attempt_id: attemptId,
      type: "camera_denied",
      severity: "medium",
      detail: {},
    });
    return { ok: false };
  }

  const bytes = Buffer.from(m[2], "base64");
  const path = `${r.organizationId}/proctoring/${attemptId}/check-in.jpg`;
  const { error } = await admin.storage
    .from("candidate-documents")
    .upload(path, bytes, { contentType: m[1], upsert: true });

  if (error) return { ok: false };

  await admin.from("test_attempts").update({ check_in_photo_path: path }).eq("id", attemptId);
  await admin.from("proctoring_events").insert({
    organization_id: r.organizationId,
    attempt_id: attemptId,
    type: "check_in",
    severity: "low",
    detail: {},
  });

  // Identity-match enrolment (CP-20): the candidate's FIRST check-in becomes the
  // trusted reference later attempts are compared against.
  const { data: assignment } = await admin
    .from("test_assignments")
    .select("candidate_id")
    .eq("id", r.attempt.assignment_id)
    .maybeSingle();
  if (assignment?.candidate_id) {
    const { data: candidate } = await admin
      .from("candidates")
      .select("reference_photo_path")
      .eq("id", assignment.candidate_id)
      .maybeSingle();
    if (candidate && !candidate.reference_photo_path) {
      const refPath = `${r.organizationId}/reference/${assignment.candidate_id}.jpg`;
      const { error: refErr } = await admin.storage
        .from("candidate-documents")
        .upload(refPath, bytes, { contentType: m[1], upsert: true });
      if (!refErr) {
        await admin
          .from("candidates")
          .update({ reference_photo_path: refPath })
          .eq("id", assignment.candidate_id);
      }
    }
  }
  return { ok: true };
}
