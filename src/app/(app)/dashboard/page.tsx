import { ArrowUpRight, Briefcase, CalendarClock, ClipboardCheck, Rocket, Users } from "lucide-react";
import Link from "next/link";

import { PageBody, PageHeader } from "@/components/layout/app-shell";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { requireSession } from "@/server/auth/session";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

const FUNNEL_STAGES: { label: string; keys: string[]; tone: string }[] = [
  { label: "Applied", keys: ["applied"], tone: "bg-chart-1" },
  { label: "Screened", keys: ["screened"], tone: "bg-chart-2" },
  { label: "Shortlisted", keys: ["shortlisted"], tone: "bg-chart-3" },
  { label: "Assessed", keys: ["test_assigned", "test_completed"], tone: "bg-chart-4" },
  { label: "Interviewed", keys: ["interview_scheduled", "interviewed"], tone: "bg-chart-5" },
  { label: "Offer", keys: ["offer"], tone: "bg-warning" },
  { label: "Hired", keys: ["hired"], tone: "bg-success" },
];

const STAGE_LABEL: Record<string, string> = {
  applied: "Applied",
  screened: "Screened",
  shortlisted: "Shortlisted",
  test_assigned: "Test assigned",
  test_completed: "Test completed",
  interview_scheduled: "Interview",
  interviewed: "Interviewed",
  offer: "Offer",
  hired: "Hired",
  rejected: "Rejected",
  on_hold: "On hold",
  withdrawn: "Withdrawn",
};

