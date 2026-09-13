-- Phase 9B — Coach-Confirmed Learned Rules: the FIRST controlled promotion
-- step from Phase 9A's shadow PatternCandidate (a derived read model, never
-- persisted) to a real, coach-confirmed piece of intelligence.
--
-- Non-negotiable, restated here so this migration's own contract is
-- unambiguous to any future reader:
--   - A row in coach_learned_rules is created ONLY by an explicit coach
--     confirmation action — nothing here or in the app code silently
--     promotes a candidate.
--   - A confirmed rule has ZERO influence on generation in this phase —
--     see lib/patterns/*, lib/production/pattern-analysis.ts, and this
--     phase's own completion report for the repo-wide proof.
--   - This table is structurally distinct from coach_playbooks
--     (CoachOperatingModel) — explicit onboarding-derived methodology and
--     observed/confirmed behavior remain two separate authority layers
--     (Phase 9B spec section 2/3). Nothing here ever mutates
--     coach_playbooks, and nothing in coach_playbooks ever reads this
--     table.
--
-- Why two tables (coach_learned_rules + coach_pattern_candidate_dispositions)
-- rather than one:
--   - A CONFIRM disposition always creates exactly one learned rule; a
--     CONTEXTUAL or REJECTED disposition never does. Folding "did the
--     coach respond to this candidate" and "the structured rule itself"
--     into one table would force every non-confirmed disposition to carry
--     a pile of null rule-only columns, and would conflate a POINT-IN-TIME
--     coach decision (confirmed_at, contextual, rejected — never changes)
--     with a rule's own ongoing LIFECYCLE (active -> deactivated ->
--     superseded, which DOES change after the fact).
--   - coach_pattern_candidate_dispositions is the append-only ledger that
--     answers "was this candidate signature already shown and answered" —
--     the exact mechanism spec section 10 requires for suppressing a
--     rejected/contextual candidate from immediately resurfacing, and spec
--     section 17 explicitly forbids reusing coach_decision_evidence for.
--
-- Candidate signature (spec section 29): a deterministic string built from
-- the candidate's STRUCTURED semantics (scope, coach, client-if-scoped,
-- decision domain/type, normalized field, resolved item family, direction,
-- dominant comparison key) — never a support-row id, so the conceptual
-- candidate's identity stays stable as its supporting evidence set grows
-- between analysis runs. See lib/patterns/candidate-signature.ts.
--
-- decision_domain reuses Phase 8B's existing public.decision_domain enum
-- (no new type needed) — a learned rule's domain is always one of the same
-- bounded domains decision evidence already uses. `direction` is
-- deliberately plain text, NOT a new enum, mirroring coach_decision_evidence's
-- own decision_type convention: PatternDirection (lib/patterns/types.ts)
-- can grow via a pure code change, never a migration.
--
-- Lifecycle (spec section 15/16): `status` is the one MUTABLE field on an
-- otherwise-immutable row (confirmed_by/confirmed_at/behavior/summary/
-- evidence-id snapshots never change after insert) — the same
-- "stable-row-with-a-lifecycle-column" shape escalations already uses, not
-- coach_decision_evidence's pure append-only shape, because a rule
-- genuinely needs a "the coach doesn't coach this way anymore" path
-- without losing the historical fact that they once confirmed it. At most
-- one ACTIVE row may exist per (coach, candidate_signature) at a time
-- (the partial unique index below) — confirming a new, incompatible rule
-- for the same conceptual candidate supersedes the old one instead of
-- silently leaving two contradictory active rules (spec section 16), all
-- within one application-level transaction.
--
-- RLS mirrors coach_decision_evidence's Phase 8B posture exactly: strictly
-- coach_user_id = auth.uid(), never workspace-membership, never
-- can_manage_client — "Coach Sarah's confirmed rules must NOT become Coach
-- Elon's private methodology intelligence" even within the same workspace
-- (spec section 19). No client-facing select policy exists at all. No
-- special admin carve-out either, matching coach_decision_evidence's own
-- precedent exactly (spec section 20).

create type public.rule_scope as enum ('coach_general', 'client_specific');
create type public.rule_status as enum ('active', 'deactivated', 'superseded');
create type public.candidate_disposition_outcome as enum ('confirmed', 'contextual', 'rejected');

create table public.coach_learned_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  coach_user_id uuid not null references public.profiles (id) on delete cascade,
  scope public.rule_scope not null,
  -- Required (and only meaningful) when scope = 'client_specific' — a
  -- coach_general rule never names one client. Enforced by the check
  -- constraint below rather than silently allowed to drift.
  client_profile_id uuid references public.client_profiles (id) on delete cascade,
  constraint coach_learned_rules_client_scope_check check (
    (scope = 'client_specific' and client_profile_id is not null) or
    (scope = 'coach_general' and client_profile_id is null)
  ),
  decision_domain public.decision_domain not null,
  field text not null,
  item_family text,
  direction text not null,
  -- The structured behavior a future phase could actually consume
  -- (never relied on for generation in THIS phase) — e.g.
  -- {"comparisonKey": "decrease"} or {"comparisonKey": "push_vertical->push_horizontal"}.
  -- Never a full prose rule, never hidden reasoning.
  behavior jsonb not null,
  -- A deterministic-template sentence, snapshotted at confirmation time —
  -- never regenerated later, so the rule's own displayed meaning can never
  -- silently drift from what the coach actually confirmed (spec section 31).
  summary text not null,
  candidate_signature text not null,
  supporting_evidence_ids uuid[] not null,
  contradicting_evidence_ids uuid[] not null,
  evidence_strength_at_confirmation text not null,
  conflicted_with_explicit_methodology boolean not null default false,
  status public.rule_status not null default 'active',
  superseded_by_rule_id uuid references public.coach_learned_rules (id) on delete set null,
  confirmed_by uuid not null references public.profiles (id),
  confirmed_at timestamptz not null,
  deactivated_by uuid references public.profiles (id),
  deactivated_at timestamptz,
  created_at timestamptz not null default now()
);

-- At most one ACTIVE rule per (coach, conceptual candidate) — a
-- re-confirmation supersedes, it never silently coexists (spec section 16).
create unique index coach_learned_rules_one_active_per_signature
  on public.coach_learned_rules (coach_user_id, candidate_signature)
  where status = 'active';

create index coach_learned_rules_workspace_id_idx on public.coach_learned_rules (workspace_id);
create index coach_learned_rules_coach_id_idx on public.coach_learned_rules (coach_user_id);

alter table public.coach_learned_rules enable row level security;

create policy coach_learned_rules_select on public.coach_learned_rules for select to authenticated
  using (coach_user_id = auth.uid());

create policy coach_learned_rules_insert on public.coach_learned_rules for insert to authenticated
  with check (coach_user_id = auth.uid() and confirmed_by = auth.uid() and app_private.is_workspace_staff(workspace_id));

-- UPDATE exists only for deactivation/supersession — application code only
-- ever writes status/superseded_by_rule_id/deactivated_by/deactivated_at;
-- every provenance field is set once at insert and never touched again.
create policy coach_learned_rules_update on public.coach_learned_rules for update to authenticated
  using (coach_user_id = auth.uid()) with check (coach_user_id = auth.uid());

revoke all on public.coach_learned_rules from anon;
grant select, insert, update on public.coach_learned_rules to authenticated;
revoke delete on public.coach_learned_rules from authenticated;

create table public.coach_pattern_candidate_dispositions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  coach_user_id uuid not null references public.profiles (id) on delete cascade,
  candidate_signature text not null,
  scope public.rule_scope not null,
  client_profile_id uuid references public.client_profiles (id) on delete cascade,
  decision_domain public.decision_domain not null,
  outcome public.candidate_disposition_outcome not null,
  -- Snapshot of the candidate's evidence state AT DISPOSITION TIME — real
  -- provenance ("why did the coach see THIS version"), and the hook a
  -- FUTURE phase needs to detect material evidence growth since a past
  -- rejection/contextual disposition (drift/reconsideration logic is
  -- explicitly NOT built in Phase 9B — spec section 10/32).
  support_count_at_disposition integer not null,
  contradiction_count_at_disposition integer not null,
  distinct_client_count_at_disposition integer not null,
  supporting_evidence_ids uuid[] not null,
  contradicting_evidence_ids uuid[] not null,
  -- Set only when outcome = 'confirmed' — enforced below rather than left
  -- to application discipline alone.
  learned_rule_id uuid references public.coach_learned_rules (id) on delete set null,
  constraint coach_pattern_candidate_dispositions_rule_link_check check (
    (outcome = 'confirmed' and learned_rule_id is not null) or
    (outcome <> 'confirmed' and learned_rule_id is null)
  ),
  decided_by uuid not null references public.profiles (id),
  decided_at timestamptz not null default now(),
  -- Append-only history (a coach can, over time, disposition the same
  -- signature more than once — each is a new real decision, never an
  -- overwrite) — this unique constraint only guards an exact-instant retry
  -- of the identical request, the same idempotency posture
  -- coach_decision_evidence's own unique constraint uses.
  unique (coach_user_id, candidate_signature, decided_at)
);

create index coach_pattern_candidate_dispositions_workspace_id_idx on public.coach_pattern_candidate_dispositions (workspace_id);
create index coach_pattern_candidate_dispositions_coach_signature_idx on public.coach_pattern_candidate_dispositions (coach_user_id, candidate_signature);

alter table public.coach_pattern_candidate_dispositions enable row level security;

create policy coach_pattern_candidate_dispositions_select on public.coach_pattern_candidate_dispositions for select to authenticated
  using (coach_user_id = auth.uid());

create policy coach_pattern_candidate_dispositions_insert on public.coach_pattern_candidate_dispositions for insert to authenticated
  with check (coach_user_id = auth.uid() and decided_by = auth.uid() and app_private.is_workspace_staff(workspace_id));

-- Append-only, exactly like coach_decision_evidence — no update, no delete.
revoke all on public.coach_pattern_candidate_dispositions from anon;
grant select, insert on public.coach_pattern_candidate_dispositions to authenticated;
revoke update, delete on public.coach_pattern_candidate_dispositions from authenticated;
