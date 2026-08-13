-- =============================================================================
-- 0038 · Stripe price IDs (CP-27)
-- =============================================================================
-- Bind each paid plan to its Stripe Price. Populated by `npm run stripe:setup`,
-- which creates the Products/Prices in the (test) Stripe account and writes the
-- ids back here. Free has no price.
-- =============================================================================

alter table public.plans
  add column if not exists stripe_price_id text;
