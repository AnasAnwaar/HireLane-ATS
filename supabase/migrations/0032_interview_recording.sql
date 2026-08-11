-- =============================================================================
-- 0032 · Interview recording + transcription (spec §UC-7, CP-22)
-- =============================================================================
-- The live call runs in an external tool, so its recording is uploaded here
-- (consent-gated) rather than captured by a media server. Gemini transcribes it.
--
--   recording_consent      recorded consent before any recording is stored
--   recording_path         the uploaded file in the private bucket
--   transcript             the AI transcript
-- =============================================================================

alter table public.interviews
  add column if not exists recording_consent      boolean not null default false,
  add column if not exists recording_path         text,
  add column if not exists recording_uploaded_at  timestamptz,
  add column if not exists transcript             text;

-- Private bucket for recordings. Writes need interviews.enable_recording; reads
-- need interviews.view_recording; both scoped to the org's own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'interview-recordings',
  'interview-recordings',
  false,
  524288000, -- 500 MB
  array['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/wav', 'audio/webm',
        'video/mp4', 'video/webm']
)
on conflict (id) do nothing;

create policy "interview recordings readable"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'interview-recordings'
    and (storage.foldername(name))[1] = public.current_org_id()::text
    and public.has_permission('interviews.view_recording')
  );

create policy "interview recordings writable"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'interview-recordings'
    and (storage.foldername(name))[1] = public.current_org_id()::text
    and public.has_permission('interviews.enable_recording')
  );

create policy "interview recordings deletable"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'interview-recordings'
    and (storage.foldername(name))[1] = public.current_org_id()::text
    and public.has_permission('interviews.enable_recording')
  );
