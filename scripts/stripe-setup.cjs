/**
 * One-time (idempotent) Stripe setup for CP-27 billing.
 *
 *   npm run stripe:setup                          # against your dev DB (.env.local)
 *   DIRECT_URL="postgres://…prod…" npm run stripe:setup   # against prod
 *
 * For each paid plan it creates (or reuses) a monthly plan Price and a per-seat
 * Price in the Stripe (test/sandbox) account, then writes both ids back to
 * public.plans (stripe_price_id, stripe_seat_price_id). Amounts come from the
 * plan row (monthly_cents / per_seat_cents), so Stripe and the DB never drift.
 *
 * Idempotent: prices are matched by a stable `lookup_key`, so re-running reuses
 * them. Requires STRIPE_SECRET_KEY and DIRECT_URL.
 */
const path = require("path");

// A DIRECT_URL from the shell wins over .env.local, so a single command can be
// pointed at prod. (loadEnvFile would otherwise overwrite it with the dev URL.)
const shellDirectUrl = process.env.DIRECT_URL;
process.loadEnvFile(path.join(__dirname, "..", ".env.local"));
if (shellDirectUrl) process.env.DIRECT_URL = shellDirectUrl;

const Stripe = require("stripe");
const { Client } = require("pg");

const PAID_KEYS = ["basic", "premium"];
const CURRENCY = "usd";

async function ensurePrice(stripe, { lookupKey, productName, amountCents, planKey }) {
  const existing = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
  if (existing.data[0]) return { id: existing.data[0].id, reused: true };

  const product = await stripe.products.create({ name: productName, metadata: { plan_key: planKey } });
  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: amountCents,
    currency: CURRENCY,
    recurring: { interval: "month" },
    lookup_key: lookupKey,
    metadata: { plan_key: planKey },
  });
  return { id: price.id, reused: false };
}

async function main() {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    console.error("Missing STRIPE_SECRET_KEY in .env.local — add your test key first.");
    process.exit(1);
  }
  if (!process.env.DIRECT_URL) {
    console.error("Missing DIRECT_URL (set it in .env.local, or in the shell for prod).");
    process.exit(1);
  }
  if (!secret.startsWith("sk_test_")) {
    console.warn("WARNING: STRIPE_SECRET_KEY is not a test key (sk_test_…). Refusing to run against a live account.");
    process.exit(1);
  }

  const stripe = new Stripe(secret);
  const db = new Client({ connectionString: process.env.DIRECT_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();

  try {
    const { rows: plans } = await db.query(
      "select key, name, monthly_cents, per_seat_cents from public.plans where key = any($1)",
      [PAID_KEYS],
    );

    for (const plan of plans) {
      const planPrice = await ensurePrice(stripe, {
        lookupKey: `hirelane_${plan.key}_monthly`,
        productName: `${plan.name} — monthly`,
        amountCents: plan.monthly_cents,
        planKey: plan.key,
      });

      let seatPriceId = null;
      if (plan.per_seat_cents > 0) {
        const seatPrice = await ensurePrice(stripe, {
          lookupKey: `hirelane_${plan.key}_seat`,
          productName: `${plan.name} — additional seat`,
          amountCents: plan.per_seat_cents,
          planKey: plan.key,
        });
        seatPriceId = seatPrice.id;
        console.log(`${seatPrice.reused ? "=" : "+"} ${plan.key}: plan ${planPrice.id} · seat ${seatPrice.id}`);
      } else {
        console.log(`${planPrice.reused ? "=" : "+"} ${plan.key}: plan ${planPrice.id} · (no per-seat price)`);
      }

      await db.query(
        "update public.plans set stripe_price_id = $1, stripe_seat_price_id = $2 where key = $3",
        [planPrice.id, seatPriceId, plan.key],
      );
    }

    const { rows } = await db.query(
      "select key, stripe_price_id, stripe_seat_price_id from public.plans order by sort_order",
    );
    console.log("\nplans:");
    for (const r of rows) {
      console.log(`  ${r.key.padEnd(9)} plan=${r.stripe_price_id ?? "-"}  seat=${r.stripe_seat_price_id ?? "-"}`);
    }
    console.log("\nDone.");
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
