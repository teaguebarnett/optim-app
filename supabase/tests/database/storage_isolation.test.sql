-- Phase 6.0A — Production Foundation.
--
-- Storage policy allow/deny matrix (20260909000009_storage.sql). Same
-- STATUS as rls_isolation.test.sql: written, not yet executed — no local
-- Postgres available in this environment. Run via `supabase test db` once
-- the Supabase CLI/Docker are installed. Self-contained fixtures (does not
-- depend on rls_isolation.test.sql's fixtures — pgTAP runs each file in its
-- own transaction that rolls back at the end).

begin;
select plan(8);

set local role postgres;

insert into auth.users (id, email) values
  ('50000000-0000-0000-0000-000000000001', 'storage-coach-a@example.test'),
  ('50000000-0000-0000-0000-000000000002', 'storage-coach-b@example.test'),
  ('50000000-0000-0000-0000-000000000003', 'storage-client-a@example.test');

insert into public.workspaces (id, owner_user_id, display_name, business_name) values
  ('60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'Storage Workspace A', 'Storage Workspace A'),
  ('60000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000002', 'Storage Workspace B', 'Storage Workspace B');

insert into public.workspace_memberships (workspace_id, user_id, role) values
  ('60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'workspace_owner'),
  ('60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000003', 'client'),
  ('60000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000002', 'workspace_owner');

insert into public.client_profiles (id, workspace_id, user_id, display_name) values
  ('70000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000003', 'Storage Client A');

insert into public.coach_client_assignments (workspace_id, coach_user_id, client_profile_id) values
  ('60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001');

-- ---------------------------------------------------------------------------
-- Client A uploads their own progress photo — allowed.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"50000000-0000-0000-0000-000000000003","role":"authenticated"}';

select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     values ('progress-media', '60000000-0000-0000-0000-000000000001/70000000-0000-0000-0000-000000000001/photo1.jpg', '50000000-0000-0000-0000-000000000003') $$,
  'client A: can upload to their own progress-media path'
);

select is(
  (select count(*) from storage.objects where bucket_id = 'progress-media')::int,
  1,
  'client A: sees their own uploaded object'
);

-- Client A cannot upload into a path claiming to be Coach A's own admin path
-- with a mismatched workspace segment.
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     values ('progress-media', 'wrong-workspace-segment/70000000-0000-0000-0000-000000000001/spoof.jpg', '50000000-0000-0000-0000-000000000003') $$,
  null, null, 'client A: cannot upload with a workspace path segment that does not match their real workspace'
);

-- Client A cannot touch the staff-only import-sources bucket at all.
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     values ('import-sources', '60000000-0000-0000-0000-000000000001/some-batch/file.csv', '50000000-0000-0000-0000-000000000003') $$,
  null, null, 'client A: cannot upload into the staff-only import-sources bucket'
);

-- ---------------------------------------------------------------------------
-- Coach A (assigned) can read Client A's progress photo.
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"50000000-0000-0000-0000-000000000001","role":"authenticated"}';

select is(
  (select count(*) from storage.objects where bucket_id = 'progress-media')::int,
  1,
  'coach A: can see their assigned client''s progress-media object'
);

select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     values ('import-sources', '60000000-0000-0000-0000-000000000001/batch-1/intake.pdf', '50000000-0000-0000-0000-000000000001') $$,
  'coach A: can upload into their own workspace''s import-sources path'
);

-- ---------------------------------------------------------------------------
-- Coach B (unrelated workspace) sees and can touch none of Workspace A's
-- objects, in either bucket.
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"50000000-0000-0000-0000-000000000002","role":"authenticated"}';

select is(
  (select count(*) from storage.objects where bucket_id = 'progress-media')::int,
  0,
  'coach B: sees zero of Workspace A''s progress-media objects'
);

select is(
  (select count(*) from storage.objects where bucket_id = 'import-sources')::int,
  0,
  'coach B: sees zero of Workspace A''s import-sources objects'
);

select finish();
rollback;
