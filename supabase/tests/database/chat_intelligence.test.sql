-- Phase 6.0C — Coach-Trained Chat Intelligence and Escalation.
--
-- pgTAP coverage for 20260910000012_chat_intelligence.sql's new surfaces:
-- coach_playbooks RLS (staff-only, never client-readable, never cross-
-- workspace), create_escalation()'s authorization + atomic dedup, and
-- get_or_create_default_conversation()'s authorization + idempotency.
-- Run with: supabase test db
--
-- Same fixture shape as rls_isolation.test.sql (Workspace A / Workspace B,
-- Coach A / Coach B, Client A / Client B) — a fresh, self-contained set so
-- this file can run independently of that one.

begin;
select plan(19);

set local role postgres;

insert into auth.users (id, email) values
  ('11000000-0000-0000-0000-000000000001', 'ci-coach-a@example.test'),
  ('11000000-0000-0000-0000-000000000002', 'ci-coach-b@example.test'),
  ('11000000-0000-0000-0000-000000000003', 'ci-client-a@example.test'),
  ('11000000-0000-0000-0000-000000000004', 'ci-client-b@example.test');

insert into public.workspaces (id, owner_user_id, display_name, business_name) values
  ('21000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 'CI Workspace A', 'CI Workspace A'),
  ('21000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000002', 'CI Workspace B', 'CI Workspace B');

insert into public.workspace_memberships (workspace_id, user_id, role) values
  ('21000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 'workspace_owner'),
  ('21000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000003', 'client'),
  ('21000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000002', 'workspace_owner'),
  ('21000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000004', 'client');

insert into public.client_profiles (id, workspace_id, user_id, display_name) values
  ('31000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000003', 'CI Client A'),
  ('31000000-0000-0000-0000-000000000002', '21000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000004', 'CI Client B');

insert into public.coach_client_assignments (workspace_id, coach_user_id, client_profile_id, is_primary) values
  ('21000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001', true),
  ('21000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000002', '31000000-0000-0000-0000-000000000002', true);

insert into public.coach_playbooks (id, workspace_id, version, status, content, created_by, approved_by, approved_at) values
  ('51000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001', 1, 'approved', '{"operatingModel":{},"aiAuthority":{},"examples":[]}'::jsonb,
   '11000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', now());

-- ---------------------------------------------------------------------------
-- coach_playbooks RLS — staff-only, never client-readable, never cross-workspace.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"11000000-0000-0000-0000-000000000001","role":"authenticated"}';

select is(
  (select count(*) from public.coach_playbooks)::int, 1,
  'coach A (owner of Workspace A): sees their own workspace''s Playbook'
);
select lives_ok(
  $$ update public.coach_playbooks set status = 'approved' where id = '51000000-0000-0000-0000-000000000001' $$,
  'coach A: can update their own workspace''s Playbook'
);

set local request.jwt.claims = '{"sub":"11000000-0000-0000-0000-000000000003","role":"authenticated"}';
select is(
  (select count(*) from public.coach_playbooks)::int, 0,
  'client A: sees zero Playbook rows — coach_playbooks is staff-only, never client-readable'
);
select throws_ok(
  $$ insert into public.coach_playbooks (workspace_id, version, status, content, created_by)
     values ('21000000-0000-0000-0000-000000000001', 2, 'draft', '{}'::jsonb, '11000000-0000-0000-0000-000000000003') $$,
  null, null, 'client A: cannot insert a coach_playbooks row even for their own workspace'
);

set local request.jwt.claims = '{"sub":"11000000-0000-0000-0000-000000000002","role":"authenticated"}';
select is(
  (select count(*) from public.coach_playbooks where workspace_id = '21000000-0000-0000-0000-000000000001')::int, 0,
  'coach B (a different workspace): sees zero of Workspace A''s Playbook rows'
);

-- ---------------------------------------------------------------------------
-- get_or_create_default_conversation — authorized + idempotent.
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"11000000-0000-0000-0000-000000000003","role":"authenticated"}';

