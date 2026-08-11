-- =============================================================================
-- 0030 · Company logo storage (admin → Company)
-- =============================================================================
-- A PUBLIC bucket for organisation branding — the logo is shown on
-- candidate-facing careers pages and job posts, so it's served by public URL.
-- Uploads are still restricted: only a member with manage_company_profile may
-- write, and only under their own org's folder.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'org-branding',
  'org-branding',
  true,
  2097152, -- 2 MB
  array['image/png', 'image/jpeg', 'image/svg+xml']
)
on conflict (id) do nothing;

-- Public read (bucket is public; explicit policy covers the authenticated API too).
create policy "org branding readable"
  on storage.objects for select
  using (bucket_id = 'org-branding');

create policy "org branding writable by admins"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'org-branding'
    and (storage.foldername(name))[1] = public.current_org_id()::text
    and public.has_permission('administration.manage_company_profile')
  );

create policy "org branding updatable by admins"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'org-branding'
    and (storage.foldername(name))[1] = public.current_org_id()::text
    and public.has_permission('administration.manage_company_profile')
  );

create policy "org branding deletable by admins"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'org-branding'
    and (storage.foldername(name))[1] = public.current_org_id()::text
    and public.has_permission('administration.manage_company_profile')
  );
