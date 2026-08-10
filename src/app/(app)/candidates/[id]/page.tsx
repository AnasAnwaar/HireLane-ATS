import { ArrowLeft, Briefcase, Globe, Link2, Mail, MapPin, Phone } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageBody, PageHeader } from "@/components/layout/app-shell";
import { NoAccess } from "@/components/permissions/no-access";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { STAGE_META } from "@/lib/applicants-display";
import { experienceLabel } from "@/lib/openings-display";
import { formatDate } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { isAiConfigured } from "@/server/ai/gemini";
import { can } from "@/server/auth/authorize";
import { getFieldVisibility } from "@/server/auth/field-visibility";
import { getCandidateProfile } from "@/server/candidates/queries";
import { requireSession } from "@/server/auth/session";
import type { ApplicationScreening } from "@/types/database";

import { AssessmentsCard, type AssignableTest, type AssignmentView } from "./assessments-card";
import { DocumentsSection } from "./documents-section";
import { MatchReport, type MatchReportData } from "./match-report";
import { NotesSection } from "./notes-section";
import { PortalInviteCard } from "./portal-invite-card";
import { StageControl } from "./stage-control";
import { Timeline } from "./timeline";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const profile = await getCandidateProfile(id, session.membershipId);
  return { title: profile ? profile.candidate.full_name : "Candidate" };
}

