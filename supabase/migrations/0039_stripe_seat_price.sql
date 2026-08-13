-- =============================================================================
-- 0039 · Stripe per-seat price (CP-27, additional-seat purchase)
-- =============================================================================
-- Each paid plan gets a per-seat recurring Price so admins can buy extra seats
-- as a quantity-based subscription item. Populated by `npm run stripe:setup`.
-- =============================================================================

alter table public.plans
  add column if not exists stripe_seat_price_id text;
