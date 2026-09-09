-- Phase 6.0A — Production Foundation.
--
-- Extensions, the app_private schema, and the shared app_role enum. RLS
-- helper functions are deliberately NOT defined here — a `language sql`
-- function is parse-analyzed against real tables at CREATE FUNCTION time, so
-- any helper referencing e.g. workspace_memberships must be created AFTER
-- that table exists. See 20260909000007_rls_helpers.sql, which runs after
-- every table in this migration set, for those helpers, and
-- 20260909000008_rls_policies.sql for the policies built from them.

create extension if not exists pgcrypto;

create schema if not exists app_private;

-- Never expose app_private to PostgREST or to the authenticated/anon roles
-- directly — only SECURITY DEFINER functions inside it (see
-- 20260909000007_rls_helpers.sql) are callable, and only from within
-- policies evaluated as the invoking role. Confirm in the Supabase
-- dashboard/config that "Exposed schemas" for the Data API lists only
-- `public` (and `storage` for Storage) — never app_private — per this
-- migration's own intent; see docs/production/FOUNDATION.md's setup
-- checklist for the exact item to verify.
revoke all on schema app_private from public, anon, authenticated;

comment on schema app_private is
  'Phase 6.0A: RLS helper functions only. Never added to Supabase''s exposed schema list.';

-- ---------------------------------------------------------------------------
-- app_role — the same four roles as lib/tenancy/types.ts's Role union, so
-- the DB and the TS domain model never drift.
-- ---------------------------------------------------------------------------
create type app_role as enum ('platform_admin', 'workspace_owner', 'coach', 'client');
