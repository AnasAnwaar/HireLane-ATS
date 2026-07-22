import {
  ArrowUpRight,
  Briefcase,
  CalendarClock,
  ClipboardCheck,
  Flag,
  Rocket,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import Link from "next/link";

import { PageBody, PageHeader } from "@/components/layout/app-shell";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScoreRing } from "@/components/ui/score-ring";
import { cn } from "@/lib/utils";
import { requireSession } from "@/server/auth/session";

export const metadata = { title: "Dashboard" };

/* ---------------------------------------------------------------------------
   Sample data — replaced by real queries from CP-6 onward. Kept here (not in a
   shared fixtures file) so it's obvious at a glance that this page is not yet
   wired to the database.
   --------------------------------------------------------------------------- */

const STATS = [
  { label: "Open positions", value: "12", delta: "+3", trend: "up", sub: "vs last month", icon: Briefcase },
  { label: "Active candidates", value: "348", delta: "+62", trend: "up", sub: "vs last month", icon: Users },
  { label: "Awaiting review", value: "27", delta: "+9", trend: "up", sub: "tests + profiles", icon: ClipboardCheck },
  { label: "Avg. time to hire", value: "21d", delta: "−4d", trend: "down", sub: "vs last quarter", icon: CalendarClock },
] as const;

const FUNNEL = [
  { stage: "Applied", count: 348, tone: "bg-chart-1" },
  { stage: "Screened", count: 194, tone: "bg-chart-2" },
  { stage: "Shortlisted", count: 86, tone: "bg-chart-3" },
  { stage: "Assessed", count: 41, tone: "bg-chart-4" },
  { stage: "Interviewed", count: 18, tone: "bg-chart-5" },
  { stage: "Offer", count: 5, tone: "bg-success" },
];

const CANDIDATES = [
  { name: "Ayesha Khan", role: "Senior React Developer", score: 94, status: "Interview", variant: "success", flagged: false },
  { name: "Bilal Ahmed", role: "Senior React Developer", score: 88, status: "Test passed", variant: "default", flagged: false },
  { name: "Hina Raza", role: "Product Designer", score: 81, status: "Test flagged", variant: "warning", flagged: true },
  { name: "Usman Tariq", role: "DevOps Engineer", score: 67, status: "Screened", variant: "secondary", flagged: false },
  { name: "Sara Malik", role: "Product Designer", score: 52, status: "Applied", variant: "secondary", flagged: false },
] as const;

const ACTIVITY = [
  { icon: Sparkles, text: "AI ranked 42 new applicants for Senior React Developer", time: "12m ago", tone: "text-primary" },
  { icon: CalendarClock, text: "Interview scheduled with Ayesha Khan — technical round 2", time: "40m ago", tone: "text-sand-foreground" },
  { icon: Flag, text: "Hina Raza flagged for tab switching during assessment", time: "1h ago", tone: "text-warning" },
  { icon: ClipboardCheck, text: "Bilal Ahmed completed React Fundamentals (88%)", time: "3h ago", tone: "text-success" },
  { icon: Briefcase, text: "DevOps Engineer published to LinkedIn, Indeed, Rozee.pk", time: "Yesterday", tone: "text-muted-foreground" },
];

const INTERVIEWS = [
  { name: "Ayesha Khan", round: "Technical round 2", when: "Today, 3:00 PM" },
  { name: "Bilal Ahmed", round: "Culture fit", when: "Tomorrow, 11:30 AM" },
  { name: "Zoya Iqbal", round: "Screening call", when: "Thu, 10:00 AM" },
];

