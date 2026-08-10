import { PageBody, PageHeader } from "@/components/layout/app-shell";
import { NoAccess } from "@/components/permissions/no-access";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/server/auth/authorize";
import { getAssessmentPolicy } from "@/server/assessments/policy";
import { requireSession } from "@/server/auth/session";

import { PolicyForm } from "./policy-form";

export const metadata = { title: "Assessment policy" };

export default async function AssessmentPolicyPage() {
  const session = await requireSession();

  if (!(await can("administration.configure_ai_policy"))) {
    return <NoAccess title="You don't have access to the assessment policy" />;
  }

  const supabase = await createClient();
  const policy = await getAssessmentPolicy(supabase, session.organizationId);

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Assessment policy"
        description="Defaults applied to every new test, and the cap on how many retakes can be granted."
      />
      <PageBody className="max-w-2xl">
        <PolicyForm policy={policy} />
      </PageBody>
    </>
  );
}
