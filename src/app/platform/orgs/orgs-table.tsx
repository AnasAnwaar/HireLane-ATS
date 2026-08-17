"use client";

import { Loader2, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { assignPlanToOrgAction } from "@/server/platform/org-actions";

type Row = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  planKey: string;
  status: string;
};
type PlanOpt = { key: string; name: string; isPublic: boolean };

export function OrgsTable({ rows, plans }: { rows: Row[]; plans: PlanOpt[] }) {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [choice, setChoice] = React.useState<Record<string, string>>({});

  const filtered = rows.filter(
    (r) => r.name.toLowerCase().includes(q.toLowerCase()) || r.slug.toLowerCase().includes(q.toLowerCase()),
  );

  async function assign(orgId: string) {
    const planKey = choice[orgId];
    if (!planKey) return;
    setBusy(orgId);
    const r = await assignPlanToOrgAction(orgId, planKey);
    setBusy(null);
    if (r.ok) {
      toast.success(r.message ?? "Assigned.");
      router.refresh();
    } else toast.error(r.error);
  }

  return (
    <Card className="p-0">
      <div className="flex items-center gap-2 border-b border-border p-3">
        <Search className="size-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search organizations…"
          className="h-8 border-0 shadow-none focus-visible:ring-0"
        />
        <span className="ml-auto text-xs text-muted-foreground">{filtered.length} orgs</span>
      </div>
      <ul className="divide-y divide-border">
        {filtered.map((r) => {
          const planName = plans.find((p) => p.key === r.planKey)?.name ?? r.planKey;
          const selected = choice[r.id] ?? "";
          return (
            <li key={r.id} className="flex flex-wrap items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{r.name}</p>
                <p className="truncate text-xs text-muted-foreground">{r.slug}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <Badge variant={r.planKey === "free" ? "secondary" : "success"}>{planName}</Badge>
                {r.status !== "active" && <Badge variant="warning">{r.status}</Badge>}
              </div>
              <select
                value={selected}
                onChange={(e) => setChoice((c) => ({ ...c, [r.id]: e.target.value }))}
                className="h-8 rounded-md border border-border bg-background px-2 text-sm"
              >
                <option value="">Assign plan…</option>
                {plans.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.name}
                    {p.isPublic ? "" : " (private)"}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                disabled={!selected || selected === r.planKey || busy !== null}
                onClick={() => assign(r.id)}
              >
                {busy === r.id ? <Loader2 className="animate-spin" /> : "Assign"}
              </Button>
            </li>
          );
        })}
        {filtered.length === 0 && (
          <li className="p-6 text-center text-sm text-muted-foreground">No organizations match “{q}”.</li>
        )}
      </ul>
    </Card>
  );
}
