"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { createAdminClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/validation/auth";
import { authorize } from "@/server/auth/authorize";
import { getSessionContext } from "@/server/auth/session";
import { getStripe, isStripeConfigured } from "@/server/billing/stripe";

/**
 * Absolute base URL to send Stripe redirects back to. Derived from the actual
 * request (origin / forwarded host) so checkout always returns to the domain the
 * user is on — not whatever NEXT_PUBLIC_APP_URL happens to be set to. Falls back
 * to the env var, then localhost.
 */
async function appUrl(): Promise<string> {
  const h = await headers();
  const origin = h.get("origin");
  if (origin) return origin.replace(/\/$/, "");
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host) {
    const proto = h.get("x-forwarded-proto") ?? "https";
    return `${proto}://${host}`;
  }
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
}

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

/**
 * Start a Stripe Checkout session for a paid plan (CP-27). Gated on
 * manage_billing. Ensures the org has a Stripe customer, then returns the hosted
 * Checkout URL via `redirectTo`; the webhook flips the plan once payment lands.
 * Falls back with a clear error when Stripe or the price isn't configured.
 */
export async function createCheckoutSessionAction(planKey: string): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Your session has expired." };
  const auth = await authorize("administration.manage_billing");
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!isStripeConfigured()) {
    return { ok: false, error: "Online billing isn't configured yet. Add your Stripe keys to enable checkout." };
  }

  const admin = createAdminClient();
  const { data: plan } = await admin
    .from("plans")
    .select("key, name, stripe_price_id")
    .eq("key", planKey)
    .maybeSingle();
  if (!plan) return { ok: false, error: "Unknown plan." };
  if (!plan.stripe_price_id) {
    return { ok: false, error: `The ${plan.name} plan isn't wired to Stripe yet. Run \`npm run stripe:setup\`.` };
  }

  const { data: sub } = await admin
    .from("org_subscriptions")
    .select("stripe_customer_id")
    .eq("organization_id", session.organizationId)
    .maybeSingle();

  const stripe = getStripe();

  let customerId = sub?.stripe_customer_id ?? null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: session.email || undefined,
      name: session.organizationName,
      metadata: { organization_id: session.organizationId },
    });
    customerId = customer.id;
    await admin.from("org_subscriptions").upsert(
      { organization_id: session.organizationId, stripe_customer_id: customerId },
      { onConflict: "organization_id" },
    );
  }

  const base = await appUrl();
  const checkout = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
    success_url: `${base}/admin/billing?checkout=success`,
    cancel_url: `${base}/admin/billing?checkout=cancelled`,
    allow_promotion_codes: true,
    metadata: { organization_id: session.organizationId, plan_key: plan.key },
    subscription_data: {
      metadata: { organization_id: session.organizationId, plan_key: plan.key },
    },
  });

  if (!checkout.url) return { ok: false, error: "Stripe did not return a checkout URL." };
  return { ok: true, redirectTo: checkout.url };
}

/**
 * Open the Stripe Billing Portal so an admin can update card, switch/cancel the
 * subscription, and view invoices. Downgrades and cancellations flow through
 * here; the webhook syncs the result back to org_subscriptions.
 */
export async function createBillingPortalSessionAction(): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Your session has expired." };
  const auth = await authorize("administration.manage_billing");
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!isStripeConfigured()) {
    return { ok: false, error: "Online billing isn't configured yet." };
  }

  const admin = createAdminClient();
  const { data: sub } = await admin
    .from("org_subscriptions")
    .select("stripe_customer_id")
    .eq("organization_id", session.organizationId)
    .maybeSingle();

  if (!sub?.stripe_customer_id) {
    return { ok: false, error: "No billing account yet — start a paid plan first." };
  }

  const base = await appUrl();
  const portal = await getStripe().billingPortal.sessions.create({
    customer: sub.stripe_customer_id,
    return_url: `${base}/admin/billing`,
  });
  return { ok: true, redirectTo: portal.url };
}

