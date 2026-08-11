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
  return { ok: true };
}
