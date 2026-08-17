import { createAdminClient } from "@/lib/supabase/server";
import { isStripeConfigured } from "@/server/billing/stripe";
import { requirePlatformAccess } from "@/server/platform/auth";
import type { Plan } from "@/types/database";

import { PlansEditor } from "./plans-editor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Plans · Platform" };

export default async function PlatformPlansPage() {
  await requirePlatformAccess();
  const admin = createAdminClient();
  const { data: plans } = await admin.from("plans").select("*").order("sort_order");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Plans &amp; pricing</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Edit tiers, limits, the feature matrix and pricing. Private plans are hidden from public
          pricing and can be assigned to specific organizations.
        </p>
      </div>
      <PlansEditor plans={(plans ?? []) as Plan[]} stripeEnabled={isStripeConfigured()} />
    </div>
  );
}
