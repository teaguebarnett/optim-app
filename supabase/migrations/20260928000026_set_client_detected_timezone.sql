-- Gate 6F — the one write a client is ever allowed to make to
-- client_enrollments (otherwise staff-only — see
-- client_enrollments_update_staff/client_enrollments_insert_staff in
-- 20260909000008_rls_policies.sql). SECURITY DEFINER, matching
-- accept_invitation's own established pattern
-- (20260909000010_accept_invitation.sql): narrowly scoped to exactly the
-- caller's own client_profiles row, validates the value is a real IANA
-- zone before writing anything, and never overwrites a coach's own
-- explicit override (timezone_source = 'coach_override') — the WHERE
-- clause on the upsert makes that guarantee atomic, not a separate
-- check-then-write race.
create or replace function public.set_client_detected_timezone(p_time_zone text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_client_profile_id uuid;
  v_workspace_id uuid;
begin
  if auth.uid() is null then
    raise exception 'set_client_detected_timezone: no authenticated caller.';
  end if;

  if not exists (select 1 from pg_timezone_names where name = p_time_zone) then
    raise exception 'set_client_detected_timezone: % is not a recognized IANA timezone.', p_time_zone;
  end if;

  select id, workspace_id into v_client_profile_id, v_workspace_id
  from public.client_profiles
  where user_id = auth.uid();

  if v_client_profile_id is null then
    raise exception 'set_client_detected_timezone: caller has no client_profiles row.';
  end if;

  insert into public.client_enrollments (workspace_id, client_profile_id, timezone, timezone_source)
  values (v_workspace_id, v_client_profile_id, p_time_zone, 'client_detected')
  on conflict (client_profile_id) do update
    set timezone = excluded.timezone, timezone_source = excluded.timezone_source
    where public.client_enrollments.timezone_source is distinct from 'coach_override';
end;
$$;

grant execute on function public.set_client_detected_timezone(text) to authenticated;
revoke execute on function public.set_client_detected_timezone(text) from anon;
