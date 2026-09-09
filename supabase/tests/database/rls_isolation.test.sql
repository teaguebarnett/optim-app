-- Phase 6.0A — Production Foundation.
--
-- RLS allow/deny matrix, written for pgTAP (the standard `supabase test db`
-- runner). STATUS: written but NOT YET EXECUTED — this environment has
-- neither the Supabase CLI nor Docker installed (`which supabase` / `which
-- docker` both came back empty), so there is no local Postgres to run
-- pgTAP against. See docs/production/FOUNDATION.md's setup checklist for
-- the exact command to run this once either is installed:
--
--   supabase test db
--
-- Do NOT treat this file's existence as proof RLS behaves as intended —
-- only an actual run of `supabase test db` against a real local Postgres
-- proves that. This file exercises the minimum matrix Part 4 requires:
-- anonymous, invited/authenticated client A, client B, Teague/coach A
-- (workspace admin), an unrelated coach B in a different workspace, and one
-- authorized server-only op (accept_invitation).
--
-- Pattern: seed fixtures as `postgres` (bypasses RLS), then `set local
-- role authenticated` + `set local request.jwt.claims` to simulate each
-- caller — the same mechanism Supabase's own auth.uid() reads from in a
-- real request, so this exercises the actual policies, not a stand-in.

begin;
select plan(26);

-- ---------------------------------------------------------------------------
-- Fixtures — two independent workspaces, mirroring lib/tenancy/seed.ts's
-- own WORKSPACE_OPTIM / WORKSPACE_ATLAS isolation fixture shape.
-- ---------------------------------------------------------------------------
set local role postgres;

insert into auth.users (id, email) values
  ('10000000-0000-0000-0000-000000000001', 'coach-a@example.test'),
  ('10000000-0000-0000-0000-000000000002', 'coach-b@example.test'),
  ('10000000-0000-0000-0000-000000000003', 'client-a@example.test'),
  ('10000000-0000-0000-0000-000000000004', 'client-b@example.test'),
  -- Phase 6.0A-V addition: a plain (non-owner) coach in Workspace A,
  -- assigned only to Client A — proves coach access is scoped through
  -- coach_client_assignments, not workspace membership alone, against a
  -- SECOND client in the SAME workspace (distinct from the cross-workspace
  -- Client A/Client B isolation already covered above).
  ('10000000-0000-0000-0000-000000000005', 'coach-a-plain@example.test');

-- handle_new_user's trigger fires on the inserts above and creates matching
-- public.profiles rows automatically.

insert into public.workspaces (id, owner_user_id, display_name, business_name)
values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Workspace A', 'Workspace A'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'Workspace B', 'Workspace B');

insert into public.workspace_memberships (workspace_id, user_id, role) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'workspace_owner'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'client'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'workspace_owner'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000004', 'client'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000005', 'coach');

insert into public.client_profiles (id, workspace_id, user_id, display_name) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'Client A'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000004', 'Client B');

-- A second client in Workspace A (same workspace as Client A), never
-- assigned to coach-a-plain — the "different client in the same workspace"
-- fixture. Not yet signed in (no user_id), so invited_email satisfies
-- client_profiles_user_or_invite.
insert into public.client_profiles (id, workspace_id, invited_email, display_name) values
  ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 'client-a2@example.test', 'Client A2');

insert into public.coach_client_assignments (workspace_id, coach_user_id, client_profile_id, is_primary) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', true),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', true),
  -- coach-a-plain is assigned to Client A only — never to Client A2, even
  -- though both are in Workspace A.
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000005', '30000000-0000-0000-0000-000000000001', false);

insert into public.conversations (id, workspace_id, client_profile_id, kind) values
  ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'optim_default'),
  ('40000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', 'optim_default');

-- ---------------------------------------------------------------------------
-- Anonymous — zero access to anything protected.
-- ---------------------------------------------------------------------------
set local role anon;
reset request.jwt.claims;

-- Phase 6.0A-V live-run fix: migration 20260909000008's own grants preamble
-- explicitly documents (and enforces via `revoke all on all tables in
-- schema public from anon`) that anon gets zero table-level grants at
-- all — stronger than RLS-filters-to-empty, by design. That means a query
-- against any protected table doesn't succeed-with-zero-rows for anon, it
-- fails at the grant layer before RLS is ever evaluated (Postgres:
-- "permission denied for table ...", SQLSTATE 42501). These three
-- assertions were written and committed before this file was ever actually
-- run against a real Postgres, and encoded the wrong expectation for that
-- design — caught by this live run, matching the throws_ok pattern the
-- INSERT assertion right below already used correctly.
select throws_ok(
  $$ select count(*) from public.client_profiles $$,
  '42501', null, 'anon: cannot select client_profiles at all (no grant, not just filtered to zero)'
);
select throws_ok(
  $$ select count(*) from public.workspaces $$,
  '42501', null, 'anon: cannot select workspaces at all (no grant, not just filtered to zero)'
);
select throws_ok(
  $$ select count(*) from public.conversation_messages $$,
  '42501', null, 'anon: cannot select conversation_messages at all (no grant, not just filtered to zero)'
);
select throws_ok(
  $$ insert into public.client_profiles (workspace_id, display_name) values ('20000000-0000-0000-0000-000000000001', 'Ghost') $$,
  null, null, 'anon: cannot insert a client_profiles row (no grant at all)'
);

-- ---------------------------------------------------------------------------
-- Client A — sees only their own client_profile, never Client B's.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}';

select is((select count(*) from public.client_profiles)::int, 1, 'client A: sees exactly one client_profiles row');
select is(
  (select id from public.client_profiles limit 1)::text,
  '30000000-0000-0000-0000-000000000001',
  'client A: the one visible row is their own, not Client B''s'
);
select is((select count(*) from public.workspaces)::int, 1, 'client A: sees exactly one workspace (their own)');
select is((select count(*) from public.conversations)::int, 1, 'client A: sees exactly one conversation (their own)');

