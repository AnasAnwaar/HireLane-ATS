/**
 * One-time (idempotent) Stripe setup for CP-27 billing.
 *
 *   npm run stripe:setup
 *
 * Creates a Product + monthly recurring Price for each paid plan in the Stripe
 * (test/sandbox) account, then writes the Price id back to public.plans so
 * Checkout and the webhook can resolve plan <-> price. Safe to re-run: prices
 * are looked up by a stable `lookup_key`, so a second run reuses them instead
 * of creating duplicates.
 *
 * Requires STRIPE_SECRET_KEY and DIRECT_URL in .env.local.
 */
const path = require("path");
process.loadEnvFile(path.join(__dirname, "..", ".env.local"));

const Stripe = require("stripe");
const { Client } = require("pg");

// Amounts in the smallest currency unit (cents). Keep in sync with the seeded
// monthly_cents in migration 0037.
const PAID_PLANS = [
  { key: "basic", name: "HireLane Basic", amountCents: 4900 },
  { key: "premium", name: "HireLane Premium", amountCents: 14900 },
];
const CURRENCY = "usd";

async function main() {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    console.error("Missing STRIPE_SECRET_KEY in .env.local — add your test key first.");
    process.exit(1);
  }
  if (!process.env.DIRECT_URL) {
    console.error("Missing DIRECT_URL in .env.local.");
    process.exit(1);
  }
  if (!secret.startsWith("sk_test_")) {
    console.warn("WARNING: STRIPE_SECRET_KEY is not a test key (sk_test_…). Refusing to run against a live account.");
    process.exit(1);
  }

  const stripe = new Stripe(secret);
  const db = new Client({
    connectionString: process.env.DIRECT_URL,
    ssl: { rejectUnauthorized: false },
  });
  await db.connect();

  try {
    for (const plan of PAID_PLANS) {
      const lookupKey = `hirelane_${plan.key}_monthly`;

      // Reuse an existing price with this lookup_key if one exists.
      const existing = await stripe.prices.list({
        lookup_keys: [lookupKey],
        active: true,
        limit: 1,
        expand: ["data.product"],
      });

      let price = existing.data[0];
      if (price) {
        console.log(`= ${plan.key}: reused price ${price.id} (${lookupKey})`);
      } else {
        const product = await stripe.products.create({
          name: plan.name,
          metadata: { plan_key: plan.key },
        });
        price = await stripe.prices.create({
          product: product.id,
          unit_amount: plan.amountCents,
          currency: CURRENCY,
          recurring: { interval: "month" },
          lookup_key: lookupKey,
          metadata: { plan_key: plan.key },
        });
        console.log(`+ ${plan.key}: created product ${product.id} + price ${price.id}`);
      }

      await db.query("update public.plans set stripe_price_id = $1 where key = $2", [price.id, plan.key]);
    }

    const { rows } = await db.query(
      "select key, name, stripe_price_id from public.plans order by sort_order",
    );
    console.log("\nplans:");
    for (const r of rows) {
      console.log(`  ${r.key.padEnd(9)} ${r.stripe_price_id ?? "(no price — free)"}`);
    }
    console.log("\nDone. Set the same STRIPE_SECRET_KEY / prices on production before going live there.");
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
