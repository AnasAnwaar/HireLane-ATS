"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/validation/auth";
import { authorize } from "@/server/auth/authorize";
import { getSessionContext } from "@/server/auth/session";

/**
 * Change the org's plan (CP-26). Immediate, server-side — no payment yet; Stripe
 * Checkout replaces this direct switch in CP-27. Gated on manage_billing; written
 * via the service role (org_subscriptions has no authenticated write policy).
 */
export async function changePlanAction(planKey: string): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Your session has expired." };
  const auth = await authorize("administration.manage_billing");
  if (!auth.ok) return { ok: false, error: auth.error };

  const admin = createAdminClient();
  const { data: plan } = await admin
    .from("plans")
    .select("key, name, seat_cap")
    .eq("key", planKey)
    .maybeSingle();
  if (!plan) return { ok: false, error: "Unknown plan." };

  const { error } = await admin.from("org_subscriptions").upsert(
    {
      organization_id: session.organizationId,
      plan_key: plan.key,
      status: "active",
      base_seats: plan.seat_cap ?? 1,
    },
    { onConflict: "organization_id" },
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/billing");
  return { ok: true, message: `You're now on the ${plan.name} plan.` };
}
