import {
  ArrowLeft,
  Banknote,
  CalendarClock,
  ClipboardList,
  MapPin,
  Pencil,
  Sparkles,
  Users,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageBody, PageHeader } from "@/components/layout/app-shell";
import { NoAccess } from "@/components/permissions/no-access";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import {
  EMPLOYMENT_LABELS,
  REQUIREMENT_LABELS,
  STATUS_META,
  WORK_MODE_LABELS,
  experienceLabel,
  salaryLabel,
} from "@/lib/openings-display";
import { formatDate } from "@/lib/utils";
import { can } from "@/server/auth/authorize";
import { getFieldVisibility } from "@/server/auth/field-visibility";
import { requireSession } from "@/server/auth/session";
import type { RequirementKind } from "@/types/database";

import { StatusActions } from "./status-actions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("job_openings").select("title").eq("id", id).maybeSingle();
  return { title: data?.title ?? "Job opening" };
}

export default async function OpeningDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSession();
  const { id } = await params;

  if (!(await can("job_openings.view"))) {
    return <NoAccess title="You don't have access to job openings" />;
  }

  const supabase = await createClient();

  // RLS scopes this: a row the viewer can't access simply isn't returned.
  const { data: opening } = await supabase
    .from("job_openings")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!opening) notFound();

  const [{ data: requirements }, { data: questions }, { count: applicantCount }, fields, canEdit, canClose, canViewApplicants, canGeneratePosts, canViewTests] =
    await Promise.all([
      supabase
        .from("job_requirements")
        .select("id, kind, label, sort_order")
        .eq("job_opening_id", id)
        .order("sort_order"),
      supabase
        .from("screening_questions")
        .select("id, question, sort_order")
        .eq("job_opening_id", id)
        .order("sort_order"),
      supabase
        .from("applications")
        .select("*", { count: "exact", head: true })
        .eq("job_opening_id", id),
      getFieldVisibility(),
      can("job_openings.edit"),
      can("job_openings.close"),
      can("applicants.view_list"),
      can("post_generation.generate"),
      can("assessments.view"),
    ]);

  const meta = STATUS_META[opening.status];
  const exp = experienceLabel(opening.experience_min, opening.experience_max);

  // Salary is shown only when the opening opts in AND the viewer holds the
  // field permission — the two gates from spec §UC-2 R2 and §UC-0 step 5.
  const salary =
    opening.salary_visible && fields["fields.view_salary"]
      ? salaryLabel(opening.salary_min, opening.salary_max, opening.salary_currency)
      : null;

  const grouped = groupRequirements(requirements ?? []);

  return (
    <>
      <PageHeader
        eyebrow={
          <Link
            href="/openings"
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3" /> Openings
          </Link>
        }
        title={opening.title}
        description={`${EMPLOYMENT_LABELS[opening.employment_type]} · ${WORK_MODE_LABELS[opening.work_mode]}`}
        actions={
          <div className="flex items-center gap-2">
            <StatusActions
              openingId={opening.id}
              status={opening.status}
              canEdit={canEdit}
              canClose={canClose}
            />
            {canGeneratePosts && (
              <Button size="sm" variant="outline" asChild>
                <Link href={`/openings/${opening.id}/posts`}>
                  <Sparkles /> AI posts
                </Link>
              </Button>
            )}
            {canViewTests && (
              <Button size="sm" variant="outline" asChild>
                <Link href={`/openings/${opening.id}/tests`}>
                  <ClipboardList /> Tests
                </Link>
              </Button>
            )}
            {canEdit && (
              <Button size="sm" variant="ghost" asChild>
                <Link href={`/openings/${opening.id}/edit`}>
                  <Pencil /> Edit
                </Link>
              </Button>
            )}
          </div>
        }
      />

      <PageBody className="grid max-w-5xl gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Description</CardTitle>
              <Badge variant={meta.variant} dot>
                {meta.label}
              </Badge>
            </CardHeader>
            <CardContent>
              {opening.description ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                  {opening.description}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">No description yet.</p>
              )}
            </CardContent>
          </Card>

          {(["must_have", "nice_to_have", "qualification"] as RequirementKind[]).map((kind) =>
            grouped[kind]?.length ? (
              <Card key={kind}>
                <CardHeader>
                  <CardTitle className="text-base">{REQUIREMENT_LABELS[kind]}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="flex flex-wrap gap-2">
                    {grouped[kind].map((r) => (
                      <li key={r.id}>
                        <Badge variant="secondary">{r.label}</Badge>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ) : null,
          )}

          {questions?.length ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Screening questions</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="list-decimal space-y-1.5 pl-5 text-sm">
                  {questions.map((q) => (
                    <li key={q.id}>{q.question}</li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          ) : null}
        </div>

        {/* Sidebar facts */}
        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-3 p-5 text-sm">
              <Fact icon={Users} label="Positions" value={String(opening.positions)} />
              {opening.location && <Fact icon={MapPin} label="Location" value={opening.location} />}
              {exp && <Fact icon={CalendarClock} label="Experience" value={exp} />}
              {salary && <Fact icon={Banknote} label="Salary" value={salary} />}
              {opening.salary_visible &&
                !fields["fields.view_salary"] &&
                (opening.salary_min !== null || opening.salary_max !== null) && (
                  <Fact icon={Banknote} label="Salary" value="Hidden from your role" muted />
                )}
              {opening.application_deadline && (
                <Fact
                  icon={CalendarClock}
                  label="Deadline"
                  value={formatDate(opening.application_deadline)}
                />
              )}
              <Fact icon={CalendarClock} label="Created" value={formatDate(opening.created_at)} />
            </CardContent>
          </Card>

          {canViewApplicants && (
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Applicants</p>
                  <span className="text-2xl font-semibold tabular-nums">{applicantCount ?? 0}</span>
                </div>
                <Button variant="outline" size="sm" className="mt-3 w-full" asChild>
                  <Link href={`/openings/${opening.id}/applicants`}>
                    <Users /> View applicants
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </PageBody>
    </>
  );
}

function groupRequirements(
  rows: { id: string; kind: RequirementKind; label: string; sort_order: number }[],
) {
  const out: Partial<Record<RequirementKind, typeof rows>> = {};
  for (const row of rows) (out[row.kind] ??= []).push(row);
  return out;
}

function Fact({
  icon: Icon,
  label,
  value,
  muted,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="text-muted-foreground">{label}</span>
      <span className={muted ? "ml-auto italic text-muted-foreground" : "ml-auto font-medium"}>
        {value}
      </span>
    </div>
  );
}
