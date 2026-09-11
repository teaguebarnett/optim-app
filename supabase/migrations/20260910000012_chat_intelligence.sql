-- Phase 6.0C — Coach-Trained Chat Intelligence and Escalation.
--
-- Two additions on top of Phase 6.0A's communication contracts
-- (20260909000005_communications.sql) and Phase 6.0B's persistence
-- patterns:
--
-- 1. coach_playbooks — the structured, versioned, coach-editable source of
--    OPTIM's intelligence (methodology, adjustment rules, safety
--    thresholds, communication style, AI authority, and examples of prior
--    coach decisions). Mirrors lib/coach/operating-model.ts's
--    CoachOperatingModel shape (the existing "coach calibration" data
--    model) plus lib/coach/ai-authority.ts's CoachAiAuthoritySettings and a
--    `examples` array — reused wholesale as the `content` jsonb payload,
--    for the exact same "one coherent, versionable typed payload" reason
--    20260909000004's own header documents for program/nutrition content.
--    Never mutated in place: a proposed change (including a coach-decision
--    "make this an example") always creates a new draft version; only an
--    explicit coach approval promotes it to the one active version per
--    workspace (partial unique index below).
--
-- 2. conversation_messages.route_meta — non-sensitive audit metadata for
--    why an assistant response took the route it took (decision kind,
--    escalation reason if any, provider/model id, latency). Never raw
--    prompts, secrets, or unnecessary health detail — see
--    lib/ai/provider.ts's own doc for what actually gets logged here.
--
-- Escalation creation still has no authenticated-role INSERT policy (see
-- 20260909000005's own comment) — create_escalation() below is the one
-- SECURITY DEFINER path a normal authenticated session (the client's own,
-- via the chat pipeline server action) uses to create one, re-deriving and
-- re-checking authority itself exactly like assign_active_program_version
-- does, and deduplicating atomically so "the same unresolved issue" never
-- produces two open escalations.

-- ---------------------------------------------------------------------------
-- coach_playbooks
-- ---------------------------------------------------------------------------
create type coach_playbook_status as enum ('draft', 'approved');

create table public.coach_playbooks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  version integer not null,
  status coach_playbook_status not null default 'draft',
  content jsonb not null,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  superseded_at timestamptz,
  constraint coach_playbooks_approved_requires_approver check (
    status <> 'approved' or (approved_by is not null and approved_at is not null)
  ),
  unique (workspace_id, version)
);

alter table public.coach_playbooks enable row level security;

create index coach_playbooks_workspace_idx on public.coach_playbooks (workspace_id, version desc);
-- Exactly one approved (i.e. "current") playbook per workspace.
create unique index coach_playbooks_one_approved_per_workspace_idx
  on public.coach_playbooks (workspace_id)
  where status = 'approved';

revoke delete on public.coach_playbooks from authenticated;

-- Coach/admin-internal only — never selectable by a client, same posture as
-- coach_notes' "private coach notes" and CoachOperatingModel's own "no
-- coach ever sees a field key from this file" framing for the raw content;
-- here it's "no client ever sees the methodology that drives their
-- assistant," which the context-assembly server code reads with the
-- caller's own session (staff-authenticated, server-only) — never exposed
-- as a client-readable row.
create policy coach_playbooks_select_staff on public.coach_playbooks for select to authenticated
  using (app_private.is_workspace_staff(workspace_id));

create policy coach_playbooks_insert_staff on public.coach_playbooks for insert to authenticated
  with check (app_private.is_workspace_staff(workspace_id) and created_by = auth.uid());

create policy coach_playbooks_update_staff on public.coach_playbooks for update to authenticated
  using (app_private.is_workspace_staff(workspace_id))
  with check (app_private.is_workspace_staff(workspace_id));

-- ---------------------------------------------------------------------------
-- conversation_messages — non-sensitive route audit metadata. Set only at
-- insert time by the server-only pipeline; no update policy exists on this
-- table (see 20260909000008), so once written this is as immutable as the
-- rest of the row.
-- ---------------------------------------------------------------------------
alter table public.conversation_messages add column route_meta jsonb;

