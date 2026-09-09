-- Phase 6.0A — Production Foundation.
--
-- Versioned training programs and nutrition plans, sufficient for Phase
-- 6.0B to point the live workout/nutrition engines at real assignments
-- instead of PUSH_WORKOUT, plus the immutable publication_events audit
-- trail "approved/reviewed/published by Teague" claims must be backed by.
--
-- Normalization decision (Part 3's required documented tradeoff): ownership,
-- versioning, status, and assignment — the columns every tenancy/RLS/query
-- decision actually needs to filter or join on — are real relational
-- columns. The deeply-nested plan CONTENT itself (exercises, sets, reps,
-- meal periods, macros — see lib/types.ts's Workout/NutritionPlan-shaped
-- structures) is stored as a single validated `content jsonb` column on the
-- version row, not flattened into dozens of child tables. Reasoning: that
-- nested content is written and read as one coherent unit (never queried by
-- Postgres for individual set/rep values — every consumer, both the
-- existing TS domain layer and any future one, treats it as one typed
-- payload), it changes shape release-to-release faster than a migration
-- cadence should gate, and normalizing it would buy no RLS or query benefit
-- since access is already scoped at the version/assignment row, not at
-- individual exercises. `content` is validated at the application layer
-- (lib/production/repository — a Zod-equivalent runtime check belongs there
-- once Phase 6.0B actually writes real content) before insert; the database
-- only guarantees it is well-formed JSON and non-null.

-- ---------------------------------------------------------------------------
-- training_programs — a program "family" a coach authors new versions
-- under. The row itself never changes meaning; only its versions do.
-- ---------------------------------------------------------------------------
create table public.training_programs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_by uuid not null references public.profiles (id),
  title text not null,
  created_at timestamptz not null default now()
);

alter table public.training_programs enable row level security;

create index training_programs_workspace_id_idx on public.training_programs (workspace_id);

create type plan_version_status as enum ('draft', 'published', 'archived');

create table public.training_program_versions (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.training_programs (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  version_number integer not null,
  status plan_version_status not null default 'draft',
  content jsonb not null,
  created_by uuid not null references public.profiles (id),
  published_by uuid references public.profiles (id),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (program_id, version_number)
);

alter table public.training_program_versions enable row level security;

create index training_program_versions_program_id_idx on public.training_program_versions (program_id);
create index training_program_versions_workspace_id_idx on public.training_program_versions (workspace_id);

-- Publication is a one-way door at the row level: once status flips to
-- 'published', content/version_number/program_id can never change again — a
-- real edit must create a new version row. 'archived' is likewise terminal.
-- This is the DB-level enforcement of "programs ... immutable/versioned
-- after publication (edits create drafts/new versions)".
create or replace function public.prevent_published_version_mutation()
returns trigger
language plpgsql
as $$
begin
  if old.status in ('published', 'archived') and (
    new.content is distinct from old.content
    or new.version_number is distinct from old.version_number
    or new.program_id is distinct from old.program_id
    or (old.status = 'published' and new.status = 'draft')
  ) then
    raise exception 'training_program_versions: cannot modify a % version (id=%). Create a new version instead.', old.status, old.id;
  end if;
  return new;
end;
$$;

create trigger training_program_versions_immutability
  before update on public.training_program_versions
  for each row execute function public.prevent_published_version_mutation();

create type assignment_status as enum ('active', 'completed', 'replaced');

create table public.program_assignments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  client_profile_id uuid not null references public.client_profiles (id) on delete cascade,
  program_version_id uuid not null references public.training_program_versions (id),
  assigned_by uuid not null references public.profiles (id),
  assigned_at timestamptz not null default now(),
  status assignment_status not null default 'active'
);

alter table public.program_assignments enable row level security;

create index program_assignments_client_idx on public.program_assignments (client_profile_id);
create index program_assignments_workspace_id_idx on public.program_assignments (workspace_id);
-- A client has at most one *active* program assignment at a time — the
-- exact "client assignment points to explicit approved version" invariant,
-- singular.
create unique index program_assignments_one_active_idx
  on public.program_assignments (client_profile_id)
  where status = 'active';

-- ---------------------------------------------------------------------------
-- nutrition_plans / nutrition_plan_versions / nutrition_plan_assignments —
-- identical shape and identical reasoning to the training-program trio
-- above, kept as separate tables (not a shared polymorphic "plans" table)
-- because their content payloads, assignment cardinality rules, and future
-- 6.0B consumers are genuinely different domains.
-- ---------------------------------------------------------------------------
create table public.nutrition_plans (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_by uuid not null references public.profiles (id),
  title text not null,
  created_at timestamptz not null default now()
);

alter table public.nutrition_plans enable row level security;

create index nutrition_plans_workspace_id_idx on public.nutrition_plans (workspace_id);

create table public.nutrition_plan_versions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.nutrition_plans (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  version_number integer not null,
  status plan_version_status not null default 'draft',
  content jsonb not null,
  created_by uuid not null references public.profiles (id),
  published_by uuid references public.profiles (id),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (plan_id, version_number)
);

alter table public.nutrition_plan_versions enable row level security;

create index nutrition_plan_versions_plan_id_idx on public.nutrition_plan_versions (plan_id);
create index nutrition_plan_versions_workspace_id_idx on public.nutrition_plan_versions (workspace_id);

create trigger nutrition_plan_versions_immutability
  before update on public.nutrition_plan_versions
  for each row execute function public.prevent_published_version_mutation();

create table public.nutrition_plan_assignments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  client_profile_id uuid not null references public.client_profiles (id) on delete cascade,
  plan_version_id uuid not null references public.nutrition_plan_versions (id),
  assigned_by uuid not null references public.profiles (id),
  assigned_at timestamptz not null default now(),
  status assignment_status not null default 'active'
);

alter table public.nutrition_plan_assignments enable row level security;

create index nutrition_plan_assignments_client_idx on public.nutrition_plan_assignments (client_profile_id);
create index nutrition_plan_assignments_workspace_id_idx on public.nutrition_plan_assignments (workspace_id);
create unique index nutrition_plan_assignments_one_active_idx
  on public.nutrition_plan_assignments (client_profile_id)
  where status = 'active';

-- ---------------------------------------------------------------------------
-- publication_events — the immutable audit trail behind every "approved by
-- Teague" / "published by Teague" claim anywhere in the product. Insert +
-- select only (see 20260909000008) — no update or delete policy is ever
-- defined for this table, so once a row exists it exists forever, and a
-- client-side message can only ever describe a real one of these rows, per
-- the communications model's "never infer coach approval from message
-- text" and "an assistant message may say something was sent to Teague only
-- after a real persisted escalation/review record is successfully created."
-- ---------------------------------------------------------------------------
create type publication_event_type as enum ('published', 'approved', 'archived', 'activated');

create table public.publication_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  entity_type text not null check (entity_type in (
    'training_program_version', 'nutrition_plan_version', 'campaign', 'import_batch'
  )),
  entity_id uuid not null,
  event_type publication_event_type not null,
  actor_user_id uuid not null references public.profiles (id),
  actor_role app_role not null,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

alter table public.publication_events enable row level security;

create index publication_events_workspace_id_idx on public.publication_events (workspace_id);
create index publication_events_entity_idx on public.publication_events (entity_type, entity_id);
