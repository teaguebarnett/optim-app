-- Gate 3 — Coach Brain foundation.
--
-- OPTIM is one shared core intelligence; each coach gets an isolated Coach
-- Brain representing how THEY coach. This migration creates the canonical,
-- per-coach source of confirmed methodology. It deliberately does NOT reuse
-- coach_playbooks: that table is workspace-scoped (one approved row per
-- workspace, readable/writable by every staff member) and is auto-created
-- with OPTIM defaults stored as "approved" — so it can't enforce coach-level
-- isolation, and an approved-looking row there is not evidence a coach chose
-- anything. coach_playbooks stays as legacy compatibility scaffolding only;
-- nothing in it ever counts as calibration.
--
-- Three tables, every row owned by exactly ONE coach in ONE workspace:
--
--   coach_brains                — the anchor: one per (workspace, coach).
--                                 Points at the active confirmed method
--                                 version; carries calibration state.
--   coach_method_versions       — immutable, versioned, coach-CONFIRMED
--                                 methodology snapshots (operating model with
--                                 per-field provenance, explicit AI
--                                 authority, the explicit calibration answers
--                                 that produced it). Insert-only.
--   coach_calibration_progress  — in-progress explicit answers + position
--                                 (initial calibration, or a later "review or
--                                 update your method" draft). Never read as
--                                 methodology; never affects the active
--                                 version until the coach confirms.
--
-- Inferred learning stays where it already is and stays separate:
-- coach_decision_evidence / coach_pattern_candidate_dispositions /
-- coach_learned_rules (already coach_user_id-scoped). Nothing here lets an
-- inferred tendency become confirmed methodology; a new method version is
-- only ever created by confirm_coach_method(), called on an explicit coach
-- confirmation.
--
-- Isolation: RLS requires coach_user_id = auth.uid() AND current workspace
-- staff membership on every row. A coach can never read or modify another
-- coach's brain, method, or calibration — even in the same workspace. Server
-- code that must apply a client's PRIMARY coach's method while someone else
-- is acting (e.g. chat, run as the client) reads through the service role
-- after its own authorization check, exactly like existing coach_playbooks
-- reads in lib/production/chat.ts.

create type coach_calibration_status as enum ('not_started', 'in_progress', 'calibrated');
create type coach_method_source as enum ('calibration', 'method_review', 'authority_update');
create type coach_calibration_mode as enum ('initial', 'review');

-- ---------------------------------------------------------------------------
-- coach_brains
-- ---------------------------------------------------------------------------
create table public.coach_brains (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  coach_user_id uuid not null references public.profiles (id) on delete cascade,
  calibration_status coach_calibration_status not null default 'not_started',
  -- Set only by confirm_coach_method(); FK added below (circular reference).
  active_method_version_id uuid,
  calibrated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, coach_user_id),
  constraint coach_brains_calibrated_requires_method check (
    calibration_status <> 'calibrated' or (active_method_version_id is not null and calibrated_at is not null)
  )
);

