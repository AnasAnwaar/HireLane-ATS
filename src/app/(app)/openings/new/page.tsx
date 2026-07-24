import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { PageBody, PageHeader } from "@/components/layout/app-shell";
import { NoAccess } from "@/components/permissions/no-access";
import { createClient } from "@/lib/supabase/server";
import { createOpeningAction } from "@/server/openings/actions";
import { can } from "@/server/auth/authorize";
import { requireSession } from "@/server/auth/session";

import { OpeningForm } from "../opening-form";

export const metadata = { title: "New job opening" };

export default async function NewOpeningPage() {
  const session = await requireSession("/openings/new");

  if (!(await can("job_openings.create"))) {
    return <NoAccess title="You don't have permission to create openings" />;
  }

  const supabase = await createClient();
  const [{ data: departments }, { data: org }] = await Promise.all([
    supabase
      .from("departments")
      .select("id, name")
      .eq("organization_id", session.organizationId)
      .order("name"),
    supabase
      .from("organizations")
      .select("currency")
      .eq("id", session.organizationId)
      .single(),
  ]);

  return (
    <>
      <PageHeader
        eyebrow={
          <Link
            href="/openings"
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3" /> Openings
          </Link>
        }
        title="New job opening"
        description="Describe the role once. Posting to job boards and AI drafting come later."
      />

      <PageBody className="max-w-3xl">
        <OpeningForm
          action={createOpeningAction}
          mode="create"
          departments={departments ?? []}
          defaultCurrency={org?.currency ?? "USD"}
        />
      </PageBody>
    </>
  );
}
