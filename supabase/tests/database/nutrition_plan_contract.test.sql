-- Gate U3A — database compatibility of the nutrition plan contract: nutrition_plan_versions.content is jsonb with no
-- shape constraint, so method-based plans (no flat four-number targets) need NO migration. This proves both shapes
-- store, publish (immutability trigger), assign through the real atomic function and read back for the client —
-- and that legacy content is untouched. Same fixture conventions as program_publication_and_activity.test.sql.

begin;
select plan(8);

set local role postgres;

insert into auth.users (id, email) values
  ('10000000-0000-0000-0000-000000000001', 'coach-a@example.test'),
  ('10000000-0000-0000-0000-000000000003', 'client-a@example.test');
insert into public.workspaces (id, owner_user_id, display_name, business_name) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Workspace A', 'Workspace A');
insert into public.workspace_memberships (workspace_id, user_id, role) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'workspace_owner'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'client');
insert into public.client_profiles (id, workspace_id, user_id, display_name) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'Client A');
insert into public.coach_client_assignments (workspace_id, coach_user_id, client_profile_id, is_primary) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', true);
insert into public.nutrition_plans (id, workspace_id, created_by, title) values
  ('70000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Nutrition');

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';

select lives_ok(
  $$ insert into public.nutrition_plan_versions (id, plan_id, workspace_id, version_number, status, content, created_by) values
     ('80000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 1, 'draft',
      '{"id":"legacy","targets":{"calories":2400,"proteinG":180,"carbsG":250,"fatG":75},"usesTrainingRestSplit":false,"approvedAtIso":""}'::jsonb,
      '10000000-0000-0000-0000-000000000001') $$,
  'coach: a legacy four-number plan stores as a draft (unchanged)'
);
select lives_ok(
  $$ insert into public.nutrition_plan_versions (id, plan_id, workspace_id, version_number, status, content, created_by) values
     ('80000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 2, 'draft',
      '{"id":"method","targets":null,"method":{"schema":1,"approach":"calories_protein","energyMode":"target","prescribed":{"calories":2400,"proteinG":180,"carbsG":null,"fatG":null}},"usesTrainingRestSplit":false,"approvedAtIso":""}'::jsonb,
      '10000000-0000-0000-0000-000000000001') $$,
  'coach: a calories-and-protein method plan (no carbs/fat, no flat targets) stores as a draft — no migration needed'
);
select lives_ok(
  $$ update public.nutrition_plan_versions set status = 'published', published_by = '10000000-0000-0000-0000-000000000001', published_at = now()
     where id = '80000000-0000-0000-0000-000000000002' $$,
  'coach: the method plan publishes'
);
select throws_ok(
  $$ update public.nutrition_plan_versions set content = '{"id":"tampered"}'::jsonb where id = '80000000-0000-0000-0000-000000000002' $$,
  null, null, 'a published method plan is immutable (existing trigger applies to the new shape)'
);
select lives_ok(
  $$ select public.assign_active_nutrition_plan_version('30000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000002') $$,
  'coach: the real atomic assign function accepts the method plan'
);

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}';
select is(
  (select content->'method'->>'approach' from public.nutrition_plan_versions where id = '80000000-0000-0000-0000-000000000002'),
  'calories_protein', 'client: reads the assigned method plan'
);
select ok(
  (select content->'method'->'prescribed'->'carbsG' = 'null'::jsonb and content->'targets' = 'null'::jsonb from public.nutrition_plan_versions where id = '80000000-0000-0000-0000-000000000002'),
  'client: carbs are stored as not prescribed (null), never a number'
);
select is(
  (select count(*) from public.nutrition_plan_versions where id = '80000000-0000-0000-0000-000000000001')::int,
  0, 'client: the unassigned legacy draft stays invisible (existing RLS unchanged)'
);

select * from finish();
rollback;
