import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageBody, PageHeader } from "@/components/layout/app-shell";
import { NoAccess } from "@/components/permissions/no-access";
import { createClient } from "@/lib/supabase/server";
import { isAiConfigured } from "@/server/ai/gemini";
import { can } from "@/server/auth/authorize";
import { requireSession } from "@/server/auth/session";
import type { Test, TestQuestion } from "@/types/database";

import { TestEditor } from "@/app/(app)/openings/[id]/tests/[testId]/test-editor";

export const metadata = { title: "Edit assessment" };

export default async function LibraryTestEditorPage({
  params,
}: {
  params: Promise<{ testId: string }>;
}) {
  await requireSession();
  const { testId } = await params;

  if (!(await can("assessments.view"))) {
    return <NoAccess title="You don't have access to assessments" />;
  }

  const supabase = await createClient();
  const [{ data: test }, { data: questions }, canEdit, canManual, canAi, canBank] = await Promise.all([
    supabase.from("tests").select("*").eq("id", testId).maybeSingle(),
    supabase.from("test_questions").select("*").eq("test_id", testId).order("sort_order"),
    can("assessments.edit"),
    can("assessments.create_manual"),
    can("assessments.generate_ai"),
    can("assessments.manage_bank"),
  ]);

  // This route is only for library templates; opening-scoped tests live under
  // /openings/[id]/tests/[testId].
  if (!test || !(test as Test).is_bank_template) notFound();

  return (
    <>
      <PageHeader
        eyebrow={
          <Link
            href="/assessments"
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3" /> Assessments
          </Link>
        }
        title={test.title}
        description="A reusable library assessment. Add it to a job role from the Assessments library."
      />

      <PageBody className="max-w-3xl">
        <TestEditor
          test={test as Test}
          questions={(questions ?? []) as TestQuestion[]}
          canAuthor={canEdit || canManual}
          canPublish={canEdit}
          canAi={canAi && isAiConfigured()}
          canManageBank={canBank}
        />
      </PageBody>
    </>
  );
}
