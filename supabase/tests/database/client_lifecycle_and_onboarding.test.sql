-- Phase 6.0D-B — Controlled Live-Client Pilot and Production Client Lifecycle.
--
-- pgTAP coverage for 20260911000013_client_onboarding_progress.sql (the new
-- client_onboarding_progress table + client_enrollments.archived_at) and a
-- regression guard for coach_notes' real, correct visibility (client +
-- assigned coach + workspace admin — see 20260911000015's own header for
-- the live-verification correction this reverts: 20260911000014 wrongly
-- narrowed this to staff-only, based on a misreading of "Personal Coach
-- Note" as private; it is a real client-visible feature). Same fixture-id
-- convention and set-local-role/request.jwt.claims mechanism as
-- rls_isolation.test.sql and program_publication_and_activity.test.sql —
-- see those files' own headers for why this proves the real policies
-- rather than standing in for them.
--
-- STATUS: executed live against a real local Supabase stack via
-- `npx supabase test db` (Docker reachable via $HOME/.docker/bin) — see
-- this phase's corrected final report. All assertions in this file pass.

begin;
select plan(18);

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

-- ---------------------------------------------------------------------------
-- 1. client_onboarding_progress — client-authored, staff-read-only, exactly
--    like daily_records.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}';

select lives_ok(
  $$ insert into public.client_onboarding_progress (workspace_id, client_profile_id, current_step_index, answers)
     values ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 2, '{"about_you":{"heightFeet":5}}'::jsonb) $$,
  'client A: can insert their own onboarding progress row'
);

select lives_ok(
  $$ update public.client_onboarding_progress set current_step_index = 3, answers = '{"about_you":{"heightFeet":5},"what_you_want":{"primaryGoal":"strength"}}'::jsonb
     where client_profile_id = '30000000-0000-0000-0000-000000000001' $$,
  'client A: can update (merge in) their own onboarding progress'
);

select throws_ok(
  $$ insert into public.client_onboarding_progress (workspace_id, client_profile_id, current_step_index, answers)
     values ('20000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', 0, '{}'::jsonb) $$,
  null, null, 'client A: cannot insert an onboarding progress row for client B'
);

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';

select is(
  (select current_step_index from public.client_onboarding_progress where client_profile_id = '30000000-0000-0000-0000-000000000001'),
  3,
  'coach A (assigned): can read client A''s real onboarding progress'
);

-- Not throws_ok: an UPDATE whose WHERE-matched row is excluded by RLS's
-- USING clause is a silent 0-row no-op in Postgres, not a thrown error
-- (unlike INSERT/a failing WITH CHECK, or a grant-less DELETE below) — the
-- real assertion is that the row is provably unchanged afterward.
update public.client_onboarding_progress set current_step_index = 99
  where client_profile_id = '30000000-0000-0000-0000-000000000001';

select is(
  (select current_step_index from public.client_onboarding_progress where client_profile_id = '30000000-0000-0000-0000-000000000001'),
  3,
  'coach A: writing client A''s onboarding progress is a silent no-op — RLS''s USING clause excludes it (client-authored only, never coach-editable)'
);

select throws_ok(
  $$ delete from public.client_onboarding_progress where client_profile_id = '30000000-0000-0000-0000-000000000001' $$,
  null, null, 'no one can delete an onboarding progress row — DELETE grant revoked entirely'
);

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}';

select is(
  (select count(*) from public.client_onboarding_progress where client_profile_id = '30000000-0000-0000-0000-000000000001')::int,
  0,
  'client B: sees zero of client A''s onboarding progress'
);

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}';

select is(
  (select count(*) from public.client_onboarding_progress where client_profile_id = '30000000-0000-0000-0000-000000000001')::int,
  0,
  'coach B (unrelated workspace): sees zero of client A''s onboarding progress'
);

set local role anon;
reset request.jwt.claims;
select throws_ok(
  $$ select count(*) from public.client_onboarding_progress $$,
  '42501', null, 'anon: cannot select client_onboarding_progress at all (no grant)'
);

-- ---------------------------------------------------------------------------
-- 2. client_enrollments.archived_at — staff-only write (can_manage_client),
--    same as every other client_enrollments column.
-- ---------------------------------------------------------------------------
set local role postgres;
insert into public.client_enrollments (workspace_id, client_profile_id, status) values
  ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'offboarded');

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';

select lives_ok(
  $$ update public.client_enrollments set archived_at = now() where client_profile_id = '30000000-0000-0000-0000-000000000001' $$,
  'coach A (assigned): can archive their own client''s completed enrollment'
);

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}';

