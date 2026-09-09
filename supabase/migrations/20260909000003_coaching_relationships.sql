-- Phase 6.0A — Production Foundation.
--
-- client_profiles, coach_client_assignments, client_enrollments — the
-- production analog of lib/tenancy/types.ts's ClientProfile/
-- CoachClientAssignment, plus the program-position anchors the "Newly
-- approved existing-client migration model" requires (original start date,
-- enrollment date, current phase/week/day, "as of" date, verified-vs-
-- imported history split) so an imported mid-program client resumes where
-- they actually are instead of restarting at Day 1.

-- ---------------------------------------------------------------------------
-- client_profiles — user_id is nullable: a client can exist here (created
-- privately by a coach, or as an import's approved staged client — see
-- 20260909000006_imports.sql) before they've ever signed in. invited_email
-- lets an invitation be sent for a client_profile that predates any
-- auth.users row; user_id is filled in only once that invitation is
-- accepted (see accept_invitation in lib/production/invite.ts's
-- accompanying SQL function, 20260909000009).
-- ---------------------------------------------------------------------------
create table public.client_profiles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid references public.profiles (id),
  invited_email text,
  display_name text not null,
  goal text,
  avatar_initials text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_profiles_user_or_invite check (user_id is not null or invited_email is not null)
);

alter table public.client_profiles enable row level security;

create index client_profiles_workspace_id_idx on public.client_profiles (workspace_id);
create unique index client_profiles_user_id_idx on public.client_profiles (user_id) where user_id is not null;

-- ---------------------------------------------------------------------------
-- coach_client_assignments — which coach(es) serve which client. A separate
-- record (not a single FK column on client_profiles) so a workspace can
-- support multiple assigned coaches per client later, matching
-- lib/tenancy/types.ts's CoachClientAssignment doc exactly. Coach-level
-- access (app_private.is_assigned_coach, added in 20260909000007) is scoped
-- through THIS table, not workspace membership alone — a plain "coach" role
-- must not see every client in the workspace, only their own assignments.
-- ---------------------------------------------------------------------------
create table public.coach_client_assignments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  coach_user_id uuid not null references public.profiles (id),
  client_profile_id uuid not null references public.client_profiles (id) on delete cascade,
  is_primary boolean not null default true,
  created_at timestamptz not null default now(),
  unique (coach_user_id, client_profile_id)
);

alter table public.coach_client_assignments enable row level security;

create index coach_client_assignments_client_idx on public.coach_client_assignments (client_profile_id);
create index coach_client_assignments_coach_idx on public.coach_client_assignments (coach_user_id);
create unique index coach_client_assignments_primary_idx
  on public.coach_client_assignments (client_profile_id)
  where is_primary;

-- ---------------------------------------------------------------------------
-- client_enrollments — the program-position anchors. "An imported client in
-- Week 7 must resume in Week 7" is enforced by current_week_index/
-- current_phase/as_of_date living here as real, independently-set columns —
-- never derived by counting elapsed calendar time from original_start_date,
-- which would silently misplace an imported or paused client.
-- ---------------------------------------------------------------------------
create type enrollment_status as enum ('invited', 'onboarding', 'active', 'paused', 'offboarded');

create table public.client_enrollments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  client_profile_id uuid not null references public.client_profiles (id) on delete cascade,
  status enrollment_status not null default 'invited',
  original_program_start_date date,
  enrollment_date date not null default current_date,
  current_phase text,
  current_week_index integer check (current_week_index is null or current_week_index >= 0),
  current_day_index integer check (current_day_index is null or current_day_index >= 0),
  as_of_date date not null default current_date,
  timezone text not null default 'UTC',
  -- true only for enrollments whose current position was set by a natively
  -- observed OPTIM session; false for one seeded by an import's approved
  -- staged position. Distinguishing "OPTIM watched this happen" from
  -- "a coach/import told OPTIM this is true" is a hard product requirement
  -- (see the import model's "must not have history rewritten as if OPTIM
  -- observed it live"), so it's a real column, not something inferred.
  position_natively_observed boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_profile_id)
);

alter table public.client_enrollments enable row level security;

create index client_enrollments_workspace_id_idx on public.client_enrollments (workspace_id);
