-- U3C closure — pgTAP coverage for 20261012000037_unified_exclusion_guard.sql: an exercise the coach excluded through a
-- review decision can't be in the training version that is approved, nor in the version that is published to the
-- client (even a client copy crafted to re-introduce it). Keeping the exercise is the coach's call.

begin;
select plan(5);

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
insert into public.training_programs (id, workspace_id, created_by, title) values
  ('50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Unified A');
insert into public.training_program_versions (id, program_id, workspace_id, version_number, status, content, created_by) values
  -- A draft that still contains the excluded exercise.
  ('60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 1, 'draft',
   '{"clientId":"30000000-0000-0000-0000-000000000001","weeks":[{"weekNumber":1,"days":[{"dayOfWeek":"Monday","sessions":[{"blocks":[{"items":[{"name":"Cable Triceps Pushdown"},{"name":"Bench Press"}]}]}]}]}]}'::jsonb, '10000000-0000-0000-0000-000000000001'),
  -- A clean approved version (the exercise was removed) …
  ('60000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 2, 'draft',
   '{"clientId":"30000000-0000-0000-0000-000000000001","weeks":[{"weekNumber":1,"days":[{"dayOfWeek":"Monday","sessions":[{"blocks":[{"items":[{"name":"Bench Press"}]}]}]}]}]}'::jsonb, '10000000-0000-0000-0000-000000000001'),
  -- … and a "client copy" crafted to re-introduce it.
  ('60000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 3, 'draft',
   '{"clientId":"30000000-0000-0000-0000-000000000001","clientFacingFrom":{"reviewedVersionId":"60000000-0000-0000-0000-000000000002"},"weeks":[{"weekNumber":1,"days":[{"dayOfWeek":"Monday","sessions":[{"blocks":[{"items":[{"name":"single-leg calf raise"},{"name":"Bench Press"}]}]}]}]}]}'::jsonb, '10000000-0000-0000-0000-000000000001');

insert into public.unified_program_proposals (id, workspace_id, client_profile_id, requested_by, idempotency_key, title, status, training_program_version_id, resistance_source, coach_decisions) values
  ('90000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'k1', 'U1', 'draft_ready', '60000000-0000-0000-0000-000000000001', 'proposed_program',
   '{"resistance:documented_limitation_exercise_review:abc":{"answer":"Exclude them for this client (exercise decision)","question":"q","decidedBy":"10000000-0000-0000-0000-000000000001","decidedAtIso":"2026-10-11T00:00:00Z","excludes":["Cable Triceps Pushdown"]}}'::jsonb);
-- An already-approved proposal (exclusion of the calf raise, clean approved version), to test the publish-time guard.
insert into public.unified_program_proposals (id, workspace_id, client_profile_id, requested_by, idempotency_key, title, status, training_program_version_id, resistance_source, approval_state, reviewed_by, reviewed_at, approved_training_version_id, approved_content_hashes, approved_db_hashes, coach_decisions) values
  ('90000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'k2', 'U2', 'draft_ready', '60000000-0000-0000-0000-000000000002', 'proposed_program',
   'approved', '10000000-0000-0000-0000-000000000001', now(), '60000000-0000-0000-0000-000000000002', '{"training":"t"}'::jsonb,
   jsonb_build_object('training', (select md5(content::text) from public.training_program_versions where id = '60000000-0000-0000-0000-000000000002')),
   '{"resistance:documented_limitation_exercise_review:def":{"answer":"Exclude them for this client (exercise decision)","question":"q","decidedBy":"10000000-0000-0000-0000-000000000001","decidedAtIso":"2026-10-11T00:00:00Z","excludes":["Single-Leg Calf Raise"]}}'::jsonb);

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';

select throws_like(
  $$ update public.unified_program_proposals set approval_state = 'approved', reviewed_by = '10000000-0000-0000-0000-000000000001', reviewed_at = now(),
       approved_training_version_id = '60000000-0000-0000-0000-000000000001', approved_content_hashes = '{"training":"t"}'::jsonb
     where id = '90000000-0000-0000-0000-000000000001' $$,
  '%excluded cable triceps pushdown but it is still in the program%',
  'approval is refused while an exercise the coach excluded is still in the program'
);
select lives_ok(
  $$ update public.unified_program_proposals set coach_decisions = '{"resistance:documented_limitation_exercise_review:abc":{"answer":"Keep them as prescribed","question":"q","decidedBy":"10000000-0000-0000-0000-000000000001","decidedAtIso":"2026-10-11T00:00:00Z"}}'::jsonb
     where id = '90000000-0000-0000-0000-000000000001' $$,
  'the coach may change the decision to keep the exercise (coach authority)'
);
select lives_ok(
  $$ update public.unified_program_proposals set approval_state = 'approved', reviewed_by = '10000000-0000-0000-0000-000000000001', reviewed_at = now(),
       approved_training_version_id = '60000000-0000-0000-0000-000000000001', approved_content_hashes = '{"training":"t"}'::jsonb
     where id = '90000000-0000-0000-0000-000000000001' $$,
  '…and then approve it'
);
select throws_like(
  $$ select public.publish_unified_proposal('90000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000003', '{"activeTrainingVersionId":null,"activeNutritionVersionId":null,"replaceActive":true}'::jsonb) $$,
  '%excluded single-leg calf raise but it is still in the program%',
  'publishing a client copy that re-introduces an excluded exercise is refused by the exclusion guard (whole publication rolled back)'
);
select is((select approval_state from public.unified_program_proposals where id = '90000000-0000-0000-0000-000000000002'), 'approved', '…the proposal is still only approved — nothing was published');

select * from finish();
rollback;
