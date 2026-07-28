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
import { can } from "@/server/auth/authorize";
import { getFieldVisibility } from "@/server/auth/field-visibility";
import { getCandidateProfile } from "@/server/candidates/queries";
import { requireSession } from "@/server/auth/session";

import { DocumentsSection } from "./documents-section";
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
  const [profile, fields, canNote, canAdvance, canInvite, { data: liveInvite }] = await Promise.all([
    getCandidateProfile(id, session.membershipId),
    getFieldVisibility(),
    can("profile.add_note"),
    can("pipeline.advance"),
    can("applicants.send_invitation"),
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

          {/* Notes */}
          <NotesSection candidateId={candidate.id} notes={notes} canAdd={canNote} />

          {/* Stubbed §UC-6 sections that arrive with later checkpoints. */}
          <Card className="border-dashed">
            <CardContent className="p-5 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Match report · Assessments · Interviews</p>
              <p className="mt-1">
                AI screening (CP-13), test results (CP-15+) and interview records (CP-22) attach
                here as those checkpoints land.
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
