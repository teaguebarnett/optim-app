-- Gate U2 — Unified Program Intelligence: one PARENT row per persisted unified proposal, linking the domain DRAFTS
-- it produced (a training_program_versions draft holding lifting + executable cardio, and a nutrition_plan_versions
-- draft when the strategy fits the existing nutrition contract) and the domain ReasonerRun provenance.
--
-- * Proposed only: nothing here approves, publishes, assigns or notifies. approval_state is pinned to 'proposed'
--   (Gate U3 widens it when coach approval exists). Linked versions must be DRAFTS when linked (trigger below).
-- * Ownership: workspace staff only (same as reasoner_generation_jobs); the client must belong to the row's workspace;
--   a linked training draft must be FOR this client (content.clientId) and in this workspace; a linked nutrition draft
--   must be in this workspace. Clients never read this table.
-- * Idempotent: unique (workspace, client, idempotency_key) — the key is a hash of the planning inputs, so a retry of
--   the same request finds the same row (and its already-created drafts) instead of creating duplicates.
-- * Single-flight: at most one 'preparing' proposal per client.
-- * Audit: rows are never deleted (no delete policy or grant).
create table public.unified_program_proposals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_profile_id uuid not null references public.client_profiles(id) on delete cascade,
  requested_by uuid not null references auth.users(id),
  idempotency_key text not null,
  title text not null,
  status text not null default 'preparing' check (status in ('preparing', 'draft_ready', 'needs_coach_decision', 'incomplete', 'escalated', 'needs_input', 'incoherent', 'failed')),
  -- Safe, fixed categories only (never provider text).
  failure_category text check (failure_category in ('content_invalid', 'draft_not_saved', 'superseded')),
  approval_state text not null default 'proposed' check (approval_state = 'proposed'),
  unified_version text,
  -- The UnifiedProgramProposal (optim.unified-program-proposal.v1) as reviewed.
  proposal jsonb not null default '{}'::jsonb,
  -- Serialized domain runs (resistance / cardio / nutrition ReasonerRun artifacts) for audit and replay.
  domain_runs jsonb not null default '{}'::jsonb,
  -- A nutrition strategy that the existing nutrition contract can't hold (e.g. no carb/fat targets), kept with its
  -- meaning instead of being forced into fabricated numbers.
  nutrition_strategy jsonb,
  training_program_version_id uuid references public.training_program_versions(id) on delete set null,
  nutrition_plan_version_id uuid references public.nutrition_plan_versions(id) on delete set null,
  resistance_source text check (resistance_source in ('approved_program', 'proposed_program', 'existing_draft', 'none')),
  source_resistance_version_id uuid references public.training_program_versions(id) on delete set null,
  coach_method_version_id uuid references public.coach_method_versions(id) on delete set null,
  client_state_hash text,
  goal_contract_hash text,
  model_calls integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (workspace_id, client_profile_id, idempotency_key)
);

create unique index unified_program_proposals_one_in_flight_per_client
  on public.unified_program_proposals (client_profile_id)
  where status = 'preparing';

create index unified_program_proposals_client_recent
  on public.unified_program_proposals (client_profile_id, created_at desc);

-- Integrity of every link, checked when it is set or changed (security definer so the check sees the linked rows
-- regardless of the caller's RLS; it only reads).
create or replace function app_private.check_unified_program_proposal_links()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ws uuid;
  v_status public.plan_version_status;
  v_client text;
begin
  if (select cp.workspace_id from public.client_profiles cp where cp.id = new.client_profile_id) is distinct from new.workspace_id then
    raise exception 'unified_program_proposals: client % is not in workspace %', new.client_profile_id, new.workspace_id;
  end if;
  if new.training_program_version_id is not null and (tg_op = 'INSERT' or new.training_program_version_id is distinct from old.training_program_version_id) then
    select v.workspace_id, v.status, v.content->>'clientId' into v_ws, v_status, v_client from public.training_program_versions v where v.id = new.training_program_version_id;
    if v_ws is distinct from new.workspace_id then raise exception 'unified_program_proposals: training draft is not in this workspace'; end if;
    if v_status <> 'draft' then raise exception 'unified_program_proposals: only a DRAFT training version can be linked (got %)', v_status; end if;
    if v_client is distinct from new.client_profile_id::text then raise exception 'unified_program_proposals: training draft is not for this client'; end if;
  end if;
  if new.nutrition_plan_version_id is not null and (tg_op = 'INSERT' or new.nutrition_plan_version_id is distinct from old.nutrition_plan_version_id) then
    select v.workspace_id, v.status into v_ws, v_status from public.nutrition_plan_versions v where v.id = new.nutrition_plan_version_id;
    if v_ws is distinct from new.workspace_id then raise exception 'unified_program_proposals: nutrition draft is not in this workspace'; end if;
    if v_status <> 'draft' then raise exception 'unified_program_proposals: only a DRAFT nutrition version can be linked (got %)', v_status; end if;
  end if;
  if new.source_resistance_version_id is not null and (tg_op = 'INSERT' or new.source_resistance_version_id is distinct from old.source_resistance_version_id) then
    select v.workspace_id into v_ws from public.training_program_versions v where v.id = new.source_resistance_version_id;
    if v_ws is distinct from new.workspace_id then raise exception 'unified_program_proposals: source resistance version is not in this workspace'; end if;
  end if;
  if tg_op = 'UPDATE' and (new.workspace_id is distinct from old.workspace_id or new.client_profile_id is distinct from old.client_profile_id or new.requested_by is distinct from old.requested_by or new.idempotency_key is distinct from old.idempotency_key) then
    raise exception 'unified_program_proposals: ownership and idempotency key are immutable';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function app_private.check_unified_program_proposal_links() from public;

create trigger unified_program_proposals_links
  before insert or update on public.unified_program_proposals
  for each row execute function app_private.check_unified_program_proposal_links();

alter table public.unified_program_proposals enable row level security;

create policy unified_program_proposals_select_staff on public.unified_program_proposals for select to authenticated
  using (app_private.is_workspace_staff(workspace_id));

create policy unified_program_proposals_insert_staff on public.unified_program_proposals for insert to authenticated
  with check (app_private.is_workspace_staff(workspace_id) and requested_by = auth.uid() and status = 'preparing' and approval_state = 'proposed');

create policy unified_program_proposals_update_staff on public.unified_program_proposals for update to authenticated
  using (app_private.is_workspace_staff(workspace_id))
  with check (app_private.is_workspace_staff(workspace_id));

-- No delete policy: proposal rows are audit history.
revoke all on public.unified_program_proposals from anon;
revoke all on public.unified_program_proposals from authenticated;
grant select, insert, update on public.unified_program_proposals to authenticated;
grant all on public.unified_program_proposals to service_role;
