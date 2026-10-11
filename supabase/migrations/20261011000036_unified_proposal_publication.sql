-- Gate U3C — atomic publication of an approved unified program proposal.
--
-- One SECURITY DEFINER function, one transaction: either the client receives the approved training AND nutrition
-- (published, assigned, position set, earlier drafts/proposals explicitly superseded, an in-app notification written)
-- or nothing changes. Reuses the existing contracts: training/nutrition versions publish as before (immutable once
-- published), assignment goes through assign_active_program_version / assign_active_nutrition_plan_version (which
-- authorize, lock, replace the previous active assignment and log publication_events), and the client's start date
-- lives on client_enrollments as before (past daily_records keep their own snapshotted program week).
--
-- Safety: only the client's assigned coach / workspace admin (can_manage_client); publications for one client are
-- serialized (client row lock); a retry of a published proposal returns the same publication (idempotent); the
-- approved versions must be unchanged since approval (database-side content fingerprints taken AT approval); the
-- client's active assignments must be exactly what the coach saw, and replacing one needs explicit confirmation.

alter table public.unified_program_proposals drop constraint unified_program_proposals_approval_state_check;
alter table public.unified_program_proposals
  add constraint unified_program_proposals_approval_state_check check (approval_state in ('proposed', 'approved', 'rejected', 'published', 'superseded')),
  add column approved_db_hashes jsonb,
  add column published_at timestamptz,
  add column published_by uuid references auth.users(id),
  add column publication jsonb,
  add column superseded_by uuid references public.unified_program_proposals(id),
  add column superseded_at timestamptz;

alter table public.unified_program_proposals
  add constraint unified_program_proposals_published_complete check (
    approval_state <> 'published' or (published_at is not null and published_by is not null and publication is not null
      and reviewed_by is not null and approved_content_hashes is not null)
  ),
  add constraint unified_program_proposals_superseded_complete check (
    approval_state <> 'superseded' or (superseded_by is not null and superseded_at is not null)
  );

-- The U3B review guard, extended: approval also records database-side fingerprints of the exact approved contents
-- (jsonb text is canonical, so publication can re-check them); decided rows stay immutable for every direct write —
-- only public.publish_unified_proposal may move approved → published or proposed/approved → superseded. It marks its
-- own transaction (a transaction-local setting naming the proposal it is publishing); API callers can't set custom
-- settings, and current_user can't be used here because this trigger function is itself SECURITY DEFINER.
create or replace function app_private.guard_unified_proposal_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.plan_version_status;
  v_review_write boolean;
  v_t text;
  v_n text;
