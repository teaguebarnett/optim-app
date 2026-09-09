-- Phase 6.0A — Production Foundation.
--
-- Persistence + typed contracts for the "Newly approved communication
-- model": default OPTIM-assistant chat, real escalation records, temporary
-- two-way coach threads scoped to one escalation, one-way Personal Coach
-- Notes, and coach-authored Adaptive Campaigns with per-recipient
-- publication state. This migration builds the tables; lib/communications/
-- types.ts carries the matching TypeScript contracts and state-machine
-- types. No chat intelligence, escalation-trigger logic, or campaign
-- personalization is implemented here — persistence and shape only, per
-- Phase 6.0A's explicit scope boundary (that's Phase 6.0C).
--
-- conversations, conversation_messages, and escalations reference each
-- other (a conversation may point at the escalation it exists for; an
-- escalation may point at the message that triggered it), so
-- conversations.escalation_id is added as a plain column here and given its
-- foreign key constraint at the bottom of this file, once escalations
-- exists.

-- ---------------------------------------------------------------------------
-- notifications — in-app only (Part: "Notifications: in-app first; email
-- for invitations/auth; push/SMS deferred").
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  recipient_user_id uuid not null references public.profiles (id),
  kind text not null,
  title text not null,
  body text,
  link_path text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.notifications enable row level security;

create index notifications_recipient_idx on public.notifications (recipient_user_id, read_at);
create index notifications_workspace_id_idx on public.notifications (workspace_id);

-- ---------------------------------------------------------------------------
-- conversations — default kind is always 'optim_default': every client has
-- exactly one, created alongside their client_profile, and the composer
-- always returns to it once any escalation thread resolves. 'coach_escalation'
-- conversations are temporary and exist only for the lifetime of one
-- escalation (unopened -> open -> resolved, mirrored by escalations.status
-- below) — clients never get a permanent OPTIM-vs-Teague selector, so there
-- is deliberately no third, standing "coach chat" kind.
-- ---------------------------------------------------------------------------
create type conversation_kind as enum ('optim_default', 'coach_escalation');
create type conversation_status as enum ('open', 'resolved');

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  client_profile_id uuid not null references public.client_profiles (id) on delete cascade,
  kind conversation_kind not null,
  status conversation_status not null default 'open',
  escalation_id uuid,
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id)
);

alter table public.conversations enable row level security;

create index conversations_client_idx on public.conversations (client_profile_id);
create index conversations_workspace_id_idx on public.conversations (workspace_id);
-- Exactly one standing optim_default conversation per client.
create unique index conversations_one_default_per_client_idx
  on public.conversations (client_profile_id)
  where kind = 'optim_default';
create unique index conversations_escalation_id_idx on public.conversations (escalation_id) where escalation_id is not null;

-- ---------------------------------------------------------------------------
-- conversation_messages — immutable (insert + select only, see
-- 20260909000008). actor_type is the authorship model's core invariant:
-- client / assistant / coach / system, always attributable, "never infer
-- coach approval from message text" — a coach-authored row can only be
-- inserted by someone the RLS policy independently proves has coach/admin
-- authority over that client, never by trusting the row's own actor_type
-- value.
-- ---------------------------------------------------------------------------
create type message_actor_type as enum ('client', 'assistant', 'coach', 'system');

create table public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  actor_type message_actor_type not null,
  actor_user_id uuid references public.profiles (id),
  body text not null,
  created_at timestamptz not null default now(),
  constraint conversation_messages_actor_user_required check (
    (actor_type in ('client', 'coach') and actor_user_id is not null)
    or (actor_type in ('assistant', 'system') and actor_user_id is null)
  )
);

alter table public.conversation_messages enable row level security;

create index conversation_messages_conversation_idx on public.conversation_messages (conversation_id, created_at);
create index conversation_messages_workspace_id_idx on public.conversation_messages (workspace_id);

-- ---------------------------------------------------------------------------
-- escalations — the ONLY thing that can make an assistant message honestly
-- claim "sent to Teague." reason_category enumerates the approved
-- escalation triggers from the communication model (pain/safety, plan
-- change, out-of-authority, unresolved uncertainty, conflicting info,
-- adherence/sensitive, explicit request) — routine interactions never reach
-- this table at all in this phase (no escalation-trigger logic is built
-- here; a future 6.0C system decides when to insert one of these rows).
-- ---------------------------------------------------------------------------
create type escalation_reason as enum (
  'pain_or_safety',
  'plan_change',
  'out_of_authority',
  'unresolved_uncertainty',
  'conflicting_information',
  'adherence_or_sensitive',
  'explicit_request'
);
create type escalation_status as enum ('pending', 'proposed', 'approved', 'coach_responded', 'resolved');
create type escalation_coach_action as enum ('approved', 'edited', 'personal_response');

create table public.escalations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  client_profile_id uuid not null references public.client_profiles (id) on delete cascade,
  source_message_id uuid references public.conversation_messages (id),
  reason_category escalation_reason not null,
  status escalation_status not null default 'pending',
  proposed_response text,
  coach_action escalation_coach_action,
  resolved_by uuid references public.profiles (id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.escalations enable row level security;

create index escalations_client_idx on public.escalations (client_profile_id);
create index escalations_workspace_status_idx on public.escalations (workspace_id, status);

alter table public.conversations
  add constraint conversations_escalation_id_fkey foreign key (escalation_id) references public.escalations (id);

-- ---------------------------------------------------------------------------
-- coach_notes — Personal Coach Note: one-way, never opens a permanent
-- thread (unlike an escalation's temporary coach thread above).
-- ---------------------------------------------------------------------------
create table public.coach_notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  client_profile_id uuid not null references public.client_profiles (id) on delete cascade,
  author_user_id uuid not null references public.profiles (id),
  body text not null,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.coach_notes enable row level security;

create index coach_notes_client_idx on public.coach_notes (client_profile_id);
create index coach_notes_workspace_id_idx on public.coach_notes (workspace_id);

-- ---------------------------------------------------------------------------
-- campaigns / campaign_recipients — Adaptive Campaign: coach-authored, sent
-- to a selected roster, tailored per recipient, requires coach
-- preview/approval before publication. No personalization ENGINE is built
-- in this phase — personalized_body is a plain nullable column a future
-- 6.0C system (or manual coach edit) fills in before publish.
-- ---------------------------------------------------------------------------
create type campaign_status as enum ('draft', 'preview', 'approved', 'published');
create type campaign_delivery_status as enum ('pending', 'sent', 'failed');

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  author_user_id uuid not null references public.profiles (id),
  title text not null,
  body_template text not null,
  status campaign_status not null default 'draft',
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  constraint campaigns_published_requires_approval check (
    status <> 'published' or (approved_by is not null and approved_at is not null)
  )
);

alter table public.campaigns enable row level security;

create index campaigns_workspace_id_idx on public.campaigns (workspace_id);

create table public.campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  client_profile_id uuid not null references public.client_profiles (id) on delete cascade,
  personalized_body text,
  delivery_status campaign_delivery_status not null default 'pending',
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (campaign_id, client_profile_id)
);

alter table public.campaign_recipients enable row level security;

create index campaign_recipients_client_idx on public.campaign_recipients (client_profile_id);
create index campaign_recipients_workspace_id_idx on public.campaign_recipients (workspace_id);
