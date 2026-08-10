import { Briefcase, Search, Users } from "lucide-react";
import Link from "next/link";

import { PageBody, PageHeader } from "@/components/layout/app-shell";
import { NoAccess } from "@/components/permissions/no-access";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { STAGE_META } from "@/lib/applicants-display";
import { can } from "@/server/auth/authorize";
import { listCandidates } from "@/server/candidates/queries";
import { requireSession } from "@/server/auth/session";

export const metadata = { title: "Candidates" };

export default async function CandidatesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireSession("/candidates");

  if (!(await can("applicants.view_list"))) {
    return <NoAccess title="You don't have access to candidates" />;
  }

  const { q = "" } = await searchParams;
  const candidates = await listCandidates(q);
  const canViewProfile = await can("applicants.view_profile");

  return (
    <>
      <PageHeader
        eyebrow="Recruiting"
        title="Candidates"
        description="Everyone in your talent pool, across all openings."
      />

      <PageBody className="space-y-5">
        <form className="relative max-w-sm" action="/candidates">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search by name or email…"
            className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/40 focus:ring-2 focus:ring-ring/20"
          />
        </form>

        {!candidates.length ? (
          <Card className="flex flex-col items-center gap-3 py-16 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-muted">
              <Users className="size-6 text-muted-foreground" />
            </span>
            <p className="text-sm text-muted-foreground">
              {q ? "No candidates match your search." : "No candidates yet."}
            </p>
          </Card>
        ) : (
          <div className="space-y-2">
            {candidates.map((c) => {
              const inner = (
                <div className="flex items-center gap-4 p-4">
                  <Avatar name={c.fullName} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{c.fullName}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {c.headline ? `${c.headline} · ` : ""}
                      {c.email}
                    </p>
                    {c.latestOpening && (
                      <span className="mt-1.5 inline-flex max-w-full items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                        <Briefcase className="size-3 shrink-0 text-muted-foreground" />
                        <span className="truncate">{c.latestOpening.title}</span>
                        {c.openingCount > 1 && (
                          <span className="text-muted-foreground">+{c.openingCount - 1}</span>
                        )}
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                    <span className="hidden sm:inline">
                      {c.applicationCount}{" "}
                      {c.applicationCount === 1 ? "application" : "applications"}
                    </span>
                    {c.latestStage && (
                      <Badge variant={STAGE_META[c.latestStage].variant} dot>
                        {STAGE_META[c.latestStage].label}
                      </Badge>
                    )}
                  </div>
                </div>
              );
              return (
                <Card key={c.id} className="transition-colors hover:border-primary/30">
                  {canViewProfile ? (
                    <Link href={`/candidates/${c.id}`}>{inner}</Link>
                  ) : (
                    inner
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </PageBody>
    </>
  );
}
