import { BarChart3, Briefcase, CheckCircle2, Clock, TrendingUp, Users } from "lucide-react";

import { PageBody, PageHeader } from "@/components/layout/app-shell";
import { NoAccess } from "@/components/permissions/no-access";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { can } from "@/server/auth/authorize";
import { requireSession } from "@/server/auth/session";
import { getReports } from "@/server/reporting/queries";

import { ReportExport } from "./report-export";

export const metadata = { title: "Reports" };

export default async function ReportsPage() {
  const session = await requireSession("/reports");
  const [canOwn, canDept, canCompany, canDiversity, canExport] = await Promise.all([
    can("reporting.view_own"),
    can("reporting.view_department"),
    can("reporting.view_company"),
    can("reporting.view_diversity"),
    can("reporting.export"),
  ]);
  if (!canOwn && !canDept && !canCompany) {
    return <NoAccess title="You don't have access to reports" />;
  }

  const r = await getReports(session.organizationId);
  const funnelMax = r.funnel[0]?.count || 1;

  return (
    <>
      <PageHeader
        eyebrow="Recruiting"
        title="Reports"
        description="Pipeline, sources, assessments and team activity across your organisation."
        actions={canExport ? <ReportExport data={r} /> : undefined}
      />
      <PageBody className="space-y-6">
        {/* Headline metrics */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Stat icon={Users} label="Applications" value={r.totals.applications} />
          <Stat icon={CheckCircle2} label="Hired" value={r.totals.hired} tone="success" />
          <Stat icon={TrendingUp} label="In pipeline" value={r.totals.active} />
          <Stat icon={Clock} label="Avg. time to hire" value={r.timeToHireDays != null ? `${r.timeToHireDays}d` : "—"} />
          <Stat icon={Briefcase} label="Open roles" value={r.totals.openOpenings} />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Funnel */}
          <Section title="Pipeline funnel" icon={BarChart3}>
            {r.totals.applications === 0 ? (
              <Empty label="No applications yet." />
            ) : (
              <div className="space-y-2.5">
                {r.funnel.map((f) => (
                  <div key={f.stage}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{f.label}</span>
                      <span className="tabular-nums">
                        <span className="font-medium">{f.count}</span>
                        {f.conversion != null && (
                          <span className="ml-2 text-xs text-muted-foreground">{f.conversion}%</span>
                        )}
                      </span>
                    </div>
                    <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${(f.count / funnelMax) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Source effectiveness */}
          <Section title="Source effectiveness" icon={TrendingUp}>
            {r.sources.length === 0 ? (
              <Empty label="No source data yet." />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th className="pb-2 text-left font-medium">Source</th>
                    <th className="pb-2 text-right font-medium">Applicants</th>
                    <th className="pb-2 text-right font-medium">Hired</th>
                    <th className="pb-2 text-right font-medium">Conv.</th>
                  </tr>
                </thead>
                <tbody>
                  {r.sources.map((s) => (
                    <tr key={s.source} className="border-t border-border">
                      <td className="py-2 capitalize">{s.source}</td>
                      <td className="py-2 text-right tabular-nums">{s.total}</td>
                      <td className="py-2 text-right tabular-nums">{s.hired}</td>
                      <td className="py-2 text-right tabular-nums">{s.conversion}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          {/* Assessment analytics */}
          <Section title="Assessment analytics" icon={CheckCircle2}>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Mini label="Attempts" value={r.assessments.attempts} />
              <Mini label="Submitted" value={r.assessments.submitted} />
              <Mini label="Avg. score" value={r.assessments.avgScorePct != null ? `${r.assessments.avgScorePct}%` : "—"} />
              <Mini label="Pass rate" value={r.assessments.passRatePct != null ? `${r.assessments.passRatePct}%` : "—"} />
            </div>
          </Section>

          {/* Team activity */}
          <Section title="Team activity · 30 days" icon={Users}>
            {r.teamActivity.byActor.length === 0 ? (
              <Empty label="No recent activity." />
            ) : (
              <ul className="space-y-2">
                {r.teamActivity.byActor.map((a) => (
                  <li key={a.name} className="flex items-center justify-between text-sm">
                    <span>{a.name}</span>
                    <span className="font-medium tabular-nums">{a.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        {/* Top openings */}
        {r.topOpenings.length > 0 && (
          <Section title="Openings by applicant volume" icon={Briefcase}>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {r.topOpenings.map((o) => (
                <div key={o.title} className="flex items-center justify-between rounded-lg border border-border p-3 text-sm">
                  <span className="truncate">{o.title}</span>
                  <Badge variant="secondary">{o.applicants}</Badge>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Diversity — aggregate only */}
        {canDiversity && (
          <Section title="Diversity (aggregate only)" icon={Users}>
            <p className="text-sm text-muted-foreground">
              Diversity reporting is aggregate-only and never attributes data to an individual. HireLane
              doesn&rsquo;t collect protected-characteristic data by default — enable optional, self-declared
              fields to populate anonymised distributions here.
            </p>
          </Section>
        )}
      </PageBody>
    </>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Users;
  label: string;
  value: number | string;
  tone?: "success";
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-4" /> {label}
      </div>
      <p className={cn("mt-1.5 text-2xl font-semibold tabular-nums", tone === "success" && "text-success")}>{value}</p>
    </Card>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: typeof Users; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
        <Icon className="size-4 text-muted-foreground" /> {title}
      </h2>
      {children}
    </Card>
  );
}

function Mini({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-border p-3 text-center">
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return <p className="text-sm text-muted-foreground">{label}</p>;
}
