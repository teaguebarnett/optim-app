-- Gate U2 — pgTAP coverage for 20261010000034_unified_program_proposals.sql: staff-only access and workspace
-- isolation, client invisibility, proposed-only state, single-flight and idempotency, link integrity (drafts only, same
-- workspace, same client), immutable ownership, and no delete. Same fixture-id convention and set-local-role /
-- request.jwt.claims mechanism as rls_isolation.test.sql.

begin;
select plan(23);

set local role postgres;

insert into auth.users (id, email) values
  ('10000000-0000-0000-0000-000000000001', 'coach-a@example.test'),
  ('10000000-0000-0000-0000-000000000002', 'coach-b@example.test'),
  ('10000000-0000-0000-0000-000000000003', 'client-a@example.test'),
  ('10000000-0000-0000-0000-000000000004', 'client-b@example.test');

insert into public.workspaces (id, owner_user_id, display_name, business_name) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Workspace A', 'Workspace A'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'Workspace B', 'Workspace B');

insert into public.workspace_memberships (workspace_id, user_id, role) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'workspace_owner'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'client'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'workspace_owner'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000004', 'client');

insert into public.client_profiles (id, workspace_id, user_id, invited_email, display_name) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', null, 'Client A'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000004', null, 'Client B'),
  ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', null, 'a2@example.test', 'Client A2');

