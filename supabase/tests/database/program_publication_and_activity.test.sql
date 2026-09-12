-- Phase 6.0B — Persist the Complete Revenue Loop.
--
-- pgTAP coverage for 20260909000011_program_publication_and_activity.sql:
-- the draft-visibility gap fix, the two atomic assign_active_* functions,
-- and daily_records isolation. Same fixture-id convention and
-- set-local-role/request.jwt.claims mechanism as
-- rls_isolation.test.sql — see that file's own header for why this proves
-- the real policies rather than standing in for them.

begin;
select plan(29);

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

insert into public.client_profiles (id, workspace_id, user_id, display_name) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'Client A'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000004', 'Client B');

insert into public.coach_client_assignments (workspace_id, coach_user_id, client_profile_id, is_primary) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', true),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', true);

insert into public.training_programs (id, workspace_id, created_by, title) values
  ('50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Program A');

insert into public.training_program_versions (id, program_id, workspace_id, version_number, status, content, created_by) values
  ('60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 1, 'draft', '{"id":"p1"}'::jsonb, '10000000-0000-0000-0000-000000000001');

-- ---------------------------------------------------------------------------
-- 1. Draft content is invisible to the client, and cannot be assigned while
--    still a draft — the exact gap 20260909000011 closes.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}';

select is(
  (select count(*) from public.training_program_versions where id = '60000000-0000-0000-0000-000000000001')::int,
  0,
  'client A: cannot see a draft version at all (not staff, not yet assigned)'
);

select throws_ok(
  $$ insert into public.program_assignments (workspace_id, client_profile_id, program_version_id, assigned_by, status)
     values ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'active') $$,
  null, null, 'client A: cannot self-assign any version at all (not staff)'
);

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';

select throws_ok(
  $$ insert into public.program_assignments (workspace_id, client_profile_id, program_version_id, assigned_by, status)
     values ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'active') $$,
  null, null, 'coach A: cannot directly INSERT an assignment pointing at a still-draft version'
);

select throws_ok(
  $$ select public.assign_active_program_version('30000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001') $$,
  null, null, 'coach A: assign_active_program_version also rejects an unpublished version'
);

-- ---------------------------------------------------------------------------
-- 2. Publish, then assign via the real atomic function — succeeds, and the
--    client now genuinely sees exactly this version's content.
-- ---------------------------------------------------------------------------
update public.training_program_versions set status = 'published', published_by = '10000000-0000-0000-0000-000000000001', published_at = now()
where id = '60000000-0000-0000-0000-000000000001';

select lives_ok(
  $$ select public.assign_active_program_version('30000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001') $$,
  'coach A: assign_active_program_version succeeds once the version is published'
);

select is(
  (select status::text from public.program_assignments where client_profile_id = '30000000-0000-0000-0000-000000000001' and program_version_id = '60000000-0000-0000-0000-000000000001'),
  'active',
  'the new assignment is active'
);

select is(
  (select count(*) from public.publication_events where entity_id = '60000000-0000-0000-0000-000000000001' and event_type = 'activated')::int,
  1,
  'assign_active_program_version writes exactly one publication_events row'
);

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}';
select is(
  (select content->>'id' from public.training_program_versions where id = '60000000-0000-0000-0000-000000000001'),
  'p1',
  'client A: now genuinely sees the published, assigned version''s real content'
);

-- ---------------------------------------------------------------------------
-- 3. A second publish+assign replaces the first — exactly one active row
--    ever exists for this client, never two.
-- ---------------------------------------------------------------------------
set local role postgres;
insert into public.training_program_versions (id, program_id, workspace_id, version_number, status, content, created_by) values
  ('60000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 2, 'published', '{"id":"p2"}'::jsonb, '10000000-0000-0000-0000-000000000001');

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';

select lives_ok(
  $$ select public.assign_active_program_version('30000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002') $$,
  'coach A: assigning a second published version succeeds'
);

select is(
  (select count(*) from public.program_assignments where client_profile_id = '30000000-0000-0000-0000-000000000001' and status = 'active')::int,
  1,
  'exactly one active program_assignment exists for client A after the replacement'
);

select is(
  (select status::text from public.program_assignments where program_version_id = '60000000-0000-0000-0000-000000000001'),
  'replaced',
  'the original assignment was retired to replaced, not left active or deleted'
);

-- ---------------------------------------------------------------------------
-- 4. Cross-client / cross-workspace isolation for the new function and the
--    assignment it created.
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}';

select is(
  (select count(*) from public.program_assignments where client_profile_id = '30000000-0000-0000-0000-000000000001')::int,
  0,
  'client B: sees zero of client A''s program_assignments'
);

select throws_ok(
  $$ select public.assign_active_program_version('30000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002') $$,
  null, null, 'client B: cannot call assign_active_program_version for client A at all (not authorized to manage them)'
);

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}';

select throws_ok(
  $$ select public.assign_active_program_version('30000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002') $$,
  null, null, 'coach B (unrelated workspace): cannot assign anything to client A'
);

