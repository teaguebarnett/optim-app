-- Gate U3B — pgTAP coverage for 20261011000035_unified_proposal_review.sql: only the assigned coach / workspace admin
-- reviews; the recorded reviewer is the caller; approval binds the exact linked DRAFT versions + hashes and needs a
-- reviewable status; rejected/approved proposals are immutable; proposed rows carry no review fields; the client can't
-- write. Same fixture-id convention as unified_program_proposals.test.sql.

begin;
select plan(16);

set local role postgres;

insert into auth.users (id, email) values
  ('10000000-0000-0000-0000-000000000001', 'coach-a@example.test'),
  ('10000000-0000-0000-0000-000000000002', 'coach-b@example.test'),
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
  ('60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 1, 'draft', '{"clientId":"30000000-0000-0000-0000-000000000001"}'::jsonb, '10000000-0000-0000-0000-000000000001'),
  ('60000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 2, 'draft', '{"clientId":"30000000-0000-0000-0000-000000000001"}'::jsonb, '10000000-0000-0000-0000-000000000001'),
  ('60000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 3, 'draft', '{"clientId":"30000000-0000-0000-0000-000000000001"}'::jsonb, '10000000-0000-0000-0000-000000000001');
insert into public.nutrition_plans (id, workspace_id, created_by, title) values
  ('70000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Nutrition A');
insert into public.nutrition_plan_versions (id, plan_id, workspace_id, version_number, status, content, created_by) values
  ('80000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 1, 'draft', '{}'::jsonb, '10000000-0000-0000-0000-000000000001');

-- Three reviewable proposals (completed by the U2 flow), plus one incomplete.
insert into public.unified_program_proposals (id, workspace_id, client_profile_id, requested_by, idempotency_key, title, status, training_program_version_id, nutrition_plan_version_id) values
  ('90000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'k1', 'U1', 'draft_ready', '60000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001'),
  ('90000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'k2', 'U2', 'needs_coach_decision', '60000000-0000-0000-0000-000000000002', null),
  ('90000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'k3', 'U3', 'draft_ready', '60000000-0000-0000-0000-000000000003', null),
  ('90000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'k4', 'U4', 'incomplete', null, null);

-- --- Coach C: a coach in the workspace who is NOT assigned to this client --------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated"}';
select throws_ok(
  $$ update public.unified_program_proposals set coach_decisions = '{"k":{"answer":"x"}}'::jsonb where id = '90000000-0000-0000-0000-000000000001' $$,
  null, null, 'an unassigned coach cannot record decisions'
);
select throws_ok(
  $$ update public.unified_program_proposals set approval_state = 'rejected', reviewed_by = '10000000-0000-0000-0000-000000000005', reviewed_at = now() where id = '90000000-0000-0000-0000-000000000001' $$,
  null, null, 'an unassigned coach cannot reject'
);

-- --- Client A ------------------------------------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}';
update public.unified_program_proposals set approval_state = 'rejected' where id = '90000000-0000-0000-0000-000000000001';

-- --- Coach A (workspace owner) -----------------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select is((select approval_state from public.unified_program_proposals where id = '90000000-0000-0000-0000-000000000001'), 'proposed', 'the client cannot change a proposal (RLS: invisible, nothing updated)');
select lives_ok(
  $$ update public.unified_program_proposals set coach_decisions = '{"program:no_rest_day:abc":{"answer":"Keep 7 training days"}}'::jsonb where id = '90000000-0000-0000-0000-000000000001' $$,
  'the assigned coach / admin records a decision'
);
select throws_ok(
  $$ update public.unified_program_proposals set reviewed_by = '10000000-0000-0000-0000-000000000001' where id = '90000000-0000-0000-0000-000000000001' $$,
  null, null, 'a proposed row carries no review fields'
);
select throws_ok(
  $$ update public.unified_program_proposals set approval_state = 'approved', reviewed_by = '10000000-0000-0000-0000-000000000002', reviewed_at = now(),
       approved_training_version_id = '60000000-0000-0000-0000-000000000001', approved_nutrition_version_id = '80000000-0000-0000-0000-000000000001', approved_content_hashes = '{}'::jsonb
     where id = '90000000-0000-0000-0000-000000000001' $$,
  null, null, 'the recorded reviewer must be the signed-in coach'
);
select throws_ok(
  $$ update public.unified_program_proposals set approval_state = 'approved', reviewed_by = '10000000-0000-0000-0000-000000000001', reviewed_at = now(),
       approved_training_version_id = '60000000-0000-0000-0000-000000000001', approved_nutrition_version_id = '80000000-0000-0000-0000-000000000001'
     where id = '90000000-0000-0000-0000-000000000001' $$,
  null, null, 'approval requires the reviewed content hashes'
);
select throws_ok(
  $$ update public.unified_program_proposals set approval_state = 'approved', reviewed_by = '10000000-0000-0000-0000-000000000001', reviewed_at = now(),
       approved_training_version_id = '60000000-0000-0000-0000-000000000002', approved_nutrition_version_id = '80000000-0000-0000-0000-000000000001', approved_content_hashes = '{}'::jsonb
     where id = '90000000-0000-0000-0000-000000000001' $$,
  null, null, 'approval must bind exactly the linked versions'
);
select throws_ok(
  $$ update public.unified_program_proposals set approval_state = 'approved', reviewed_by = '10000000-0000-0000-0000-000000000001', reviewed_at = now(),
       training_program_version_id = '60000000-0000-0000-0000-000000000002', approved_training_version_id = '60000000-0000-0000-0000-000000000002', approved_nutrition_version_id = '80000000-0000-0000-0000-000000000001', approved_content_hashes = '{}'::jsonb
     where id = '90000000-0000-0000-0000-000000000001' $$,
  null, null, 'drafts cannot change in the same write as the decision'
);
select lives_ok(
  $$ update public.unified_program_proposals set approval_state = 'approved', reviewed_by = '10000000-0000-0000-0000-000000000001', reviewed_at = now(),
       approved_training_version_id = '60000000-0000-0000-0000-000000000001', approved_nutrition_version_id = '80000000-0000-0000-0000-000000000001', approved_content_hashes = '{"training":"t","nutrition":"n"}'::jsonb
     where id = '90000000-0000-0000-0000-000000000001' $$,
  'the coach approves exactly the linked drafts (bound by version + hash)'
);
select throws_ok(
  $$ update public.unified_program_proposals set coach_decisions = '{}'::jsonb where id = '90000000-0000-0000-0000-000000000001' $$,
  null, null, 'an approved proposal is immutable'
);
select is((select status::text from public.training_program_versions where id = '60000000-0000-0000-0000-000000000001'), 'draft', 'approval publishes nothing: the approved training version is still a draft');
select lives_ok(
  $$ update public.unified_program_proposals set approval_state = 'rejected', reviewed_by = '10000000-0000-0000-0000-000000000001', reviewed_at = now(), rejection_reason = 'Rebuild later.'
     where id = '90000000-0000-0000-0000-000000000002' $$,
  'the coach rejects with a reason'
);
select throws_ok(
  $$ update public.unified_program_proposals set approval_state = 'approved' where id = '90000000-0000-0000-0000-000000000002' $$,
  null, null, 'a rejected proposal is immutable (cannot become approved)'
);
select throws_ok(
  $$ update public.unified_program_proposals set approval_state = 'approved', reviewed_by = '10000000-0000-0000-0000-000000000001', reviewed_at = now(), approved_content_hashes = '{}'::jsonb
     where id = '90000000-0000-0000-0000-000000000004' $$,
  null, null, 'an incomplete proposal cannot be approved'
);

-- A linked draft that got published elsewhere can't be approved through the proposal.
set local role postgres;
update public.training_program_versions set status = 'published', published_by = '10000000-0000-0000-0000-000000000001', published_at = now() where id = '60000000-0000-0000-0000-000000000003';
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok(
  $$ update public.unified_program_proposals set approval_state = 'approved', reviewed_by = '10000000-0000-0000-0000-000000000001', reviewed_at = now(),
       approved_training_version_id = '60000000-0000-0000-0000-000000000003', approved_content_hashes = '{"training":"t"}'::jsonb
     where id = '90000000-0000-0000-0000-000000000003' $$,
  null, null, 'approval requires the linked versions to still be drafts'
);

select * from finish();
rollback;
