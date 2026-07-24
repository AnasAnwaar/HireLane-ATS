import { Briefcase, MapPin, Plus, Search, Users } from "lucide-react";
import Link from "next/link";

import { PageBody, PageHeader } from "@/components/layout/app-shell";
import { NoAccess } from "@/components/permissions/no-access";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import {
  EMPLOYMENT_LABELS,
  STATUS_META,
  WORK_MODE_LABELS,
  experienceLabel,
} from "@/lib/openings-display";
import { cn } from "@/lib/utils";
import { can } from "@/server/auth/authorize";
import { requireSession } from "@/server/auth/session";
import type { OpeningStatus } from "@/types/database";

export const metadata = { title: "Job openings" };

const FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "draft", label: "Draft" },
  { value: "on_hold", label: "On hold" },
  { value: "closed", label: "Closed" },
];

export default async function OpeningsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  await requireSession("/openings");

  if (!(await can("job_openings.view"))) {
    return <NoAccess title="You don't have access to job openings" />;
  }

  const { status = "all", q = "" } = await searchParams;
  const canCreate = await can("job_openings.create");
  const supabase = await createClient();

  // RLS already scopes rows to what this viewer may see, so no org filter needed.
  let query = supabase
    .from("job_openings")
    .select("id, title, status, employment_type, work_mode, location, positions, experience_min, experience_max, application_deadline, created_at")
    .order("created_at", { ascending: false });

  if (status !== "all") query = query.eq("status", status as OpeningStatus);
  if (q.trim()) query = query.ilike("title", `%${q.trim()}%`);

  const { data: openings } = await query;

  return (
    <>
      <PageHeader
        eyebrow="Recruiting"
        title="Job openings"
        description="Every requisition you're working on, in one place."
        actions={
          canCreate && (
            <Button asChild>
              <Link href="/openings/new">
                <Plus /> New opening
              </Link>
            </Button>
          )
        }
      />

      <PageBody className="space-y-5">
        {/* Filters + search */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => {
              const active = status === f.value;
              const href = `/openings?status=${f.value}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
              return (
                <Button
                  key={f.value}
                  variant={active ? "secondary" : "ghost"}
                  size="sm"
                  className={cn(active && "font-semibold")}
                  asChild
                >
                  <Link href={href}>{f.label}</Link>
                </Button>
              );
            })}
          </div>

          <form className="relative" action="/openings">
            {status !== "all" && <input type="hidden" name="status" value={status} />}
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              name="q"
              defaultValue={q}
              placeholder="Search titles…"
              className="h-9 w-56 rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/40 focus:ring-2 focus:ring-ring/20"
            />
          </form>
        </div>

        {/* List */}
        {!openings?.length ? (
          <EmptyState canCreate={canCreate} filtered={status !== "all" || q.length > 0} />
        ) : (
          <div className="space-y-2.5">
            {openings.map((o) => {
              const meta = STATUS_META[o.status];
              const exp = experienceLabel(o.experience_min, o.experience_max);
              return (
                <Card key={o.id} className="transition-colors hover:border-primary/30">
                  <Link href={`/openings/${o.id}`} className="flex items-center gap-4 p-4">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                      <Briefcase className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{o.title}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>{EMPLOYMENT_LABELS[o.employment_type]}</span>
                        <span>·</span>
                        <span>{WORK_MODE_LABELS[o.work_mode]}</span>
                        {o.location && (
                          <>
                            <span>·</span>
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="size-3" /> {o.location}
                            </span>
                          </>
                        )}
                        {exp && (
                          <>
                            <span>·</span>
                            <span>{exp}</span>
                          </>
                        )}
                        <span>·</span>
                        <span className="inline-flex items-center gap-1">
                          <Users className="size-3" /> {o.positions}{" "}
                          {o.positions === 1 ? "position" : "positions"}
                        </span>
                      </div>
                    </div>
                    <Badge variant={meta.variant} dot className="shrink-0">
                      {meta.label}
                    </Badge>
                  </Link>
                </Card>
              );
            })}
          </div>
        )}
      </PageBody>
    </>
  );
}

function EmptyState({ canCreate, filtered }: { canCreate: boolean; filtered: boolean }) {
  return (
    <Card className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-muted">
        <Briefcase className="size-6 text-muted-foreground" />
      </span>
      <div>
        <p className="font-medium">
          {filtered ? "No openings match this filter" : "No job openings yet"}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {filtered
            ? "Try a different status or clear the search."
            : "Create your first requisition to start hiring."}
        </p>
      </div>
      {canCreate && !filtered && (
        <Button className="mt-1" asChild>
          <Link href="/openings/new">
            <Plus /> New opening
          </Link>
        </Button>
      )}
    </Card>
  );
}