export default async function CandidateProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;

  if (!(await can("applicants.view_profile"))) {
    return <NoAccess title="You don't have access to candidate profiles" />;
  }

  const supabase = await createClient();
  const [profile, fields, canNote, canAdvance, canInvite, canViewReport, canOverride, canRerank, canViewAssessments, canAssign, canGrantRetake, { data: liveInvite }] =
    await Promise.all([
      getCandidateProfile(id, session.membershipId),
      getFieldVisibility(),
      can("profile.add_note"),
      can("pipeline.advance"),
      can("applicants.send_invitation"),
      can("screening.view_report"),
      can("screening.override"),
      can("screening.rerank"),
      can("assessments.view"),
      can("assessments.assign"),
      can("assessments.grant_retake"),
      supabase
        .from("candidate_portal_invites")
        .select("expires_at")
        .eq("candidate_id", id)
        .is("revoked_at", null)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle(),
    ]);

  if (!profile) notFound();
  const { candidate, applications, documents, notes, timeline } = profile;

  const showContact = fields["fields.view_candidate_contact"];
  const exp = experienceLabel(candidate.years_experience, null);

  // Match reports (spec §UC-4, CP-14) — one per application, if the viewer may
  // see the full breakdown. RLS also hides them without screening.view_report.
  const screeningByApp = new Map<string, ApplicationScreening>();
  if (canViewReport && applications.length) {
    const { data: screenings } = await supabase
      .from("application_screenings")
      .select("*")
      .in(
        "application_id",
        applications.map((a) => a.id),
      );
    for (const s of (screenings ?? []) as ApplicationScreening[]) {
      screeningByApp.set(s.application_id, s);
    }
  }

  // Assessments (spec §UC-5.2, CP-16) — this candidate's test assignments + the
  // published tests HR can assign for their openings.
  let assignments: AssignmentView[] = [];
  const assignableTests: AssignableTest[] = [];
  if (canViewAssessments) {
    const { data: aRows } = await supabase
      .from("test_assignments")
      .select("id, status, deadline, attempts_used, attempts_allowed, test_id, tests(title)")
      .eq("candidate_id", id)
      .order("created_at", { ascending: false });

    const aList = aRows ?? [];
    const attemptByAssignment = new Map<string, { auto_score: number | null; max_score: number | null }>();
    if (aList.length) {
      const { data: atts } = await supabase
        .from("test_attempts")
        .select("assignment_id, auto_score, max_score, created_at")
        .in(
          "assignment_id",
          aList.map((a) => a.id),
        )
        .order("created_at", { ascending: false });
      for (const at of atts ?? []) {
        if (!attemptByAssignment.has(at.assignment_id)) {
          attemptByAssignment.set(at.assignment_id, { auto_score: at.auto_score, max_score: at.max_score });
        }
      }
    }
    assignments = aList.map((a) => ({
      id: a.id,
      testTitle: a.tests?.title ?? "Assessment",
      status: a.status,
      deadline: a.deadline,
      attemptsUsed: a.attempts_used,
      attemptsAllowed: a.attempts_allowed,
      autoScore: attemptByAssignment.get(a.id)?.auto_score ?? null,
      maxScore: attemptByAssignment.get(a.id)?.max_score ?? null,
    }));

    if (canAssign) {
      const openingIds = [...new Set(applications.map((a) => a.jobOpeningId))];
      if (openingIds.length) {
        const { data: pubTests } = await supabase
          .from("tests")
          .select("id, title, job_opening_id")
          .eq("status", "published")
          .in("job_opening_id", openingIds);
        for (const t of pubTests ?? []) {
          const app = applications.find((a) => a.jobOpeningId === t.job_opening_id);
          if (app) {
            assignableTests.push({ testId: t.id, title: t.title, applicationId: app.id, openingTitle: app.jobTitle });
          }
        }
      }
    }
  }

  return (
    <>
      <PageHeader
        eyebrow={
          <Link
            href="/candidates"
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3" /> Candidates
          </Link>
        }
        title={candidate.full_name}
        description={candidate.headline ?? undefined}
      />

      <PageBody className="grid max-w-5xl gap-6 lg:grid-cols-3">
        {/* Left column — the working record */}
        <div className="space-y-6 lg:col-span-2">
          {/* Applications + stage control */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Applications ({applications.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {applications.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Not linked to any opening yet.
                </p>
              ) : (
                applications.map((app) => (
                  <div
                    key={app.id}
                    className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/30 p-3"
                  >
                    <Briefcase className="size-4 shrink-0 text-muted-foreground" />
                    <Link
                      href={`/openings/${app.jobOpeningId}`}
                      className="min-w-0 flex-1 truncate text-sm font-medium hover:underline"
                    >
                      {app.jobTitle}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      Applied {formatDate(app.appliedAt)}
                    </span>
                    {canAdvance ? (
                      <StageControl applicationId={app.id} stage={app.stage} />
                    ) : (
                      <Badge variant={STAGE_META[app.stage].variant} dot>
                        {STAGE_META[app.stage].label}
                      </Badge>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Match reports (CP-14) — one per screened application */}
          {applications.map((app) => {
            const s = screeningByApp.get(app.id);
            if (!s) return null;
            const report: MatchReportData = {
              applicationId: app.id,
              openingTitle: app.jobTitle,
              status: s.status,
              score: s.score,
              recommendation: s.recommendation,
              summary: s.summary,
              mustHaves: s.must_haves ?? [],
              niceToHaves: s.nice_to_haves ?? [],
              criteria: s.criteria ?? [],
              highlights: s.highlights ?? [],
              concerns: s.concerns ?? [],
              model: s.model,
              stale: s.stale,
              overrideRecommendation: s.override_recommendation,
              overrideReason: s.override_reason,
              overriddenAt: s.overridden_at,
            };
            return (
              <MatchReport
                key={app.id}
                report={report}
                canOverride={canOverride}
                canRerank={canRerank && isAiConfigured()}
              />
            );
          })}

          {/* Assessments (CP-16) */}
          {canViewAssessments && (
            <AssessmentsCard
              assignments={assignments}
              assignableTests={assignableTests}
              canAssign={canAssign}
              canGrantRetake={canGrantRetake}
            />
          )}

          {/* Notes */}
          <NotesSection candidateId={candidate.id} notes={notes} canAdd={canNote} />

          {/* Stubbed sections that arrive with later checkpoints. */}
          <Card className="border-dashed">
            <CardContent className="p-5 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Assessments · Interviews</p>
              <p className="mt-1">
                Test results (CP-15+) and interview records (CP-22) attach here as those
                checkpoints land.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Right column — facts, documents, timeline */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex-row items-center gap-3 space-y-0">
              <Avatar name={candidate.full_name} size="lg" />
              <div className="min-w-0">
                <CardTitle className="truncate text-base">{candidate.full_name}</CardTitle>
                {candidate.headline && (
                  <p className="truncate text-sm text-muted-foreground">{candidate.headline}</p>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-2.5 text-sm">
              {showContact ? (
                <>
                  <Fact icon={Mail} value={candidate.email} href={`mailto:${candidate.email}`} />
                  {candidate.phone && <Fact icon={Phone} value={candidate.phone} />}
                </>
              ) : (
                <p className="text-xs italic text-muted-foreground">
                  Contact details are hidden from your role.
                </p>
              )}
              {candidate.location && <Fact icon={MapPin} value={candidate.location} />}
              {exp && <Fact icon={Briefcase} value={exp} />}
              {candidate.linkedin_url && (
                <Fact icon={Link2} value="LinkedIn" href={ensureUrl(candidate.linkedin_url)} />
              )}
              {candidate.portfolio_url && (
                <Fact icon={Globe} value="Portfolio" href={ensureUrl(candidate.portfolio_url)} />
              )}
              {candidate.github_url && (
                <Fact icon={Link2} value="GitHub" href={ensureUrl(candidate.github_url)} />
              )}

              {candidate.skills.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {candidate.skills.map((s) => (
                    <Badge key={s} variant="secondary">
                      {s}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {canInvite && (
            <PortalInviteCard
              candidateId={candidate.id}
              hasLiveInvite={Boolean(liveInvite)}
              expiresAt={liveInvite?.expires_at ?? null}
            />
          )}

          <DocumentsSection
            documents={documents.map((d) => ({
              id: d.id,
              fileName: d.file_name,
              kind: d.kind,
              createdAt: d.created_at,
            }))}
            canView={fields["fields.view_candidate_documents"] || showContact}
          />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <Timeline events={timeline} />
            </CardContent>
          </Card>
        </div>
      </PageBody>
    </>
  );
}

function Fact({
  icon: Icon,
  value,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  value: string;
  href?: string;
}) {
  const content = (
    <span className="flex items-center gap-2.5">
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="truncate">{value}</span>
    </span>
  );
  return href ? (
    <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="block hover:text-primary">
      {content}
    </a>
  ) : (
    <div>{content}</div>
  );
}

function ensureUrl(v: string) {
  return v.startsWith("http") ? v : `https://${v}`;
}