begin
  if old.approval_state <> 'proposed' then
    if old.approval_state = 'approved' and new.approval_state = 'published' and current_setting('app.unified_publication', true) = new.id::text then
      return new;
    end if;
    if old.approval_state = 'approved' and new.approval_state = 'superseded' and current_setting('app.unified_publication', true) = new.superseded_by::text then
      return new;
    end if;
    raise exception 'unified_program_proposals: a % proposal is immutable', old.approval_state;
  end if;
  if new.approval_state = 'superseded' then
    if current_setting('app.unified_publication', true) is distinct from new.superseded_by::text then
      raise exception 'unified_program_proposals: only publication supersedes a proposal';
    end if;
    return new;
  end if;
  if new.approval_state = 'published' then
    raise exception 'unified_program_proposals: only an approved proposal can be published';
  end if;

  v_review_write := new.approval_state <> 'proposed'
    or new.coach_decisions is distinct from old.coach_decisions
    or new.review_revisions is distinct from old.review_revisions
    or (old.status in ('draft_ready', 'needs_coach_decision', 'incomplete') and (
      new.training_program_version_id is distinct from old.training_program_version_id
      or new.nutrition_plan_version_id is distinct from old.nutrition_plan_version_id));

  if v_review_write and auth.uid() is not null and not app_private.can_manage_client(new.client_profile_id) then
    raise exception 'unified_program_proposals: only the client''s assigned coach or a workspace admin can review this proposal';
  end if;

  if new.approval_state <> 'proposed' then
    if auth.uid() is not null and new.reviewed_by is distinct from auth.uid() then
      raise exception 'unified_program_proposals: the recorded reviewer must be the signed-in coach';
    end if;
    if new.training_program_version_id is distinct from old.training_program_version_id
       or new.nutrition_plan_version_id is distinct from old.nutrition_plan_version_id then
      raise exception 'unified_program_proposals: drafts can''t change in the same write as the decision';
    end if;
    if new.approval_state = 'approved' then
      if new.training_program_version_id is not null then
        select v.status, md5(v.content::text) into v_status, v_t from public.training_program_versions v where v.id = new.training_program_version_id;
        if v_status is distinct from 'draft' then raise exception 'unified_program_proposals: the approved training version must still be a draft (got %)', v_status; end if;
      end if;
      if new.nutrition_plan_version_id is not null then
        select v.status, md5(v.content::text) into v_status, v_n from public.nutrition_plan_versions v where v.id = new.nutrition_plan_version_id;
        if v_status is distinct from 'draft' then raise exception 'unified_program_proposals: the approved nutrition version must still be a draft (got %)', v_status; end if;
      end if;
      new.approved_db_hashes := jsonb_build_object('training', v_t, 'nutrition', v_n);
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.publish_unified_proposal(
  p_proposal_id uuid,
  -- The training version to publish: the approved version itself, or its client-facing copy (a draft in the same
  -- program whose content.clientFacingFrom.reviewedVersionId is the approved version). Null when no training.
  p_training_version_id uuid,
  -- What the coach saw and confirmed: { activeTrainingVersionId, activeNutritionVersionId, replaceActive, startDate }.
  p_expected jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  p public.unified_program_proposals%rowtype;
  v_uid uuid := auth.uid();
  v_client_user uuid;
  v_active_t uuid;
  v_active_n uuid;
  v_status plan_version_status;
  v_program uuid;
  v_copy record;
  v_t_assignment uuid;
  v_n_assignment uuid;
  v_superseded uuid[] := '{}';
  v_archived_t uuid[] := '{}';
  v_archived_n uuid[] := '{}';
  v_notification uuid;
  v_start date;
  v_publication jsonb;
  v_keep_t uuid[];
  v_keep_n uuid[];
begin
  if v_uid is null then
    raise exception 'publish_unified_proposal: sign in to publish';
  end if;

  select * into p from public.unified_program_proposals where id = p_proposal_id;
  if not found then
    raise exception 'publish_unified_proposal: no such proposal';
  end if;
  if not app_private.can_manage_client(p.client_profile_id) then
    raise exception 'publish_unified_proposal: only the client''s assigned coach or a workspace admin can publish';
  end if;

  -- One publication per client at a time; then the proposal itself.
  perform 1 from public.client_profiles where id = p.client_profile_id for update;
  select * into p from public.unified_program_proposals where id = p_proposal_id for update;
  -- This transaction (and only it) may move THIS proposal to published / supersede others in its name.
  perform set_config('app.unified_publication', p.id::text, true);

  -- Idempotent retry: the same proposal already published → the same publication, nothing repeated.
  if p.approval_state = 'published' then
    return p.publication || jsonb_build_object('replayed', true);
  end if;
  if p.approval_state <> 'approved' then
    raise exception 'publish_unified_proposal: only an approved proposal can be published (this one is %)', p.approval_state;
  end if;
  if p.approved_db_hashes is null then
    raise exception 'publish_unified_proposal: this approval predates publication checks — review and approve it again';
  end if;

  -- The approved versions: still drafts, and byte-identical to what was approved.
  if p.training_program_version_id is not null then
    select status, program_id into v_status, v_program from public.training_program_versions where id = p.training_program_version_id for update;
    if v_status is distinct from 'draft' then raise exception 'publish_unified_proposal: the approved training version is no longer a draft (%)', v_status; end if;
    if (select md5(content::text) from public.training_program_versions where id = p.training_program_version_id) is distinct from p.approved_db_hashes->>'training' then
      raise exception 'publish_unified_proposal: the approved training changed after approval — review and approve again';
    end if;
    if p_training_version_id is null then raise exception 'publish_unified_proposal: a training version to publish is required'; end if;
    if p_training_version_id <> p.training_program_version_id then
      select id, status, program_id, workspace_id, content into v_copy from public.training_program_versions where id = p_training_version_id for update;
      if v_copy.id is null or v_copy.status <> 'draft' or v_copy.program_id <> v_program or v_copy.workspace_id <> p.workspace_id
         or v_copy.content->'clientFacingFrom'->>'reviewedVersionId' is distinct from p.training_program_version_id::text
         or v_copy.content->>'clientId' is distinct from p.client_profile_id::text then
        raise exception 'publish_unified_proposal: the training to publish isn''t the client copy of the approved version';
      end if;
    end if;
  elsif p_training_version_id is not null then
    raise exception 'publish_unified_proposal: this proposal has no training to publish';
  end if;
  if p.nutrition_plan_version_id is not null then
    select status into v_status from public.nutrition_plan_versions where id = p.nutrition_plan_version_id for update;
    if v_status is distinct from 'draft' then raise exception 'publish_unified_proposal: the approved nutrition version is no longer a draft (%)', v_status; end if;
    if (select md5(content::text) from public.nutrition_plan_versions where id = p.nutrition_plan_version_id) is distinct from p.approved_db_hashes->>'nutrition' then
      raise exception 'publish_unified_proposal: the approved nutrition changed after approval — review and approve again';
    end if;
  end if;

  -- The client's active assignments must be exactly what the coach saw; replacing one is never silent.
  select program_version_id into v_active_t from public.program_assignments where client_profile_id = p.client_profile_id and status = 'active';
  select plan_version_id into v_active_n from public.nutrition_plan_assignments where client_profile_id = p.client_profile_id and status = 'active';
  if v_active_t::text is distinct from nullif(p_expected->>'activeTrainingVersionId', '') or v_active_n::text is distinct from nullif(p_expected->>'activeNutritionVersionId', '') then
    raise exception 'publish_unified_proposal: the client''s active program or nutrition changed since you reviewed this — reload and confirm again';
  end if;
  if ((p.training_program_version_id is not null and v_active_t is not null) or (p.nutrition_plan_version_id is not null and v_active_n is not null))
     and coalesce((p_expected->>'replaceActive')::boolean, false) is not true then
    raise exception 'publish_unified_proposal: this replaces the client''s active program or nutrition — confirm the replacement to publish';
  end if;
  if p.training_program_version_id is not null and v_active_t is not null then
    if p.resistance_source = 'approved_program' then
      -- The same approved lifting continues (plus cardio): the client's program position is preserved.
      if v_active_t is distinct from p.source_resistance_version_id then
        raise exception 'publish_unified_proposal: the client''s active program isn''t the approved program this proposal was built around';
      end if;
      if nullif(p_expected->>'startDate', '') is not null then
        raise exception 'publish_unified_proposal: this continues the client''s approved program — its start date and position are kept';
      end if;
    else
      v_start := nullif(p_expected->>'startDate', '')::date;
      if v_start is null then
        raise exception 'publish_unified_proposal: a new program replaces the active one — choose its start date';
      end if;
    end if;
  end if;

  -- Publish (+ stamp nutrition's approval time — the coach's approval) and assign through the existing contracts.
  if p.training_program_version_id is not null then
    update public.training_program_versions set status = 'published', published_by = v_uid, published_at = now() where id = p_training_version_id and status = 'draft';
    v_t_assignment := public.assign_active_program_version(p.client_profile_id, p_training_version_id);
  end if;
  if p.nutrition_plan_version_id is not null then
    update public.nutrition_plan_versions
      set content = jsonb_set(content, '{approvedAtIso}', to_jsonb(to_char(p.reviewed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))),
          status = 'published', published_by = v_uid, published_at = now()
      where id = p.nutrition_plan_version_id and status = 'draft';
    v_n_assignment := public.assign_active_nutrition_plan_version(p.client_profile_id, p.nutrition_plan_version_id);
  end if;
  if v_start is not null then
    update public.client_enrollments set original_program_start_date = v_start, updated_at = now() where client_profile_id = p.client_profile_id;
    if not found then raise exception 'publish_unified_proposal: the client has no enrollment to set a start date on'; end if;
  end if;

  -- Explicit supersession: this proposal's own unpublished drafts, every other open proposal for the client (and its
  -- drafts), and any legacy pending program proposal — archived, never deleted.
  v_keep_t := array_remove(array[p_training_version_id], null);
  v_keep_n := array_remove(array[p.nutrition_plan_version_id], null);
  with drafts as (
    select (r->>'fromVersionId')::uuid id from public.unified_program_proposals u, jsonb_array_elements(u.review_revisions) r where u.client_profile_id = p.client_profile_id and u.approval_state in ('proposed', 'approved') and r->>'domain' = 'training'
    union select (r->>'toVersionId')::uuid from public.unified_program_proposals u, jsonb_array_elements(u.review_revisions) r where u.client_profile_id = p.client_profile_id and u.approval_state in ('proposed', 'approved') and r->>'domain' = 'training'
    union select training_program_version_id from public.unified_program_proposals where client_profile_id = p.client_profile_id and approval_state in ('proposed', 'approved')
    union select id from public.training_program_versions where proposed_for_client_profile_id = p.client_profile_id and status = 'draft'
  ), archived as (
    update public.training_program_versions v set status = 'archived'
    where v.id in (select id from drafts where id is not null) and v.status = 'draft' and not (v.id = any(v_keep_t))
    returning v.id
  ) select coalesce(array_agg(id), '{}') into v_archived_t from archived;
  with drafts as (
    select (r->>'fromVersionId')::uuid id from public.unified_program_proposals u, jsonb_array_elements(u.review_revisions) r where u.client_profile_id = p.client_profile_id and u.approval_state in ('proposed', 'approved') and r->>'domain' = 'nutrition'
    union select (r->>'toVersionId')::uuid from public.unified_program_proposals u, jsonb_array_elements(u.review_revisions) r where u.client_profile_id = p.client_profile_id and u.approval_state in ('proposed', 'approved') and r->>'domain' = 'nutrition'
    union select nutrition_plan_version_id from public.unified_program_proposals where client_profile_id = p.client_profile_id and approval_state in ('proposed', 'approved')
  ), archived as (
    update public.nutrition_plan_versions v set status = 'archived'
    where v.id in (select id from drafts where id is not null) and v.status = 'draft' and not (v.id = any(v_keep_n))
    returning v.id
  ) select coalesce(array_agg(id), '{}') into v_archived_n from archived;
  with sup as (
    update public.unified_program_proposals set approval_state = 'superseded', superseded_by = p.id, superseded_at = now()
    where client_profile_id = p.client_profile_id and id <> p.id and approval_state in ('proposed', 'approved')
    returning id
  ) select coalesce(array_agg(id), '{}') into v_superseded from sup;

  -- The client hears about it only now, inside the same transaction: no publication, no notification.
  select user_id into v_client_user from public.client_profiles where id = p.client_profile_id;
  if v_client_user is not null then
    insert into public.notifications (workspace_id, recipient_user_id, kind, title, body, link_path)
    values (p.workspace_id, v_client_user, 'program_published', 'Your updated program is ready',
            'Your coach published your new ' || concat_ws(' and ', case when p.training_program_version_id is not null then 'training' end, case when p.nutrition_plan_version_id is not null then 'nutrition' end) || ' plan.',
            '/today')
    returning id into v_notification;
  end if;

  v_publication := jsonb_build_object(
    'trainingVersionId', p_training_version_id,
    'nutritionVersionId', p.nutrition_plan_version_id,
    'programAssignmentId', v_t_assignment,
    'nutritionAssignmentId', v_n_assignment,
    'replaced', jsonb_build_object('trainingVersionId', case when p.training_program_version_id is not null then v_active_t end, 'nutritionVersionId', case when p.nutrition_plan_version_id is not null then v_active_n end),
    'startDate', v_start,
    'positionPreserved', v_start is null,
    'supersededProposalIds', to_jsonb(v_superseded),
    'archivedTrainingVersionIds', to_jsonb(v_archived_t),
    'archivedNutritionVersionIds', to_jsonb(v_archived_n),
    'notificationId', v_notification
  );
  update public.unified_program_proposals
    set approval_state = 'published', published_at = now(), published_by = v_uid, publication = v_publication
    where id = p.id;

  insert into public.publication_events (workspace_id, entity_type, entity_id, event_type, actor_user_id, actor_role, metadata)
  select p.workspace_id, e.entity_type, e.entity_id, 'published'::publication_event_type, v_uid,
         (select role from public.workspace_memberships where workspace_id = p.workspace_id and user_id = v_uid and status = 'active' limit 1),
         jsonb_build_object('client_profile_id', p.client_profile_id, 'unified_proposal_id', p.id)
  from (values ('training_program_version', p_training_version_id), ('nutrition_plan_version', p.nutrition_plan_version_id)) e(entity_type, entity_id)
  where e.entity_id is not null;

  return v_publication;
end;
$$;

revoke all on function public.publish_unified_proposal(uuid, uuid, jsonb) from public, anon;
grant execute on function public.publish_unified_proposal(uuid, uuid, jsonb) to authenticated;
