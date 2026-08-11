-- =============================================================================
-- 0026 · Company profile (admin → Company)
-- =============================================================================
-- Rounds out organizations with the brand + candidate-facing identity fields the
-- Company admin page edits. name / logo_url / industry / website / timezone /
-- currency / locale already exist (0002); this adds the descriptive, branding and
-- sender-identity columns. No RLS change: organizations_update (0006) already
-- gates every column on administration.manage_company_profile.
-- =============================================================================

alter table public.organizations
  add column if not exists tagline         text,
  add column if not exists description     text,
  add column if not exists brand_color     text,   -- hex, e.g. #4f46e5
  add column if not exists email_from_name text,   -- sender name on candidate emails
  add column if not exists email_reply_to  text,   -- reply-to address on candidate emails
  add column if not exists careers_url     text;

-- Keep colours sane: a hex triplet or nothing.
alter table public.organizations
  drop constraint if exists organizations_brand_color_hex;
alter table public.organizations
  add constraint organizations_brand_color_hex
  check (brand_color is null or brand_color ~ '^#[0-9a-fA-F]{6}$');
