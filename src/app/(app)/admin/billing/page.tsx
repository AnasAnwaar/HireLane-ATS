import { PageBody, PageHeader } from "@/components/layout/app-shell";
import { NoAccess } from "@/components/permissions/no-access";
import { can } from "@/server/auth/authorize";
import { requireSession } from "@/server/auth/session";

import { BillingPlans } from "./billing-plans";

export const metadata = { title: "Plans & billing" };

export default async function BillingPage() {
  const session = await requireSession("/admin/billing");
  if (!(await can("administration.manage_billing"))) {
    return <NoAccess title="You don't have access to billing" />;
  }

  // UI only for now — the current plan is a placeholder until Stripe billing (CP-27).
  const currentPlan = "free";

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Plans & billing"
        description="Manage your subscription, upgrade your plan, and add seats."
      />
      <PageBody>
        <BillingPlans currentPlan={currentPlan} organization={session.organizationName} />
      </PageBody>
    </>
  );
}
