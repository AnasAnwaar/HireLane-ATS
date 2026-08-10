-- =============================================================================
-- 0016 · Channels & connections (spec §UC-1) + postings shell (§UC-2)
-- =============================================================================
--   channels             vendor catalogue of publishing destinations (global,
--                        like the permissions catalogue)
--   channel_connections  a platform an organisation has connected
--   job_postings         a job opening posted to a channel (content lives here;
--                        the AI generation and publish flow arrive in CP-11/12)
--
-- Reality (spec §UC-1): direct API posting to LinkedIn/Indeed requires partner
-- approval, so most channels start in ASSISTED mode — the AI writes the post and
-- HR copies it across. `supports_api` marks the ones a future OAuth flow could
-- publish to directly. Assisted mode needs no tokens; the *_cipher columns are a
-- placeholder for OAuth secrets (stored encrypted) when that lands at go-live.
-- =============================================================================

create table public.channels (
  key             text primary key check (key ~ '^[a-z0-9_]+$'),
  name            text    not null,
  category        text    not null, -- 'job_board' | 'social' | 'internal'
  supports_api    boolean not null default false,
  -- Capability hints, used by AI post generation (CP-11) to tune each variant.
  max_title_length int,
  max_body_length  int,
  supports_media   boolean not null default false,
  brand_color      text,
  website          text,
  sort_order       int     not null default 0
);

create type connection_mode   as enum ('assisted', 'oauth');
create type connection_status as enum ('connected', 'expired', 'disconnected');

create table public.channel_connections (
  id                   uuid              primary key default gen_random_uuid(),
  organization_id      uuid              not null references public.organizations(id) on delete cascade,
  channel_key          text              not null references public.channels(key) on delete cascade,
  mode                 connection_mode   not null default 'assisted',
  status               connection_status not null default 'connected',
  display_name         text,
  -- OAuth secrets (future) — stored as ciphertext; null in assisted mode.
  access_token_cipher  text,
  refresh_token_cipher text,
  token_expires_at     timestamptz,
  connected_by         uuid              references public.memberships(id) on delete set null,
  connected_at         timestamptz       not null default now(),
  disconnected_at      timestamptz,
  created_at           timestamptz       not null default now(),
  updated_at           timestamptz       not null default now(),
  unique (organization_id, channel_key)
);

create index channel_connections_org_idx on public.channel_connections (organization_id, status);

create trigger channel_connections_set_updated_at
  before update on public.channel_connections
  for each row execute function public.set_updated_at();

create type posting_status as enum ('draft', 'scheduled', 'published', 'failed', 'closed');

create table public.job_postings (
  id              uuid           primary key default gen_random_uuid(),
  organization_id uuid           not null references public.organizations(id) on delete cascade,
  job_opening_id  uuid           not null references public.job_openings(id) on delete cascade,
  channel_key     text           not null references public.channels(key) on delete cascade,
  title           text,
  body            text,
  seo_score       int,
  status          posting_status not null default 'draft',
  external_url    text,
  external_id     text,
  scheduled_for   timestamptz,
  published_at    timestamptz,
  error           text,
  created_by      uuid           references public.memberships(id) on delete set null,
  created_at      timestamptz    not null default now(),
  updated_at      timestamptz    not null default now(),
  unique (job_opening_id, channel_key)
);

create index job_postings_opening_idx on public.job_postings (job_opening_id);
create index job_postings_org_idx     on public.job_postings (organization_id, status);

create trigger job_postings_set_updated_at
  before update on public.job_postings
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.channels            enable row level security;
alter table public.channel_connections enable row level security;
alter table public.job_postings        enable row level security;
alter table public.channel_connections force row level security;
alter table public.job_postings        force row level security;

-- channels — global catalogue: readable by any authenticated user, writable by
-- nobody (vendor-defined, changed only by migration).
create policy channels_select on public.channels
  for select to authenticated using (true);

-- channel_connections — view with integrations.view; mutate with connect/disconnect.
create policy channel_connections_select on public.channel_connections
  for select to authenticated
  using (organization_id = public.current_org_id() and public.has_permission('integrations.view'));

create policy channel_connections_write on public.channel_connections
  for all to authenticated
  using (
    organization_id = public.current_org_id()
    and (public.has_permission('integrations.connect') or public.has_permission('integrations.disconnect'))
  )
  with check (
    organization_id = public.current_org_id()
    and (public.has_permission('integrations.connect') or public.has_permission('integrations.disconnect'))
  );

-- job_postings — visible with job_openings.view (via the opening); managed with publish/post_generation.
create policy job_postings_select on public.job_postings
  for select to authenticated
  using (
    organization_id = public.current_org_id()
    and exists (select 1 from public.job_openings o where o.id = job_opening_id)
  );

create policy job_postings_write on public.job_postings
  for all to authenticated
  using (
    organization_id = public.current_org_id()
    and exists (select 1 from public.job_openings o where o.id = job_opening_id)
    and (public.has_permission('post_generation.generate') or public.has_permission('job_openings.publish'))
  )
  with check (
    organization_id = public.current_org_id()
    and exists (select 1 from public.job_openings o where o.id = job_opening_id)
  );

-- -----------------------------------------------------------------------------
-- Seed the channel catalogue.
-- supports_api is false for the external boards until a partner OAuth flow is
-- approved (go-live); careers_page is our own public apply surface, always on.
-- -----------------------------------------------------------------------------
insert into public.channels (key, name, category, supports_api, max_title_length, max_body_length, supports_media, brand_color, website, sort_order) values
  ('careers_page', 'Careers Page', 'internal',  true,  120, 20000, true,  '#e43a38', null,               10),
  ('linkedin',     'LinkedIn',     'job_board', false, 150, 3000,  true,  '#0a66c2', 'https://linkedin.com', 20),
  ('indeed',       'Indeed',       'job_board', false, 120, 5000,  false, '#003a9b', 'https://indeed.com',   30),
  ('rozee',        'Rozee.pk',     'job_board', false, 120, 5000,  false, '#f7941e', 'https://rozee.pk',     40),
  ('glassdoor',    'Glassdoor',    'job_board', false, 120, 5000,  false, '#0caa41', 'https://glassdoor.com',50),
  ('bayt',         'Bayt',         'job_board', false, 120, 5000,  false, '#2a9d8f', 'https://bayt.com',     60),
  ('facebook',     'Facebook Jobs','social',    false, 100, 5000,  true,  '#1877f2', 'https://facebook.com', 70),
  ('twitter',      'X (Twitter)',  'social',    false, 0,   280,   true,  '#111111', 'https://x.com',        80)
on conflict (key) do update set
  name = excluded.name, category = excluded.category, supports_api = excluded.supports_api,
  max_title_length = excluded.max_title_length, max_body_length = excluded.max_body_length,
  supports_media = excluded.supports_media, brand_color = excluded.brand_color,
  website = excluded.website, sort_order = excluded.sort_order;

grant select, insert, update, delete on public.channel_connections to authenticated, service_role;
grant select, insert, update, delete on public.job_postings to authenticated, service_role;
grant select on public.channels to anon, authenticated, service_role;
