-- Phase 6.0D-B follow-up — client_profiles duplicate-invite race fix.
--
-- lib/production/roster.ts's inviteClient already checks for an existing
-- client_profiles row before creating one, but a plain SELECT-then-INSERT
-- has a real race: two concurrent invite requests for the same email in the
-- same workspace can both pass that check before either commits, producing
-- two client_profiles rows (plus their own coach_client_assignments/
-- client_enrollments) for one person. This index makes that impossible at
-- the database layer, atomically — a unique index insertion is a single
-- atomic operation Postgres itself serializes, so the losing concurrent
-- request's INSERT fails outright (no partial row ever created, nothing to
-- roll back) rather than racing past an application-level check.
--
-- Partial (where invited_email is not null): mirrors
-- workspace_invitations_pending_email_idx's own partial-index shape
-- (20260909000002_core_identity.sql), and respects
-- client_profiles_user_or_invite's own constraint that invited_email can be
-- null once a client is identified only by user_id (an already-signed-up
-- client whose invited_email was never backfilled, or a future direct-
-- add path with no invitation at all).
create unique index client_profiles_workspace_invited_email_idx
  on public.client_profiles (workspace_id, invited_email)
  where invited_email is not null;
