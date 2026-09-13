-- Phase 7B — Persist Coach-Reviewed Training Limitations.
--
-- Closes the gap Phase 7A explicitly identified: production's escalations
-- table can record THAT a health/safety concern was reported (Phase 7A),
-- but had nowhere to record the coach's actual structured decision about
-- it (lib/coach/types.ts's real, existing HealthReviewStatus vocabulary —
-- review_needed / discuss_with_client / professional_guidance_requested /
-- professional_guidance_confirmed / reviewed_by_coach /
-- proceed_with_limitations — and, when the coach chooses
-- proceed_with_limitations, the real documented limitation text demo
-- mode's components/coach/health-review-decision-card.tsx already collects
-- and lib/coach/programming-profile.ts's extractClientProgrammingProfile
-- already knows how to fold into ClientProgrammingProfile.injuryRestrictions).
--
-- Why the existing escalations columns cannot safely represent this
-- (per this phase's own required stop-and-report): `status`
-- (escalation_status: pending/proposed/approved/coach_responded/resolved)
-- is a different concept entirely — the chat-escalation QUEUE lifecycle,
-- not a health-review DECISION — and conflating the two into one enum
-- would be exactly the kind of overloaded, ambiguous state machine this
-- phase's own instructions warn against. `proposed_response` (the only
-- existing free-text column) is already reserved, as of Phase 7A, for the
-- CLIENT's original report summary — writing the coach's decision text
-- into it would silently overwrite that original report, violating the
-- historical-truth requirement both phases establish.
--
-- These four columns are additive and nullable — meaningful only for
-- reason_category = 'pain_or_safety' rows, always null for every other
-- escalation (plan_change, explicit_request, etc.), and null on every
-- existing row until a coach makes a real decision. No backfill: there is
-- no historical decision to backfill (Phase 7A only just started creating
-- these rows), and every current pain_or_safety row correctly reads as
-- "no decision recorded yet" — never a false "reviewed" fabricated by a
-- migration.
--
-- No RLS policy changes: escalations_update_staff (20260909000005) is
-- already a plain row-level policy with no column restrictions — an
-- authorized coach (app_private.can_manage_client) can already update any
-- column on a row for a client they manage, including these four. The
-- decision write itself goes through a normal authenticated `.update()`
-- from a real Server Action (lib/production/pain-safety.ts), exactly like
-- lib/production/chat.ts's existing resolveEscalationWithoutMessaging
-- already does for the same table — no new RPC function needed here, only
-- schema.
--
-- Rollback: `alter table public.escalations drop column ...` for each of
-- the four columns, then `drop type public.health_review_status` — safe at
-- any time since nothing else in the schema references these columns
-- (checked: no foreign keys point at them, no other table/view depends on
-- them).

create type public.health_review_status as enum (
  'review_needed',
  'discuss_with_client',
  'professional_guidance_requested',
  'professional_guidance_confirmed',
  'reviewed_by_coach',
  'proceed_with_limitations'
);

alter table public.escalations
  add column health_review_status public.health_review_status,
  add column documented_limitations text,
  add column health_review_decided_by uuid references public.profiles (id),
  add column health_review_decided_at timestamptz;

comment on column public.escalations.health_review_status is
  'Phase 7B — the coach''s real, explicit health-review decision (never inferred from acknowledgement/queue status). Null except on pain_or_safety rows a coach has actually decided on.';
comment on column public.escalations.documented_limitations is
  'Phase 7B — the coach''s own real, structured training-boundary text, required only when health_review_status = proceed_with_limitations. Feeds ClientProgrammingProfile.injuryRestrictions (see lib/coach/programming-profile.ts) — never free text OPTIM invented.';
