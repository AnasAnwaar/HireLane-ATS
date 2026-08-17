import { PageBody, PageHeader } from "@/components/layout/app-shell";
import { NoAccess } from "@/components/permissions/no-access";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/server/auth/authorize";
import { saveCompanyProfileAction } from "@/server/company/actions";
import { getMfaStatus } from "@/server/auth/mfa-status";
import { requireSession } from "@/server/auth/session";
import type { Organization } from "@/types/database";

import { CompanyForm } from "./company-form";
import { CompanyDangerZone } from "./danger-zone";

export const metadata = { title: "Company" };

export default async function CompanyPage() {
  const session = await requireSession("/admin/company");

  const supabase = await createClient();
  const [{ data: org }, canEdit, mfa] = await Promise.all([
    supabase.from("organizations").select("*").eq("id", session.organizationId).maybeSingle(),
    can("administration.manage_company_profile"),
    getMfaStatus(),
  ]);

  // The nav gates on manage_company_profile; anyone reaching here without it
  // (deep link) gets a read-only view rather than a 404.
  if (!org) {
    return <NoAccess title="Company profile unavailable" />;
  }

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Company profile"
        description="Your organisation's identity — what candidates see on careers pages, job posts and emails."
      />
      <PageBody className="space-y-6">
        <CompanyForm org={org as Organization} canEdit={canEdit} action={saveCompanyProfileAction} />
        <CompanyDangerZone
          orgName={session.organizationName}
          isOwner={session.isOwner}
          canManage={canEdit}
          hasMfa={mfa.enabled}
        />
      </PageBody>
    </>
  );
}
