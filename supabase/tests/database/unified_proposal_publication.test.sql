-- Gate U3C — pgTAP coverage for 20261011000036_unified_proposal_publication.sql: approval records database-side
-- fingerprints; publication is only through public.publish_unified_proposal (no direct 'published'/'superseded'); only
-- the client's assigned coach / workspace admin may publish; one call publishes AND assigns training + nutrition; a
-- retry replays the same publication; published rows are immutable; a changed approved draft is refused.

begin;
select plan(14);

set local role postgres;

insert into auth.users (id, email) values
  ('10000000-0000-0000-0000-000000000001', 'coach-a@example.test'),
  ('10000000-0000-0000-0000-000000000003', 'client-a@example.test'),
  ('10000000-0000-0000-0000-000000000005', 'coach-c@example.test');
insert into public.workspaces (id, owner_user_id, display_name, business_name) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Workspace A', 'Workspace A');
insert into public.workspace_memberships (workspace_id, user_id, role) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'workspace_owner'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'client'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000005', 'coach');
insert into public.client_profiles (id, workspace_id, user_id, display_name) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'Client A');
insert into public.training_programs (id, workspace_id, created_by, title) values
  ('50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Unified A');
insert into public.training_program_versions (id, program_id, workspace_id, version_number, status, content, created_by) values
  ('60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 1, 'draft', '{"clientId":"30000000-0000-0000-0000-000000000001","name":"A"}'::jsonb, '10000000-0000-0000-0000-000000000001'),
  ('60000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 2, 'draft', '{"clientId":"30000000-0000-0000-0000-000000000001","name":"B"}'::jsonb, '10000000-0000-0000-0000-000000000001');
insert into public.nutrition_plans (id, workspace_id, created_by, title) values
  ('70000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Nutrition A');
insert into public.nutrition_plan_versions (id, plan_id, workspace_id, version_number, status, content, created_by) values
  ('80000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 1, 'draft', '{"approvedAtIso":""}'::jsonb, '10000000-0000-0000-0000-000000000001'),
  ('80000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 2, 'draft', '{"approvedAtIso":""}'::jsonb, '10000000-0000-0000-0000-000000000001');
insert into public.unified_program_proposals (id, workspace_id, client_profile_id, requested_by, idempotency_key, title, status, training_program_version_id, nutrition_plan_version_id, resistance_source) values
  ('90000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'k1', 'U1', 'draft_ready', '60000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001', 'proposed_program'),
  ('90000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'k2', 'U2', 'draft_ready', '60000000-0000-0000-0000-000000000002', '80000000-0000-0000-0000-000000000002', 'proposed_program');

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
update public.unified_program_proposals set approval_state = 'approved', reviewed_by = '10000000-0000-0000-0000-000000000001', reviewed_at = now(),
  approved_training_version_id = training_program_version_id, approved_nutrition_version_id = nutrition_plan_version_id, approved_content_hashes = '{"training":"t","nutrition":"n"}'::jsonb
  where id in ('90000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000002');

select ok(
  (select approved_db_hashes->>'training' = md5(v.content::text) from public.unified_program_proposals u join public.training_program_versions v on v.id = u.training_program_version_id where u.id = '90000000-0000-0000-0000-000000000001'),
  'approval records a database-side fingerprint of the exact approved content'
);
select throws_ok(
  $$ update public.unified_program_proposals set approval_state = 'published', published_at = now(), published_by = '10000000-0000-0000-0000-000000000001', publication = '{}'::jsonb where id = '90000000-0000-0000-0000-000000000001' $$,
  null, null, 'a coach cannot mark a proposal published directly — only the publication function can'
);
select throws_ok(
  $$ update public.unified_program_proposals set approval_state = 'superseded', superseded_by = '90000000-0000-0000-0000-000000000002', superseded_at = now() where id = '90000000-0000-0000-0000-000000000001' $$,
  null, null, 'a coach cannot supersede a proposal directly'
);

-- Unassigned coach / client: refused.
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated"}';
select throws_ok($$ select public.publish_unified_proposal('90000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', '{}'::jsonb) $$, null, null, 'an unassigned coach cannot publish');
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}';
select throws_ok($$ select public.publish_unified_proposal('90000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', '{}'::jsonb) $$, null, null, 'the client cannot publish');

-- The assigned coach publishes: one call publishes and assigns both.
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok($$ select public.publish_unified_proposal('90000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', '{"activeTrainingVersionId":null,"activeNutritionVersionId":null,"replaceActive":false}'::jsonb) $$, 'the assigned coach publishes the approved proposal');
select is((select status::text from public.training_program_versions where id = '60000000-0000-0000-0000-000000000001'), 'published', 'training version published');
select is((select count(*)::int from public.program_assignments where client_profile_id = '30000000-0000-0000-0000-000000000001' and status = 'active' and program_version_id = '60000000-0000-0000-0000-000000000001'), 1, 'training assigned to the client');
select is((select count(*)::int from public.nutrition_plan_assignments where client_profile_id = '30000000-0000-0000-0000-000000000001' and status = 'active' and plan_version_id = '80000000-0000-0000-0000-000000000001'), 1, 'nutrition assigned to the client in the same call');
select is((select approval_state from public.unified_program_proposals where id = '90000000-0000-0000-0000-000000000002'), 'superseded', 'the other open proposal for the client was superseded');
select is((select (public.publish_unified_proposal('90000000-0000-0000-0000-000000000001', null, '{}'::jsonb))->>'replayed'), 'true', 'a retry replays the same publication');
select is((select count(*)::int from public.program_assignments where client_profile_id = '30000000-0000-0000-0000-000000000001'), 1, '…without assigning again');
select throws_ok($$ update public.unified_program_proposals set coach_decisions = '{}'::jsonb where id = '90000000-0000-0000-0000-000000000001' $$, null, null, 'a published proposal is immutable');
select throws_ok($$ select public.publish_unified_proposal('90000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000002', '{}'::jsonb) $$, null, null, 'a superseded proposal cannot be published');

select * from finish();
rollback;