-- ---------------------------------------------------------------------------
-- create_escalation — the one authorized path to a new escalation row.
-- Deduplicates atomically: if the client already has a non-resolved
-- escalation, returns its id instead of creating a second one ("prevent
-- duplicate escalations for the same unresolved issue"). `for update` locks
-- the candidate rows for the duration of the transaction so two concurrent
-- calls for the same client can't both observe "none open" and both insert.
-- ---------------------------------------------------------------------------
create or replace function public.create_escalation(
  p_client_profile_id uuid,
  p_reason_category escalation_reason,
  p_source_message_id uuid,
  p_proposed_response text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_workspace_id uuid;
  v_existing_id uuid;
  v_new_id uuid;
begin
  if not app_private.can_access_client(p_client_profile_id) then
    raise exception 'create_escalation: not authorized for client %', p_client_profile_id;
  end if;
  if not (app_private.is_client_self(p_client_profile_id) or app_private.can_manage_client(p_client_profile_id)) then
    raise exception 'create_escalation: caller is neither the client nor an authorized coach for %', p_client_profile_id;
  end if;

  select workspace_id into v_workspace_id from public.client_profiles where id = p_client_profile_id;

  select id into v_existing_id
  from public.escalations
  where client_profile_id = p_client_profile_id and status <> 'resolved'
  order by created_at desc
  limit 1
  for update;

  if v_existing_id is not null then
    return v_existing_id;
  end if;

  insert into public.escalations (workspace_id, client_profile_id, source_message_id, reason_category, status, proposed_response)
  values (v_workspace_id, p_client_profile_id, p_source_message_id, p_reason_category, 'proposed', p_proposed_response)
  returning id into v_new_id;

  return v_new_id;
end;
$$;

revoke all on function public.create_escalation(uuid, escalation_reason, uuid, text) from public;
grant execute on function public.create_escalation(uuid, escalation_reason, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- get_or_create_default_conversation — conversations_insert_staff (see
-- 20260909000008) only lets STAFF insert a conversation row, so a client's
-- own first chat message has no authenticated-role path to create their own
-- standing optim_default conversation. SECURITY DEFINER, exactly like
-- create_escalation above: re-derives and re-checks the caller's own
-- identity (is_client_self, or staff managing the client, for the coach
-- proof surface reading a client's history before they've ever messaged)
-- rather than trusting RLS to have already gated entry. Get-or-create is
-- atomic under the unique index from 20260909000005
-- (conversations_one_default_per_client_idx): a concurrent second call
-- safely resolves to the same row via the exception handler below rather
-- than ever creating two.
-- ---------------------------------------------------------------------------
create or replace function public.get_or_create_default_conversation(
  p_client_profile_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_workspace_id uuid;
  v_conversation_id uuid;
begin
  if not (app_private.is_client_self(p_client_profile_id) or app_private.can_manage_client(p_client_profile_id)) then
    raise exception 'get_or_create_default_conversation: not authorized for client %', p_client_profile_id;
  end if;

  select id into v_conversation_id
  from public.conversations
  where client_profile_id = p_client_profile_id and kind = 'optim_default';

  if v_conversation_id is not null then
    return v_conversation_id;
  end if;

  select workspace_id into v_workspace_id from public.client_profiles where id = p_client_profile_id;

  begin
    insert into public.conversations (workspace_id, client_profile_id, kind, status)
    values (v_workspace_id, p_client_profile_id, 'optim_default', 'open')
    returning id into v_conversation_id;
  exception when unique_violation then
    select id into v_conversation_id
    from public.conversations
    where client_profile_id = p_client_profile_id and kind = 'optim_default';
  end;

  return v_conversation_id;
end;
$$;

revoke all on function public.get_or_create_default_conversation(uuid) from public;
grant execute on function public.get_or_create_default_conversation(uuid) to authenticated;