-- Client A may insert a client-authored message into their own conversation.
select lives_ok(
  $$ insert into public.conversation_messages (conversation_id, workspace_id, actor_type, actor_user_id, body)
     values ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'client', '10000000-0000-0000-0000-000000000003', 'Hello') $$,
  'client A: can insert their own client-authored message into their own conversation'
);

-- Client A may NOT insert a coach-authored message (even into their own
-- conversation) — actor_type must match a real, independently-proven role.
select throws_ok(
  $$ insert into public.conversation_messages (conversation_id, workspace_id, actor_type, actor_user_id, body)
     values ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'coach', '10000000-0000-0000-0000-000000000003', 'Spoofed') $$,
  null, null, 'client A: cannot insert a coach-authored message impersonating their coach'
);

-- Client A may NOT write a coach_note about themselves.
select throws_ok(
  $$ insert into public.coach_notes (workspace_id, client_profile_id, author_user_id, body)
     values ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'Self-authored note') $$,
  null, null, 'client A: cannot write a coach_notes row about themselves'
);

-- Client A cannot reach into Workspace B's conversation at all.
select is(
  (select count(*) from public.conversation_messages where conversation_id = '40000000-0000-0000-0000-000000000002')::int,
  0,
  'client A: sees zero messages in Workspace B''s conversation'
);

-- ---------------------------------------------------------------------------
-- Client B — the mirror image, proving isolation both directions.
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}';

select is((select count(*) from public.client_profiles)::int, 1, 'client B: sees exactly one client_profiles row');
select is(
  (select id from public.client_profiles limit 1)::text,
  '30000000-0000-0000-0000-000000000002',
  'client B: the one visible row is their own, not Client A''s'
);
select is(
  (select count(*) from public.conversation_messages where conversation_id = '40000000-0000-0000-0000-000000000001')::int,
  0,
  'client B: sees zero messages in Client A''s conversation (including the one client A just wrote)'
);

-- ---------------------------------------------------------------------------
-- Coach A (workspace_owner of Workspace A) — full access within their own
-- workspace, including approving/resolving.
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';

-- Two clients now, Client A and Client A2 — the workspace_owner sees both,
-- since is_workspace_admin grants workspace-wide access regardless of
-- individual coach_client_assignments rows.
select is((select count(*) from public.client_profiles)::int, 2, 'coach A (owner): sees both of Workspace A''s clients');
select lives_ok(
  $$ insert into public.coach_notes (workspace_id, client_profile_id, author_user_id, body)
     values ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Great week.') $$,
  'coach A: can write a coach_notes row for their own assigned client'
);
select lives_ok(
  $$ insert into public.conversation_messages (conversation_id, workspace_id, actor_type, actor_user_id, body)
     values ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'coach', '10000000-0000-0000-0000-000000000001', 'Nice work.') $$,
  'coach A: can insert their own coach-authored message'
);

-- ---------------------------------------------------------------------------
-- Coach A-plain (plain 'coach' role in Workspace A, assigned only to
-- Client A) — the "different client in the same workspace" isolation case:
-- unlike the owner above, a plain coach's access is scoped through
-- coach_client_assignments alone, so Client A2 (same workspace, no
-- assignment to this coach) must stay invisible to them.
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated"}';

select is(
  (select count(*) from public.client_profiles)::int,
  1,
  'coach A-plain: sees exactly one client (their own assignment), not Client A2 in the same workspace'
);
select is(
  (select id from public.client_profiles limit 1)::text,
  '30000000-0000-0000-0000-000000000001',
  'coach A-plain: the one visible client is Client A, not Client A2'
);
select throws_ok(
  $$ insert into public.coach_notes (workspace_id, client_profile_id, author_user_id, body)
     values ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000005', 'Unassigned note') $$,
  null, null, 'coach A-plain: cannot write a coach_notes row for Client A2 — same workspace, but not their assignment'
);

-- ---------------------------------------------------------------------------
-- Coach B (workspace_owner of Workspace B, an entirely different
-- workspace) — the critical cross-workspace isolation assertion.
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}';

select is(
  (select count(*) from public.client_profiles where id = '30000000-0000-0000-0000-000000000001')::int,
  0,
  'coach B: cannot see Client A (Workspace A''s client) at all'
);
select throws_ok(
  $$ insert into public.coach_notes (workspace_id, client_profile_id, author_user_id, body)
     values ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'Injected note') $$,
  null, null, 'coach B: cannot write a coach_notes row for Workspace A''s client'
);
select throws_ok(
  $$ insert into public.conversation_messages (conversation_id, workspace_id, actor_type, actor_user_id, body)
     values ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'coach', '10000000-0000-0000-0000-000000000002', 'Injected message') $$,
  null, null, 'coach B: cannot insert a coach-authored message into Workspace A''s conversation'
);
select is(
  (select count(*) from public.publication_events where workspace_id = '20000000-0000-0000-0000-000000000001')::int,
  0,
  'coach B: sees zero of Workspace A''s publication_events'
);

-- ---------------------------------------------------------------------------
-- Authorized server-only op — accept_invitation is callable by an
-- authenticated user (guarded entirely by its own internal email match, not
-- by table-level RLS), proving the one sanctioned account-creation path
-- still works under RLS rather than being silently blocked by it.
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}';
select throws_ok(
  $$ select public.accept_invitation('00000000-0000-0000-0000-000000000000') $$,
  null, null, 'accept_invitation: rejects a non-existent invitation id rather than silently no-op-ing'
);

select finish();
rollback;
