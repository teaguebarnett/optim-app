-- Phase 6.0A — Production Foundation.
--
-- Private Storage buckets for progress/client media, chat attachments, and
-- staged import source files. No bucket here is public. Object paths are
-- always {workspace_id}/{client_or_batch_id}/{filename} — server-validated
-- at write time by lib/production/storage.ts (never taken as-is from a
-- client-supplied path), and independently re-validated here at the
-- database layer since RLS must never trust a client-supplied path segment
-- on its own.

insert into storage.buckets (id, name, public)
values
  ('progress-media', 'progress-media', false),
  ('chat-attachments', 'chat-attachments', false),
  ('import-sources', 'import-sources', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- progress-media / chat-attachments — client-owned objects. Path shape:
-- {workspace_id}/{client_profile_id}/{filename}. Readable/writable by the
-- client themselves, their assigned coach, or a workspace admin — exactly
-- app_private.can_access_client, the same predicate every client-owned
-- table's SELECT policy already uses, plus a check that the path's own
-- workspace segment actually matches that client's real workspace (never
-- trust the path string alone).
-- ---------------------------------------------------------------------------
create policy client_media_select on storage.objects for select to authenticated
  using (
    bucket_id in ('progress-media', 'chat-attachments')
    and app_private.can_access_client(((storage.foldername(name))[2])::uuid)
    and (storage.foldername(name))[1] = app_private.client_workspace_id(((storage.foldername(name))[2])::uuid)::text
  );

create policy client_media_insert on storage.objects for insert to authenticated
  with check (
    bucket_id in ('progress-media', 'chat-attachments')
    and app_private.can_access_client(((storage.foldername(name))[2])::uuid)
    and (storage.foldername(name))[1] = app_private.client_workspace_id(((storage.foldername(name))[2])::uuid)::text
  );

create policy client_media_delete on storage.objects for delete to authenticated
  using (
    bucket_id in ('progress-media', 'chat-attachments')
    and app_private.can_access_client(((storage.foldername(name))[2])::uuid)
    and (storage.foldername(name))[1] = app_private.client_workspace_id(((storage.foldername(name))[2])::uuid)::text
  );

-- ---------------------------------------------------------------------------
-- import-sources — staff-only, staging-private objects. Path shape:
-- {workspace_id}/{batch_id}/{filename}. Never visible to any client by
-- default, including the client a staged row eventually matches — there is
-- deliberately no can_access_client-style clause here at all.
-- ---------------------------------------------------------------------------
create policy import_sources_media_select on storage.objects for select to authenticated
  using (
    bucket_id = 'import-sources'
    and app_private.is_workspace_staff(((storage.foldername(name))[1])::uuid)
  );

create policy import_sources_media_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'import-sources'
    and app_private.is_workspace_staff(((storage.foldername(name))[1])::uuid)
  );

create policy import_sources_media_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'import-sources'
    and app_private.is_workspace_staff(((storage.foldername(name))[1])::uuid)
  );
