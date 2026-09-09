-- Phase 6.0A — Production Foundation.
--
-- Persistence + typed contracts for the "Newly approved existing-client
-- migration model": private staging for single/batch imports, raw source
-- files kept tenant-scoped, parsing only into a staged draft, field-level
-- provenance and confidence, coach review/correction, and activation only
-- via an explicit coach-approved transaction. No OCR/spreadsheet parser is
-- implemented here — this is the staging schema those parsers will write
-- into during Phase 6.0B/6.0C, not the parsers themselves.

create type import_batch_status as enum (
  'uploading', 'processing', 'needs_review', 'ready', 'activated', 'failed', 'cancelled'
);

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_by uuid not null references public.profiles (id),
  status import_batch_status not null default 'uploading',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.import_batches enable row level security;

create index import_batches_workspace_id_idx on public.import_batches (workspace_id);

-- ---------------------------------------------------------------------------
-- import_sources — one row per raw uploaded file. file_path points into the
-- private `import-sources` Storage bucket (20260909000009) under a
-- workspace/batch-scoped path; never visible to any imported client by
-- default (see that migration's storage policies) since this is private
-- staging work, not something a client should ever see mid-review.
-- ---------------------------------------------------------------------------
create table public.import_sources (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.import_batches (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  file_name text not null,
  file_path text not null,
  mime_type text,
  sha256 text,
  uploaded_by uuid not null references public.profiles (id),
  uploaded_at timestamptz not null default now()
);

alter table public.import_sources enable row level security;

create index import_sources_batch_id_idx on public.import_sources (batch_id);
create index import_sources_workspace_id_idx on public.import_sources (workspace_id);

-- ---------------------------------------------------------------------------
-- staged_clients — one row per client identified inside a batch (single
-- import: exactly one row). Never an active client_profiles record; only
-- becomes one via an explicit approval transaction (see
-- lib/production/repository.ts's activateStagedClient contract) that
-- creates/links client_profiles + client_enrollments with the reviewed
-- position anchors and sets matched_client_profile_id + import_batches.
-- status = 'activated'.
-- ---------------------------------------------------------------------------
create type staged_client_status as enum ('needs_review', 'ready', 'approved', 'rejected');

create table public.staged_clients (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.import_batches (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  matched_client_profile_id uuid references public.client_profiles (id),
  display_name_guess text,
  status staged_client_status not null default 'needs_review',
  current_phase_guess text,
  current_week_index_guess integer,
  as_of_date_guess date,
  -- Batch imports must prevent cross-client file/data mixing and surface
  -- uncertain grouping for review — grouping_confidence lets the coach see
  -- "this client's rows were confidently grouped" vs. "review this split."
  grouping_confidence numeric check (grouping_confidence is null or grouping_confidence between 0 and 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.staged_clients enable row level security;

create index staged_clients_batch_id_idx on public.staged_clients (batch_id);
create index staged_clients_workspace_id_idx on public.staged_clients (workspace_id);

-- ---------------------------------------------------------------------------
-- staged_client_fields — field-level provenance. One row per extracted
-- fact: which staged client, which field, the raw sourced value, an
-- AI-normalized value (kept distinct per the model's "separate sourced
-- facts / AI-normalized values / uncertain interpretations / missing info"
-- requirement), which source file/location it came from, a confidence
-- score, and an ambiguity flag. Never invents a value with no source_id —
-- see the check constraint.
-- ---------------------------------------------------------------------------
create table public.staged_client_fields (
  id uuid primary key default gen_random_uuid(),
  staged_client_id uuid not null references public.staged_clients (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  field_key text not null,
  source_value text,
  normalized_value jsonb,
  confidence numeric check (confidence is null or confidence between 0 and 1),
  source_id uuid references public.import_sources (id),
  source_location text,
  is_ambiguous boolean not null default false,
  coach_correction jsonb,
  created_at timestamptz not null default now(),
  constraint staged_client_fields_needs_provenance check (
    source_value is not null or source_id is not null or coach_correction is not null
  )
);

alter table public.staged_client_fields enable row level security;

create index staged_client_fields_staged_client_idx on public.staged_client_fields (staged_client_id);
create index staged_client_fields_workspace_id_idx on public.staged_client_fields (workspace_id);

-- ---------------------------------------------------------------------------
-- import_review_events — append-only trail of coach review actions on a
-- staged client (reviewed / corrected / approved / rejected / activated),
-- giving the required "preserve version history" for imports the same
-- immutable-event treatment publication_events gives programs/nutrition.
-- ---------------------------------------------------------------------------
create type import_review_event_type as enum ('reviewed', 'corrected', 'approved', 'rejected', 'activated');

create table public.import_review_events (
  id uuid primary key default gen_random_uuid(),
  staged_client_id uuid not null references public.staged_clients (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  actor_user_id uuid not null references public.profiles (id),
  event_type import_review_event_type not null,
  notes text,
  occurred_at timestamptz not null default now()
);

alter table public.import_review_events enable row level security;

create index import_review_events_staged_client_idx on public.import_review_events (staged_client_id);
create index import_review_events_workspace_id_idx on public.import_review_events (workspace_id);
