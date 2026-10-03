-- Gate 4.0C-2A — Coach-confirmed structured training limitations.
--
-- The coach's health-review decision already lives on the canonical
-- escalations row (Phase 7B): health_review_status + documented_limitations
-- (the coach's own words). Planning needs those words expressed as
-- STRUCTURED restrictions (movement patterns, exercise demands, positions,
-- equipment, specific exercises) that the coach has explicitly confirmed —
-- OPTIM never activates its own interpretation of free text.
--
-- Why columns on escalations (and not a new table): the escalations row is
-- the sole canonical safety record for this decision; the structured
-- version is the same decision in machine-checkable form, scoped to the
-- same row, so it can never drift onto another client or another review.
-- documented_limitations stays untouched as the raw source text.
-- coach_decision_evidence is not suitable as the store: it is insert-only
-- evidence readable only by the deciding coach, not canonical planning
-- truth — it remains the HISTORY of each confirmation (proposal vs. the
-- coach's choice), written alongside this update.
--
-- Shape (validated in lib/synthesis/limitations/confirm.ts before every
-- write and on every read): { schema: 1, sourceText, restrictions: [...],
-- noExerciseRestrictions, interpretation: {...}, confirmedAtIso,
-- confirmedBy }. sourceText is the exact documented_limitations text it was
-- confirmed against; if the coach later records a new limitation, the
-- stored structure no longer matches and planning asks again (never applies
-- a stale interpretation).
--
-- Additive and nullable; no backfill (nothing has been confirmed yet).
-- No RLS changes: escalations_update_staff already authorizes an assigned
-- coach to update this row (same write path as recordHealthReviewDecision).
--
-- Rollback: alter table public.escalations drop constraint
-- escalations_structured_limitations_confirmed, drop column
-- structured_limitations, drop column structured_limitations_confirmed_by,
-- drop column structured_limitations_confirmed_at.

alter table public.escalations
  add column structured_limitations jsonb,
  add column structured_limitations_confirmed_by uuid references public.profiles (id),
  add column structured_limitations_confirmed_at timestamptz;

alter table public.escalations
  add constraint escalations_structured_limitations_confirmed check (
    structured_limitations is null
    or (
      jsonb_typeof(structured_limitations) = 'object'
      and structured_limitations_confirmed_by is not null
      and structured_limitations_confirmed_at is not null
      and reason_category = 'pain_or_safety'
    )
  );

comment on column public.escalations.structured_limitations is
  'Gate 4.0C-2A — the coach-CONFIRMED structured form of documented_limitations (patterns/demands/positions/equipment/exercises). Never an unconfirmed OPTIM interpretation. Validated by lib/synthesis/limitations/confirm.ts.';
