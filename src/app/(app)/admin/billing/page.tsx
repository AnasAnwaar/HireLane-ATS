import { PageBody, PageHeader } from "@/components/layout/app-shell";
import { NoAccess } from "@/components/permissions/no-access";
import { createAdminClient } from "@/lib/supabase/server";
import { can } from "@/server/auth/authorize";
import { requireSession } from "@/server/auth/session";
import { getEntitlements, getUsage } from "@/server/billing/entitlements";
import { isStripeConfigured } from "@/server/billing/stripe";

import { BillingPlans } from "./billing-plans";

export const metadata = { title: "Plans & billing" };

export default async function BillingPage() {
  const session = await requireSession("/admin/billing");
  if (!(await can("administration.manage_billing"))) {
    return <NoAccess title="You don't have access to billing" />;
  }

  const [ent, usage, { data: sub }] = await Promise.all([
    getEntitlements(session.organizationId),
    getUsage(session.organizationId),
    createAdminClient()
      .from("org_subscriptions")
      .select("stripe_subscription_id")
      .eq("organization_id", session.organizationId)
      .maybeSingle(),
  ]);
  const hasSubscription = Boolean(sub?.stripe_subscription_id);

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Plans & billing"
        description="Manage your subscription, upgrade your plan, and add seats."
      />
      <PageBody>
        <BillingPlans
          organization={session.organizationName}
          currentPlan={ent.planKey}
          usage={{
            seatsUsed: usage.seatsUsed,
            seatCap: ent.seatCap,
            openingsUsed: usage.openingsUsed,
            openingCap: ent.openingCap,
          }}
          features={ent.features}
          stripeEnabled={isStripeConfigured()}
          testMode={(process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_test_")}
          addonSeats={ent.addonSeats}
          seatsSupported={isStripeConfigured() && ent.allowAddonSeats}
          hasSubscription={hasSubscription}
          status={ent.status}
        />
      </PageBody>
    </>
  );
}
