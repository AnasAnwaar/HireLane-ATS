"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/validation/auth";

import { logPlatformAction } from "./audit";
import { requirePlatformActor } from "./auth";

/**
 * Assign a plan to a specific organization (CP-28). Unlike the org-self
 * changePlanAction, this is platform-gated and can grant a PRIVATE/custom plan
 * (is_public = false) that the org could never select itself — entitlements
 * apply immediately with no payment (a comp/custom grant). Existing Stripe
 * subscriptions are left untouched here.
 */
export async function assignPlanToOrgAction(organizationId: string, planKey: string): Promise<ActionResult> {
  const gate = await requirePlatformActor();
  if (!gate.ok) return { ok: false, error: gate.error };

  const admin = createAdminClient();
  const [{ data: plan }, { data: org }] = await Promise.all([
    admin.from("plans").select("key, name, seat_cap").eq("key", planKey).maybeSingle(),
    admin.from("organizations").select("id, name").eq("id", organizationId).maybeSingle(),
  ]);
  if (!plan) return { ok: false, error: "Unknown plan." };
  if (!org) return { ok: false, error: "Unknown organization." };

  const { error } = await admin.from("org_subscriptions").upsert(
    {
      organization_id: organizationId,
      plan_key: plan.key,
      status: "active",
      base_seats: plan.seat_cap ?? 1,
    },
    { onConflict: "organization_id" },
  );
  if (error) return { ok: false, error: error.message };

  await logPlatformAction(gate.actor, "org.assign_plan", {
    type: "organization",
    id: organizationId,
    detail: { plan_key: plan.key, org: org.name },
  });
  revalidatePath("/platform/orgs");
  revalidatePath("/platform");
  return { ok: true, message: `${org.name} is now on ${plan.name}.` };
}

/** Suspend or reactivate an organization (CP-28). Suspended orgs are blocked at
 * the app shell. Platform-gated + audited. */
export async function setOrgSuspendedAction(organizationId: string, suspend: boolean): Promise<ActionResult> {
  const gate = await requirePlatformActor();
  if (!gate.ok) return { ok: false, error: gate.error };

  const admin = createAdminClient();
  const { data: org } = await admin
    .from("organizations")
    .select("id, name")
    .eq("id", organizationId)
    .maybeSingle();
  if (!org) return { ok: false, error: "Unknown organization." };

  const { error } = await admin
    .from("organizations")
    .update({ suspended_at: suspend ? new Date().toISOString() : null })
    .eq("id", organizationId);
  if (error) return { ok: false, error: error.message };

  await logPlatformAction(gate.actor, suspend ? "org.suspend" : "org.reactivate", {
    type: "organization",
    id: organizationId,
    detail: { org: org.name },
  });
  revalidatePath("/platform/orgs");
  return { ok: true, message: `${org.name} ${suspend ? "suspended" : "reactivated"}.` };
}
