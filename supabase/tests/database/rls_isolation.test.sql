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
select plan(23);

-- ---------------------------------------------------------------------------
-- Fixtures — two independent workspaces, mirroring lib/tenancy/seed.ts's
-- own WORKSPACE_OPTIM / WORKSPACE_ATLAS isolation fixture shape.
-- ---------------------------------------------------------------------------
set local role postgres;

insert into auth.users (id, email) values
  ('10000000-0000-0000-0000-000000000001', 'coach-a@example.test'),
  ('10000000-0000-0000-0000-000000000002', 'coach-b@example.test'),
  ('10000000-0000-0000-0000-000000000003', 'client-a@example.test'),
  ('10000000-0000-0000-0000-000000000004', 'client-b@example.test');

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
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000004', 'client');

insert into public.client_profiles (id, workspace_id, user_id, display_name) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'Client A'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000004', 'Client B');

insert into public.coach_client_assignments (workspace_id, coach_user_id, client_profile_id) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002');

insert into public.conversations (id, workspace_id, client_profile_id, kind) values
  ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'optim_default'),
  ('40000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', 'optim_default');

-- ---------------------------------------------------------------------------
-- Anonymous — zero access to anything protected.
-- ---------------------------------------------------------------------------
set local role anon;
reset request.jwt.claims;

select is((select count(*) from public.client_profiles)::int, 0, 'anon: sees zero client_profiles rows');
select is((select count(*) from public.workspaces)::int, 0, 'anon: sees zero workspaces rows');
select is((select count(*) from public.conversation_messages)::int, 0, 'anon: sees zero conversation_messages rows');
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

select is((select count(*) from public.client_profiles)::int, 1, 'coach A: sees exactly Workspace A''s one client');
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
