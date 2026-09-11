-- Phase 6.0D-B — Controlled Live-Client Pilot and Production Client Lifecycle.
--
-- client_onboarding_progress — the Supabase-mode analog of
-- lib/coach/platform-store.ts's SAVE_ONBOARDING_STEP/COMPLETE_ONBOARDING
-- reducer actions (demo mode's OnboardingProgress, see
-- lib/coach/types.ts). One row per client, upserted chapter-by-chapter as
-- components/onboarding/onboarding-wizard.tsx already does in demo mode —
-- `answers` is the exact same `Partial<Record<OnboardingStepId,
-- OnboardingStepAnswers>>` shape, reused wholesale as the jsonb payload for
-- the same "one coherent, versionable typed payload" reason
-- 20260909000004's own header documents for program/nutrition content.
--
-- Client-authored, staff-read-only — mirrors daily_records
-- (20260909000011) exactly: the client is the only writer of their own
-- progress; their assigned coach/workspace admin gets read-only visibility
-- (can_access_client), never write access (a coach must never silently
-- rewrite what a client actually answered).
--
-- Deliberately does NOT introduce a new lifecycle/enrollment_status enum
-- value for "invited" / "onboarding" / "awaiting coach review": those three
-- states are derived in application code (see lib/production/roster.ts)
-- from the tuple (client_enrollments.status, this row's existence,
-- completed_at) — no client_profiles/client_enrollments row is
-- client-writable at all (see 20260909000008's staff-only policies), so a
-- client-driven state transition can only ever be expressed by a write to a
-- table the client actually owns. This keeps "the client declared their
-- onboarding progress" and "the coach controls the client's program
-- position" as two genuinely separate authorities, exactly like
-- daily_records vs. program_assignments already are.

create table public.client_onboarding_progress (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  client_profile_id uuid not null references public.client_profiles (id) on delete cascade,
  current_step_index integer not null default 0,
  answers jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_profile_id)
);

alter table public.client_onboarding_progress enable row level security;

create index client_onboarding_progress_workspace_id_idx on public.client_onboarding_progress (workspace_id);

create trigger client_onboarding_progress_touch_updated_at
  before update on public.client_onboarding_progress
  for each row execute function public.touch_daily_records_updated_at();

create policy client_onboarding_progress_select on public.client_onboarding_progress for select to authenticated
  using (app_private.can_access_client(client_profile_id));

create policy client_onboarding_progress_insert_self on public.client_onboarding_progress for insert to authenticated
  with check (app_private.is_client_self(client_profile_id) and workspace_id = app_private.client_workspace_id(client_profile_id));

create policy client_onboarding_progress_update_self on public.client_onboarding_progress for update to authenticated
  using (app_private.is_client_self(client_profile_id))
  with check (app_private.is_client_self(client_profile_id) and workspace_id = app_private.client_workspace_id(client_profile_id));

-- Same explicit anon revoke every table created after 20260909000008 needs
-- (see that file's blanket revoke, and 20260909000011's own note on why a
-- later-created table never inherited it automatically).
revoke all on public.client_onboarding_progress from anon;
grant select, insert, update on public.client_onboarding_progress to authenticated;
revoke delete on public.client_onboarding_progress from authenticated;

-- ---------------------------------------------------------------------------
-- client_enrollments.archived_at — a real, additive terminal marker a coach
-- can set once a client is already 'offboarded' (see
-- lib/production/roster.ts's deriveLifecycle: 'offboarded' displays as
-- "Completed", archived_at set displays as "Archived") — never a DELETE,
-- never a new enrollment_status enum value (avoids an ALTER TYPE ADD VALUE
-- migration-ordering hazard for a distinction that's cosmetic/filtering
-- only, not a new authorization boundary). History is never lost either
-- way: daily_records, conversation history, coach notes, and program/
-- nutrition assignment history all remain exactly as they were.
-- ---------------------------------------------------------------------------
alter table public.client_enrollments add column archived_at timestamptz;
