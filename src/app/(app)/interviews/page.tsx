import { Calendar, Video } from "lucide-react";
import Link from "next/link";

import { PageBody, PageHeader } from "@/components/layout/app-shell";
import { NoAccess } from "@/components/permissions/no-access";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { INTERVIEW_MODE_META, INTERVIEW_STATUS_META } from "@/lib/interviews-display";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/server/auth/authorize";
import { requireSession } from "@/server/auth/session";
import type { Interview } from "@/types/database";

import { ScheduleDialog, type ApplicationOption, type MemberOption } from "./schedule-dialog";

export const metadata = { title: "Interviews" };

function fmt(dt: string, tz: string): string {
  return new Date(dt).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: tz || "UTC",
  });
}

export default async function InterviewsPage() {
  await requireSession("/interviews");
  if (!(await can("interviews.view_schedule"))) {
    return <NoAccess title="You don't have access to interviews" />;
  }

  const supabase = await createClient();
  const [{ data: interviewRows }, canSchedule] = await Promise.all([
    supabase.from("interviews").select("*").order("scheduled_at", { ascending: true }),
    can("interviews.schedule"),
  ]);
  const interviews = (interviewRows ?? []) as Interview[];

  // Resolve candidate + opening names.
  const candidateIds = [...new Set(interviews.map((i) => i.candidate_id))];
  const openingIds = [...new Set(interviews.map((i) => i.job_opening_id).filter(Boolean))] as string[];
  const [{ data: candidates }, { data: openings }] = await Promise.all([
    candidateIds.length
      ? supabase.from("candidates").select("id, full_name").in("id", candidateIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    openingIds.length
      ? supabase.from("job_openings").select("id, title").in("id", openingIds)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
  ]);
  const candidateName = new Map((candidates ?? []).map((c) => [c.id, c.full_name]));
  const openingTitle = new Map((openings ?? []).map((o) => [o.id, o.title]));

  // Scheduling inputs (only fetched when the user can schedule).
  let applications: ApplicationOption[] = [];
  let members: MemberOption[] = [];
  if (canSchedule) {
    const [{ data: apps }, { data: mems }] = await Promise.all([
      supabase
        .from("applications")
        .select("id, candidate_id, candidates(full_name), job_openings(title)")
        .order("applied_at", { ascending: false })
        .limit(200),
      supabase
        .from("memberships")
        .select("id, profiles(full_name, email)")
        .eq("status", "active")
        .limit(200),
    ]);
    applications = (apps ?? []).map((a) => ({
      id: a.id,
      candidateName: (a.candidates as { full_name?: string } | null)?.full_name ?? "Candidate",
      openingTitle: (a.job_openings as { title?: string } | null)?.title ?? null,
    }));
    members = (mems ?? []).map((m) => ({
      id: m.id,
      name: (m.profiles as { full_name?: string } | null)?.full_name || "Member",
      email: (m.profiles as { email?: string } | null)?.email ?? "",
    }));
  }

  const now = new Date().getTime();
  const upcoming = interviews.filter(
    (i) => i.status === "scheduled" && new Date(i.scheduled_at).getTime() >= now - 3_600_000,
  );
  const past = interviews.filter((i) => !upcoming.includes(i));

  return (
    <>
      <PageHeader
        eyebrow="Recruiting"
        title="Interviews"
        description="Schedule interviews, run them in-app, and score candidates with blind scorecards."
        actions={
          canSchedule ? <ScheduleDialog applications={applications} members={members} /> : undefined
        }
      />
      <PageBody className="space-y-6">
        {interviews.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 py-16 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-muted">
              <Video className="size-6 text-muted-foreground" />
            </span>
            <div>
              <p className="font-medium">No interviews yet</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Schedule an interview to send a calendar invite and open an in-app room.
              </p>
            </div>
          </Card>
        ) : (
          <>
            <Section title={`Upcoming (${upcoming.length})`}>
              {upcoming.length === 0 ? (
                <p className="text-sm text-muted-foreground">No upcoming interviews.</p>
              ) : (
                upcoming.map((i) => (
                  <InterviewRow
                    key={i.id}
                    interview={i}
                    candidate={candidateName.get(i.candidate_id) ?? "Candidate"}
                    opening={i.job_opening_id ? (openingTitle.get(i.job_opening_id) ?? null) : null}
                  />
                ))
              )}
            </Section>
            {past.length > 0 && (
              <Section title={`Past & closed (${past.length})`}>
                {past.map((i) => (
                  <InterviewRow
                    key={i.id}
                    interview={i}
                    candidate={candidateName.get(i.candidate_id) ?? "Candidate"}
                    opening={i.job_opening_id ? (openingTitle.get(i.job_opening_id) ?? null) : null}
                  />
                ))}
              </Section>
            )}
          </>
        )}
      </PageBody>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

function InterviewRow({
  interview,
  candidate,
  opening,
}: {
  interview: Interview;
  candidate: string;
  opening: string | null;
}) {
  const status = INTERVIEW_STATUS_META[interview.status];
  return (
    <Card className="transition-colors hover:border-primary/30">
      <Link href={`/interviews/${interview.id}`} className="flex items-center gap-4 p-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
          <Calendar className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">
            {candidate}
            <span className="ml-2 font-normal text-muted-foreground">{interview.title}</span>
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span>{fmt(interview.scheduled_at, interview.timezone)}</span>
            <span>· {interview.duration_minutes} min</span>
            <span>· {INTERVIEW_MODE_META[interview.mode].label}</span>
            {opening && <span className="truncate">· {opening}</span>}
          </div>
        </div>
        <Badge variant={status.variant} dot>
          {status.label}
        </Badge>
      </Link>
    </Card>
  );
}
