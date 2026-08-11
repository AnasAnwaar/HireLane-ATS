import { ClipboardList } from "lucide-react";

import { ComingSoon } from "@/components/coming-soon";
import { PageBody } from "@/components/layout/app-shell";
import { NoAccess } from "@/components/permissions/no-access";
import { can } from "@/server/auth/authorize";
import { requireSession } from "@/server/auth/session";

export const metadata = { title: "Assessments" };

export default async function AssessmentsPage() {
  await requireSession("/assessments");
  if (!(await can("assessments.view"))) {
    return <NoAccess title="You don't have access to assessments" />;
  }

  return (
    <PageBody>
      <ComingSoon
        icon={ClipboardList}
        title="Assessments hub"
        milestone="next up"
        tagline="Tests already live per opening under Job Openings → Tests. This will be the one place to see every test, its assignments and their results across all roles."
        capabilities={[
          "Every published test and question bank in one library",
          "All assignments and attempts, filterable by opening and status",
          "Grading queue for written answers awaiting a human decision",
          "Integrity flags surfaced alongside scores",
        ]}
      />
    </PageBody>
  );
}
