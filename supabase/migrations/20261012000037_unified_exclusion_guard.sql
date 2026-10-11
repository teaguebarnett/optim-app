-- Gate U3C closure — the coach's exercise exclusions are binding all the way to the client.
--
-- In unified review a coach can answer an exercise decision (e.g. the documented-limitation review naming Cable
-- Triceps Pushdown and Single-Leg Calf Raise) with "Exclude them for this client". The answer is stored in
-- coach_decisions with the excluded exercise names (`excludes`). The app's revalidation already blocks approval and
-- publication while an excluded exercise remains; this guard enforces the same in the database, so no write path can
-- approve — or publish — a training version that still contains an exercise the coach excluded. Nothing is removed
-- here: removing or replacing the exercise is always the coach's explicit edit.

create or replace function app_private.guard_unified_exclusions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version uuid;
  v_hits text[];
begin
  if new.approval_state is not distinct from old.approval_state or new.approval_state not in ('approved', 'published') then
    return new;
  end if;
  -- approved → the linked (reviewed) draft; published → the version actually published to the client (its copy).
  v_version := case when new.approval_state = 'approved' then new.training_program_version_id
                    else nullif(new.publication->>'trainingVersionId', '')::uuid end;
  if v_version is null then
    return new;
  end if;
  select array_agg(distinct hit order by hit) into v_hits from (
    select lower(item #>> '{}') as hit
      from public.training_program_versions v,
           jsonb_path_query(v.content, '$.weeks[*].days[*].sessions[*].blocks[*].items[*].name') as item
     where v.id = v_version
    intersect
    select lower(x #>> '{}')
      from jsonb_each(coalesce(new.coach_decisions, '{}'::jsonb)) as d(k, a),
           jsonb_array_elements(case when jsonb_typeof(a->'excludes') = 'array' then a->'excludes' else '[]'::jsonb end) as x
  ) s;
  if v_hits is not null then
    raise exception 'unified_program_proposals: the coach excluded % but it is still in the program — remove or replace it first', array_to_string(v_hits, ', ');
  end if;
  return new;
end;
$$;

revoke all on function app_private.guard_unified_exclusions() from public;

create trigger unified_program_proposals_exclusions
  before update on public.unified_program_proposals
  for each row execute function app_private.guard_unified_exclusions();