/**
 * Start an EMBEDDED Stripe Checkout for a first subscription (CP-27) — the card
 * form renders inside our app (ui_mode: embedded) instead of redirecting to
 * checkout.stripe.com. Returns the session client_secret for the client to
 * mount. On completion Stripe navigates the page to return_url (our domain).
 */
export async function createEmbeddedCheckoutSessionAction(
  planKey: string,
): Promise<{ ok: true; clientSecret: string } | { ok: false; error: string }> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Your session has expired." };
  const auth = await authorize("administration.manage_billing");
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!isStripeConfigured()) return { ok: false, error: "Online billing isn't configured yet." };

  const admin = createAdminClient();
  const { data: plan } = await admin
    .from("plans")
    .select("key, name, stripe_price_id")
    .eq("key", planKey)
    .maybeSingle();
  if (!plan) return { ok: false, error: "Unknown plan." };
  if (!plan.stripe_price_id) return { ok: false, error: `The ${plan.name} plan isn't wired to Stripe yet.` };

  const { data: sub } = await admin
    .from("org_subscriptions")
    .select("stripe_customer_id")
    .eq("organization_id", session.organizationId)
    .maybeSingle();

  const stripe = getStripe();
  let customerId = sub?.stripe_customer_id ?? null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: session.email || undefined,
      name: session.organizationName,
      metadata: { organization_id: session.organizationId },
    });
    customerId = customer.id;
    await admin
      .from("org_subscriptions")
      .upsert({ organization_id: session.organizationId, stripe_customer_id: customerId }, { onConflict: "organization_id" });
  }

  const base = await appUrl();
  const checkout = await stripe.checkout.sessions.create({
    // The account's API version renamed the embedded value: "embedded" ->
    // "embedded_page". Cast because the SDK's TS union predates it.
    ui_mode: "embedded_page" as unknown as "embedded",
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
    return_url: `${base}/admin/billing?checkout=complete`,
    allow_promotion_codes: true,
    metadata: { organization_id: session.organizationId, plan_key: plan.key },
    subscription_data: {
      metadata: { organization_id: session.organizationId, plan_key: plan.key },
    },
  });

  if (!checkout.client_secret) return { ok: false, error: "Stripe did not return a checkout secret." };
  return { ok: true, clientSecret: checkout.client_secret };
}

/**
 * Cancel the subscription IN-APP (no Stripe redirect). Cancels the Stripe
 * subscription immediately, drops the org to Free, and returns the caller to the
 * dashboard. The webhook confirms, but we apply it synchronously for instant
 * feedback.
 */
export async function cancelSubscriptionAction(): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Your session has expired." };
  const auth = await authorize("administration.manage_billing");
  if (!auth.ok) return { ok: false, error: auth.error };

  const admin = createAdminClient();
  const { data: sub } = await admin
    .from("org_subscriptions")
    .select("stripe_subscription_id")
    .eq("organization_id", session.organizationId)
    .maybeSingle();

  if (isStripeConfigured() && sub?.stripe_subscription_id) {
    try {
      await getStripe().subscriptions.cancel(sub.stripe_subscription_id);
    } catch {
      // Already canceled/absent in Stripe — proceed to reflect Free locally.
    }
  }

  const { error } = await admin.from("org_subscriptions").upsert(
    {
      organization_id: session.organizationId,
      plan_key: "free",
      status: "canceled",
      stripe_subscription_id: null,
      addon_seats: 0,
    },
    { onConflict: "organization_id" },
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/billing");
  revalidatePath("/dashboard");
  return { ok: true, redirectTo: "/dashboard", message: "Your subscription has been cancelled." };
}

/**
 * Switch between paid plans IN-APP (no Stripe redirect) when an active Stripe
 * subscription already exists — swaps the plan line item's price with prorated
 * billing against the card on file. Falls back to the direct switch when Stripe
 * isn't configured. (Starting a subscription from Free still needs Checkout for
 * card entry — the UI routes there when there's no subscription yet.)
 */
