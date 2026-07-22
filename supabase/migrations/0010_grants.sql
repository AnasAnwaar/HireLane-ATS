-- =============================================================================
-- 0010 · Role grants
-- =============================================================================
-- RLS decides WHICH ROWS a role may touch. It does not grant access to the table
-- in the first place — that still needs SQL-standard GRANTs. Without these,
-- every query from the app fails with "permission denied for table ...",
-- regardless of how permissive the policies are.
--
-- Supabase normally applies default privileges to new tables in `public`, but
-- those are attached to the schema and are lost if it is ever recreated. Being
-- explicit here means the schema is self-contained and reproducible anywhere.
-- =============================================================================

grant usage on schema public to anon, authenticated, service_role;

-- `authenticated` gets full DML on every table; RLS is what actually constrains
-- it to the caller's own organisation.
grant select, insert, update, delete
  on all tables in schema public
  to authenticated;

grant select, insert, update, delete
  on all tables in schema public
  to service_role;

grant usage, select on all sequences in schema public to authenticated, service_role;

grant execute on all functions in schema public to anon, authenticated, service_role;

-- `anon` deliberately gets nothing beyond schema usage. No policy targets anon,
-- so a grant would be dead weight today and a liability the day one is added by
-- accident. Public-facing tables (the candidate application form, CP-7) will
-- grant themselves explicitly.

-- -----------------------------------------------------------------------------
-- Re-assert the append-only guarantee.
--
-- The blanket grant above would otherwise hand back the UPDATE/DELETE rights
-- that 0004 revoked. The triggers would still refuse, but a table whose
-- privileges say one thing and whose triggers say another is a trap for whoever
-- reads this next.
-- -----------------------------------------------------------------------------
revoke update, delete, truncate on public.audit_log
  from anon, authenticated, service_role;

-- Vendor-owned catalogues: readable by everyone, writable by nobody.
revoke insert, update, delete on public.permissions              from authenticated, service_role;
revoke insert, update, delete on public.permission_presets       from authenticated, service_role;
revoke insert, update, delete on public.permission_preset_roles  from authenticated, service_role;
revoke insert, update, delete on public.permission_preset_grants from authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Anything created by a later migration inherits the same treatment.
-- -----------------------------------------------------------------------------
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated, service_role;

alter default privileges in schema public
  grant usage, select on sequences to authenticated, service_role;

alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;
