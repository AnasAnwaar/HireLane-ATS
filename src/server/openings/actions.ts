"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { linesToItems, openingSchema } from "@/lib/validation/openings";
import { toFieldErrors, type ActionResult } from "@/lib/validation/auth";
import { authorize } from "@/server/auth/authorize";
import { getSessionContext } from "@/server/auth/session";
import type { JobOpening, OpeningStatus, RequirementKind } from "@/types/database";

/**
 * Job opening server actions.
 *
 * Every write authorizes first (clear error, not a silent RLS rejection) and
 * then writes through the user's RLS-bound client, so the database enforces the
 * same rule again. Belt and braces: the check here is for UX, RLS is the wall.
 */

function formToObject(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

/** Build the requirement rows for an opening from the three textareas. */
function requirementRows(openingId: string, data: {
  mustHaves: string;
  niceToHaves: string;
  qualifications: string;
}) {
  const rows: { job_opening_id: string; kind: RequirementKind; label: string; sort_order: number }[] =
    [];
  const push = (kind: RequirementKind, text: string) => {
    linesToItems(text).forEach((label, i) =>
      rows.push({ job_opening_id: openingId, kind, label, sort_order: i }),
    );
  };
  push("must_have", data.mustHaves);
  push("nice_to_have", data.niceToHaves);
  push("qualification", data.qualifications);
  return rows;
}

export async function createOpeningAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Your session has expired. Please sign in again." };

  const auth = await authorize("job_openings.create");
  if (!auth.ok) return auth;

  const parsed = openingSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please correct the highlighted fields.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  }

  const d = parsed.data;
  const supabase = await createClient();

  // Saving as draft vs. opening straight away is chosen by the submit button.
  const status: OpeningStatus = formData.get("action") === "open" ? "open" : "draft";

  const { data: opening, error } = await supabase
    .from("job_openings")
    .insert({
      organization_id: session.organizationId,
      created_by: session.membershipId,
      department_id: d.departmentId,
      title: d.title,
      employment_type: d.employmentType,
      work_mode: d.workMode,
      location: d.location,
      experience_min: d.experienceMin,
      experience_max: d.experienceMax,
      salary_min: d.salaryMin,
      salary_max: d.salaryMax,
      salary_currency: d.salaryCurrency?.toUpperCase() ?? null,
      salary_visible: d.salaryVisible,
      description: d.description,
      positions: d.positions,
      application_deadline: d.applicationDeadline,
      status,
      opened_at: status === "open" ? new Date().toISOString() : null,
    })
    .select("id")
    .single();

  if (error || !opening) {
    return { ok: false, error: error?.message ?? "Couldn't create the opening." };
  }

  const requirements = requirementRows(opening.id, d);
  if (requirements.length) {
    await supabase.from("job_requirements").insert(requirements);
  }

  const questions = linesToItems(d.screeningQuestions).map((question, i) => ({
    job_opening_id: opening.id,
    question,
    required: true,
    sort_order: i,
  }));
  if (questions.length) {
    await supabase.from("screening_questions").insert(questions);
  }

  revalidatePath("/openings");
  redirect(`/openings/${opening.id}`);
}

export async function updateOpeningAction(
  openingId: string,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Your session has expired. Please sign in again." };

  const auth = await authorize("job_openings.edit");
  if (!auth.ok) return auth;

  const parsed = openingSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please correct the highlighted fields.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  }

  const d = parsed.data;
  const supabase = await createClient();

  const { error } = await supabase
    .from("job_openings")
    .update({
      department_id: d.departmentId,
      title: d.title,
      employment_type: d.employmentType,
      work_mode: d.workMode,
      location: d.location,
      experience_min: d.experienceMin,
      experience_max: d.experienceMax,
      salary_min: d.salaryMin,
      salary_max: d.salaryMax,
      salary_currency: d.salaryCurrency?.toUpperCase() ?? null,
      salary_visible: d.salaryVisible,
      description: d.description,
      positions: d.positions,
      application_deadline: d.applicationDeadline,
    })
    .eq("id", openingId);

  if (error) return { ok: false, error: error.message };

  // Requirements and questions are replaced wholesale — simpler and correct for
  // the low row counts here than diffing. RLS scopes the delete to this opening.
  await supabase.from("job_requirements").delete().eq("job_opening_id", openingId);
  await supabase.from("screening_questions").delete().eq("job_opening_id", openingId);

  const requirements = requirementRows(openingId, d);
  if (requirements.length) await supabase.from("job_requirements").insert(requirements);

  const questions = linesToItems(d.screeningQuestions).map((question, i) => ({
    job_opening_id: openingId,
    question,
    required: true,
    sort_order: i,
  }));
  if (questions.length) await supabase.from("screening_questions").insert(questions);

  revalidatePath(`/openings/${openingId}`);
  revalidatePath("/openings");
  redirect(`/openings/${openingId}`);
}

/**
 * Move an opening between statuses. Opening/reopening needs create-or-edit;
 * closing needs the close permission. RLS enforces both again.
 */
export async function changeOpeningStatusAction(
  openingId: string,
  status: OpeningStatus,
): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Your session has expired." };

  const needed = status === "closed" ? "job_openings.close" : "job_openings.edit";
  const auth = await authorize(needed);
  if (!auth.ok) return auth;

  const supabase = await createClient();
  const patch: Partial<JobOpening> = { status };
  if (status === "open") patch.opened_at = new Date().toISOString();
  if (status === "closed") patch.closed_at = new Date().toISOString();

  const { error } = await supabase.from("job_openings").update(patch).eq("id", openingId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/openings/${openingId}`);
  revalidatePath("/openings");
  return { ok: true, message: "Status updated." };
}
