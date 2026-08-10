import { ArrowLeft, ClipboardList, Clock, FileQuestion } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageBody, PageHeader } from "@/components/layout/app-shell";
import { NoAccess } from "@/components/permissions/no-access";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { TEST_STATUS_META } from "@/lib/assessments-display";
import { createClient } from "@/lib/supabase/server";
import { isAiConfigured } from "@/server/ai/gemini";
import { can } from "@/server/auth/authorize";
import { requireSession } from "@/server/auth/session";
import type { Test } from "@/types/database";

import { CreateTest } from "./create-test";

export const metadata = { title: "Tests" };

export default async function TestsPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;

  if (!(await can("assessments.view"))) {
    return <NoAccess title="You don't have access to assessments" />;
  }

  const supabase = await createClient();
  const { data: opening } = await supabase
    .from("job_openings")
    .select("id, title")
    .eq("id", id)
    .maybeSingle();
  if (!opening) notFound();

  const [{ data: tests }, { data: requirements }, canManual, canAi, canEdit] = await Promise.all([
    supabase.from("tests").select("*").eq("job_opening_id", id).order("created_at", { ascending: false }),
    supabase.from("job_requirements").select("label").eq("job_opening_id", id).eq("kind", "must_have"),
    can("assessments.create_manual"),
    can("assessments.generate_ai"),
    can("assessments.edit"),
  ]);

  const testRows = (tests ?? []) as Test[];
  const counts = new Map<string, number>();
  if (testRows.length) {
    const { data: qs } = await supabase
      .from("test_questions")
      .select("test_id")
      .in(
        "test_id",
        testRows.map((t) => t.id),
      );
    for (const q of qs ?? []) counts.set(q.test_id, (counts.get(q.test_id) ?? 0) + 1);
  }

  const skills = (requirements ?? []).map((r) => r.label);

  return (
    <>
      <PageHeader
        eyebrow={
          <Link
            href={`/openings/${id}`}
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3" /> {opening.title}
          </Link>
        }
        title="Tests"
        description="Assess candidates for this opening. Author by hand or generate with AI, then publish."
        actions={
          <CreateTest
            openingId={id}
            skills={skills}
            canManual={canManual}
            canAi={canAi && isAiConfigured()}
          />
        }
      />

      <PageBody className="space-y-2.5">
        {testRows.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 py-16 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-muted">
              <ClipboardList className="size-6 text-muted-foreground" />
            </span>
            <div>
              <p className="font-medium">No tests yet</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Create a test manually or let AI draft one from this opening&rsquo;s requirements.
              </p>
            </div>
          </Card>
        ) : (
          testRows.map((t) => {
            const meta = TEST_STATUS_META[t.status];
            const count = counts.get(t.id) ?? 0;
            const inner = (
              <div className="flex items-center gap-4 p-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <ClipboardList className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{t.title}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <FileQuestion className="size-3" /> {count} {count === 1 ? "question" : "questions"}
                    </span>
                    {t.duration_minutes && (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="size-3" /> {t.duration_minutes} min
                      </span>
                    )}
                    {t.version > 0 && <span>v{t.version}</span>}
                    {t.has_unpublished_changes && (
                      <span className="text-warning">unpublished changes</span>
                    )}
                  </div>
                </div>
                <Badge variant={meta.variant} dot>
                  {meta.label}
                </Badge>
              </div>
            );
            return (
              <Card key={t.id} className="transition-colors hover:border-primary/30">
                {canEdit || canManual ? (
                  <Link href={`/openings/${id}/tests/${t.id}`}>{inner}</Link>
                ) : (
                  inner
                )}
              </Card>
            );
          })
        )}
      </PageBody>
    </>
  );
}
