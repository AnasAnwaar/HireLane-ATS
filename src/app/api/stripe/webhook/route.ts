import { NextResponse } from "next/server";
import type Stripe from "stripe";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/server";
import { getStripe, isStripeConfigured } from "@/server/billing/stripe";
import type { SubscriptionStatus } from "@/types/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Admin = SupabaseClient;

/** Stripe subscription status -> our narrower enum (migration 0037). */
function mapStatus(s: Stripe.Subscription.Status): SubscriptionStatus {
  switch (s) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
    case "unpaid":
    case "incomplete":
      return "past_due";
    default: // canceled, incomplete_expired, paused
      return "canceled";
  }
}

function customerId(customer: string | Stripe.Customer | Stripe.DeletedCustomer | null): string | null {
  if (!customer) return null;
  return typeof customer === "string" ? customer : customer.id;
}

/**
 * Current-period end. Stripe moved this onto subscription items in recent API
 * versions, so read the item first and fall back to the (older) top-level field.
 */
function periodEndIso(sub: Stripe.Subscription): string | null {
  const item = sub.items?.data?.[0] as { current_period_end?: number } | undefined;
  const secs = item?.current_period_end ?? (sub as unknown as { current_period_end?: number }).current_period_end;
  return typeof secs === "number" ? new Date(secs * 1000).toISOString() : null;
}

async function orgIdByCustomer(admin: Admin, customer: Stripe.Subscription["customer"] | Stripe.Invoice["customer"]): Promise<string | null> {
  const id = customerId(customer ?? null);
  if (!id) return null;
  const { data } = await admin
    .from("org_subscriptions")
    .select("organization_id")
    .eq("stripe_customer_id", id)
    .maybeSingle();
  return data?.organization_id ?? null;
}

/**
 * Reflect a Stripe subscription onto org_subscriptions. `forceFree` handles the
 * deletion event: the org drops back to the free plan, canceled. Otherwise the
 * plan is resolved from the price (authoritative) or the metadata we stamped at
 * checkout.
 */
async function syncSubscription(admin: Admin, sub: Stripe.Subscription, opts?: { forceFree?: boolean }): Promise<void> {
  const orgId = sub.metadata?.organization_id ?? (await orgIdByCustomer(admin, sub.customer));
  if (!orgId) {
    console.warn(`stripe webhook: no org for subscription ${sub.id}`);
    return;
  }

  // The org may not exist in THIS database — e.g. a checkout done against dev
  // whose events also fan out to the prod webhook endpoint. Skip cleanly (200)
  // rather than failing the FK and returning 500.
  const { data: orgExists } = await admin.from("organizations").select("id").eq("id", orgId).maybeSingle();
  if (!orgExists) {
    console.warn(`stripe webhook: org ${orgId} not in this database (cross-environment event) — skipping`);
    return;
  }

  const items = sub.items?.data ?? [];
  const priceIds = items.map((i) => i.price?.id).filter((id): id is string => Boolean(id));

  let planKey = sub.metadata?.plan_key ?? null;
  let baseSeats: number | null = null;
  let addonSeats = 0;
  if (!opts?.forceFree && priceIds.length) {
    // Resolve the plan from whichever item matches a plan's monthly price, then
    // read the extra-seat quantity from the seat-price line item.
    const { data: plan } = await admin
      .from("plans")
      .select("key, seat_cap, stripe_seat_price_id")
      .in("stripe_price_id", priceIds)
      .maybeSingle();
    if (plan) {
      planKey = plan.key;
      baseSeats = plan.seat_cap;
      if (plan.stripe_seat_price_id) {
        const seatItem = items.find((i) => i.price?.id === plan.stripe_seat_price_id);
        addonSeats = seatItem?.quantity ?? 0;
      }
    }
  }

  const cid = customerId(sub.customer);
  const row: Record<string, unknown> = {
    organization_id: orgId,
    plan_key: opts?.forceFree ? "free" : planKey ?? "free",
    status: opts?.forceFree ? "canceled" : mapStatus(sub.status),
    stripe_customer_id: cid,
    stripe_subscription_id: opts?.forceFree ? null : sub.id,
    current_period_end: periodEndIso(sub),
    addon_seats: opts?.forceFree ? 0 : addonSeats,
  };
  if (baseSeats != null) row.base_seats = baseSeats;

  const { error } = await admin.from("org_subscriptions").upsert(row, { onConflict: "organization_id" });
  if (error) throw new Error(error.message);
}

/**
 * Stripe webhook (CP-27). Signature-verified with STRIPE_WEBHOOK_SECRET; the
 * raw body is required for verification. Handlers are idempotent upserts, so
 * Stripe retries are safe. Register the endpoint with `stripe listen` (dev) or a
 * dashboard webhook (prod) for the subscription + checkout events below.
 */
export async function POST(req: Request) {
  if (!isStripeConfigured()) return new NextResponse("Stripe not configured", { status: 503 });
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return new NextResponse("Webhook secret not set", { status: 503 });

  const signature = req.headers.get("stripe-signature");
  if (!signature) return new NextResponse("Missing stripe-signature header", { status: 400 });

  const stripe = getStripe();
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, secret);
  } catch (err) {
    return new NextResponse(`Invalid signature: ${(err as Error).message}`, { status: 400 });
  }

  const admin = createAdminClient();
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        const subId = typeof s.subscription === "string" ? s.subscription : s.subscription?.id;
        if (subId) {
          const sub = await stripe.subscriptions.retrieve(subId);
          // The subscription may not carry our metadata yet; graft it from the session.
          if (!sub.metadata?.organization_id && s.metadata?.organization_id) {
            sub.metadata = { ...sub.metadata, ...s.metadata };
          }
          await syncSubscription(admin, sub);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        await syncSubscription(admin, event.data.object as Stripe.Subscription);
        break;
      }
      case "customer.subscription.deleted": {
        await syncSubscription(admin, event.data.object as Stripe.Subscription, { forceFree: true });
        break;
      }
      case "invoice.payment_failed": {
        const inv = event.data.object as Stripe.Invoice;
        const orgId = await orgIdByCustomer(admin, inv.customer);
        if (orgId) await admin.from("org_subscriptions").update({ status: "past_due" }).eq("organization_id", orgId);
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error("stripe webhook handler error", err);
    return NextResponse.json({ received: true, error: (err as Error).message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
