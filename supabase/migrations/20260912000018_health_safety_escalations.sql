-- Phase 7A — Persist Client Health Reviews and Coach Escalation.
--
-- Closes a real production safety gap: a client's self-reported health/
-- injury/pain information (both at onboarding and during a live workout)
-- had no real Supabase-mode path into the coach review/attention system —
-- only demo mode's in-memory HealthReviewRecord/ReviewRequest ever created
-- one. Reuses the existing public.escalations table and its established
-- 'pain_or_safety' reason_category (see 20260909000005_communications.sql)
-- rather than introducing a new "health review" or "injury" table — the
-- exact same generalized review structure the coach's real attention
-- inbox (lib/production/chat.ts's getWorkspaceEscalations,
-- app/coach/escalations/page.tsx) already renders, already prioritizes
-- pain_or_safety first (see chat.ts's ESCALATION_PRIORITY), and already
-- supports resolving without a chat message
-- (resolveEscalationWithoutMessaging). No new table, no RLS policy change:
-- escalations_select/escalations_update_staff (20260909000005) already
-- scope this correctly by client_profile_id/workspace_id.
--
-- Two real facts get their own escalation row, both via this ONE new
-- function (never a raw INSERT — escalations still has no authenticated
-- INSERT policy, matching create_escalation's own established posture):
--   - a BASELINE onboarding-completion trigger (lib/production/onboarding.ts,
--     mirroring lib/coach/health-review.ts's computeHealthReviewRequired,
--     the same structured-answer-only, non-diagnostic trigger demo mode
--     already uses) — deduplicated per client, since re-submitting
--     onboarding must never spam a second review request for the same
--     already-open concern.
--   - an ACUTE live-workout pain report (app/actions/production-safety.ts)
--     — never deduplicated against an unrelated older escalation: a new
--     acute event during a live session is real, current information that
--     must never silently disappear behind a stale pending item.
--
-- Authorization mirrors create_escalation exactly, narrowed to
-- is_client_self only (never can_manage_client) — a health/pain report is
-- always a first-person "I reported this," never something a coach files
-- on a client's behalf.

create or replace function public.create_health_safety_escalation(
  p_client_profile_id uuid,
  p_summary text,
  p_dedupe_existing boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_workspace_id uuid;
  v_existing_id uuid;
  v_new_id uuid;
begin
  if not app_private.can_access_client(p_client_profile_id) then
    raise exception 'create_health_safety_escalation: not authorized for client %', p_client_profile_id;
  end if;
  if not app_private.is_client_self(p_client_profile_id) then
    raise exception 'create_health_safety_escalation: caller is not the client this report is about';
  end if;

  select workspace_id into v_workspace_id from public.client_profiles where id = p_client_profile_id;

  if p_dedupe_existing then
    select id into v_existing_id
    from public.escalations
    where client_profile_id = p_client_profile_id
      and reason_category = 'pain_or_safety'
      and status <> 'resolved'
    order by created_at desc
    limit 1
    for update;

    if v_existing_id is not null then
      return v_existing_id;
    end if;
  end if;

  insert into public.escalations (workspace_id, client_profile_id, source_message_id, reason_category, status, proposed_response)
  values (v_workspace_id, p_client_profile_id, null, 'pain_or_safety', 'pending', p_summary)
  returning id into v_new_id;

  return v_new_id;
end;
$$;

revoke all on function public.create_health_safety_escalation(uuid, text, boolean) from public;
grant execute on function public.create_health_safety_escalation(uuid, text, boolean) to authenticated;
