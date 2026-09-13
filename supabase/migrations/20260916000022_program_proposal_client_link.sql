-- Phase 8C — Generated Program Review and Approval Workflow.
--
-- Closes the one real gap the existing training_program_versions draft/
-- published/archived lifecycle (20260909000004) didn't already cover:
-- nothing links an unassigned DRAFT version to the client it was actually
-- generated for. Before this phase, that link only ever existed
-- implicitly, the instant program_assignments was written by
-- assignProgramVersionToClient — i.e., only AFTER a version went live.
-- With a real coach review step now sitting between "generated" and
-- "assigned," a coach must be able to navigate away and later rediscover
-- "my pending proposal for this client" — this column is what makes that
-- possible without inventing a second, parallel proposal table.
--
-- Nullable and purely additive: every existing row reads null (no
-- historical proposal ever needs backfilling — this concept didn't exist
-- before this phase), and nothing about the existing draft/publish/assign
-- mechanics changes.
--
-- No RLS changes: training_program_versions_select/_update_staff
-- (20260909000008) are already plain workspace-staff-scoped policies with
-- no per-column restriction — adding a column never on its own grants a
-- CLIENT any new visibility, since no policy branch ever checks this
-- column against app_private.is_client_self. A client continues to see a
-- version only once it's actually referenced by one of their own
-- program_assignments rows (the existing client branch of that select
-- policy), exactly as before this migration.
--
-- Rollback: drop the index, then drop the column — nothing else in the
-- schema references it.

alter table public.training_program_versions
  add column proposed_for_client_profile_id uuid references public.client_profiles (id) on delete set null;

create index training_program_versions_proposed_client_idx
  on public.training_program_versions (proposed_for_client_profile_id)
  where proposed_for_client_profile_id is not null;
