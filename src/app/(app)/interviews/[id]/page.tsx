import { ArrowLeft, CalendarDays, Clock, Download, ExternalLink, MapPin, Users, Video } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageBody, PageHeader } from "@/components/layout/app-shell";
import { NoAccess } from "@/components/permissions/no-access";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { INTERVIEW_MODE_META, INTERVIEW_STATUS_META } from "@/lib/interviews-display";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/server/auth/authorize";
import { getSessionContext } from "@/server/auth/session";
import type { Interview, InterviewScorecard } from "@/types/database";

import { LifecycleActions } from "./lifecycle-actions";
import { ScorecardPanel, type ScorecardView } from "./scorecard-panel";

export const metadata = { title: "Interview" };

function fmt(dt: string, tz: string): string {
  return new Date(dt).toLocaleString("en-GB", { dateStyle: "full", timeStyle: "short", timeZone: tz || "UTC" });
}

export default async function InterviewPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionContext();
  if (!session) notFound();
  const { id } = await params;

  if (!(await can("interviews.view_schedule"))) {
    return <NoAccess title="You don't have access to interviews" />;
  }

  const supabase = await createClient();
  const { data: interviewRow } = await supabase.from("interviews").select("*").eq("id", id).maybeSingle();
  if (!interviewRow) notFound();
  const interview = interviewRow as Interview;

  const [{ data: candidate }, { data: panelistRows }, { data: scorecardRows }, canSchedule, canScore, canJoin] =
    await Promise.all([
      supabase.from("candidates").select("id, full_name").eq("id", interview.candidate_id).maybeSingle(),
      supabase.from("interview_panelists").select("membership_id").eq("interview_id", id),
      supabase.from("interview_scorecards").select("*").eq("interview_id", id),
      can("interviews.schedule"),
      can("interviews.submit_scorecard"),
      can("interviews.join"),
    ]);

  let openingTitle: string | null = null;
  if (interview.job_opening_id) {
    const { data: o } = await supabase
      .from("job_openings")
      .select("title")
      .eq("id", interview.job_opening_id)
      .maybeSingle();
    openingTitle = o?.title ?? null;
  }

  // Names for panel + scorecard authors.
  const scorecards = (scorecardRows ?? []) as InterviewScorecard[];
  const memberIds = [
    ...new Set([
      ...(panelistRows ?? []).map((p) => p.membership_id),
      ...scorecards.map((s) => s.membership_id),
    ]),
  ];
  const { data: members } = memberIds.length
    ? await supabase.from("memberships").select("id, profiles(full_name)").in("id", memberIds)
    : { data: [] as { id: string; profiles: { full_name?: string } | null }[] };
  const memberName = new Map(
    (members ?? []).map((m) => [m.id, (m.profiles as { full_name?: string } | null)?.full_name || "Member"]),
  );

  const panel = (panelistRows ?? []).map((p) => ({
    membershipId: p.membership_id,
    name: memberName.get(p.membership_id) ?? "Member",
  }));

  const own = scorecards.find((s) => s.membership_id === session.membershipId) ?? null;
  const others: ScorecardView[] = scorecards
    .filter((s) => s.membership_id !== session.membershipId)
    .map((s) => ({
      author: memberName.get(s.membership_id) ?? "Interviewer",
      recommendation: s.recommendation,
      rating: s.rating,
      strengths: s.strengths,
      concerns: s.concerns,
      notes: s.notes,
      submitted: s.submitted,
    }));

  const status = INTERVIEW_STATUS_META[interview.status];

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/interviews" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-3" /> Interviews
          </Link>
        }
        title={`${candidate?.full_name ?? "Candidate"} · ${interview.title}`}
        description={openingTitle ?? undefined}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant={status.variant} dot>
              {status.label}
            </Badge>
            {canJoin && interview.status === "scheduled" && (
              <Button asChild size="sm">
                <Link href={`/interviews/${id}/room`}>
                  <Video /> Open room
                </Link>
              </Button>
            )}
          </div>
        }
      />

      <PageBody className="max-w-3xl space-y-5">
        {/* Details */}
        <Card className="p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Detail icon={CalendarDays} label="When" value={fmt(interview.scheduled_at, interview.timezone)} />
            <Detail icon={Clock} label="Duration" value={`${interview.duration_minutes} min · ${interview.timezone}`} />
            <Detail icon={Video} label="Mode" value={INTERVIEW_MODE_META[interview.mode].label} />
            {interview.round && <Detail icon={Users} label="Round" value={interview.round} />}
            {interview.location && <Detail icon={MapPin} label="Location" value={interview.location} />}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {interview.video_link && (
              <Button asChild variant="outline" size="sm">
                <a href={interview.video_link} target="_blank" rel="noopener noreferrer">
                  <ExternalLink /> Join video call
                </a>
              </Button>
            )}
            <Button asChild variant="outline" size="sm">
              <a href={`/interviews/${id}/invite`}>
                <Download /> Calendar invite (.ics)
              </a>
            </Button>
          </div>

          {panel.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Panel</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {panel.map((p) => (
                  <span key={p.membershipId} className="rounded-full border border-border px-2.5 py-1 text-xs">
                    {p.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* Lifecycle */}
        {canSchedule && (
          <LifecycleActions
            interviewId={id}
            status={interview.status}
            scheduledAtLocal={toLocalInput(interview.scheduled_at)}
          />
        )}

        {/* Scorecards (blind) */}
        <ScorecardPanel
          interviewId={id}
          canScore={canScore}
          own={
            own
              ? {
                  recommendation: own.recommendation,
                  rating: own.rating,
                  strengths: own.strengths,
                  concerns: own.concerns,
                  notes: own.notes,
                  submitted: own.submitted,
                }
              : null
          }
          others={others}
        />
      </PageBody>
    </>
  );
}

function toLocalInput(iso: string): string {
  // Format an ISO instant as a datetime-local value (yyyy-MM-ddTHH:mm) in UTC.
  return new Date(iso).toISOString().slice(0, 16);
}

function Detail({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}
