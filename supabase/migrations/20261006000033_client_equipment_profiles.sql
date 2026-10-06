-- Equipment specificity — the specific machines / apparatus a coach has confirmed present (or absent) where a
-- client trains. "Machine access" from intake never implies a particular machine; planning treats any apparatus
-- not confirmed here (and not in the gym-type baseline) as unknown.
--
-- * One row per client; `apparatus` maps apparatus ids (Fitness Knowledge taxonomy) to 'available' | 'unavailable'.
--   The application validates ids and states; unknown ids are ignored on read.
-- * Authority: workspace staff only (coach-confirmed planning state). Clients never read this table.
-- * History: confirmed_by / confirmed_at record the latest confirmation; changes are explicit coach updates.

create table public.client_equipment_profiles (
  client_profile_id uuid primary key references public.client_profiles(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  apparatus jsonb not null default '{}'::jsonb check (jsonb_typeof(apparatus) = 'object'),
  confirmed_by uuid not null references auth.users(id),
  confirmed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index client_equipment_profiles_workspace on public.client_equipment_profiles (workspace_id);

alter table public.client_equipment_profiles enable row level security;

create policy client_equipment_profiles_select_staff on public.client_equipment_profiles for select to authenticated
  using (app_private.is_workspace_staff(workspace_id));

create policy client_equipment_profiles_insert_staff on public.client_equipment_profiles for insert to authenticated
  with check (app_private.is_workspace_staff(workspace_id) and confirmed_by = auth.uid());

create policy client_equipment_profiles_update_staff on public.client_equipment_profiles for update to authenticated
  using (app_private.is_workspace_staff(workspace_id))
  with check (app_private.is_workspace_staff(workspace_id) and confirmed_by = auth.uid());

-- No delete policy: a confirmation is changed by updating it, never silently removed.

revoke all on public.client_equipment_profiles from anon;
revoke all on public.client_equipment_profiles from authenticated;
grant select, insert, update on public.client_equipment_profiles to authenticated;
grant all on public.client_equipment_profiles to service_role;