export default async function DashboardPage() {
  const session = await requireSession("/dashboard");
  const funnelMax = FUNNEL[0].count;
  const firstName = session.fullName.split(" ")[0] || "there";

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
        {/* Onboarding is optional, not a gate — nudge rather than block. */}
        {!session.onboardingCompleted && (
          <Card className="border-primary/25 bg-primary-soft/40">
            <CardContent className="flex flex-wrap items-center gap-4 p-5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Rocket className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">Finish setting up {session.organizationName}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Add departments, invite your team and connect your job boards — about two
                  minutes.
                </p>
              </div>
              <Button asChild>
                <Link href="/onboarding">
                  Continue setup <ArrowUpRight />
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Stat row */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {STATS.map((stat) => (
            <Card key={stat.label} className="group relative overflow-hidden">
              <span
                aria-hidden
                className="brand-rule absolute inset-x-0 top-0 h-[3px] opacity-0 transition-opacity group-hover:opacity-100"
              />
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <span className="flex size-8 items-center justify-center rounded-lg bg-sand-soft text-sand-foreground">
                    <stat.icon className="size-4" />
                  </span>
                </div>
                <p className="mt-3 text-3xl font-semibold tabular-nums tracking-tight">
                  {stat.value}
                </p>
                <p className="mt-1.5 flex items-center gap-1.5 text-xs">
                  <span
                    className={cn(
                      "inline-flex items-center gap-0.5 font-medium",
                      stat.trend === "up" ? "text-success" : "text-sand-foreground",
                    )}
                  >
                    {stat.trend === "up" ? (
                      <TrendingUp className="size-3" />
                    ) : (
                      <TrendingDown className="size-3" />
                    )}
                    {stat.delta}
                  </span>
                  <span className="text-muted-foreground">{stat.sub}</span>
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Funnel */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base">Pipeline funnel</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  All open positions · last 30 days
                </p>
              </div>
              <Badge variant="outline">Sample data</Badge>
            </CardHeader>
            <CardContent className="space-y-3.5">
              {FUNNEL.map((row, i) => {
                const pct = Math.round((row.count / funnelMax) * 100);
                const prev = i === 0 ? null : FUNNEL[i - 1].count;
                const conversion = prev ? Math.round((row.count / prev) * 100) : null;

                return (
                  <div key={row.stage}>
                    <div className="mb-1.5 flex items-baseline justify-between text-sm">
                      <span className="font-medium">{row.stage}</span>
                      <span className="flex items-baseline gap-2">
                        <span className="font-semibold tabular-nums">{row.count}</span>
                        {conversion !== null && (
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {conversion}% ↓
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn("h-full rounded-full", row.tone)}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
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
              {INTERVIEWS.map((item) => (
                <div
                  key={item.name}
                  className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-muted"
                >
                  <Avatar name={item.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{item.round}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">{item.when}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Top candidates */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base">Top ranked candidates</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Scored by the screening agent against role requirements
                </p>
              </div>
              <Button variant="ghost" size="sm" className="text-muted-foreground" asChild>
                <Link href="/candidates">
                  All <ArrowUpRight />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="px-2 pb-3">
              {CANDIDATES.map((candidate) => (
                <div
                  key={candidate.name}
                  className="flex items-center gap-4 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted"
                >
                  <ScoreRing score={candidate.score} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate text-sm font-medium">
                      {candidate.name}
                      {candidate.flagged && (
                        <Flag className="size-3.5 shrink-0 text-warning" aria-label="Flagged" />
                      )}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{candidate.role}</p>
                  </div>
                  <Badge variant={candidate.variant} dot>
                    {candidate.status}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Activity */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent activity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {ACTIVITY.map((item, i) => (
                <div key={i} className="flex gap-3">
                  <span className="relative flex flex-col items-center">
                    <span
                      className={cn(
                        "flex size-7 shrink-0 items-center justify-center rounded-full bg-muted",
                        item.tone,
                      )}
                    >
                      <item.icon className="size-3.5" />
                    </span>
                    {i < ACTIVITY.length - 1 && (
                      <span aria-hidden className="mt-1 w-px flex-1 bg-border" />
                    )}
                  </span>
                  <div className="pb-1">
                    <p className="text-sm leading-snug">{item.text}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{item.time}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Figures above are sample data — the dashboard is wired to live queries from CP-6.
        </p>
      </PageBody>
    </>
  );
}
