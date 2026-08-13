import "server-only";

import Stripe from "stripe";

/**
 * Lazily-constructed Stripe client. Everything billing-related degrades
 * gracefully when the keys are absent (same posture as the email layer): the
 * app runs, buttons fall back to the direct plan-switch, and nothing throws at
 * import time. Only call `getStripe()` after `isStripeConfigured()`.
 */
let client: Stripe | null = null;

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("Stripe is not configured (missing STRIPE_SECRET_KEY).");
  }
  client ??= new Stripe(key, { typescript: true });
  return client;
}
