-- Phase 6.0B — Persist the Complete Revenue Loop.
--
-- Two things this vertical slice needs that 6.0A's schema didn't yet have:
--
-- 1. A hardened, atomic "make this published version the client's one
--    active assignment" transition (training AND nutrition) — the ordinary
--    RLS-governed INSERT policy 6.0A shipped for program_assignments/
--    nutrition_plan_assignments checks who's assigning (can_manage_client)
--    but never checked what they're assigning: a coach could INSERT an
--    assignment row pointing at a still-DRAFT version, and
--    training_program_versions_select's own policy would then let that
--    client see it — a real gap against "draft content remains private to
--    the coach" and "only an approved and published assignment can become
--    active." Closed two ways: the WITH CHECK below now requires the
--    referenced version to already be 'published', AND the actual
--    transition (retire the old active row, insert the new one) moves into
--    one SECURITY DEFINER function so it's a single atomic statement no
--    concurrent caller can interleave with — the existing
--    program_assignments_one_active_idx / nutrition_plan_assignments_one_
--    active_idx unique partial indexes from 20260909000004 make a second,
--    genuinely concurrent attempt fail outright (safely rejected) rather
--    than ever create two active rows for the same client.
--
-- 2. Somewhere to persist real client-logged daily activity — workout set
--    completion/RPE/skips, day completion, nutrition adherence — so a
--    client's actual session survives a refresh. 6.0A's schema had no such
--    table; the closest existing shape is the demo prototype's own
--    lib/history/types.ts TrainingDaySnapshot/NutritionDaySnapshot, reused
--    here as the `content` jsonb payload (see daily_records below) for
--    exactly the same "one coherent, versionable typed payload" reasoning
--    20260909000004's own header already documents for program/nutrition
--    content — never queried field-by-field, changes shape with the client
--    app faster than a migration cadence should gate.

-- ---------------------------------------------------------------------------
-- Close the draft-visibility gap: an assignment can only ever be inserted
-- pointing at an already-published version.
-- ---------------------------------------------------------------------------
drop policy if exists program_assignments_insert_staff on public.program_assignments;
create policy program_assignments_insert_staff on public.program_assignments for insert to authenticated
  with check (
    app_private.can_manage_client(client_profile_id)
    and assigned_by = auth.uid()
    and exists (
      select 1 from public.training_program_versions v
      where v.id = program_version_id and v.status = 'published'
    )
  );

drop policy if exists nutrition_plan_assignments_insert_staff on public.nutrition_plan_assignments;
create policy nutrition_plan_assignments_insert_staff on public.nutrition_plan_assignments for insert to authenticated
  with check (
    app_private.can_manage_client(client_profile_id)
    and assigned_by = auth.uid()
    and exists (
      select 1 from public.nutrition_plan_versions v
      where v.id = plan_version_id and v.status = 'published'
    )
  );

