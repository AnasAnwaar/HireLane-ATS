import "server-only";

import { createAdminClient } from "@/lib/supabase/server";
import type { ApplicationStage } from "@/types/database";

/**
 * Reporting aggregates (spec §UC-8, CP-24). Computed org-wide via the admin
 * client after the page has authorised a reporting permission — reports are
 * aggregate, not row-level, so they intentionally see the whole tenant.
 */

const FUNNEL_ORDER: ApplicationStage[] = [
  "applied",
  "screened",
  "shortlisted",
  "test_assigned",
  "test_completed",
  "interview_scheduled",
  "interviewed",
  "offer",
  "hired",
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
};

export type ReportBundle = {
  totals: { applications: number; hired: number; rejected: number; active: number; openOpenings: number };
  funnel: { stage: string; label: string; count: number; conversion: number | null }[];
  timeToHireDays: number | null;
  sources: { source: string; total: number; hired: number; conversion: number }[];
  assessments: { attempts: number; submitted: number; avgScorePct: number | null; passRatePct: number | null };
  topOpenings: { title: string; applicants: number }[];
  teamActivity: { total30d: number; byActor: { name: string; count: number }[] };
};

const day = 86_400_000;

export async function getReports(organizationId: string): Promise<ReportBundle> {
  const db = createAdminClient();
  const since30 = new Date(Date.now() - 30 * day).toISOString();

  const [{ data: apps }, { data: openings }, { data: attempts }, { data: audit }] = await Promise.all([
    db.from("applications").select("stage, source, applied_at, updated_at, job_opening_id").eq("organization_id", organizationId),
    db.from("job_openings").select("id, title, status").eq("organization_id", organizationId),
    db.from("test_attempts").select("status, auto_score, max_score").eq("organization_id", organizationId),
    db.from("audit_log").select("actor_name, created_at").eq("organization_id", organizationId).gte("created_at", since30),
  ]);

  const applications = apps ?? [];
  const total = applications.length;
  const hired = applications.filter((a) => a.stage === "hired").length;
  const rejected = applications.filter((a) => a.stage === "rejected" || a.stage === "withdrawn").length;

  // Funnel — count of applications that reached at least each stage.
  const reachedIdx = (s: string) => FUNNEL_ORDER.indexOf(s as ApplicationStage);
  const terminalToApplied = (s: string) => (s === "rejected" || s === "withdrawn" || s === "on_hold" ? 0 : reachedIdx(s));
  const stageCounts = FUNNEL_ORDER.map((stage, i) => {
    const count = applications.filter((a) => {
      const idx = terminalToApplied(a.stage);
      return idx >= i; // reached this stage or beyond
    }).length;
    return { stage, count };
  });
  const funnel = stageCounts.map((s, i) => ({
    stage: s.stage,
    label: STAGE_LABEL[s.stage] ?? s.stage,
    count: s.count,
    conversion: i === 0 ? null : stageCounts[i - 1].count ? Math.round((s.count / stageCounts[i - 1].count) * 100) : 0,
  }));

  // Time to hire — approx from applied_at → updated_at for hired applications.
  const hiredApps = applications.filter((a) => a.stage === "hired" && a.applied_at);
  const spans = hiredApps
    .map((a) => (new Date(a.updated_at).getTime() - new Date(a.applied_at).getTime()) / day)
    .filter((n) => Number.isFinite(n) && n >= 0);
  const timeToHireDays = spans.length ? Math.round(spans.reduce((x, y) => x + y, 0) / spans.length) : null;

  // Source effectiveness.
  const sourceMap = new Map<string, { total: number; hired: number }>();
  for (const a of applications) {
    const s = a.source || "Direct";
    const cur = sourceMap.get(s) ?? { total: 0, hired: 0 };
    cur.total += 1;
    if (a.stage === "hired") cur.hired += 1;
    sourceMap.set(s, cur);
  }
  const sources = [...sourceMap.entries()]
    .map(([source, v]) => ({ source, total: v.total, hired: v.hired, conversion: v.total ? Math.round((v.hired / v.total) * 100) : 0 }))
    .sort((a, b) => b.total - a.total);

  // Assessment analytics.
  const submitted = (attempts ?? []).filter((t) => t.status === "submitted");
  const pcts = submitted
    .map((t) => (t.max_score ? (Number(t.auto_score ?? 0) / Number(t.max_score)) * 100 : null))
    .filter((n): n is number => n != null);
  const assessments = {
    attempts: (attempts ?? []).length,
    submitted: submitted.length,
    avgScorePct: pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null,
    passRatePct: pcts.length ? Math.round((pcts.filter((p) => p >= 60).length / pcts.length) * 100) : null,
  };

  // Top openings by applicant volume.
  const openTitle = new Map((openings ?? []).map((o) => [o.id, o.title]));
  const openCounts = new Map<string, number>();
  for (const a of applications) if (a.job_opening_id) openCounts.set(a.job_opening_id, (openCounts.get(a.job_opening_id) ?? 0) + 1);
  const topOpenings = [...openCounts.entries()]
    .map(([id, applicants]) => ({ title: openTitle.get(id) ?? "Opening", applicants }))
    .sort((a, b) => b.applicants - a.applicants)
    .slice(0, 6);

  // Team activity (last 30 days).
  const actorMap = new Map<string, number>();
  for (const e of audit ?? []) {
    const n = e.actor_name || "System";
    actorMap.set(n, (actorMap.get(n) ?? 0) + 1);
  }
  const teamActivity = {
    total30d: (audit ?? []).length,
    byActor: [...actorMap.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 8),
  };

  return {
    totals: {
      applications: total,
      hired,
      rejected,
      active: total - hired - rejected,
      openOpenings: (openings ?? []).filter((o) => o.status === "open").length,
    },
    funnel,
    timeToHireDays,
    sources,
    assessments,
    topOpenings,
    teamActivity,
  };
}
