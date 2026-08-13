-- =============================================================================
-- 0037 · Plans & Entitlements (CP-26)
-- =============================================================================
-- The monetization foundation. `plans` is the catalogue (limits + feature flags),
-- `org_subscriptions` binds an org to a plan (+ purchased add-on seats). Stripe
-- IDs are placeholders here and wired in CP-27. Entitlements are RESOLVED
-- server-side (src/server/billing/entitlements.ts) and enforced in the action
-- layer on top of the CP-2 RLS boundary — never UI-only.
-- =============================================================================

create type subscription_status as enum ('active', 'trialing', 'past_due', 'canceled');

create table public.plans (
  key                 text        primary key,   -- free | basic | premium | <custom-slug>
  name                text        not null,
  seat_cap            int,                        -- null = unlimited
  opening_cap         int,                        -- null = unlimited
  feat_integrations   boolean     not null default false,
  feat_ai_posts       boolean     not null default false,
  feat_ai_screening   boolean     not null default false,
  feat_ai_assessments boolean     not null default false,
  allow_addon_seats   boolean     not null default false,
  monthly_cents       int         not null default 0,
  per_seat_cents      int         not null default 0,
  is_public           boolean     not null default true,  -- false = private/custom (CP-28)
  sort_order          int         not null default 0,
  created_at          timestamptz not null default now()
);

insert into public.plans
  (key, name, seat_cap, opening_cap, feat_integrations, feat_ai_posts, feat_ai_screening, feat_ai_assessments, allow_addon_seats, monthly_cents, per_seat_cents, sort_order)
values
  ('free',    'Free',    1,    5,    false, false, false, false, false, 0,     0,    10),
  ('basic',   'Basic',   3,    null, true,  true,  false, false, true,  4900,  1500, 20),
  ('premium', 'Premium', 10,   null, true,  true,  true,  true,  true,  14900, 1500, 30)
on conflict (key) do nothing;

create table public.org_subscriptions (
  organization_id        uuid                primary key references public.organizations(id) on delete cascade,
  plan_key               text                not null references public.plans(key) default 'free',
  status                 subscription_status not null default 'active',
  base_seats             int                 not null default 1,
  addon_seats            int                 not null default 0,
  current_period_end     timestamptz,
  stripe_customer_id     text,               -- CP-27
  stripe_subscription_id text,               -- CP-27
  created_at             timestamptz         not null default now(),
  updated_at             timestamptz         not null default now(),
  constraint org_sub_addon_nonneg check (addon_seats >= 0)
);

create trigger org_subscriptions_set_updated_at before update on public.org_subscriptions
  for each row execute function public.set_updated_at();

-- Every existing org starts on Free. New orgs are treated as Free by the resolver
-- until a row is created (on first upgrade), so provisioning needs no change.
insert into public.org_subscriptions (organization_id, plan_key, base_seats)
select id, 'free', 1 from public.organizations
on conflict (organization_id) do nothing;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.plans             enable row level security;
alter table public.org_subscriptions enable row level security;
alter table public.plans             force row level security;
alter table public.org_subscriptions force row level security;

-- Plans catalogue: any authenticated member may read (billing page, upgrade UI).
create policy plans_select on public.plans
  for select to authenticated using (true);
-- No app-side writes: plans are seeded / managed by the super-admin path (CP-28).

-- Subscription: an org's members read their own; writes go through the service
-- role (upgrades in the action layer / Stripe webhooks), never direct.
create policy org_subscriptions_select on public.org_subscriptions
  for select to authenticated
  using (organization_id = public.current_org_id());

grant select on public.plans to authenticated, service_role;
grant insert, update, delete on public.plans to service_role;
grant select, insert, update, delete on public.org_subscriptions to authenticated, service_role;