select isnt(
  (select public.get_or_create_default_conversation('31000000-0000-0000-0000-000000000001')),
  null,
  'client A: get_or_create_default_conversation returns a real id for themselves'
);
select is(
  (select public.get_or_create_default_conversation('31000000-0000-0000-0000-000000000001')),
  (select public.get_or_create_default_conversation('31000000-0000-0000-0000-000000000001')),
  'get_or_create_default_conversation: idempotent — repeated calls for the same client return the same conversation id'
);
select is(
  (select count(*) from public.conversations where client_profile_id = '31000000-0000-0000-0000-000000000001' and kind = 'optim_default')::int,
  1,
  'exactly one optim_default conversation exists for client A after multiple get_or_create calls'
);

set local request.jwt.claims = '{"sub":"11000000-0000-0000-0000-000000000004","role":"authenticated"}';
select throws_ok(
  $$ select public.get_or_create_default_conversation('31000000-0000-0000-0000-000000000001') $$,
  null, null, 'client B: cannot call get_or_create_default_conversation for client A — not authorized for that client'
);

-- ---------------------------------------------------------------------------
-- create_escalation — authorized + atomic dedup.
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"11000000-0000-0000-0000-000000000003","role":"authenticated"}';

select isnt(
  (select public.create_escalation('31000000-0000-0000-0000-000000000001', 'pain_or_safety', null, 'proposed response text')),
  null,
  'client A: create_escalation returns a real id for themselves'
);
select is(
  (select count(*) from public.escalations where client_profile_id = '31000000-0000-0000-0000-000000000001')::int,
  1,
  'exactly one escalation row exists for client A after create_escalation'
);
select is(
  (select public.create_escalation('31000000-0000-0000-0000-000000000001', 'unresolved_uncertainty', null, 'second attempt')),
  (select id from public.escalations where client_profile_id = '31000000-0000-0000-0000-000000000001' limit 1),
  'create_escalation: a second call while the first is unresolved returns the SAME existing id (dedup), never a second row'
);
select is(
  (select count(*) from public.escalations where client_profile_id = '31000000-0000-0000-0000-000000000001')::int,
  1,
  'still exactly one escalation row for client A — dedup prevented a duplicate unresolved escalation'
);

-- Resolve it directly (bypassing the coach action flow, which is exercised
-- in lib/production/verify-chat.mts and the live E2E) so the NEXT
-- create_escalation call is proven to open a genuinely new row rather than
-- deduping against a resolved one.
set local role postgres;
update public.escalations set status = 'resolved', resolved_at = now() where client_profile_id = '31000000-0000-0000-0000-000000000001';
set local role authenticated;
set local request.jwt.claims = '{"sub":"11000000-0000-0000-0000-000000000003","role":"authenticated"}';

select is(
  (select count(*) from public.escalations where client_profile_id = '31000000-0000-0000-0000-000000000001')::int,
  1,
  'still one escalation row immediately after resolving it'
);
select isnt(
  (select public.create_escalation('31000000-0000-0000-0000-000000000001', 'plan_change', null, 'a genuinely new issue')),
  (select id from public.escalations where client_profile_id = '31000000-0000-0000-0000-000000000001' and status = 'resolved' limit 1),
  'create_escalation: once the prior escalation is resolved, a new call opens a genuinely NEW row, not the resolved one'
);
select is(
  (select count(*) from public.escalations where client_profile_id = '31000000-0000-0000-0000-000000000001')::int,
  2,
  'two escalation rows now exist for client A — one resolved, one freshly opened'
);

set local request.jwt.claims = '{"sub":"11000000-0000-0000-0000-000000000004","role":"authenticated"}';
select throws_ok(
  $$ select public.create_escalation('31000000-0000-0000-0000-000000000001', 'pain_or_safety', null, 'injected') $$,
  null, null, 'client B: cannot call create_escalation for client A — not authorized for that client'
);

-- ---------------------------------------------------------------------------
-- conversation_messages.route_meta — present, settable, never required.
-- ---------------------------------------------------------------------------
set local role postgres;
select has_column('public', 'conversation_messages', 'route_meta', 'conversation_messages has a route_meta column');
select col_is_null('public', 'conversation_messages', 'route_meta', 'route_meta is nullable — a coach/client-authored message never has route metadata');

select finish();
rollback;
