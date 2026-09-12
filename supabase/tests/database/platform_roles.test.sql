-- Phase 6.1A — Secure Founder Command Center.
--
-- pgTAP coverage for 20260911000017_platform_roles.sql. Same fixture-id/
-- set-local-role/request.jwt.claims mechanism as rls_isolation.test.sql and
-- client_lifecycle_and_onboarding.test.sql — see those files' own headers
-- for why this proves the real policies rather than standing in for them.
-- Own fixture id namespace ('90000000-...') so this file can run standalone
-- without colliding with other suites' fixtures.
--
-- What this file does NOT test: the cross-workspace aggregation queries
-- lib/production/platform-operations.ts's Supabase adapter runs through the
-- service-role admin client — those bypass RLS by design (see that file's
-- own threat-model doc) and are exercised by lib/production/
-- verify-platform-operations.mts (pure logic) plus a live browser
-- walkthrough, not pgTAP. This file proves the one thing that genuinely is
-- an RLS/grant question: who can read/write platform_administrators and
-- platform_role_audit_log themselves, and that self-assignment is
-- structurally impossible.

begin;
select plan(17);

set local role postgres;

insert into auth.users (id, email) values
  ('90000000-0000-0000-0000-000000000001', 'platform-owner@example.test'),
  ('90000000-0000-0000-0000-000000000002', 'platform-admin@example.test'),
  ('90000000-0000-0000-0000-000000000003', 'platform-analyst@example.test'),
  ('90000000-0000-0000-0000-000000000004', 'ordinary-coach@example.test'),
  ('90000000-0000-0000-0000-000000000005', 'ordinary-client@example.test'),
  ('90000000-0000-0000-0000-000000000006', 'revoked-former-admin@example.test');

insert into public.workspaces (id, owner_user_id, display_name, business_name) values
  ('91000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000004', 'Ordinary Workspace', 'Ordinary Workspace');

insert into public.workspace_memberships (workspace_id, user_id, role) values
  ('91000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000004', 'workspace_owner'),
  ('91000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000005', 'client');

insert into public.client_profiles (id, workspace_id, user_id, display_name) values
  ('92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000005', 'Ordinary Client');

insert into public.platform_administrators (user_id, role, status, granted_by, notes) values
  ('90000000-0000-0000-0000-000000000001', 'platform_owner', 'active', null, 'seed: first owner'),
  ('90000000-0000-0000-0000-000000000002', 'platform_admin', 'active', '90000000-0000-0000-0000-000000000001', 'seed'),
  ('90000000-0000-0000-0000-000000000003', 'platform_analyst', 'active', '90000000-0000-0000-0000-000000000001', 'seed'),
  ('90000000-0000-0000-0000-000000000006', 'platform_admin', 'revoked', '90000000-0000-0000-0000-000000000001', 'seed: revoked');

insert into public.platform_role_audit_log (target_user_id, action, role, previous_role, performed_by, performed_by_note) values
  ('90000000-0000-0000-0000-000000000001', 'granted', 'platform_owner', null, null, 'bootstrap script'),
  ('90000000-0000-0000-0000-000000000006', 'revoked', 'platform_admin', 'platform_admin', '90000000-0000-0000-0000-000000000001', null);

-- ---------------------------------------------------------------------------
-- 1. Self-select: everyone (including a revoked former admin) can read
--    their OWN platform_administrators row.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000001","role":"authenticated"}';

select is(
  (select role from public.platform_administrators where user_id = '90000000-0000-0000-0000-000000000001'),
  'platform_owner'::platform_role,
  'platform_owner: can read their own platform_administrators row'
);

set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000006","role":"authenticated"}';

select is(
  (select status from public.platform_administrators where user_id = '90000000-0000-0000-0000-000000000006'),
  'revoked'::membership_status,
  'a revoked former admin can still read their own (revoked) row honestly'
);

