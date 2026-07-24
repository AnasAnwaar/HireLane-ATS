import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageBody, PageHeader } from "@/components/layout/app-shell";
import { NoAccess } from "@/components/permissions/no-access";
import { createClient } from "@/lib/supabase/server";
import { updateOpeningAction } from "@/server/openings/actions";
import { can } from "@/server/auth/authorize";
import { requireSession } from "@/server/auth/session";
import type { RequirementKind } from "@/types/database";

import { OpeningForm, type OpeningFormValues } from "../../opening-form";

export const metadata = { title: "Edit job opening" };

export default async function EditOpeningPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;

  if (!(await can("job_openings.edit"))) {
    return <NoAccess title="You don't have permission to edit openings" />;
  }

  const supabase = await createClient();
  const { data: opening } = await supabase
    .from("job_openings")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!opening) notFound();

  const [{ data: requirements }, { data: questions }, { data: departments }] = await Promise.all([
    supabase
      .from("job_requirements")
      .select("kind, label, sort_order")
      .eq("job_opening_id", id)
      .order("sort_order"),
    supabase
      .from("screening_questions")
      .select("question, sort_order")
      .eq("job_opening_id", id)
      .order("sort_order"),
    supabase
      .from("departments")
      .select("id, name")
      .eq("organization_id", session.organizationId)
      .order("name"),
  ]);

  const byKind = (kind: RequirementKind) =>
    (requirements ?? [])
      .filter((r) => r.kind === kind)
      .map((r) => r.label)
      .join("\n");

  const initial: Partial<OpeningFormValues> = {
    title: opening.title,
    departmentId: opening.department_id ?? "",
    employmentType: opening.employment_type,
    workMode: opening.work_mode,
    location: opening.location ?? "",
    experienceMin: opening.experience_min?.toString() ?? "",
    experienceMax: opening.experience_max?.toString() ?? "",
    salaryMin: opening.salary_min?.toString() ?? "",
    salaryMax: opening.salary_max?.toString() ?? "",
    salaryCurrency: opening.salary_currency ?? "",
    salaryVisible: opening.salary_visible,
    description: opening.description,
    positions: opening.positions.toString(),
    applicationDeadline: opening.application_deadline ?? "",
    mustHaves: byKind("must_have"),
    niceToHaves: byKind("nice_to_have"),
    qualifications: byKind("qualification"),
    screeningQuestions: (questions ?? []).map((q) => q.question).join("\n"),
  };

  // Bind the opening id into the update action.
  const action = updateOpeningAction.bind(null, id);

  return (
    <>
      <PageHeader
        eyebrow={
          <Link
            href={`/openings/${id}`}
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3" /> {opening.title}
          </Link>
        }
        title="Edit opening"
      />
      <PageBody className="max-w-3xl">
        <OpeningForm
          action={action}
          mode="edit"
          departments={departments ?? []}
          defaultCurrency={opening.salary_currency ?? "USD"}
          initial={initial}
        />
      </PageBody>
    </>
  );
}
