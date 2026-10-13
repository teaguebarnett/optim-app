-- pgTAP coverage for 20261013000038_coach_intake_corrections.sql: the assigned coach corrects or clears an onboarding
-- answer through correct_client_intake_answer; the client's own answers are never changed; the original value, who,
-- when and why are recorded (with history); nobody else — the client included — can write corrections.

begin;
select plan(10);

set local role postgres;

insert into auth.users (id, email) values
  ('10000000-0000-0000-0000-000000000001', 'coach-a@example.test'),
  ('10000000-0000-0000-0000-000000000002', 'coach-b@example.test'),
  ('10000000-0000-0000-0000-000000000003', 'client-a@example.test');
insert into public.workspaces (id, owner_user_id, display_name, business_name) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Workspace A', 'Workspace A'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'Workspace B', 'Workspace B');
insert into public.workspace_memberships (workspace_id, user_id, role) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'workspace_owner'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'workspace_owner'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'client');
insert into public.client_profiles (id, workspace_id, user_id, display_name) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'Client A');
insert into public.client_onboarding_progress (workspace_id, client_profile_id, current_step_index, answers, completed_at) values
  ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 6, '{"what_you_want":{"primaryGoal":"get_stronger","targetWeight":80}}'::jsonb, now());

-- The assigned coach.
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';

select lives_ok($$ select public.correct_client_intake_answer('30000000-0000-0000-0000-000000000001', 'what_you_want', 'targetWeight', '185'::jsonb, 'Client confirmed 185 lb by message') $$, 'the assigned coach can correct an answer');
select is((select coach_intake_corrections #>> '{what_you_want.targetWeight,value}' from public.client_onboarding_progress where client_profile_id = '30000000-0000-0000-0000-000000000001'), '185', 'the corrected value is recorded');
select is((select coach_intake_corrections #>> '{what_you_want.targetWeight,original}' from public.client_onboarding_progress where client_profile_id = '30000000-0000-0000-0000-000000000001'), '80', 'the client''s original value is recorded');
select is((select answers #>> '{what_you_want,targetWeight}' from public.client_onboarding_progress where client_profile_id = '30000000-0000-0000-0000-000000000001'), '80', 'the client''s own answers are unchanged');
select lives_ok($$ select public.correct_client_intake_answer('30000000-0000-0000-0000-000000000001', 'what_you_want', 'targetWeight', null, 'Not a weight goal — clear it') $$, 'the coach can clear an answer');
select ok((select (coach_intake_corrections #>> '{what_you_want.targetWeight,cleared}')::boolean and jsonb_array_length(coach_intake_corrections -> 'what_you_want.targetWeight' -> 'history') = 1 from public.client_onboarding_progress where client_profile_id = '30000000-0000-0000-0000-000000000001'), 'clearing is recorded, and the earlier correction stays in the history');
select throws_like($$ select public.correct_client_intake_answer('30000000-0000-0000-0000-000000000001', 'what_you_want', 'targetWeight', '185'::jsonb, '  ') $$, '%reason%', 'a reason is required');

-- A coach from another workspace.
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}';
select throws_like($$ select public.correct_client_intake_answer('30000000-0000-0000-0000-000000000001', 'what_you_want', 'targetWeight', '90'::jsonb, 'x') $$, '%not authorized%', 'another workspace''s coach cannot correct this client');

-- The client.
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}';
select throws_like($$ select public.correct_client_intake_answer('30000000-0000-0000-0000-000000000001', 'what_you_want', 'targetWeight', '90'::jsonb, 'x') $$, '%not authorized%', 'the client cannot correct their own intake through the coach function');
select throws_like($$ update public.client_onboarding_progress set coach_intake_corrections = '{}'::jsonb where client_profile_id = '30000000-0000-0000-0000-000000000001' $$, '%only be changed through correct_client_intake_answer%', 'nobody can rewrite corrections directly (the client''s own update included)');

select * from finish();
rollback;