-- Same no-op reasoning as the onboarding-progress case above: RLS's USING
-- clause (can_manage_client — staff only) excludes this row from the
-- client's own UPDATE target entirely; it never throws, it just changes
-- nothing.
update public.client_enrollments set archived_at = null where client_profile_id = '30000000-0000-0000-0000-000000000001';

select isnt(
  (select archived_at from public.client_enrollments where client_profile_id = '30000000-0000-0000-0000-000000000001'),
  null,
  'client A: cannot un-archive (or write anything on) their own client_enrollments row — stays archived'
);

-- ---------------------------------------------------------------------------
-- 3. coach_notes — REGRESSION GUARD for the live-verification correction
--    (20260911000014 then reverted by 20260911000015): "Personal Coach
--    Note" is a real, intentional CLIENT-VISIBLE feature (rendered in the
--    client's own /chat via app/actions/chat.ts's getMyChatScreenStateAction
--    + components/chat/live-chat-screen.tsx — "Note from {coach}" cards),
--    never a private coach-only annotation. This file previously asserted
--    the OPPOSITE (client sees zero) — that assertion was itself the
--    defect, caught live against scripts/e2e-chat-intelligence.mts's own
--    pre-existing "Client A can read the note" case. Isolation here is
--    scoped exactly like every other client-owned table: the client
--    themselves, their assigned coach, or a workspace admin — never an
--    unrelated client or an unrelated workspace's coach.
-- ---------------------------------------------------------------------------
set local role postgres;
insert into public.coach_notes (workspace_id, client_profile_id, author_user_id, body) values
  ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Watch her left knee on unilateral work.');

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}';

select is(
  (select body from public.coach_notes where client_profile_id = '30000000-0000-0000-0000-000000000001'),
  'Watch her left knee on unilateral work.',
  'client A: CAN read their own coach note — it is a real, intentional client-visible feature, not a private annotation'
);

select throws_ok(
  $$ insert into public.coach_notes (workspace_id, client_profile_id, author_user_id, body)
     values ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'trying to write my own note') $$,
  null, null, 'client A: cannot author a coach note about themselves (not staff — read-only for the client)'
);

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';

select is(
  (select body from public.coach_notes where client_profile_id = '30000000-0000-0000-0000-000000000001'),
  'Watch her left knee on unilateral work.',
  'coach A (assigned): can also read their own note about their own client'
);

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}';

select is(
  (select count(*) from public.coach_notes where client_profile_id = '30000000-0000-0000-0000-000000000001')::int,
  0,
  'client B: sees zero of client A''s coach notes (cross-client isolation still holds)'
);

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}';

select is(
  (select count(*) from public.coach_notes where client_profile_id = '30000000-0000-0000-0000-000000000001')::int,
  0,
  'coach B (unrelated workspace): sees zero of client A''s coach notes'
);

-- ---------------------------------------------------------------------------
-- 4. REGRESSION GUARD — live-verification finding: INSERT ... RETURNING on
--    client_profiles, under a real authenticated (non-service-role)
--    session, triggers a genuine PostgreSQL RLS defect (matching the class
--    of bug tracked upstream as postgresql.org bug #19015 — a STABLE
--    function in a SELECT policy misbehaving when an INSERT's implicit
--    RETURNING-triggered visibility check runs against the very row being
--    inserted). client_profiles is the one table in this schema whose own
--    SELECT policy (client_profiles_select -> can_access_client(id) ->
--    client_workspace_id(id)) self-queries client_profiles for the row a
--    RETURNING clause would expose; every other client-owned table's SELECT
--    policy resolves through a foreign key into an ALREADY-EXISTING
--    client_profiles row instead, which is why this is the only INSERT path
--    affected. lib/production/roster.ts's inviteClient is fixed to never
--    chain .select() onto this specific insert (the id is generated
--    client-side instead) — this pgTAP case proves the plain INSERT (no
--    RETURNING) a real workspace_owner performs succeeds, and separately
--    documents that adding RETURNING back would reproduce the failure (see
--    this phase's final report for the full live investigation).
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';

select lives_ok(
  $$ insert into public.client_profiles (workspace_id, invited_email, display_name)
     values ('20000000-0000-0000-0000-000000000001', 'zz-regression-fix@example.test', 'Regression Fix') $$,
  'coach A: the FIXED insert pattern (no RETURNING) succeeds for a real workspace_owner session'
);

select throws_ok(
  $$ insert into public.client_profiles (workspace_id, invited_email, display_name)
     values ('20000000-0000-0000-0000-000000000001', 'zz-regression-broken@example.test', 'Regression Broken')
     returning id $$,
  '42501', null,
  'REGRESSION DOCUMENTATION (not a desired outcome): the same insert WITH a RETURNING clause still fails under real RLS — proves why inviteClient must never add .select()/RETURNING back onto this specific statement'
);

select finish();
rollback;