-- ---------------------------------------------------------------------------
-- 5. daily_records — client-authored, coach-readable, cross-client/
--    cross-workspace denied.
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}';

select lives_ok(
  $$ insert into public.daily_records (workspace_id, client_profile_id, date_iso, content)
     values ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '2026-09-09', '{"training":{"workingSetsCompleted":3},"nutrition":{}}'::jsonb) $$,
  'client A: can insert their own daily_records row'
);

select lives_ok(
  $$ update public.daily_records set content = '{"training":{"workingSetsCompleted":5},"nutrition":{}}'::jsonb
     where client_profile_id = '30000000-0000-0000-0000-000000000001' and date_iso = '2026-09-09' $$,
  'client A: can update their own daily_records row (same-day re-log)'
);

select throws_ok(
  $$ insert into public.daily_records (workspace_id, client_profile_id, date_iso, content)
     values ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', '2026-09-09', '{}'::jsonb) $$,
  null, null, 'client A: cannot insert a daily_records row for client B'
);

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';

select is(
  (select (content->'training'->>'workingSetsCompleted')::int from public.daily_records where client_profile_id = '30000000-0000-0000-0000-000000000001'),
  5,
  'coach A (assigned): can read client A''s real logged activity'
);

select throws_ok(
  $$ insert into public.daily_records (workspace_id, client_profile_id, date_iso, content)
     values ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '2026-09-10', '{}'::jsonb) $$,
  null, null, 'coach A: cannot write a daily_records row for their own client (client-authored only)'
);

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}';

select is(
  (select count(*) from public.daily_records where client_profile_id = '30000000-0000-0000-0000-000000000001')::int,
  0,
  'client B: sees zero of client A''s daily_records'
);

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}';

select is(
  (select count(*) from public.daily_records where client_profile_id = '30000000-0000-0000-0000-000000000001')::int,
  0,
  'coach B (unrelated workspace): sees zero of client A''s daily_records'
);

select throws_ok(
  $$ delete from public.daily_records where client_profile_id = '30000000-0000-0000-0000-000000000001' $$,
  null, null, 'no one (not even an assigned coach) can delete a daily_records row — DELETE grant revoked entirely'
);

-- ---------------------------------------------------------------------------
-- 6. Anonymous — zero access to any of this new schema.
-- ---------------------------------------------------------------------------
set local role anon;
reset request.jwt.claims;

select throws_ok(
  $$ select count(*) from public.daily_records $$,
  '42501', null, 'anon: cannot select daily_records at all (no grant)'
);

select throws_ok(
  $$ select public.assign_active_program_version('30000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002') $$,
  null, null, 'anon: cannot call assign_active_program_version at all (no execute grant)'
);

-- ---------------------------------------------------------------------------
-- 7. REGRESSION GUARD (Phase 6.0D-B live-verification correction) —
--    nutrition_plan_versions publishing. prevent_published_version_mutation
--    (this migration's own trigger, both tables) used to reference
--    new.program_id/old.program_id unconditionally, a column
--    nutrition_plan_versions doesn't have — publishing ANY nutrition plan
--    version always raised `record "new" has no field "program_id"`, live-
--    confirmed and fixed by 20260911000016_fix_version_immutability_trigger.sql.
--    Never previously covered by any pgTAP or live E2E test.
-- ---------------------------------------------------------------------------
set local role postgres;
insert into public.nutrition_plans (id, workspace_id, created_by, title) values
  ('70000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Nutrition Plan A');

insert into public.nutrition_plan_versions (id, plan_id, workspace_id, version_number, status, content, created_by) values
  ('80000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 1, 'draft', '{"id":"n1","targets":{"calories":2200,"proteinG":160,"carbsG":220,"fatG":70},"usesTrainingRestSplit":false}'::jsonb, '10000000-0000-0000-0000-000000000001');

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}';

select is(
  (select count(*) from public.nutrition_plan_versions where id = '80000000-0000-0000-0000-000000000001')::int,
  0,
  'client A: cannot see a draft nutrition plan version at all'
);

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';

select lives_ok(
  $$ update public.nutrition_plan_versions set status = 'published', published_by = '10000000-0000-0000-0000-000000000001', published_at = now()
     where id = '80000000-0000-0000-0000-000000000001' $$,
  'coach A: publishing a nutrition plan version succeeds — the actual regression this migration fixes (was: record "new" has no field "program_id")'
);

select lives_ok(
  $$ select public.assign_active_nutrition_plan_version('30000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001') $$,
  'coach A: assign_active_nutrition_plan_version succeeds once published'
);

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}';

select is(
  (select content->>'id' from public.nutrition_plan_versions where id = '80000000-0000-0000-0000-000000000001'),
  'n1',
  'client A: now sees the real assigned nutrition plan content'
);

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';

select throws_ok(
  $$ update public.nutrition_plan_versions set content = '{"id":"n1-tampered"}'::jsonb where id = '80000000-0000-0000-0000-000000000001' $$,
  null, null, 'coach A: cannot modify a published nutrition plan version''s content — immutability trigger still enforces this correctly for THIS table too'
);

select finish();
rollback;
