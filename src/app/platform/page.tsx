import { Building2, CreditCard, DollarSign, Users } from "lucide-react";

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

  const [{ count: orgCount }, { data: subs }, { data: plans }] = await Promise.all([
    admin.from("organizations").select("id", { count: "exact", head: true }),
    admin.from("org_subscriptions").select("plan_key, status, addon_seats"),
    admin.from("plans").select("key, name, monthly_cents, per_seat_cents, is_public").order("sort_order"),
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

  const stats = [
    { label: "Organizations", value: orgCount ?? 0, icon: Building2 },
    { label: "Active subscriptions", value: active.length, icon: CreditCard },
    { label: "Paying orgs", value: paidActive.length, icon: Users },
    { label: "Est. MRR", value: usd(mrrCents), icon: DollarSign },
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
