-- Phase 6.0D-B — Controlled Live-Client Pilot and Production Client Lifecycle.
--
-- Real defect fix: coach_notes_select (20260909000008) used
-- app_private.can_access_client, which is satisfied by the client
-- themselves — directly contradicting this table's own purpose ("Personal
-- Coach Note... one-way, never opens a permanent thread," see
-- lib/production/coach-notes.ts's module doc) and this phase's own explicit
-- security requirement: "Coach-only notes remain invisible to clients."
-- Every other client-owned table (daily_records, client_onboarding_progress)
-- is legitimately client-visible because the CLIENT authored it; coach_notes
-- is authored BY staff ABOUT a client and was never meant to be client-
-- readable at all — it's staff-internal context, not client communication
-- (an actual message to the client goes through conversations/
-- conversation_messages instead, which correctly IS client-visible).
--
-- Fixed by narrowing to app_private.can_manage_client (workspace admin or
-- the client's assigned coach only — explicitly excludes is_client_self),
-- the exact same predicate escalations/campaigns/import staff-only tables
-- already use for this reason.

drop policy if exists coach_notes_select on public.coach_notes;
create policy coach_notes_select on public.coach_notes for select to authenticated
  using (app_private.can_manage_client(client_profile_id));
