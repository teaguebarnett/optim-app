-- Gate 4.0C-4 — Fitness Reasoner production integration: one row per
-- requested Reasoner proposal generation.
--
-- * Single-flight: at most one 'preparing' job per client (partial unique
--   index) — a repeated click or a second tab can never start a second paid
--   Reasoner run while one is in flight.
-- * Audit/replay: the serialized ReasonerRun (versions, input/state hashes,
--   snapshots of the normalized ClientState / GoalContract / ConstraintSet,
--   attempts with token usage and latency, validator outcome) is kept with
--   the job. It never contains credentials or raw provider error text
--   (lib/synthesis/reasoner/run.ts; tested).
-- * Authority: workspace staff only. Clients never read this table. A
--   successful job only ever points at a DRAFT training_program_versions row;
--   approval/publishing stays in the existing proposal lifecycle.

create table public.reasoner_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_profile_id uuid not null references public.client_profiles(id) on delete cascade,
  requested_by uuid not null references auth.users(id),
  status text not null default 'preparing' check (status in ('preparing', 'ready_for_review', 'needs_input', 'unsupported', 'failed')),
  -- Safe, fixed failure categories only (never provider text).
  failure_category text check (failure_category in ('provider_failed', 'rejected_by_validators', 'timed_out', 'draft_not_saved', 'superseded')),
  program_version_id uuid references public.training_program_versions(id) on delete set null,
  title text not null,
  -- Coach-facing outcome (missing inputs, unsupported-domain message, short failure explanation).
  outcome jsonb not null default '{}'::jsonb,
  -- Serialized ReasonerRun (optim.reasoner-run.v1) for audit / replay.
  run jsonb,
  reasoner_version text,
  prompt_version text,
  knowledge_version text,
  model_id text,
  input_hash text,
  client_state_hash text,
  goal_contract_hash text,
  constraint_set_hash text,
  model_calls integer,
  input_tokens integer,
  output_tokens integer,
  latency_ms integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create unique index reasoner_generation_jobs_one_in_flight_per_client
  on public.reasoner_generation_jobs (client_profile_id)
  where status = 'preparing';

create index reasoner_generation_jobs_client_recent
  on public.reasoner_generation_jobs (client_profile_id, created_at desc);

alter table public.reasoner_generation_jobs enable row level security;

create policy reasoner_generation_jobs_select_staff on public.reasoner_generation_jobs for select to authenticated
  using (app_private.is_workspace_staff(workspace_id));

create policy reasoner_generation_jobs_insert_staff on public.reasoner_generation_jobs for insert to authenticated
  with check (app_private.is_workspace_staff(workspace_id) and requested_by = auth.uid() and status = 'preparing');

create policy reasoner_generation_jobs_update_staff on public.reasoner_generation_jobs for update to authenticated
  using (app_private.is_workspace_staff(workspace_id))
  with check (app_private.is_workspace_staff(workspace_id));

-- No delete policy: job rows are audit history.

grant select, insert, update on public.reasoner_generation_jobs to authenticated;
grant all on public.reasoner_generation_jobs to service_role;
