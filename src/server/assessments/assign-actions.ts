"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import type { PermissionKey } from "@/lib/permissions/keys";
import type { ActionResult } from "@/lib/validation/auth";
import { authorize } from "@/server/auth/authorize";
import { getSessionContext } from "@/server/auth/session";

import { getAssessmentPolicy } from "./policy";

/**
 * Test assignment (spec §UC-5.2). HR gives a PUBLISHED test to an applicant with
 * a deadline. The candidate takes it through their portal; the attempt binds to
 * the test's published version (spec R3).
 */

async function guard(permission: PermissionKey) {
  const session = await getSessionContext();
  if (!session) return { ok: false as const, error: "Your session has expired." };
  const auth = await authorize(permission);
  if (!auth.ok) return { ok: false as const, error: auth.error };
  return { ok: true as const, organizationId: session.organizationId, membershipId: session.membershipId };
}

export async function assignTestAction(
  applicationId: string,
  testId: string,
  options: { deadline?: string | null; extraTimeMinutes?: number; screenReaderMode?: boolean },
): Promise<ActionResult> {
  const g = await guard("assessments.assign");
  if (!g.ok) return g;

  const db = await createClient();
  const [{ data: test }, { data: application }] = await Promise.all([
    db.from("tests").select("id, status, job_opening_id, attempts_allowed").eq("id", testId).maybeSingle(),
    db.from("applications").select("id, candidate_id, job_opening_id").eq("id", applicationId).maybeSingle(),
  ]);

  if (!test) return { ok: false, error: "Test not found." };
  if (test.status !== "published") return { ok: false, error: "Only published tests can be assigned." };
  if (!application) return { ok: false, error: "Application not found." };
  if (test.job_opening_id && application.job_opening_id !== test.job_opening_id) {
    return { ok: false, error: "That test belongs to a different opening." };
  }

  let deadline: string | null = null;
  if (options.deadline) {
    const d = new Date(options.deadline);
    if (Number.isNaN(d.getTime())) return { ok: false, error: "Pick a valid deadline." };
    if (d.getTime() <= Date.now()) return { ok: false, error: "The deadline must be in the future." };
    deadline = d.toISOString();
  }

  const { error } = await db.from("test_assignments").upsert(
    {
      organization_id: g.organizationId,
      test_id: testId,
      application_id: applicationId,
      candidate_id: application.candidate_id,
      status: "assigned",
      deadline,
      attempts_allowed: test.attempts_allowed,
      extra_time_minutes: Math.max(0, options.extraTimeMinutes ?? 0),
      screen_reader_mode: Boolean(options.screenReaderMode),
      assigned_by: g.membershipId,
    },
    { onConflict: "test_id,application_id" },
  );
  if (error) return { ok: false, error: error.message };

  await db.from("audit_log").insert({
    organization_id: g.organizationId,
    actor_membership_id: g.membershipId,
    action: "test.assigned",
    entity_type: "application",
    entity_id: applicationId,
    summary: "Assigned a test",
  });
  revalidatePath(`/candidates/${application.candidate_id}`);
  return { ok: true, message: "Test assigned." };
}

export async function cancelAssignmentAction(assignmentId: string): Promise<ActionResult> {
  const g = await guard("assessments.assign");
  if (!g.ok) return g;

  const db = await createClient();
  const { data: a, error } = await db
    .from("test_assignments")
    .update({ status: "cancelled" })
    .eq("id", assignmentId)
    .select("candidate_id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (a) revalidatePath(`/candidates/${a.candidate_id}`);
  return { ok: true, message: "Assignment cancelled." };
}

export async function grantRetakeAction(assignmentId: string): Promise<ActionResult> {
  const g = await guard("assessments.grant_retake");
  if (!g.ok) return g;

  const db = await createClient();
  const { data: a } = await db
    .from("test_assignments")
    .select("attempts_allowed, candidate_id")
    .eq("id", assignmentId)
    .maybeSingle();
  if (!a) return { ok: false, error: "Assignment not found." };

  // Enforce the org's retake cap (spec §UC-5, CP-18).
  const policy = await getAssessmentPolicy(db, g.organizationId);
  if (a.attempts_allowed >= policy.maxAttempts) {
    return { ok: false, error: `The assessment policy caps attempts at ${policy.maxAttempts}.` };
  }

  const { error } = await db
    .from("test_assignments")
    .update({ attempts_allowed: a.attempts_allowed + 1, status: "assigned" })
    .eq("id", assignmentId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/candidates/${a.candidate_id}`);
  return { ok: true, message: "Extra attempt granted." };
}

export async function extendDeadlineAction(
  assignmentId: string,
  deadline: string,
): Promise<ActionResult> {
  const g = await guard("assessments.extend_deadline");
  if (!g.ok) return g;

  const d = new Date(deadline);
  if (Number.isNaN(d.getTime()) || d.getTime() <= Date.now()) {
    return { ok: false, error: "Pick a future deadline." };
  }

  const db = await createClient();
  const { data: a, error } = await db
    .from("test_assignments")
    .update({ deadline: d.toISOString(), status: "assigned" })
    .eq("id", assignmentId)
    .select("candidate_id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (a) revalidatePath(`/candidates/${a.candidate_id}`);
  return { ok: true, message: "Deadline extended." };
}
