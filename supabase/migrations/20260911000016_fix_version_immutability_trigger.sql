-- Phase 6.0D-B (live-verification correction) — fixes a real, pre-existing
-- Phase 6.0B defect: public.prevent_published_version_mutation() (see
-- 20260909000004_programs_and_nutrition.sql) is one shared trigger function
-- attached to BOTH training_program_versions (which has a `program_id`
-- column) AND nutrition_plan_versions (which has `plan_id` instead, no
-- `program_id` at all) — but the function body references
-- `new.program_id`/`old.program_id` unconditionally.
--
-- Confirmed live: publishing a nutrition_plan_versions row (the very first
-- UPDATE ... SET status = 'published' any nutrition plan ever needs) always
-- raised `record "new" has no field "program_id"` — meaning
-- lib/production/programs.ts's publishNutritionVersion could never
-- actually succeed against a real Postgres database. This was never caught
-- before because no pgTAP or live E2E test had ever exercised publishing a
-- nutrition plan version specifically (scripts/e2e-revenue-loop.mts only
-- exercises the training-program path).
--
-- Fixed by dropping the family-id (program_id/plan_id) distinctness check
-- from the shared function entirely: no legitimate code path in this
-- codebase ever attempts to move an existing version row to a different
-- program/plan family after creation (both tables' own unique(family_id,
-- version_number) constraint makes that nonsensical), so content/
-- version_number/status are the fields that actually need immutability
-- protection once a version is published/archived — the same protection
-- both tables still get, now without referencing a column only one of them
-- has.

create or replace function public.prevent_published_version_mutation()
returns trigger
language plpgsql
as $$
begin
  if old.status in ('published', 'archived') and (
    new.content is distinct from old.content
    or new.version_number is distinct from old.version_number
    or (old.status = 'published' and new.status = 'draft')
  ) then
    raise exception 'version immutability: cannot modify a % version (id=%). Create a new version instead.', old.status, old.id;
  end if;
  return new;
end;
$$;
