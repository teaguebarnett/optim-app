-- Phase 6.0A — Production Foundation.
--
-- Core identity: profiles (one row per Supabase Auth user), workspaces,
-- workspace_memberships (role-per-workspace), workspace_invitations
-- (invite-only account creation — see handle_new_user trigger at the bottom
-- and lib/production/invite.ts, the only code path allowed to create an
-- auth.users row for a not-yet-existing person).
--
-- RLS is enabled on every table the instant it's created (fail-closed: a
-- table with RLS on and zero policies denies all access to every role
-- except the service-role key, which bypasses RLS entirely by design).
-- Policies themselves are added in 20260909000008_rls_policies.sql, once
-- every table below and the coaching/program/communications/import tables
-- all exist and app_private's helpers (20260909000007) can reference them.

-- ---------------------------------------------------------------------------
-- profiles — one row per Supabase Auth user (auth.users is Supabase-managed
-- and lives outside `public`; this is the public-schema identity row every
-- other table's user_id/actor_user_id/*_by column points at).
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  email text,
  avatar_initials text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

comment on table public.profiles is
  'One row per auth.users identity. Created automatically by handle_new_user (bottom of this file) the moment a real Supabase Auth account exists — never created ahead of auth.users, and auth.users itself is only ever created by an authorized invitation/bootstrap flow (shouldCreateUser: false everywhere else). See lib/production/invite.ts.';

-- ---------------------------------------------------------------------------
-- workspaces
-- ---------------------------------------------------------------------------
create type workspace_status as enum ('active', 'suspended', 'trial');

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles (id),
  display_name text not null,
  business_name text not null,
  status workspace_status not null default 'active',
  primary_color text not null default '#3157F6',
  accent_color text not null default '#2544c9',
  assistant_display_name text not null default 'OPTIM Assistant',
  show_powered_by_optim boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.workspaces enable row level security;

create index workspaces_owner_user_id_idx on public.workspaces (owner_user_id);

-- ---------------------------------------------------------------------------
-- workspace_memberships — a user's role inside one specific workspace. A
-- user with no row here for a workspace has no access to it whatsoever,
-- mirroring lib/tenancy/context.ts's resolveActiveContext default-deny
-- posture exactly, now enforced at the database layer instead of only in
-- frontend TypeScript.
-- ---------------------------------------------------------------------------
create type membership_status as enum ('active', 'revoked');

create table public.workspace_memberships (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role app_role not null,
  status membership_status not null default 'active',
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

alter table public.workspace_memberships enable row level security;

create index workspace_memberships_user_id_idx on public.workspace_memberships (user_id);
create index workspace_memberships_workspace_id_idx on public.workspace_memberships (workspace_id);
-- Every tenant-scoped policy in 20260909000008 filters memberships by
-- (workspace_id, user_id, status) together on nearly every request — see
-- app_private.is_workspace_member/has_workspace_role — so a composite index
-- matching that exact predicate shape matters far more here than on most
-- tables in this schema.
create index workspace_memberships_lookup_idx on public.workspace_memberships (workspace_id, user_id, status);

-- ---------------------------------------------------------------------------
-- workspace_invitations — the only sanctioned way a new person enters a
-- workspace. A generic passwordless sign-in attempt (shouldCreateUser:
-- false) can never create an account; only accepting a still-pending,
-- unexpired invitation (via the secure Supabase invite/magic-link
-- confirmation flow) can. See lib/production/invite.ts.
-- ---------------------------------------------------------------------------
create type invitation_status as enum ('pending', 'accepted', 'revoked', 'expired');

create table public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email text not null,
  role app_role not null,
  invited_by uuid not null references public.profiles (id),
  status invitation_status not null default 'pending',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id),
  constraint workspace_invitations_email_lower check (email = lower(email))
);

alter table public.workspace_invitations enable row level security;

create index workspace_invitations_workspace_id_idx on public.workspace_invitations (workspace_id);
create unique index workspace_invitations_pending_email_idx
  on public.workspace_invitations (workspace_id, lower(email))
  where status = 'pending';

-- ---------------------------------------------------------------------------
-- handle_new_user — the moment Supabase Auth creates a real auth.users row
-- (which only ever happens through the invitation/bootstrap flow, never
-- through routine OTP sign-in — see lib/production/invite.ts and
-- lib/supabase/server.ts's signInWithOtp call, both shouldCreateUser:
-- false), mirror it into public.profiles so every other table has something
-- to point at. SECURITY DEFINER + pinned search_path: this must run with
-- elevated privilege (profiles' own RLS would otherwise block the insert
-- since the new user has no session yet at trigger time), but only ever
-- inserts the exact new auth.users row, nothing else.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.profiles (id, display_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
