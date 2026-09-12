-- Phase 6.0D-B (live-verification correction) — reverts
-- 20260911000014_coach_notes_privacy_fix.sql.
--
-- That migration was based on a misreading of "Personal Coach Note" as a
-- private, coach-only annotation. It is not: this codebase's own
-- established, already-shipped Phase 6.0C architecture makes coach notes a
-- real CLIENT-VISIBLE feature —
--
--   - app/actions/chat.ts's getMyChatScreenStateAction (the CLIENT's own
--     chat bootstrap) calls getClientCoachNotes(identity.clientProfileId)
--     and returns the notes as part of the client's own chat screen state.
--   - components/chat/live-chat-screen.tsx renders them directly in the
--     client's chat UI as "Note from {coachDisplayName}" cards, alongside
--     Adaptive Campaign messages — a one-way, coach-attributed message, not
--     a DM thread (hence "Personal" — from the coach personally — not
--     "private").
--   - lib/production/coach-notes.ts's own pre-existing module doc says so
--     directly: "A client's reply (if any) goes through the ordinary chat
--     pipeline... landing in their default OPTIM conversation exactly like
--     any other message" — which only makes sense if the client saw the
--     note in the first place.
--
-- Confirmed live: with 20260911000014 applied, the pre-existing
-- scripts/e2e-chat-intelligence.mts (Phase 6.0C's own E2E suite, written
-- before this phase and never touched by it) failed its "Client A can read
-- the note" assertion against a real local Supabase stack — the actual
-- regression this reversal fixes, not a hypothetical one.
--
-- coach_notes_select returns to exactly what 20260909000008 originally
-- shipped: can_access_client (self, assigned coach, or workspace admin).
-- Coach-only privacy for genuinely private annotations is real future
-- product work (a distinct table/concept), not something this table has
-- ever actually implemented end-to-end in this codebase.

drop policy if exists coach_notes_select on public.coach_notes;
create policy coach_notes_select on public.coach_notes for select to authenticated
  using (app_private.can_access_client(client_profile_id));
