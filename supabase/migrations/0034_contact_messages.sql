-- =============================================================================
-- 0034 · Landing-page contact messages
-- =============================================================================
-- Enquiries submitted from the public marketing site. Not org-scoped (the sender
-- is an anonymous visitor). Writes go through the service role in a server action;
-- the message is also emailed onward. RLS denies everything by default — only the
-- service role touches this table — so nothing leaks to authenticated users.
-- =============================================================================

create table public.contact_messages (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null,
  email      citext      not null,
  subject    text,
  message    text        not null,
  handled    boolean     not null default false,
  created_at timestamptz not null default now()
);

create index contact_messages_created_idx on public.contact_messages (created_at desc);

alter table public.contact_messages enable row level security;
alter table public.contact_messages force row level security;
-- No policies: deny all by default. The server action uses the service role,
-- which bypasses RLS, and is the only writer/reader.

grant select, insert, update on public.contact_messages to service_role;