-- ---------------------------------------------------------------------------
-- assign_active_program_version / assign_active_nutrition_plan_version —
-- the one atomic transition: retire whatever assignment is currently
-- active for this client (if any) and insert the new one, as a single
-- statement. SECURITY DEFINER so it can perform both writes in one
-- transaction, but it re-derives and re-checks the caller's authority
-- itself first (can_manage_client) rather than trusting RLS to have already
-- gated entry — a SECURITY DEFINER function bypasses RLS on the tables it
-- touches, so it must never skip doing that check itself. Raises (rather
-- than silently no-op'ing) on an unpublished/foreign-workspace version, so
-- a caller can't get a false "success" for an assignment that didn't
-- actually happen.
-- ---------------------------------------------------------------------------
create or replace function public.assign_active_program_version(
  p_client_profile_id uuid,
  p_program_version_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_workspace_id uuid;
  v_status plan_version_status;
  v_assignment_id uuid;
begin
  if not app_private.can_manage_client(p_client_profile_id) then
    raise exception 'assign_active_program_version: not authorized to manage client %', p_client_profile_id;
  end if;

  select workspace_id, status into v_workspace_id, v_status
  from public.training_program_versions
  where id = p_program_version_id
  for update;

  if v_workspace_id is null then
    raise exception 'assign_active_program_version: no such program version %', p_program_version_id;
  end if;
  if v_workspace_id is distinct from app_private.client_workspace_id(p_client_profile_id) then
    raise exception 'assign_active_program_version: version % does not belong to client %''s workspace', p_program_version_id, p_client_profile_id;
  end if;
  if v_status is distinct from 'published' then
    raise exception 'assign_active_program_version: version % is not published (status=%)', p_program_version_id, v_status;
  end if;

  -- Serializes concurrent assign attempts for the SAME client: the second
  -- caller blocks here until the first's transaction commits or rolls
  -- back, then sees the already-updated (non-active) row and proceeds
  -- cleanly rather than racing the unique index.
  perform 1 from public.program_assignments
  where client_profile_id = p_client_profile_id and status = 'active'
  for update;

  update public.program_assignments
  set status = 'replaced'
  where client_profile_id = p_client_profile_id and status = 'active';

  insert into public.program_assignments (workspace_id, client_profile_id, program_version_id, assigned_by, status)
  values (v_workspace_id, p_client_profile_id, p_program_version_id, auth.uid(), 'active')
  returning id into v_assignment_id;

  insert into public.publication_events (workspace_id, entity_type, entity_id, event_type, actor_user_id, actor_role, metadata)
  values (
    v_workspace_id,
    'training_program_version',
    p_program_version_id,
    'activated',
    auth.uid(),
    (select role from public.workspace_memberships where workspace_id = v_workspace_id and user_id = auth.uid() and status = 'active' limit 1),
    jsonb_build_object('client_profile_id', p_client_profile_id, 'assignment_id', v_assignment_id)
  );

  return v_assignment_id;
end;
$$;

create or replace function public.assign_active_nutrition_plan_version(
  p_client_profile_id uuid,
  p_plan_version_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_workspace_id uuid;
  v_status plan_version_status;
  v_assignment_id uuid;
begin
  if not app_private.can_manage_client(p_client_profile_id) then
    raise exception 'assign_active_nutrition_plan_version: not authorized to manage client %', p_client_profile_id;
  end if;

  select workspace_id, status into v_workspace_id, v_status
  from public.nutrition_plan_versions
  where id = p_plan_version_id
  for update;

  if v_workspace_id is null then
    raise exception 'assign_active_nutrition_plan_version: no such plan version %', p_plan_version_id;
  end if;
  if v_workspace_id is distinct from app_private.client_workspace_id(p_client_profile_id) then
    raise exception 'assign_active_nutrition_plan_version: version % does not belong to client %''s workspace', p_plan_version_id, p_client_profile_id;
  end if;
  if v_status is distinct from 'published' then
    raise exception 'assign_active_nutrition_plan_version: version % is not published (status=%)', p_plan_version_id, v_status;
  end if;

  perform 1 from public.nutrition_plan_assignments
  where client_profile_id = p_client_profile_id and status = 'active'
  for update;

  update public.nutrition_plan_assignments
  set status = 'replaced'
  where client_profile_id = p_client_profile_id and status = 'active';

  insert into public.nutrition_plan_assignments (workspace_id, client_profile_id, plan_version_id, assigned_by, status)
  values (v_workspace_id, p_client_profile_id, p_plan_version_id, auth.uid(), 'active')
  returning id into v_assignment_id;

  insert into public.publication_events (workspace_id, entity_type, entity_id, event_type, actor_user_id, actor_role, metadata)
  values (
    v_workspace_id,
    'nutrition_plan_version',
    p_plan_version_id,
    'activated',
    auth.uid(),
    (select role from public.workspace_memberships where workspace_id = v_workspace_id and user_id = auth.uid() and status = 'active' limit 1),
    jsonb_build_object('client_profile_id', p_client_profile_id, 'assignment_id', v_assignment_id)
  );

  return v_assignment_id;
end;
$$;

revoke all on function public.assign_active_program_version(uuid, uuid) from public;
grant execute on function public.assign_active_program_version(uuid, uuid) to authenticated;
revoke all on function public.assign_active_nutrition_plan_version(uuid, uuid) from public;
grant execute on function public.assign_active_nutrition_plan_version(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- daily_records — one row per (client, local calendar date). Upserted
-- through the day as the client logs sets/meals/skips, exactly mirroring
-- how the demo prototype's own AppState is a single live record per day
-- (see lib/history/build-daily-record.ts — this table's `content` shape is
-- deliberately { training: TrainingDaySnapshot, nutrition:
-- NutritionDaySnapshot }, the exact same types that function already
-- produces, so the Supabase adapter never invents a parallel shape).
-- Client-authored: the client themselves is the only writer; their coach/
-- workspace admin gets read-only visibility (can_access_client), matching
-- "the authorized coach must see the resulting client state ... without
-- cross-client leakage" without ever letting a coach silently rewrite what
-- a client actually logged.
-- ---------------------------------------------------------------------------
create table public.daily_records (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  client_profile_id uuid not null references public.client_profiles (id) on delete cascade,
  program_assignment_id uuid references public.program_assignments (id),
  date_iso date not null,
  content jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_profile_id, date_iso)
);

alter table public.daily_records enable row level security;

create index daily_records_workspace_id_idx on public.daily_records (workspace_id);
create index daily_records_client_id_idx on public.daily_records (client_profile_id);

create or replace function public.touch_daily_records_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger daily_records_touch_updated_at
  before update on public.daily_records
  for each row execute function public.touch_daily_records_updated_at();

create policy daily_records_select on public.daily_records for select to authenticated
  using (app_private.can_access_client(client_profile_id));

create policy daily_records_insert_self on public.daily_records for insert to authenticated
  with check (app_private.is_client_self(client_profile_id) and workspace_id = app_private.client_workspace_id(client_profile_id));

create policy daily_records_update_self on public.daily_records for update to authenticated
  using (app_private.is_client_self(client_profile_id))
  with check (app_private.is_client_self(client_profile_id) and workspace_id = app_private.client_workspace_id(client_profile_id));

-- Explicit anon revoke — 20260909000008's blanket `revoke all on all
-- tables in schema public from anon` only ever covered tables that already
-- existed when it ran; daily_records is created here, in a later
-- migration, so it never inherited that revoke and (confirmed live by this
-- phase's own pgTAP run: anon could SELECT it, 0-row RLS-filtered rather
-- than grant-denied, before this line was added) needs the exact same
-- explicit revoke every table created after 20260909000008 will need
-- going forward.
revoke all on public.daily_records from anon;
grant select, insert, update on public.daily_records to authenticated;
revoke delete on public.daily_records from authenticated;