-- ---------------------------------------------------------------------------
-- coach_method_versions — immutable
-- ---------------------------------------------------------------------------
create table public.coach_method_versions (
  id uuid primary key default gen_random_uuid(),
  brain_id uuid not null references public.coach_brains (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  coach_user_id uuid not null references public.profiles (id) on delete cascade,
  version integer not null check (version >= 1),
  source coach_method_source not null,
  -- CoachOperatingModel, including its per-field provenance map
  -- (coach_selected / coach_confirmed / inferred / optim_default).
  operating_model jsonb not null,
  -- The coach's explicit AI authority (CoachAiAuthoritySettings).
  ai_authority jsonb not null,
  -- The explicit calibration answers this version was confirmed from.
  calibration_answers jsonb not null,
  -- Coach-approved examples (none at calibration; reserved for explicit
  -- coach-approved additions — never auto-learned).
  examples jsonb not null default '[]'::jsonb,
  supersedes_version_id uuid references public.coach_method_versions (id),
  confirmed_by uuid not null references public.profiles (id),
  confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (brain_id, version),
  constraint coach_method_versions_confirmed_by_owner check (confirmed_by = coach_user_id)
);

alter table public.coach_brains
  add constraint coach_brains_active_method_version_fk
  foreign key (active_method_version_id) references public.coach_method_versions (id);

create index coach_method_versions_brain_idx on public.coach_method_versions (brain_id, version desc);

-- Historical truth never changes: block every UPDATE, even from the service
-- role (DELETE is only reachable through cascade from the brain/workspace).
create or replace function app_private.forbid_coach_method_version_update()
returns trigger
language plpgsql
as $$
begin
  raise exception 'coach_method_versions rows are immutable — confirm a new version instead';
end;
$$;

create trigger coach_method_versions_immutable
  before update on public.coach_method_versions
  for each row execute function app_private.forbid_coach_method_version_update();

-- ---------------------------------------------------------------------------
-- coach_calibration_progress
-- ---------------------------------------------------------------------------
create table public.coach_calibration_progress (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  coach_user_id uuid not null references public.profiles (id) on delete cascade,
  mode coach_calibration_mode not null default 'initial',
  -- For mode = 'review': the active version the draft was prefilled from.
  base_method_version_id uuid references public.coach_method_versions (id),
  answers jsonb not null default '{}'::jsonb,
  -- Draft AI authority for this calibration/review; applied only on confirm.
  ai_authority jsonb,
  ai_authority_confirmed_at timestamptz,
  current_chapter_id text,
  current_question_index integer not null default 0 check (current_question_index >= 0),
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  review_reached_at timestamptz,
  completed_at timestamptz,
  -- The version this progress produced, once confirmed.
  confirmed_method_version_id uuid references public.coach_method_versions (id),
  unique (workspace_id, coach_user_id)
);

-- ---------------------------------------------------------------------------
-- RLS — coach-level isolation inside workspace authorization
-- ---------------------------------------------------------------------------
alter table public.coach_brains enable row level security;
alter table public.coach_method_versions enable row level security;
alter table public.coach_calibration_progress enable row level security;

revoke all on public.coach_brains from anon;
revoke all on public.coach_method_versions from anon;
revoke all on public.coach_calibration_progress from anon;
revoke delete on public.coach_brains from authenticated;
revoke update, delete on public.coach_method_versions from authenticated;
revoke delete on public.coach_calibration_progress from authenticated;

create policy coach_brains_select_own on public.coach_brains for select to authenticated
  using (coach_user_id = auth.uid() and app_private.is_workspace_staff(workspace_id));
create policy coach_brains_insert_own on public.coach_brains for insert to authenticated
  with check (coach_user_id = auth.uid() and app_private.is_workspace_staff(workspace_id) and calibration_status = 'not_started' and active_method_version_id is null);
-- Calibration state/active version change only through confirm_coach_method
-- (security invoker, so this same policy applies to it) or the progress
-- bookkeeping below; a coach can only ever touch their own brain.
create policy coach_brains_update_own on public.coach_brains for update to authenticated
  using (coach_user_id = auth.uid() and app_private.is_workspace_staff(workspace_id))
  with check (
    coach_user_id = auth.uid()
    and app_private.is_workspace_staff(workspace_id)
    -- The active pointer can only ever name one of THIS brain's own versions.
    and (
      active_method_version_id is null
      or exists (
        select 1 from public.coach_method_versions v
        where v.id = coach_brains.active_method_version_id
          and v.brain_id = coach_brains.id
          and v.coach_user_id = auth.uid()
      )
    )
  );

create policy coach_method_versions_select_own on public.coach_method_versions for select to authenticated
  using (coach_user_id = auth.uid() and app_private.is_workspace_staff(workspace_id));
create policy coach_method_versions_insert_own on public.coach_method_versions for insert to authenticated
  with check (
    coach_user_id = auth.uid()
    and confirmed_by = auth.uid()
    and app_private.is_workspace_staff(workspace_id)
    and exists (
      select 1 from public.coach_brains b
      where b.id = coach_method_versions.brain_id
        and b.coach_user_id = auth.uid()
        and b.workspace_id = coach_method_versions.workspace_id
    )
  );

create policy coach_calibration_progress_select_own on public.coach_calibration_progress for select to authenticated
  using (coach_user_id = auth.uid() and app_private.is_workspace_staff(workspace_id));
create policy coach_calibration_progress_insert_own on public.coach_calibration_progress for insert to authenticated
  with check (coach_user_id = auth.uid() and app_private.is_workspace_staff(workspace_id));
create policy coach_calibration_progress_update_own on public.coach_calibration_progress for update to authenticated
  using (coach_user_id = auth.uid() and app_private.is_workspace_staff(workspace_id))
  with check (coach_user_id = auth.uid() and app_private.is_workspace_staff(workspace_id));

-- ---------------------------------------------------------------------------
-- confirm_coach_method — the ONLY path to a new confirmed method version.
-- One transaction: insert the immutable version, point the brain at it,
-- mark calibration complete, and close the progress row. If any step fails,
-- nothing changes — the workspace never unlocks on a half-written method.
-- SECURITY INVOKER: every statement runs under the caller's own RLS, so a
-- coach can only ever confirm their own method in a workspace they staff.
-- p_expected_active_version_id guards against a concurrent confirmation
-- (stale review draft): the caller must name the version it started from.
-- ---------------------------------------------------------------------------
create or replace function public.confirm_coach_method(
  p_workspace_id uuid,
  p_source coach_method_source,
  p_operating_model jsonb,
  p_ai_authority jsonb,
  p_calibration_answers jsonb,
  p_expected_active_version_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_coach uuid := auth.uid();
  v_brain public.coach_brains%rowtype;
  v_next integer;
  v_version_id uuid;
begin
  if v_coach is null then
    raise exception 'confirm_coach_method: not authenticated';
  end if;
  -- Workspace-staff and same-coach authorization are enforced by the RLS
  -- policies on every statement below (this function is SECURITY INVOKER):
  -- the brain row is only visible/lockable to its own coach while they
  -- staff the workspace, and the version insert / brain update policies
  -- re-check both. (app_private helpers aren't callable from a function
  -- body by authenticated users, only from policies.)

  select * into v_brain from public.coach_brains
    where workspace_id = p_workspace_id and coach_user_id = v_coach
    for update;
  if not found then
    raise exception 'confirm_coach_method: no coach brain';
  end if;

  if v_brain.active_method_version_id is distinct from p_expected_active_version_id then
    raise exception 'confirm_coach_method: active method changed since this draft started';
  end if;

  select coalesce(max(version), 0) + 1 into v_next from public.coach_method_versions where brain_id = v_brain.id;

  insert into public.coach_method_versions
    (brain_id, workspace_id, coach_user_id, version, source, operating_model, ai_authority, calibration_answers, supersedes_version_id, confirmed_by)
  values
    (v_brain.id, p_workspace_id, v_coach, v_next, p_source, p_operating_model, p_ai_authority, p_calibration_answers, v_brain.active_method_version_id, v_coach)
  returning id into v_version_id;

  update public.coach_brains
    set active_method_version_id = v_version_id,
        calibration_status = 'calibrated',
        calibrated_at = coalesce(calibrated_at, now()),
        updated_at = now()
    where id = v_brain.id;

  update public.coach_calibration_progress
    set completed_at = now(), confirmed_method_version_id = v_version_id, updated_at = now()
    where workspace_id = p_workspace_id and coach_user_id = v_coach and completed_at is null;

  return v_version_id;
end;
$$;

revoke all on function public.confirm_coach_method(uuid, coach_method_source, jsonb, jsonb, jsonb, uuid) from public, anon;
grant execute on function public.confirm_coach_method(uuid, coach_method_source, jsonb, jsonb, jsonb, uuid) to authenticated;

comment on table public.coach_brains is 'Gate 3 Coach Brain anchor — one per (workspace, coach). Canonical owner of a coach''s confirmed methodology. Never workspace-shared.';
comment on table public.coach_method_versions is 'Immutable coach-confirmed methodology versions (operating model + provenance, explicit AI authority, source calibration answers). Created only by confirm_coach_method on explicit coach confirmation.';
comment on table public.coach_calibration_progress is 'In-progress explicit calibration answers/position (initial or review draft). Never read as methodology until confirmed.';
