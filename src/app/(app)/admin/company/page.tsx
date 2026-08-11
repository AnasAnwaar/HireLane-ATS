import { Building2 } from "lucide-react";

import { ComingSoon } from "@/components/coming-soon";
import { PageBody } from "@/components/layout/app-shell";
import { NoAccess } from "@/components/permissions/no-access";
import { can } from "@/server/auth/authorize";
import { requireSession } from "@/server/auth/session";

export const metadata = { title: "Company" };

export default async function CompanyPage() {
  await requireSession("/admin/company");
  if (!(await can("administration.manage_company_profile"))) {
    return <NoAccess title="You don't have access to the company profile" />;
  }

  return (
    <PageBody>
      <ComingSoon
        icon={Building2}
        title="Company profile"
        milestone="next up"
        tagline="Your organisation's identity — the brand candidates see on careers pages, job posts and emails."
        capabilities={[
          "Logo, brand colour and company description",
          "Careers-page details and default locations",
          "Sender identity for candidate emails",
          "Defaults that flow into new openings and AI-written posts",
        ]}
      />
    </PageBody>
  );
}