export async function switchPlanStripeAction(planKey: string): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Your session has expired." };
  const auth = await authorize("administration.manage_billing");
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!isStripeConfigured()) return changePlanAction(planKey);

  const admin = createAdminClient();
  const { data: sub } = await admin
    .from("org_subscriptions")
    .select("stripe_subscription_id, plan_key")
    .eq("organization_id", session.organizationId)
    .maybeSingle();
  if (!sub?.stripe_subscription_id) {
    return { ok: false, error: "No active subscription to change — start one first." };
  }

  const [{ data: plan }, { data: currentPlan }] = await Promise.all([
    admin.from("plans").select("name, stripe_price_id, seat_cap").eq("key", planKey).maybeSingle(),
    admin.from("plans").select("stripe_seat_price_id").eq("key", sub.plan_key).maybeSingle(),
  ]);
  if (!plan) return { ok: false, error: "Unknown plan." };
  if (!plan.stripe_price_id) return { ok: false, error: `The ${plan.name} plan isn't wired to Stripe yet.` };

  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
  const seatPriceId = currentPlan?.stripe_seat_price_id ?? null;
  // The plan line item is the one that isn't the per-seat item.
  const planItem = subscription.items.data.find((i) => i.price?.id !== seatPriceId);
  if (!planItem) return { ok: false, error: "Couldn't locate the plan line item." };

  await stripe.subscriptions.update(sub.stripe_subscription_id, {
    items: [{ id: planItem.id, price: plan.stripe_price_id }],
    proration_behavior: "create_prorations",
    metadata: { organization_id: session.organizationId, plan_key: planKey },
  });

  await admin
    .from("org_subscriptions")
    .update({ plan_key: planKey, base_seats: plan.seat_cap ?? 1 })
    .eq("organization_id", session.organizationId);

  revalidatePath("/admin/billing");
  return { ok: true, message: `You're now on the ${plan.name} plan.` };
}

/**
 * Set the number of extra seats (CP-27). Adds/updates/removes a quantity-based
 * seat line item on the org's Stripe subscription with prorated billing; the
 * webhook syncs `addon_seats` authoritatively. Requires an active paid plan.
 */
export async function updateSeatsAction(quantity: number): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Your session has expired." };
  const auth = await authorize("administration.manage_billing");
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!isStripeConfigured()) return { ok: false, error: "Online billing isn't configured yet." };

  const qty = Math.max(0, Math.min(50, Math.floor(Number.isFinite(quantity) ? quantity : 0)));

  const admin = createAdminClient();
  const { data: sub } = await admin
    .from("org_subscriptions")
    .select("plan_key, stripe_subscription_id")
    .eq("organization_id", session.organizationId)
    .maybeSingle();
  if (!sub?.stripe_subscription_id) {
    return { ok: false, error: "Start a paid plan before adding seats." };
  }

  const { data: plan } = await admin
    .from("plans")
    .select("stripe_seat_price_id")
    .eq("key", sub.plan_key)
    .maybeSingle();
  if (!plan?.stripe_seat_price_id) {
    return { ok: false, error: "This plan doesn't offer extra seats." };
  }

  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
  const seatItem = subscription.items.data.find((i) => i.price?.id === plan.stripe_seat_price_id);

  if (!seatItem && qty === 0) return { ok: true, message: "No extra seats to change." };

  const item = seatItem
    ? qty === 0
      ? { id: seatItem.id, deleted: true as const }
      : { id: seatItem.id, quantity: qty }
    : { price: plan.stripe_seat_price_id, quantity: qty };

  await stripe.subscriptions.update(sub.stripe_subscription_id, {
    items: [item],
    proration_behavior: "create_prorations",
  });

  // Optimistic local reflect; the customer.subscription.updated webhook confirms.
  await admin
    .from("org_subscriptions")
    .update({ addon_seats: qty })
    .eq("organization_id", session.organizationId);

  revalidatePath("/admin/billing");
  return {
    ok: true,
    message: qty === 0 ? "Extra seats removed." : `You now have ${qty} extra seat${qty === 1 ? "" : "s"}.`,
  };
}
