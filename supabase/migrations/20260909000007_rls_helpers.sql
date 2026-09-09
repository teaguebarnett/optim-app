-- Phase 6.0A — Production Foundation.
--
-- RLS helper functions that depend on tables created in the previous six
-- migrations (client_profiles, coach_client_assignments in particular).
-- Kept separate from 20260909000001's earlier helpers for exactly that
-- reason — see that file's header comment. Every function here is
-- SECURITY DEFINER with a pinned search_path and fully-qualified names, and
-- is never granted directly to anon/authenticated — only referenced from
-- inside policies (20260909000008), which always evaluate as the invoking
-- role regardless of the function's own privilege.

-- ---------------------------------------------------------------------------
-- app_private.is_workspace_member / has_workspace_role / is_workspace_admin
-- — the base membership predicates every other helper and policy in this
-- file and 20260909000008 composes from. Phase 6.0A-V fix: these three were
-- referenced throughout this file (is_workspace_staff below) and throughout
-- 20260909000008_rls_policies.sql, but were never actually defined anywhere
-- in the original Phase 6.0A migration set — a real defect that would have
-- failed CREATE FUNCTION/CREATE POLICY on a clean `supabase db reset` the
-- moment either file ran, since a `language sql` function is parse-analyzed
-- against real functions/tables at creation time (see this file's own
-- module-level intent) and CREATE POLICY validates its USING/WITH CHECK
-- expression the same way. Caught by Phase 6.0A-V's local verification gate
-- before this ever reached a real database.
-- ---------------------------------------------------------------------------
create or replace function app_private.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = target_workspace_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

create or replace function app_private.has_workspace_role(target_workspace_id uuid, allowed_roles app_role[])
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = target_workspace_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role = any(allowed_roles)
  );
$$;

-- workspace_owner and platform_admin are the two roles with tenant-wide
-- administrative authority over a workspace; a plain "coach" is deliberately
-- excluded here (see app_private.is_assigned_coach below and
-- app_private.is_workspace_staff further down — coach-level access is
-- always scoped through coach_client_assignments, never granted workspace-
-- wide by this predicate).
create or replace function app_private.is_workspace_admin(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select app_private.has_workspace_role(target_workspace_id, array['platform_admin', 'workspace_owner']::app_role[]);
$$;

-- ---------------------------------------------------------------------------
-- app_private.client_workspace_id — the workspace a client_profiles row
-- belongs to. STRICT so a null client_id short-circuits to null rather than
-- running the query.
-- ---------------------------------------------------------------------------
create or replace function app_private.client_workspace_id(target_client_id uuid)
returns uuid
language sql
stable
strict
security definer
set search_path = pg_catalog, public
as $$
  select c.workspace_id from public.client_profiles c where c.id = target_client_id;
$$;

-- ---------------------------------------------------------------------------
-- app_private.is_client_self — true iff the caller IS this client (their
-- own profiles.id matches client_profiles.user_id for this row).
-- ---------------------------------------------------------------------------
create or replace function app_private.is_client_self(target_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.client_profiles c
    where c.id = target_client_id and c.user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- app_private.is_assigned_coach — true iff the caller is a coach explicitly
-- assigned to this client via coach_client_assignments. Deliberately NOT
-- satisfied by workspace membership alone — a plain "coach" role only sees
-- their own assigned clients, even inside their own workspace (this is what
-- keeps Coach A from ever seeing Coach B's clients in the same workspace,
-- mirroring lib/tenancy/seed.ts's Teague/Alex isolation fixture).
-- ---------------------------------------------------------------------------
create or replace function app_private.is_assigned_coach(target_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.coach_client_assignments a
    where a.client_profile_id = target_client_id and a.coach_user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- app_private.can_access_client — the one predicate every client-owned
-- table's SELECT policy composes from: the client themselves, a
-- workspace-wide admin (workspace_owner/platform_admin) of that client's
-- workspace, or a coach explicitly assigned to that specific client.
-- ---------------------------------------------------------------------------
create or replace function app_private.can_access_client(target_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    app_private.is_client_self(target_client_id)
    or app_private.is_workspace_admin(app_private.client_workspace_id(target_client_id))
    or app_private.is_assigned_coach(target_client_id);
$$;

-- ---------------------------------------------------------------------------
-- app_private.can_manage_client — the narrower predicate for anything a
-- CLIENT must never be able to do to their own record (approve/publish
-- programs, resolve escalations, write coach notes, activate imports):
-- workspace admin or assigned coach only, explicitly excluding
-- is_client_self.
-- ---------------------------------------------------------------------------
create or replace function app_private.can_manage_client(target_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    app_private.is_workspace_admin(app_private.client_workspace_id(target_client_id))
    or app_private.is_assigned_coach(target_client_id);
$$;

-- ---------------------------------------------------------------------------
-- app_private.conversation_client_id / conversation_workspace_id — small
-- lookups so conversation_messages/escalations policies (which don't carry
-- client_profile_id directly on every row) can still compose through
-- can_access_client/can_manage_client.
-- ---------------------------------------------------------------------------
create or replace function app_private.conversation_client_id(target_conversation_id uuid)
returns uuid
language sql
stable
strict
security definer
set search_path = pg_catalog, public
as $$
  select v.client_profile_id from public.conversations v where v.id = target_conversation_id;
$$;

-- ---------------------------------------------------------------------------
-- app_private.shares_active_workspace_with — true iff the caller and
-- target_user_id both hold an active membership in at least one common
-- workspace. Backs profiles' SELECT policy: a coach/admin needs to be able
-- to read the display names of people inside their own workspace, but
-- nobody should be able to enumerate profiles across unrelated workspaces.
-- ---------------------------------------------------------------------------
create or replace function app_private.shares_active_workspace_with(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.workspace_memberships mine
    join public.workspace_memberships theirs
      on theirs.workspace_id = mine.workspace_id
     and theirs.user_id = target_user_id
     and theirs.status = 'active'
    where mine.user_id = auth.uid()
      and mine.status = 'active'
  );
$$;

-- ---------------------------------------------------------------------------
-- app_private.can_access_client_via_conversation /
-- can_manage_client_via_conversation — thin wrappers composing
-- conversation_client_id with can_access_client/can_manage_client, so
-- conversation_messages/escalations policies read as one predicate instead
-- of a repeated two-step subquery.
-- ---------------------------------------------------------------------------
create or replace function app_private.can_access_client_via_conversation(target_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select app_private.can_access_client(app_private.conversation_client_id(target_conversation_id));
$$;

create or replace function app_private.can_manage_client_via_conversation(target_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select app_private.can_manage_client(app_private.conversation_client_id(target_conversation_id));
$$;

-- ---------------------------------------------------------------------------
-- app_private.is_workspace_staff — platform_admin/workspace_owner/coach,
-- i.e. every non-client role. Used by program/nutrition/communications/
-- import policies where the operative distinction is "staff vs. client",
-- not the finer admin-vs-coach distinction is_workspace_admin draws.
-- ---------------------------------------------------------------------------
create or replace function app_private.is_workspace_staff(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select app_private.has_workspace_role(target_workspace_id, array['platform_admin', 'workspace_owner', 'coach']::app_role[]);
$$;
