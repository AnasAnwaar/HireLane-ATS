-- =============================================================================
-- 0043 · Demo (all-access) plan (CP-28, super-admin demo accounts)
-- =============================================================================
-- A private, free plan with every feature and no limits. Assigned only to demo
-- accounts a super-admin provisions from the portal — never publicly listed and
-- never self-serve. is_public = false keeps it off pricing/billing surfaces.
-- =============================================================================

insert into public.plans (
  key, name, seat_cap, opening_cap,
  feat_integrations, feat_ai_posts, feat_ai_screening, feat_ai_assessments,
  allow_addon_seats, monthly_cents, per_seat_cents, is_public, sort_order
) values (
  'demo', 'Demo (all access)', null, null,
  true, true, true, true,
  true, 0, 0, false, 90
)
on conflict (key) do update set
  name = excluded.name,
  seat_cap = null,
  opening_cap = null,
  feat_integrations = true,
  feat_ai_posts = true,
  feat_ai_screening = true,
  feat_ai_assessments = true,
  allow_addon_seats = true,
  is_public = false;