insert into public.training_programs (id, workspace_id, created_by, title) values
  ('50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Unified A'),
  ('50000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'Unified B');

insert into public.training_program_versions (id, program_id, workspace_id, version_number, status, content, created_by) values
  -- draft FOR client A
  ('60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 1, 'draft', '{"clientId":"30000000-0000-0000-0000-000000000001"}'::jsonb, '10000000-0000-0000-0000-000000000001'),
  -- draft for a DIFFERENT client (A2) in the same workspace
  ('60000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 2, 'draft', '{"clientId":"30000000-0000-0000-0000-000000000003"}'::jsonb, '10000000-0000-0000-0000-000000000001'),
  -- PUBLISHED version for client A
  ('60000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 3, 'published', '{"clientId":"30000000-0000-0000-0000-000000000001"}'::jsonb, '10000000-0000-0000-0000-000000000001'),
  -- draft in workspace B
  ('60000000-0000-0000-0000-000000000004', '50000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 1, 'draft', '{"clientId":"30000000-0000-0000-0000-000000000001"}'::jsonb, '10000000-0000-0000-0000-000000000002');

insert into public.nutrition_plans (id, workspace_id, created_by, title) values
  ('70000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Nutrition A');
insert into public.nutrition_plan_versions (id, plan_id, workspace_id, version_number, status, content, created_by) values
  ('80000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 1, 'draft', '{}'::jsonb, '10000000-0000-0000-0000-000000000001');

-- ---------------------------------------------------------------------------
-- Coach A (staff of workspace A)
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';

select lives_ok(
  $$ insert into public.unified_program_proposals (id, workspace_id, client_profile_id, requested_by, idempotency_key, title)
     values ('90000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'key-1', 'Unified') $$,
  'coach A: can start a preparing proposal for their client'
);
select throws_ok(
  $$ insert into public.unified_program_proposals (workspace_id, client_profile_id, requested_by, idempotency_key, title)
     values ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'key-2', 'Second') $$,
  null, null, 'single-flight: a second preparing proposal for the same client is refused'
);
select throws_ok(
  $$ insert into public.unified_program_proposals (workspace_id, client_profile_id, requested_by, idempotency_key, title, status)
     values ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'key-3', 'x', 'draft_ready') $$,
  null, null, 'a proposal can only be inserted as preparing'
);
select throws_ok(
  $$ insert into public.unified_program_proposals (workspace_id, client_profile_id, requested_by, idempotency_key, title, approval_state)
     values ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'key-3', 'x', 'approved') $$,
  null, null, 'approval_state can only be proposed (no approval in U2)'
);
select throws_ok(
  $$ insert into public.unified_program_proposals (workspace_id, client_profile_id, requested_by, idempotency_key, title)
     values ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', 'key-3', 'x') $$,
  null, null, 'requested_by must be the caller'
);
select throws_ok(
  $$ insert into public.unified_program_proposals (workspace_id, client_profile_id, requested_by, idempotency_key, title)
     values ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'key-x', 'x') $$,
  null, null, 'a client from another workspace can''t be named'
);

-- Link integrity.
select lives_ok(
  $$ update public.unified_program_proposals set training_program_version_id = '60000000-0000-0000-0000-000000000001', nutrition_plan_version_id = '80000000-0000-0000-0000-000000000001', status = 'draft_ready'
     where id = '90000000-0000-0000-0000-000000000001' $$,
  'links a draft training version FOR this client and a draft nutrition version, both in this workspace'
);
select throws_ok(
  $$ update public.unified_program_proposals set training_program_version_id = '60000000-0000-0000-0000-000000000002' where id = '90000000-0000-0000-0000-000000000001' $$,
  null, null, 'refuses a training draft for a different client'
);
select throws_ok(
  $$ update public.unified_program_proposals set training_program_version_id = '60000000-0000-0000-0000-000000000003' where id = '90000000-0000-0000-0000-000000000001' $$,
  null, null, 'refuses a PUBLISHED training version (drafts only)'
);
select throws_ok(
  $$ update public.unified_program_proposals set training_program_version_id = '60000000-0000-0000-0000-000000000004' where id = '90000000-0000-0000-0000-000000000001' $$,
  null, null, 'refuses a training draft from another workspace'
);
select throws_ok(
  $$ update public.unified_program_proposals set client_profile_id = '30000000-0000-0000-0000-000000000003' where id = '90000000-0000-0000-0000-000000000001' $$,
  null, null, 'ownership (client) is immutable'
);
select throws_ok(
  $$ update public.unified_program_proposals set idempotency_key = 'other' where id = '90000000-0000-0000-0000-000000000001' $$,
  null, null, 'the idempotency key is immutable'
);
select throws_ok(
  $$ update public.unified_program_proposals set approval_state = 'approved' where id = '90000000-0000-0000-0000-000000000001' $$,
  null, null, 'cannot be marked approved in U2'
);

-- Idempotency: the same key for the same client is unique.
select lives_ok(
  $$ insert into public.unified_program_proposals (workspace_id, client_profile_id, requested_by, idempotency_key, title)
     values ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'key-new', 'Next') $$,
  'once the first is no longer preparing, a new proposal (new key) can start'
);
select throws_ok(
  $$ update public.unified_program_proposals set status = 'failed' where idempotency_key = 'key-new';
     insert into public.unified_program_proposals (workspace_id, client_profile_id, requested_by, idempotency_key, title)
     values ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'key-1', 'Dup') $$,
  null, null, 'the same idempotency key can''t create a second row'
);

-- No delete.
select throws_ok(
  $$ delete from public.unified_program_proposals where id = '90000000-0000-0000-0000-000000000001' $$,
  null, null, 'proposal rows can''t be deleted (audit history)'
);

-- The linked versions stay drafts; nothing was assigned.
select is((select status::text from public.training_program_versions where id = '60000000-0000-0000-0000-000000000001'), 'draft', 'the linked training version is still a draft');
select is((select count(*) from public.program_assignments where client_profile_id = '30000000-0000-0000-0000-000000000001')::int, 0, 'no program assignment exists for the client');

-- ---------------------------------------------------------------------------
-- Coach B (other workspace) and client A see nothing.
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}';
select is((select count(*) from public.unified_program_proposals)::int, 0, 'coach B: sees no proposals from workspace A');
select lives_ok(
  $$ update public.unified_program_proposals set title = 'hijack' where id = '90000000-0000-0000-0000-000000000001' $$,
  'coach B: an update against workspace A''s proposal runs but matches no row (RLS)'
);

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}';
select is((select count(*) from public.unified_program_proposals)::int, 0, 'client A: can''t read proposals about themselves');

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select is((select title from public.unified_program_proposals where id = '90000000-0000-0000-0000-000000000001'), 'Unified', 'coach A: the title is unchanged by coach B''s attempt');

set local role anon;
select throws_ok($$ select count(*) from public.unified_program_proposals $$, null, null, 'anon: no access at all');

select * from finish();
rollback;