function ago(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d}d ago`;
}

function whenLabel(iso: string): string {
  const date = new Date(iso);
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const day = date.toDateString();
  const today = new Date().toDateString();
  const tomorrow = new Date(Date.now() + 86_400_000).toDateString();
  if (day === today) return `Today, ${time}`;
  if (day === tomorrow) return `Tomorrow, ${time}`;
  return `${date.toLocaleDateString("en-US", { weekday: "short" })}, ${time}`;
}

export default async function DashboardPage() {
  const session = await requireSession("/dashboard");
  const firstName = session.fullName.split(" ")[0] || "there";
  const supabase = await createClient();
  const nowIso = new Date().toISOString();

  const [
    { count: openPositions },
    { count: activeCandidates },
    { count: awaitingReview },
    { data: stageRows },
    { data: hiredRows },
    { data: interviews },
    { data: recentApps },
  ] = await Promise.all([
    supabase.from("job_openings").select("id", { count: "exact", head: true }).eq("status", "open"),
    supabase.from("applications").select("id", { count: "exact", head: true }).not("stage", "in", "(hired,rejected,withdrawn)"),
    supabase.from("applications").select("id", { count: "exact", head: true }).in("stage", ["applied", "test_completed"]),
    supabase.from("applications").select("stage"),
    supabase.from("applications").select("applied_at, updated_at").eq("stage", "hired"),
    supabase.from("interviews").select("id, title, scheduled_at, candidate_id").gte("scheduled_at", nowIso).order("scheduled_at").limit(5),
    supabase.from("applications").select("applied_at, stage, candidate_id, job_opening_id").order("applied_at", { ascending: false }).limit(6),
  ]);

  // Resolve candidate names / opening titles for the interview + activity lists.
  const candidateIds = [
    ...new Set([...(interviews ?? []), ...(recentApps ?? [])].map((r) => r.candidate_id).filter(Boolean)),
  ];
  const openingIds = [...new Set((recentApps ?? []).map((r) => r.job_opening_id).filter(Boolean))];
  const [{ data: cands }, { data: opens }] = await Promise.all([
    candidateIds.length
      ? supabase.from("candidates").select("id, full_name").in("id", candidateIds as string[])
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    openingIds.length
      ? supabase.from("job_openings").select("id, title").in("id", openingIds as string[])
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
  ]);
  const nameOf = new Map((cands ?? []).map((c) => [c.id, c.full_name]));
  const titleOf = new Map((opens ?? []).map((o) => [o.id, o.title]));

  // Funnel counts from current stages.
  const stageCount = new Map<string, number>();
  for (const r of stageRows ?? []) stageCount.set(r.stage, (stageCount.get(r.stage) ?? 0) + 1);
  const funnel = FUNNEL_STAGES.map((s) => ({
    label: s.label,
    tone: s.tone,
    count: s.keys.reduce((n, k) => n + (stageCount.get(k) ?? 0), 0),
  }));
  const funnelMax = Math.max(1, ...funnel.map((f) => f.count));

  // Avg time to hire (applied → hired, approximated by updated_at).
  const durations = (hiredRows ?? [])
    .map((r) => new Date(r.updated_at).getTime() - new Date(r.applied_at).getTime())
    .filter((ms) => ms > 0);
  const avgHire = durations.length
    ? `${Math.round(durations.reduce((a, b) => a + b, 0) / durations.length / 86_400_000)}d`
    : "—";

  const stats = [
    { label: "Open positions", value: openPositions ?? 0, sub: "currently open", icon: Briefcase },
    { label: "Active candidates", value: activeCandidates ?? 0, sub: "in the pipeline", icon: Users },
    { label: "Awaiting review", value: awaitingReview ?? 0, sub: "new profiles + tests", icon: ClipboardCheck },
    { label: "Avg. time to hire", value: avgHire, sub: "applied → hired", icon: CalendarClock },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title={`Welcome, ${firstName}`}
        description="Here's where your hiring pipeline stands today."
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link href="/reports">View reports</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/openings/new">New opening</Link>
            </Button>
          </>
        }
      />

      <PageBody className="space-y-6">
        {!session.onboardingCompleted && (
          <Card className="border-primary/25 bg-primary-soft/40">
            <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-start gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Rocket className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="font-medium">Finish setting up {session.organizationName}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Add departments, invite your team and connect your job boards — about two minutes.
                  </p>
                </div>
              </div>
              <Button asChild className="w-full shrink-0 sm:w-auto">
                <Link href="/onboarding">
                  Continue setup <ArrowUpRight />
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Stat row */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => (
            <Card key={stat.label} className="group relative overflow-hidden">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <span className="flex size-8 items-center justify-center rounded-lg bg-sand-soft text-sand-foreground">
                    <stat.icon className="size-4" />
                  </span>
                </div>
                <p className="mt-3 text-3xl font-semibold tabular-nums tracking-tight">{stat.value}</p>
                <p className="mt-1.5 text-xs text-muted-foreground">{stat.sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Funnel */}
          <Card className="lg:col-span-2">
            <CardHeader className="space-y-0">
              <CardTitle className="text-base">Pipeline funnel</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">All open positions · current stages</p>
            </CardHeader>
            <CardContent className="space-y-3.5">
              {funnel.map((row) => (
                <div key={row.label}>
                  <div className="mb-1.5 flex items-baseline justify-between text-sm">
                    <span className="font-medium">{row.label}</span>
                    <span className="font-semibold tabular-nums">{row.count}</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full rounded-full", row.tone)}
                      style={{ width: `${Math.round((row.count / funnelMax) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Upcoming interviews */}
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Upcoming interviews</CardTitle>
              <Button variant="ghost" size="sm" className="text-muted-foreground" asChild>
                <Link href="/interviews">
                  All <ArrowUpRight />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-1">
              {(interviews ?? []).length === 0 && (
                <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                  No interviews scheduled.
                </p>
              )}
              {(interviews ?? []).map((item) => {
                const name = nameOf.get(item.candidate_id) ?? "Candidate";
                return (
                  <div key={item.id} className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-muted">
                    <Avatar name={name} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{name}</p>
                      <p className="truncate text-xs text-muted-foreground">{item.title ?? "Interview"}</p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">{whenLabel(item.scheduled_at)}</span>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        {/* Recent activity */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {(recentApps ?? []).length === 0 && (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                No applications yet. They&apos;ll show up here as candidates apply.
              </p>
            )}
            {(recentApps ?? []).map((item, i) => {
              const name = nameOf.get(item.candidate_id) ?? "A candidate";
              const title = titleOf.get(item.job_opening_id) ?? "an opening";
              return (
                <div key={i} className="flex items-center gap-3 rounded-lg p-2">
                  <Avatar name={name} />
                  <p className="min-w-0 flex-1 truncate text-sm">
                    <span className="font-medium">{name}</span> applied to{" "}
                    <span className="font-medium">{title}</span>
                    <Badge variant="secondary" className="ml-2 align-middle">
                      {STAGE_LABEL[item.stage] ?? item.stage}
                    </Badge>
                  </p>
                  <span className="shrink-0 text-xs text-muted-foreground">{ago(item.applied_at)}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </PageBody>
    </>
  );
}