-- ---------------------------------------------------------------------------
-- 2. Admin-wide visibility: platform_owner/platform_admin see the WHOLE
--    roster; platform_analyst and ordinary users see only their own row (or
--    none).
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000001","role":"authenticated"}';

select is(
  (select count(*) from public.platform_administrators)::int,
  4,
  'platform_owner: sees every platform_administrators row, including revoked ones'
);

set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000002","role":"authenticated"}';

select is(
  (select count(*) from public.platform_administrators)::int,
  4,
  'platform_admin: also sees every platform_administrators row'
);

set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000003","role":"authenticated"}';

select is(
  (select count(*) from public.platform_administrators)::int,
  1,
  'platform_analyst: sees only their own row, not the full admin roster'
);

set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000004","role":"authenticated"}';

select is(
  (select count(*) from public.platform_administrators)::int,
  0,
  'ordinary workspace_owner/coach with no platform role: sees zero platform_administrators rows'
);

set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000005","role":"authenticated"}';

select is(
  (select count(*) from public.platform_administrators)::int,
  0,
  'ordinary client: sees zero platform_administrators rows'
);

-- ---------------------------------------------------------------------------
-- 3. Self-assignment is structurally impossible: no INSERT policy exists at
--    all for `authenticated`, and the grant itself is SELECT-only, so this
--    fails at the grant layer even before any policy would be evaluated.
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000004","role":"authenticated"}';

select throws_ok(
  $$ insert into public.platform_administrators (user_id, role) values ('90000000-0000-0000-0000-000000000004', 'platform_owner') $$,
  '42501', null,
  'an ordinary user cannot grant themselves platform_owner — no INSERT grant/policy exists for authenticated'
);

set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000001","role":"authenticated"}';

select throws_ok(
  $$ insert into public.platform_administrators (user_id, role) values ('90000000-0000-0000-0000-000000000004', 'platform_admin') $$,
  '42501', null,
  'even a real platform_owner session cannot grant a NEW platform role through the API — only the service-role script can write this table'
);

select throws_ok(
  $$ update public.platform_administrators set role = 'platform_owner' where user_id = '90000000-0000-0000-0000-000000000003' $$,
  '42501', null,
  'a platform_owner session cannot promote another admin''s role through the API either — UPDATE is equally blocked at the grant layer'
);

select throws_ok(
  $$ delete from public.platform_administrators where user_id = '90000000-0000-0000-0000-000000000006' $$,
  '42501', null,
  'no one can delete a platform_administrators row through the API'
);

-- ---------------------------------------------------------------------------
-- 4. Audit log: owner/admin only, append-only, never authenticated-writable.
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000001","role":"authenticated"}';

select is(
  (select count(*) from public.platform_role_audit_log)::int,
  2,
  'platform_owner: can read the full platform role audit log'
);

set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000002","role":"authenticated"}';

select is(
  (select count(*) from public.platform_role_audit_log)::int,
  2,
  'platform_admin: can also read the full audit log'
);

set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000003","role":"authenticated"}';

select is(
  (select count(*) from public.platform_role_audit_log)::int,
  0,
  'platform_analyst: read-only elsewhere, but has no visibility into the admin audit log itself (least privilege)'
);

set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000004","role":"authenticated"}';

select is(
  (select count(*) from public.platform_role_audit_log)::int,
  0,
  'ordinary user: sees zero audit log rows'
);

select throws_ok(
  $$ insert into public.platform_role_audit_log (target_user_id, action, role) values ('90000000-0000-0000-0000-000000000004', 'granted', 'platform_owner') $$,
  '42501', null,
  'no authenticated session can write its own audit log row — only the service-role script does'
);

-- ---------------------------------------------------------------------------
-- 5. anon: no access at all, either table.
-- ---------------------------------------------------------------------------
set local role anon;
reset request.jwt.claims;

select throws_ok(
  $$ select count(*) from public.platform_administrators $$,
  '42501', null,
  'anon: cannot select platform_administrators at all (no grant)'
);

select finish();
rollback;
