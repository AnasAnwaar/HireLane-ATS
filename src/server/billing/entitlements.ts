import "server-only";

import { createAdminClient } from "@/lib/supabase/server";

/**
 * Entitlement engine (CP-26). One source of truth resolving an org's limits
 * (seats, openings) and feature flags from its plan + add-on seats. Read via the
 * admin client and org id, so it works from any server action regardless of the
 * caller's row-level permissions. Enforcement helpers return an ActionResult-style
 * result the action layer can surface directly.
 */

export type Feature = "integrations" | "ai_posts" | "ai_screening" | "ai_assessments";

export type Entitlements = {
  planKey: string;
  planName: string;
  status: string;
  seatCap: number | null; // null = unlimited
  openingCap: number | null;
  addonSeats: number;
  allowAddonSeats: boolean;
  features: Record<Feature, boolean>;
};

const FREE_FALLBACK: Entitlements = {
  planKey: "free",
  planName: "Free",
  status: "active",
  seatCap: 1,
  openingCap: 5,
  addonSeats: 0,
  allowAddonSeats: false,
  features: { integrations: false, ai_posts: false, ai_screening: false, ai_assessments: false },
};

const FEATURE_LOCK: Record<Feature, string> = {
  integrations: "Channel integrations are a Basic plan feature. Upgrade to connect job boards.",
  ai_posts: "AI job-post generation is a Basic plan feature. Upgrade to use it.",
  ai_screening: "AI screening & match reports are a Premium feature. Upgrade to use them.",
  ai_assessments: "AI assessments & grading are a Premium feature. Upgrade to use them.",
};

/** Resolve an org's entitlements from its subscription + plan (defaults to Free). */
export async function getEntitlements(organizationId: string): Promise<Entitlements> {
  const admin = createAdminClient();
  const { data: sub } = await admin
    .from("org_subscriptions")
    .select("plan_key, status, addon_seats")
    .eq("organization_id", organizationId)
    .maybeSingle();

  const planKey = sub?.plan_key ?? "free";
  const { data: plan } = await admin.from("plans").select("*").eq("key", planKey).maybeSingle();
  if (!plan) return FREE_FALLBACK;

  const addon = plan.allow_addon_seats ? (sub?.addon_seats ?? 0) : 0;
  return {
    planKey: plan.key,
    planName: plan.name,
    status: sub?.status ?? "active",
    seatCap: plan.seat_cap == null ? null : plan.seat_cap + addon,
    openingCap: plan.opening_cap,
    addonSeats: addon,
    allowAddonSeats: plan.allow_addon_seats,
    features: {
      integrations: plan.feat_integrations,
      ai_posts: plan.feat_ai_posts,
      ai_screening: plan.feat_ai_screening,
      ai_assessments: plan.feat_ai_assessments,
    },
  };
}

/** Current consumption of the metered limits. */
export async function getUsage(organizationId: string): Promise<{ seatsUsed: number; openingsUsed: number }> {
  const admin = createAdminClient();
  const [{ count: seats }, { count: openings }] = await Promise.all([
    admin.from("memberships").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "active"),
    admin.from("job_openings").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).neq("status", "closed"),
  ]);
  return { seatsUsed: seats ?? 0, openingsUsed: openings ?? 0 };
}

type Guard = { ok: true } | { ok: false; error: string };

/** Enforce a plan feature flag. */
export async function requireFeature(organizationId: string, feature: Feature): Promise<Guard> {
  const e = await getEntitlements(organizationId);
  return e.features[feature] ? { ok: true } : { ok: false, error: FEATURE_LOCK[feature] };
}

/** Enforce the seat limit before adding a user. */
export async function requireSeatAvailable(organizationId: string): Promise<Guard> {
  const [e, u] = await Promise.all([getEntitlements(organizationId), getUsage(organizationId)]);
  if (e.seatCap == null || u.seatsUsed < e.seatCap) return { ok: true };
  return {
    ok: false,
    error: `Your ${e.planName} plan includes ${e.seatCap} seat${e.seatCap === 1 ? "" : "s"} and they're all in use. Upgrade or add seats to invite more.`,
  };
}

/** Enforce the job-opening cap before creating one. */
export async function requireOpeningAvailable(organizationId: string): Promise<Guard> {
  const [e, u] = await Promise.all([getEntitlements(organizationId), getUsage(organizationId)]);
  if (e.openingCap == null || u.openingsUsed < e.openingCap) return { ok: true };
  return {
    ok: false,
    error: `Your ${e.planName} plan allows ${e.openingCap} active job openings. Close one or upgrade to add more.`,
  };
}
