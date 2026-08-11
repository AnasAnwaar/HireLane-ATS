import { BarChart3 } from "lucide-react";

import { ComingSoon } from "@/components/coming-soon";
import { PageBody } from "@/components/layout/app-shell";
import { NoAccess } from "@/components/permissions/no-access";
import { can } from "@/server/auth/authorize";
import { requireSession } from "@/server/auth/session";

export const metadata = { title: "Reports" };

export default async function ReportsPage() {
  await requireSession("/reports");
  if (!(await can("reporting.view_own"))) {
    return <NoAccess title="You don't have access to reports" />;
  }

  return (
    <PageBody>
      <ComingSoon
        icon={BarChart3}
        title="Reports & analytics"
        milestone="Phase 6 · CP-23–25"
        tagline="Turn the pipeline into decisions — funnel health, time-to-hire, source quality and screening accuracy, with exports."
        capabilities={[
          "Pipeline funnel and conversion by stage, opening and recruiter",
          "Time-to-hire and time-in-stage trends",
          "Source and channel effectiveness",
          "Screening and assessment score distributions",
          "Scheduled exports and shareable dashboards",
        ]}
      />
    </PageBody>
  );
}
