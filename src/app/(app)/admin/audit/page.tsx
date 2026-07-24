import { History } from "lucide-react";

import { PageBody, PageHeader } from "@/components/layout/app-shell";
import { NoAccess } from "@/components/permissions/no-access";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/server/auth/authorize";
import { requireSession } from "@/server/auth/session";

export const metadata = { title: "Audit log" };

const PAGE_SIZE = 50;

/** Human labels + tone for the actions we emit today. */
const ACTION_META: Record<string, { label: string; variant: "default" | "secondary" | "warning" | "success" }> = {
  "organization.created": { label: "Workspace created", variant: "success" },
  "organization.ownership_transferred": { label: "Ownership transferred", variant: "warning" },
  "role.permission_insert": { label: "Permission granted", variant: "default" },
  "role.permission_update": { label: "Permission changed", variant: "default" },
  "role.permission_delete": { label: "Permission removed", variant: "warning" },
  "member.invited": { label: "Member invited", variant: "default" },
  "member.activated": { label: "Member activated", variant: "success" },
  "opening.status_changed": { label: "Opening status changed", variant: "secondary" },
};

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireSession("/admin/audit");

  if (!(await can("administration.view_audit_log"))) {
    return (
      <NoAccess
        title="You don't have access to the audit log"
        message="Viewing the audit log requires the View audit log permission."
      />
    );
  }

  const { page = "0" } = await searchParams;
  const pageNum = Math.max(0, parseInt(page, 10) || 0);
  const from = pageNum * PAGE_SIZE;

  const supabase = await createClient();
  const { data: entries, count } = await supabase
    .from("audit_log")
    .select("id, action, entity_type, summary, actor_name, actor_email, created_at", {
      count: "exact",
    })
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  const total = count ?? 0;
  const hasMore = from + PAGE_SIZE < total;

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Audit log"
        description="An append-only record of everything that happens in your workspace. It can never be edited or deleted."
      />

      <PageBody className="max-w-4xl space-y-4">
        {!entries?.length ? (
          <Card className="flex flex-col items-center gap-3 py-16 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-muted">
              <History className="size-6 text-muted-foreground" />
            </span>
            <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <ul className="divide-y divide-border">
              {entries.map((e) => {
                const meta = ACTION_META[e.action] ?? {
                  label: e.action,
                  variant: "secondary" as const,
                };
                return (
                  <li key={e.id} className="flex items-start gap-3 px-5 py-3.5">
                    <Avatar name={e.actor_name || e.actor_email || "System"} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm">
                        <Badge variant={meta.variant}>{meta.label}</Badge>
                        <span className="text-foreground/90">{e.summary}</span>
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {e.actor_name || e.actor_email || "System"} · {relativeTime(e.created_at)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}

        {(pageNum > 0 || hasMore) && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {total} {total === 1 ? "entry" : "entries"}
            </span>
            <div className="flex gap-2">
              {pageNum > 0 && (
                <a
                  href={`/admin/audit?page=${pageNum - 1}`}
                  className="rounded-md border border-border px-3 py-1.5 transition-colors hover:bg-muted"
                >
                  Newer
                </a>
              )}
              {hasMore && (
                <a
                  href={`/admin/audit?page=${pageNum + 1}`}
                  className="rounded-md border border-border px-3 py-1.5 transition-colors hover:bg-muted"
                >
                  Older
                </a>
              )}
            </div>
          </div>
        )}
      </PageBody>
    </>
  );
}
