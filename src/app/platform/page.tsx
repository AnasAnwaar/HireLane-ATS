import {
  Briefcase,
  Building2,
  CalendarClock,
  CreditCard,
  DollarSign,
  FileText,
  Sparkles,
  TrendingDown,
  UserRound,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { createAdminClient } from "@/lib/supabase/server";
import { requirePlatformAccess } from "@/server/platform/auth";

export const dynamic = "force-dynamic";

type PlanRow = { key: string; name: string; monthly_cents: number; per_seat_cents: number; is_public: boolean };
type SubRow = { plan_key: string; status: string; addon_seats: number };

function usd(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export default async function PlatformOverview() {
  await requirePlatformAccess();
  const admin = createAdminClient();

  const head = { count: "exact" as const, head: true };
  const [
    { count: orgCount },
    { data: subs },
    { data: plans },
    { count: seatsInUse },
    { count: openings },
    { count: applicants },
    { count: candidates },
    { count: interviews },
    { count: aiPosts },
    { count: aiTests },
  ] = await Promise.all([
    admin.from("organizations").select("id", head),
    admin.from("org_subscriptions").select("plan_key, status, addon_seats"),
    admin.from("plans").select("key, name, monthly_cents, per_seat_cents, is_public").order("sort_order"),
    admin.from("memberships").select("id", head).eq("status", "active"),
    admin.from("job_openings").select("id", head),
    admin.from("applications").select("id", head),
    admin.from("candidates").select("id", head),
    admin.from("interviews").select("id", head),
    admin.from("job_postings").select("id", head),
    admin.from("tests").select("id", head),
  ]);

  const subRows = (subs ?? []) as SubRow[];
  const planRows = (plans ?? []) as PlanRow[];
  const planByKey = new Map(planRows.map((p) => [p.key, p]));

  const active = subRows.filter((s) => s.status === "active" || s.status === "trialing");
  const paidActive = active.filter((s) => (planByKey.get(s.plan_key)?.monthly_cents ?? 0) > 0);

  // Rough MRR: active paid plans' monthly price + add-on seats × per-seat price.
  const mrrCents = active.reduce((sum, s) => {
    const plan = planByKey.get(s.plan_key);
    if (!plan) return sum;
    return sum + plan.monthly_cents + (s.addon_seats ?? 0) * plan.per_seat_cents;
  }, 0);

  const distribution = planRows.map((p) => ({
    ...p,
    count: subRows.filter((s) => s.plan_key === p.key).length,
  }));

  const churned = subRows.filter((s) => s.status === "canceled").length;
  const seatsSold = subRows.reduce((n, s) => n + (s.addon_seats ?? 0), 0);

  const stats = [
    { label: "Organizations", value: orgCount ?? 0, icon: Building2 },
    { label: "Active subscriptions", value: active.length, icon: CreditCard },
    { label: "Paying orgs", value: paidActive.length, icon: Users },
    { label: "Est. MRR", value: usd(mrrCents), icon: DollarSign },
    { label: "Seats in use", value: seatsInUse ?? 0, icon: Users },
    { label: "Add-on seats sold", value: seatsSold, icon: Users },
    { label: "Job openings", value: openings ?? 0, icon: Briefcase },
    { label: "Churned subs", value: churned, icon: TrendingDown },
  ];

  const activity = [
    { label: "Applicants", value: applicants ?? 0, icon: FileText },
    { label: "Candidates", value: candidates ?? 0, icon: UserRound },
    { label: "Interviews", value: interviews ?? 0, icon: CalendarClock },
    { label: "AI posts generated", value: aiPosts ?? 0, icon: Sparkles },
    { label: "AI tests created", value: aiTests ?? 0, icon: Sparkles },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Platform overview</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Cross-tenant view of every organization on HireLane.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{s.label}</span>
              <s.icon className="size-4 text-muted-foreground" />
            </div>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{s.value}</p>
          </Card>
        ))}
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold">Activity &amp; AI usage</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {activity.map((s) => (
            <Card key={s.label} className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{s.label}</span>
                <s.icon className="size-4 text-muted-foreground" />
              </div>
              <p className="mt-2 text-2xl font-semibold tabular-nums">{s.value}</p>
            </Card>
          ))}
        </div>
      </div>

      <Card className="p-5">
        <h2 className="text-sm font-semibold">Plan distribution</h2>
        <ul className="mt-4 divide-y divide-border">
          {distribution.map((p) => (
            <li key={p.key} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {p.name}
                  {!p.is_public && (
                    <Badge variant="secondary" className="ml-2">
                      Private
                    </Badge>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {p.monthly_cents > 0 ? `${usd(p.monthly_cents)}/mo` : "Free"}
                </p>
              </div>
              <span className="text-sm font-medium tabular-nums">{p.count}</span>
              <span className="text-xs text-muted-foreground">
                org{p.count === 1 ? "" : "s"}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
