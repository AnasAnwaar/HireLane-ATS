import { ArrowLeft, FileText, Mail, Users } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageBody, PageHeader } from "@/components/layout/app-shell";
import { NoAccess } from "@/components/permissions/no-access";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScoreRing } from "@/components/ui/score-ring";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { STAGE_META } from "@/lib/applicants-display";
import { experienceLabel } from "@/lib/openings-display";
import { RECOMMENDATION_META } from "@/lib/screening-display";
import { clientEnv } from "@/lib/env";
import { formatDate } from "@/lib/utils";
import { isAiConfigured } from "@/server/ai/gemini";
import { can } from "@/server/auth/authorize";
import { requireSession } from "@/server/auth/session";
import type { ApplicationStage, ScreeningRecommendation, ScreeningStatus } from "@/types/database";

import { ApplicantsToolbar } from "./applicants-toolbar";

export const metadata = { title: "Applicants" };

export default async function ApplicantsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSession();
  const { id } = await params;

  if (!(await can("applicants.view_list"))) {
    return <NoAccess title="You don't have access to applicants" />;
  }

  const supabase = await createClient();

  const { data: opening } = await supabase
    .from("job_openings")
    .select("id, title, status")
    .eq("id", id)
    .maybeSingle();

  if (!opening) notFound();

  const [
    { data: applications },
    { data: screenings },
    canImport,
    canViewContact,
    canViewProfile,
    canViewScore,
    canRerank,
  ] = await Promise.all([
    supabase
      .from("applications")
      .select("id, stage, source, applied_at, candidate_id, candidates(full_name, email, headline, location, years_experience)")
      .eq("job_opening_id", id)
      .order("applied_at", { ascending: false }),
    supabase
      .from("application_screenings")
      .select("application_id, score, recommendation, status")
      .eq("job_opening_id", id),
    can("applicants.import"),
    can("fields.view_candidate_contact"),
    can("applicants.view_profile"),
    can("screening.view_score"),
    can("screening.rerank"),
  ]);

  // Map screenings by application; RLS already hid them if the viewer lacks
  // screening.view_score, so `screenings` is empty in that case.
  const screeningByApp = new Map(
    ((screenings ?? []) as {
      application_id: string;
      score: number | null;
      recommendation: ScreeningRecommendation | null;
      status: ScreeningStatus;
    }[]).map((s) => [s.application_id, s]),
  );

  // Default sort: highest score first (spec §UC-4 step 4), unscored last,
  // then most-recent. Only re-sort when the viewer can actually see scores.
  const sorted = [...(applications ?? [])];
  if (canViewScore) {
    sorted.sort((a, b) => {
      const sa = screeningByApp.get(a.id)?.score ?? -1;
      const sb = screeningByApp.get(b.id)?.score ?? -1;
      if (sb !== sa) return sb - sa;
      return new Date(b.applied_at).getTime() - new Date(a.applied_at).getTime();
    });
  }

  // Which candidates have a CV on file (one query, then map).
  const candidateIds = (applications ?? []).map((a) => a.candidate_id);
  let hasCv = new Set<string>();
  if (candidateIds.length) {
    const admin = createAdminClient();
    const { data: docs } = await admin
      .from("documents")
      .select("candidate_id")
      .eq("kind", "cv")
      .in("candidate_id", candidateIds);
    hasCv = new Set((docs ?? []).map((d) => d.candidate_id).filter(Boolean) as string[]);
  }

  const applyUrl = `${clientEnv.NEXT_PUBLIC_APP_URL}/apply/${opening.id}`;

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
        title="Applicants"
        description={`${applications?.length ?? 0} ${(applications?.length ?? 0) === 1 ? "applicant" : "applicants"} for this opening`}
        actions={
          <ApplicantsToolbar
            openingId={id}
            applyUrl={applyUrl}
            isOpen={opening.status === "open"}
            canImport={canImport}
            canRerank={canRerank && isAiConfigured()}
          />
        }
      />

      <PageBody className="space-y-2.5">
        {!applications?.length ? (
          <Card className="flex flex-col items-center gap-3 py-16 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-muted">
              <Users className="size-6 text-muted-foreground" />
            </span>
            <div>
              <p className="font-medium">No applicants yet</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                {opening.status === "open"
                  ? "Share the application link, or add a candidate manually."
                  : "This opening isn't open, so it isn't accepting applications."}
              </p>
            </div>
          </Card>
        ) : (
          sorted.map((app) => {
            const c = app.candidates;
            const meta = STAGE_META[app.stage as ApplicationStage];
            const exp = experienceLabel(c?.years_experience ?? null, null);
            const screening = screeningByApp.get(app.id);

            const rowInner = (
              <div className="flex items-center gap-4 p-4">
                <Avatar name={c?.full_name ?? "?"} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{c?.full_name}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    {c?.headline && <span className="truncate">{c.headline}</span>}
                    {c?.location && <span>· {c.location}</span>}
                    {exp && <span>· {exp}</span>}
                    {canViewContact && c?.email && (
                      <span className="inline-flex items-center gap-1">
                        · <Mail className="size-3" /> {c.email}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-3">
                  {canViewScore &&
                    (screening?.status === "scored" && screening.score != null ? (
                      <div className="flex items-center gap-2">
                        {screening.recommendation && (
                          <Badge
                            variant={RECOMMENDATION_META[screening.recommendation].variant}
                            className="hidden sm:inline-flex"
                          >
                            {RECOMMENDATION_META[screening.recommendation].label}
                          </Badge>
                        )}
                        <ScoreRing score={screening.score} size={40} />
                      </div>
                    ) : screening?.status === "needs_manual_review" ? (
                      <Badge variant="warning" className="hidden sm:inline-flex">
                        Needs review
                      </Badge>
                    ) : (
                      <span className="hidden text-xs text-muted-foreground sm:inline">
                        Not scored
                      </span>
                    ))}
                  {hasCv.has(app.candidate_id) && (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title="CV on file">
                      <FileText className="size-3.5" /> CV
                    </span>
                  )}
                  {app.source && (
                    <Badge variant="outline" className="hidden sm:inline-flex">
                      {app.source}
                    </Badge>
                  )}
                  <span className="hidden text-xs text-muted-foreground md:inline">
                    {formatDate(app.applied_at)}
                  </span>
                  <Badge variant={meta.variant} dot>
                    {meta.label}
                  </Badge>
                </div>
              </div>
            );

            return (
              <Card key={app.id} className="transition-colors hover:border-primary/30">
                {canViewProfile ? (
                  <Link href={`/candidates/${app.candidate_id}`}>{rowInner}</Link>
                ) : (
                  rowInner
                )}
              </Card>
            );
          })
        )}
      </PageBody>
    </>
  );
}
