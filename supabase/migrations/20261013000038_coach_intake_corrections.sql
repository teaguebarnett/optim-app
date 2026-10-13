-- Coach intake corrections — a coach can correct or clear an inaccurate onboarding answer (e.g. a target weight the
-- client never entered) without the client repeating onboarding.
--
-- The client's own answers (client_onboarding_progress.answers) are never changed: corrections live beside them in
-- coach_intake_corrections, keyed "<step>.<field>", each with the corrected value (null = cleared), the client's
-- original value, who corrected it, when and why, plus an append-only history. Planning reads the client's answers
-- with these corrections applied (lib/coach/intake-corrections.ts).
--
-- Authority: only the client's assigned coach / a workspace admin (app_private.can_manage_client), only through
-- public.correct_client_intake_answer. The column can't be written any other way (the client's own update policy
-- included): a trigger refuses changes unless the transaction-local marker set by that function is present.

alter table public.client_onboarding_progress
  add column coach_intake_corrections jsonb not null default '{}'::jsonb;

create or replace function app_private.guard_coach_intake_corrections()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.coach_intake_corrections is distinct from old.coach_intake_corrections
     and coalesce(current_setting('app.coach_intake_correction', true), '') <> new.client_profile_id::text then
    raise exception 'client_onboarding_progress: coach intake corrections can only be changed through correct_client_intake_answer';
  end if;
  return new;
end;
$$;

revoke all on function app_private.guard_coach_intake_corrections() from public;

create trigger client_onboarding_progress_intake_corrections
  before update on public.client_onboarding_progress
  for each row execute function app_private.guard_coach_intake_corrections();

create or replace function public.correct_client_intake_answer(
  p_client_profile_id uuid,
  p_step text,
  p_field text,
  p_value jsonb,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.client_onboarding_progress%rowtype;
  v_key text;
  v_entry jsonb;
  v_history jsonb;
begin
  if v_uid is null or not app_private.can_manage_client(p_client_profile_id) then
    raise exception 'correct_client_intake_answer: not authorized for this client';
  end if;
  if p_step !~ '^[a-z_]{1,40}$' or p_field !~ '^[A-Za-z]{1,60}$' then
    raise exception 'correct_client_intake_answer: invalid step or field';
  end if;
  if p_reason is null or length(btrim(p_reason)) = 0 or length(p_reason) > 500 then
    raise exception 'correct_client_intake_answer: a reason (1–500 characters) is required';
  end if;
  if p_value is not null and jsonb_typeof(p_value) not in ('number', 'string', 'boolean') then
    raise exception 'correct_client_intake_answer: the corrected value must be a number, text or yes/no (or null to clear)';
  end if;

  select * into v_row from public.client_onboarding_progress where client_profile_id = p_client_profile_id for update;
  if not found then
    raise exception 'correct_client_intake_answer: this client has no onboarding answers yet';
  end if;

  v_key := p_step || '.' || p_field;
  v_history := coalesce(v_row.coach_intake_corrections -> v_key -> 'history', '[]'::jsonb)
    || coalesce(case when v_row.coach_intake_corrections ? v_key then jsonb_build_array((v_row.coach_intake_corrections -> v_key) - 'history') end, '[]'::jsonb);
  v_entry := jsonb_build_object(
    'step', p_step,
    'field', p_field,
    'value', coalesce(p_value, 'null'::jsonb),
    'cleared', p_value is null,
    'original', coalesce(v_row.answers -> p_step -> p_field, 'null'::jsonb),
    'reason', btrim(p_reason),
    'correctedBy', v_uid,
    'correctedAtIso', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'history', v_history
  );

  perform set_config('app.coach_intake_correction', p_client_profile_id::text, true);
  update public.client_onboarding_progress
     set coach_intake_corrections = coach_intake_corrections || jsonb_build_object(v_key, v_entry)
   where id = v_row.id;
  -- The marker covers exactly this one write, never the rest of the transaction.
  perform set_config('app.coach_intake_correction', '', true);
  return v_entry;
end;
$$;

revoke all on function public.correct_client_intake_answer(uuid, text, text, jsonb, text) from public, anon;
grant execute on function public.correct_client_intake_answer(uuid, text, text, jsonb, text) to authenticated;
