-- Phase 8A — Longitudinal Client Intelligence: the foundational
-- CLIENT OBSERVATION / SIGNAL layer.
--
-- This is deliberately the RAW OBSERVATION / FACT layer only (see this
-- phase's own spec, section 1) — never a derived-metric or interpretation
-- store. A row here says "RPE = 8.5" or "session skipped, reason =
-- illness," never "client is overreached" or "client is unmotivated."
-- Interpretation/derived-intelligence is an explicitly later phase.
--
-- Why no existing table can represent this cleanly:
--   - daily_records is a single mutable JSON blob per (client, date) —
--     upserted wholesale on every autosave. It has no per-metric identity,
--     can't represent two sources disagreeing about the same fact (e.g. a
--     future manual sleep entry vs. a future WHOOP reading for the same
--     night), and every write replaces the whole day rather than adding a
--     new fact.
--   - escalations is a queue/decision lifecycle for coach review, not a
--     generic fact store — Phase 8A does not duplicate or replace it; a
--     pain_or_safety escalation remains the sole canonical safety record,
--     and this table only ever holds a lightweight, non-authoritative fact
--     projection of it (see the header of lib/signals/project-pain-report.ts).
--
-- Design summary (full rationale in this phase's completion report):
--   - `category` is a small, low-churn Postgres enum (training_performance,
--     adherence, recovery, pain_safety, body_composition, cardio,
--     nutrition, lifestyle) — genuinely bounded, matches how every other
--     small closed vocabulary in this schema (escalation_reason,
--     health_review_status, ...) is already modeled.
--   - `metric_key` is deliberately plain text, NOT a DB enum: a brand-new
--     fact type (e.g. a future `resting_heart_rate`) must be addable by a
--     pure code change to lib/signals/types.ts's registry, never a
--     migration — this is what section 32's "future wearable observation
--     representable without schema redesign" requirement actually means in
--     practice.
--   - `source_type` is a Postgres enum that already includes the
--     explicitly-named future integration partners (apple_health, garmin,
--     whoop) as inert placeholder values — adding a real new INTEGRATION
--     later is qualitatively different work than adding a new metric, so a
--     small `alter type ... add value` migration for a genuinely new
--     partner is acceptable friction (same posture as health_review_status
--     already carrying forward-looking states).
--   - value is a narrow discriminated payload (value_type + exactly one of
--     value_numeric/value_boolean/value_text), never five nullable generic
--     columns with no discriminant, and never one untyped jsonb blob.
--   - `source_ref` (opaque, deterministically built by the projector code)
--     plus `(client_profile_id, source_type, source_ref, metric_key)` being
--     UNIQUE is the entire idempotency strategy: reprocessing the exact
--     same source event always upserts the exact same row rather than
--     accumulating duplicates, and two DIFFERENT sources for the same
--     real-world metric never collide (source_type differs), so
--     conflicting/disagreeing observations can coexist by design (section
--     10/33) without any reconciliation logic here.
--   - No delete policy: this layer is append/correction-oriented, never
--     destructively cleared.

create type public.observation_category as enum (
  'training_performance',
  'adherence',
  'recovery',
  'pain_safety',
  'body_composition',
  'cardio',
  'nutrition',
  'lifestyle'
);

create type public.observation_source as enum (
  'client_manual',
  'coach_manual',
  'workout_execution',
  'onboarding',
  'check_in',
  'optim_derived',
  'apple_health',
  'garmin',
  'whoop',
  'other'
);

create table public.client_observations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  client_profile_id uuid not null references public.client_profiles (id) on delete cascade,
  category public.observation_category not null,
  metric_key text not null,
  source_type public.observation_source not null,
  value_type text not null check (value_type in ('numeric', 'boolean', 'categorical', 'text')),
  value_numeric double precision,
  value_boolean boolean,
  -- Holds BOTH a controlled categorical value (value_type = 'categorical',
  -- e.g. a SkipReason) and genuinely free text (value_type = 'text', e.g. a
  -- client's own reported pain location) — the value_type discriminant is
  -- what tells a reader which discipline applies; this is not a second,
  -- looser text field to fall back on.
  value_text text,
  constraint client_observations_value_matches_type check (
    (value_type = 'numeric' and value_numeric is not null and value_boolean is null and value_text is null) or
    (value_type = 'boolean' and value_boolean is not null and value_numeric is null and value_text is null) or
    (value_type in ('categorical', 'text') and value_text is not null and value_numeric is null and value_boolean is null)
  ),
  unit text,
  -- Opaque provenance pointer, deterministically built by the emitting
  -- projector (see lib/signals/types.ts's buildObservationSourceRef) — the
  -- idempotency key together with (client_profile_id, source_type,
  -- metric_key) below. Nullable only because a hypothetical future
  -- source_type with no natural per-event identity could omit it, though
  -- every V1 emitter always sets one.
  source_ref text,
  -- Denormalized, queryable convenience reference for "observations about
  -- this specific training item" (section 23) — deliberately the ONLY
  -- structured contextual reference column added in Phase 8A; a
  -- session/program/escalation reference can be added the same additive
  -- way once a real query need for it exists (see completion report).
  training_item_instance_id text,
  observed_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_profile_id, source_type, source_ref, metric_key)
);

alter table public.client_observations enable row level security;

create index client_observations_workspace_id_idx on public.client_observations (workspace_id);
create index client_observations_client_id_idx on public.client_observations (client_profile_id);
create index client_observations_client_category_idx on public.client_observations (client_profile_id, category);
create index client_observations_training_item_idx on public.client_observations (training_item_instance_id) where training_item_instance_id is not null;

create or replace function public.touch_client_observations_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger client_observations_touch_updated_at
  before update on public.client_observations
  for each row execute function public.touch_client_observations_updated_at();

-- Read: identical posture to escalations_select / daily_records_select — a
-- coach may read observations for a client they manage, a client may read
-- only their own. No blanket workspace-wide visibility.
create policy client_observations_select on public.client_observations for select to authenticated
  using (app_private.can_access_client(client_profile_id));

-- Write: every real Phase 8A emitter runs as the client's OWN authenticated
-- session (mirroring daily_records_insert_self/update_self exactly) —
-- system-derived facts about a client's own workout/onboarding/pain report
-- are written by that same client's session right after the canonical
-- write succeeds. A staff-insert policy (for a future coach-manual entry
-- source) is a trivial additive migration once that capture UX actually
-- exists — deliberately not added now with no caller.
create policy client_observations_insert_self on public.client_observations for insert to authenticated
  with check (app_private.is_client_self(client_profile_id) and workspace_id = app_private.client_workspace_id(client_profile_id));

create policy client_observations_update_self on public.client_observations for update to authenticated
  using (app_private.is_client_self(client_profile_id))
  with check (app_private.is_client_self(client_profile_id) and workspace_id = app_private.client_workspace_id(client_profile_id));

-- Matches every other post-20260909000008 table's explicit anon revoke —
-- see daily_records' own identical comment for why this is needed here.
revoke all on public.client_observations from anon;
grant select, insert, update on public.client_observations to authenticated;
revoke delete on public.client_observations from authenticated;
