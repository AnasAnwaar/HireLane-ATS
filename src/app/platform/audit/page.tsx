import { Card } from "@/components/ui/card";
import { createAdminClient } from "@/lib/supabase/server";
import { requirePlatformAccess } from "@/server/platform/auth";
import type { PlatformAuditLog } from "@/types/database";

export const dynamic = "force-dynamic";
export const metadata = { title: "Audit log · Platform" };

const ACTION_LABEL: Record<string, string> = {
  "plan.update": "Updated plan",
  "plan.create": "Created plan",
  "plan.stripe_sync": "Synced plan to Stripe",
  "org.assign_plan": "Assigned plan",
  "org.suspend": "Suspended org",
  "org.reactivate": "Reactivated org",
};

export default async function PlatformAuditPage() {
  await requirePlatformAccess();
  const admin = createAdminClient();
  const { data } = await admin
    .from("platform_audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  const rows = (data ?? []) as PlatformAuditLog[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Audit log</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Every privileged platform action, newest first (last 100).
        </p>
      </div>

      <Card className="p-0">
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
              <span className="font-medium">{ACTION_LABEL[r.action] ?? r.action}</span>
              {r.target_id && (
                <span className="truncate text-xs text-muted-foreground">
                  {r.target_type}: {typeof r.detail?.org === "string" ? r.detail.org : r.target_id}
                  {typeof r.detail?.plan_key === "string" ? ` → ${r.detail.plan_key}` : ""}
                </span>
              )}
              <span className="ml-auto text-xs text-muted-foreground">{r.actor_email ?? "—"}</span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {new Date(r.created_at).toLocaleString()}
              </span>
            </li>
          ))}
          {rows.length === 0 && (
            <li className="p-6 text-center text-sm text-muted-foreground">No actions logged yet.</li>
          )}
        </ul>
      </Card>
    </div>
  );
}
