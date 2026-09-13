-- Phase 8B — Longitudinal Client Intelligence: the COACH DECISION EVIDENCE
-- layer, parallel to Phase 8A's client_observations. Answers "what did
-- OPTIM propose, what did the coach decide, and under what context?" —
-- never "what actually happened with the client" (that's client_observations)
-- and never "what rule has OPTIM learned" (that's an explicitly later,
-- unbuilt phase). One decision is evidence. It is NOT automatically a rule
-- — nothing in this schema or the code that writes to it performs pattern
-- detection, confidence scoring, or rule promotion.
--
-- Why no existing table can represent this cleanly:
--   - training_program_versions holds only the CURRENT authoritative
--     program content — it has no concept of "what was proposed vs what
--     the coach actually kept," and overwriting it on every edit would
--     destroy exactly the historical comparison this phase exists to
--     enable (spec section 6).
--   - escalations is the safety decision's own canonical lifecycle
--     (Phase 7A/7B) — this table never duplicates or replaces it; a safety
--     decision projected here only ever references the real escalation id
--     (spec section 27).
--
-- Design summary (full rationale in this phase's completion report):
--   - `decision_domain` is a small, bounded Postgres enum — matches how
--     observation_category (Phase 8A) and every other genuinely closed
--     vocabulary in this schema is modeled.
--   - `decision_type` is deliberately plain text, NOT a DB enum: a new
--     decision type (e.g. a future real exercise-substitution review) must
--     be addable via a pure code change to lib/decisions/types.ts's
--     registry, never a migration — the exact same posture as Phase 8A's
--     metric_key.
--   - `proposed_value`/`chosen_value` are jsonb, validated per-decision_type
--     by that same TS registry — the same "validate at the app layer, not
--     with a DB JSON schema" convention every other content-bearing jsonb
--     column in this schema already uses (daily_records.content,
--     coach_playbooks.content, training_program_versions.content).
--   - `outcome` is a small Postgres enum (approved/edited/rejected/
--     overridden/selected) — an unchanged approval is still real evidence
--     (spec section 7); a plain rejection may legitimately have no
--     chosen_value at all (spec section 26, enforced by the check
--     constraint below rather than silently allowing a fabricated one).
--   - Append-only: no update or delete policy at all, mirroring
--     coach_notes' own "one-way, immutable" posture. A later decision is
--     NEW evidence (a new row), never a correction to an earlier one (spec
--     section 19) — this is a deliberate departure from Phase 8A's
--     upsert-by-natural-key design, which exists precisely because a daily
--     training snapshot IS still-mutable-until-the-day-is-done in a way a
--     coach's decision moment never is.
--   - `(coach_user_id, source_ref, decision_type)` unique + an
--     insert-time ON CONFLICT DO NOTHING (never DO UPDATE) is the
--     idempotency strategy: a retried/duplicate request for the exact same
--     real decision instance is silently absorbed rather than duplicated,
--     while a genuinely later, different decision (a new source_ref)
--     always becomes its own new row.
--   - RLS is coach_user_id-scoped, never workspace-membership-scoped —
--     "Coach Sarah's decisions must NOT become Coach Elon's private
--     methodology evidence" even within the same workspace (spec section
--     12). No client read policy exists at all — this is coach/OPTIM
--     intelligence data, not a client-facing surface (spec section 13).

create type public.decision_domain as enum (
  'program_structure',
  'exercise_selection',
  'prescription',
  'progression',
  'substitution',
  'scheduling',
  'cardio_conditioning',
  'safety',
  'other'
);

create type public.decision_outcome as enum (
  'approved',
  'edited',
  'rejected',
  'overridden',
  'selected'
);

create table public.coach_decision_evidence (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  coach_user_id uuid not null references public.profiles (id) on delete cascade,
  client_profile_id uuid not null references public.client_profiles (id) on delete cascade,
  decision_domain public.decision_domain not null,
  decision_type text not null,
  outcome public.decision_outcome not null,
  -- Both validated per decision_type by lib/decisions/types.ts's registry
  -- before ever reaching this table — never raw, unvalidated model output,
  -- and never hidden chain-of-thought (spec section 5): only the concrete
  -- proposal/selection itself, in the same structured shape the product
  -- already exposes.
  proposed_value jsonb,
  chosen_value jsonb,
  constraint coach_decision_evidence_chosen_value_required check (outcome = 'rejected' or chosen_value is not null),
  constraint coach_decision_evidence_proposed_value_required check (outcome = 'selected' or proposed_value is not null),
  -- Optional, never required (spec section 9) — no workflow in this phase
  -- forces a coach to fill this in.
  reason text,
  program_assignment_id uuid references public.program_assignments (id) on delete set null,
  escalation_id uuid references public.escalations (id) on delete set null,
  training_item_instance_id text,
  -- Lightweight references to relevant Phase 8A facts that informed this
  -- decision — never a duplicated snapshot of the observations themselves,
  -- and never a channel for writing the coach's interpretation back into
  -- client_observations (spec section 11).
  observation_ids uuid[],
  -- Deterministic, idempotency-relevant provenance pointer — see this
  -- migration's own doc above.
  source_ref text not null,
  decided_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  unique (coach_user_id, source_ref, decision_type)
);

alter table public.coach_decision_evidence enable row level security;

create index coach_decision_evidence_workspace_id_idx on public.coach_decision_evidence (workspace_id);
create index coach_decision_evidence_coach_id_idx on public.coach_decision_evidence (coach_user_id);
create index coach_decision_evidence_client_id_idx on public.coach_decision_evidence (client_profile_id);

-- Read: strictly the deciding coach's own session — never workspace
-- membership, never can_manage_client (which would let ANY staff member
-- who manages this client read another coach's private decision
-- reasoning). No client-facing select policy exists at all.
create policy coach_decision_evidence_select on public.coach_decision_evidence for select to authenticated
  using (coach_user_id = auth.uid());

-- Write: the row's own declared coach_user_id must be the real caller, AND
-- the real caller must actually hold a staff role in the declared
-- workspace (app_private.is_workspace_staff — the same helper
-- escalations_update_staff-adjacent policies already trust) — this is what
-- makes "forged coach write" (claiming to be a coach you aren't, or
-- writing into a workspace you have no real staff role in) rejected by RLS
-- itself, not merely by application-layer discipline.
create policy coach_decision_evidence_insert on public.coach_decision_evidence for insert to authenticated
  with check (coach_user_id = auth.uid() and app_private.is_workspace_staff(workspace_id));

-- No update, no delete policy — append-only, exactly like coach_notes.

revoke all on public.coach_decision_evidence from anon;
grant select, insert on public.coach_decision_evidence to authenticated;
revoke update, delete on public.coach_decision_evidence from authenticated;
