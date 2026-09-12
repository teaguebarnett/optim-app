-- Phase 6.1A — Secure Founder Command Center.
--
-- Platform-level administration, genuinely independent of the existing
-- per-workspace role model. IMPORTANT NAMING NOTE: public.app_role already
-- has a value literally spelled 'platform_admin' (see
-- 20260909000001_extensions_and_helpers.sql) — that value means "full
-- administrative authority inside ONE workspace" (app_private.is_workspace_
-- admin treats it exactly like workspace_owner; see 20260909000007). It has
-- nothing to do with this migration. The new `platform_role` enum below is a
-- SEPARATE namespace: authority over the ENTIRE OPTIM platform, across every
-- workspace, held (or not) independently of any workspace_memberships row at
-- all. A user can hold a platform_administrators row, a workspace_memberships
-- row, both, or neither — they are unrelated tables.
--
-- Design goal from the spec: "transferable, acquisition-ready" — ownership
-- must be reassignable to a different authenticated account later without
-- touching code, so nothing here ever hardcodes an identity, an email, or a
-- UUID. The very first platform_owner is granted by
-- scripts/manage-platform-role.mts, run manually with a real service-role
-- key, exactly the same posture scripts/bootstrap-workspace.mts already
-- established for the first workspace owner.
--
-- Self-assignment is impossible by construction, not just by convention:
-- there is no INSERT/UPDATE/DELETE policy for `authenticated` on either
-- table below, AND the ordinary grants are explicitly revoked and re-granted
-- SELECT-only — even if some future policy were added carelessly, the grant
-- layer alone still blocks every authenticated-role write. Only the
-- service-role key (which bypasses RLS and grants both) can ever write these
-- tables, and the only code path that holds that key for this purpose is the
-- manual grant/revoke script.

-- ---------------------------------------------------------------------------
-- platform_role — a genuinely separate enum from app_role (see header).
-- platform_analyst is read-only everywhere platform data is exposed; nothing
-- in this phase lets an analyst write anything.
-- ---------------------------------------------------------------------------
create type platform_role as enum ('platform_owner', 'platform_admin', 'platform_analyst');

-- ---------------------------------------------------------------------------
-- platform_administrators — one row per user holding platform-wide
-- authority. Reuses membership_status ('active'/'revoked') from
-- 20260909000002 rather than a new enum, for the same "revoked, not
-- deleted" auditability every other membership-shaped table in this schema
-- already has.
-- ---------------------------------------------------------------------------
create table public.platform_administrators (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id),
  role platform_role not null,
  status membership_status not null default 'active',
  granted_by uuid references public.profiles (id),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.platform_administrators enable row level security;

create or replace function public.touch_platform_administrators_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger platform_administrators_touch_updated_at
  before update on public.platform_administrators
  for each row execute function public.touch_platform_administrators_updated_at();

-- ---------------------------------------------------------------------------
-- platform_role_audit_log — append-only. Every grant/revoke/role-change the
-- manual script performs writes exactly one row here, so "who has platform
-- authority and when it changed" is always independently reconstructable,
-- never inferred from platform_administrators' own current-state row alone.
-- performed_by is nullable: the very first grant on a brand-new project has
-- no prior platform admin to attribute the action to (see bootstrap-style
-- reasoning in scripts/bootstrap-workspace.mts) — performed_by_note carries
-- a human-readable operator label in that case instead of fabricating an
-- actor.
-- ---------------------------------------------------------------------------
create table public.platform_role_audit_log (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null references public.profiles (id),
  action text not null check (action in ('granted', 'revoked', 'role_changed')),
  role platform_role not null,
  previous_role platform_role,
  performed_by uuid references public.profiles (id),
  performed_by_note text,
  created_at timestamptz not null default now()
);

alter table public.platform_role_audit_log enable row level security;

create index platform_role_audit_log_target_idx on public.platform_role_audit_log (target_user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- app_private helpers — SECURITY DEFINER, same discipline as every other
-- helper in 20260909000007: pinned search_path, never granted directly to
-- anon/authenticated, only ever referenced from inside a policy.
-- ---------------------------------------------------------------------------
create or replace function app_private.is_platform_admin(target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.platform_administrators a
    where a.user_id = target_user_id
      and a.status = 'active'
      and a.role in ('platform_owner', 'platform_admin')
  );
$$;

create or replace function app_private.is_platform_owner(target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.platform_administrators a
    where a.user_id = target_user_id
      and a.status = 'active'
      and a.role = 'platform_owner'
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS policies.
--
-- platform_administrators: a user may always read their OWN row (so
-- lib/production/platform-auth.ts can resolve "am I a platform admin, and
-- which role" through the caller's own RLS-governed session — never the
-- admin client, for this specific check); a platform_owner/platform_admin
-- may additionally read every row (so the Command Center can show the
-- current roster of platform administrators). No INSERT/UPDATE/DELETE
-- policy exists for `authenticated` at all.
-- ---------------------------------------------------------------------------
create policy platform_administrators_select on public.platform_administrators for select to authenticated
  using (user_id = auth.uid() or app_private.is_platform_admin(auth.uid()));

-- platform_role_audit_log: platform_owner/platform_admin only (an analyst is
-- read-only on operational data, not necessarily on who holds administrative
-- authority — the narrower default). No INSERT/UPDATE/DELETE policy exists
-- for `authenticated` at all; only the service-role script ever writes here.
create policy platform_role_audit_log_select_admin on public.platform_role_audit_log for select to authenticated
  using (app_private.is_platform_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- Grants — explicit revoke-then-selective-grant, same pattern
-- 20260909000011/20260911000013 already use for tables created after
-- 20260909000008's blanket statements. Deliberately narrower here than any
-- prior table in this schema: SELECT only, nothing else, for either table —
-- there is no legitimate authenticated-role write path to platform role
-- data at all, only the service-role script.
-- ---------------------------------------------------------------------------
revoke all on public.platform_administrators from anon;
revoke all on public.platform_administrators from authenticated;
grant select on public.platform_administrators to authenticated;

revoke all on public.platform_role_audit_log from anon;
revoke all on public.platform_role_audit_log from authenticated;
grant select on public.platform_role_audit_log to authenticated;
