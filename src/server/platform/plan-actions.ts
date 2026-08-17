"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/validation/auth";
import { getStripe, isStripeConfigured } from "@/server/billing/stripe";

import { logPlatformAction } from "./audit";
import { requirePlatformActor } from "./auth";

/** Fields a super-admin may edit on a plan. All optional (partial patch). */
export type PlanPatch = {
  name?: string;
  seat_cap?: number | null;
  opening_cap?: number | null;
  feat_integrations?: boolean;
  feat_ai_posts?: boolean;
  feat_ai_screening?: boolean;
  feat_ai_assessments?: boolean;
  allow_addon_seats?: boolean;
  monthly_cents?: number;
  per_seat_cents?: number;
  is_public?: boolean;
  sort_order?: number;
};

const NUM_FIELDS = ["monthly_cents", "per_seat_cents", "sort_order"] as const;
const CAP_FIELDS = ["seat_cap", "opening_cap"] as const;

function sanitize(patch: PlanPatch): PlanPatch {
  const out: PlanPatch = {};
  if (typeof patch.name === "string" && patch.name.trim()) out.name = patch.name.trim();
  for (const f of NUM_FIELDS) {
    const v = patch[f];
    if (typeof v === "number" && Number.isFinite(v)) out[f] = Math.max(0, Math.round(v));
  }
  for (const f of CAP_FIELDS) {
    if (f in patch) {
      const v = patch[f];
      out[f] = v == null ? null : Math.max(0, Math.round(Number(v)));
    }
  }
  for (const f of [
    "feat_integrations",
    "feat_ai_posts",
    "feat_ai_screening",
    "feat_ai_assessments",
    "allow_addon_seats",
    "is_public",
  ] as const) {
    if (typeof patch[f] === "boolean") out[f] = patch[f];
  }
  return out;
}

/** Update an existing plan's metadata / limits / feature matrix / pricing. */
export async function updatePlanAction(key: string, patch: PlanPatch): Promise<ActionResult> {
  const gate = await requirePlatformActor();
  if (!gate.ok) return { ok: false, error: gate.error };

  const clean = sanitize(patch);
  if (Object.keys(clean).length === 0) return { ok: false, error: "Nothing to update." };

  const admin = createAdminClient();
  const { error } = await admin.from("plans").update(clean).eq("key", key);
  if (error) return { ok: false, error: error.message };

  await logPlatformAction(gate.actor, "plan.update", { type: "plan", id: key, detail: clean });
  revalidatePath("/platform/plans");
  return { ok: true, message: "Plan updated." };
}

/** Create a new plan (public tier or private/custom — see Phase 3). */
export async function createPlanAction(input: PlanPatch & { key: string; name: string }): Promise<ActionResult> {
  const gate = await requirePlatformActor();
  if (!gate.ok) return { ok: false, error: gate.error };

  const key = input.key?.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
  if (!key) return { ok: false, error: "A plan key is required." };
  if (!input.name?.trim()) return { ok: false, error: "A plan name is required." };

  const admin = createAdminClient();
  const { data: existing } = await admin.from("plans").select("key").eq("key", key).maybeSingle();
  if (existing) return { ok: false, error: `A plan with key "${key}" already exists.` };

  const row = { key, name: input.name.trim(), ...sanitize(input) };
  const { error } = await admin.from("plans").insert(row);
  if (error) return { ok: false, error: error.message };

  await logPlatformAction(gate.actor, "plan.create", { type: "plan", id: key, detail: row });
  revalidatePath("/platform/plans");
  return { ok: true, message: `Plan "${input.name.trim()}" created.` };
}

/**
 * Push a plan's current prices to Stripe. Stripe Prices are immutable, so a
 * changed amount means a NEW Price — this creates/reuses a Product and mints
 * fresh monthly + per-seat Prices, then repoints stripe_price_id /
 * stripe_seat_price_id. New subscriptions use the new price; existing ones keep
 * theirs until migrated in the portal.
 */
export async function syncPlanStripeAction(key: string): Promise<ActionResult> {
  const gate = await requirePlatformActor();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!isStripeConfigured()) return { ok: false, error: "Stripe isn't configured." };

  const admin = createAdminClient();
  const { data: plan } = await admin
    .from("plans")
    .select("key, name, monthly_cents, per_seat_cents")
    .eq("key", key)
    .maybeSingle();
  if (!plan) return { ok: false, error: "Unknown plan." };
  if (plan.monthly_cents <= 0) return { ok: false, error: "Free plans don't need Stripe prices." };

  const stripe = getStripe();
  const product = await stripe.products.create({ name: plan.name, metadata: { plan_key: plan.key } });
  const monthly = await stripe.prices.create({
    product: product.id,
    unit_amount: plan.monthly_cents,
    currency: "usd",
    recurring: { interval: "month" },
    metadata: { plan_key: plan.key },
  });

  let seatId: string | null = null;
  if (plan.per_seat_cents > 0) {
    const seat = await stripe.prices.create({
      product: product.id,
      unit_amount: plan.per_seat_cents,
      currency: "usd",
      recurring: { interval: "month" },
      metadata: { plan_key: plan.key, kind: "seat" },
    });
    seatId = seat.id;
  }

  const { error } = await admin
    .from("plans")
    .update({ stripe_price_id: monthly.id, stripe_seat_price_id: seatId })
    .eq("key", key);
  if (error) return { ok: false, error: error.message };

  await logPlatformAction(gate.actor, "plan.stripe_sync", {
    type: "plan",
    id: key,
    detail: { price: monthly.id, seat: seatId },
  });
  revalidatePath("/platform/plans");
  return { ok: true, message: "New Stripe prices created and linked." };
}
