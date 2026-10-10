-- Gate U3B — coach review of unified program proposals: record the coach's answers to prepared decisions, the
-- review's edit history, and an APPROVE or REJECT decision — without publishing, assigning or notifying anything.
-- Approval binds the decision to the exact draft versions (and their content hashes) the coach reviewed; atomic
-- publication (U3C) will publish exactly those. Once decided, a proposal is immutable.
--
-- Defense in depth: the app layer already requires the client's assigned coach (or a workspace admin); this trigger
-- enforces the same for every review write, records the real reviewer, and keeps approved links on drafts.

alter table public.unified_program_proposals drop constraint unified_program_proposals_approval_state_check;

alter table public.unified_program_proposals
  add constraint unified_program_proposals_approval_state_check check (approval_state in ('proposed', 'approved', 'rejected')),
  add column coach_decisions jsonb not null default '{}'::jsonb,
  add column review_revisions jsonb not null default '[]'::jsonb,
  add column reviewed_by uuid references auth.users(id),
  add column reviewed_at timestamptz,
  add column rejection_reason text check (rejection_reason is null or char_length(rejection_reason) <= 1000),
  add column approved_training_version_id uuid references public.training_program_versions(id) on delete set null,
  add column approved_nutrition_version_id uuid references public.nutrition_plan_versions(id) on delete set null,
  add column approved_content_hashes jsonb;

alter table public.unified_program_proposals
  add constraint unified_program_proposals_proposed_unreviewed check (
    approval_state <> 'proposed' or (reviewed_by is null and reviewed_at is null and rejection_reason is null
      and approved_training_version_id is null and approved_nutrition_version_id is null and approved_content_hashes is null)
  ),
  add constraint unified_program_proposals_approved_bound check (
    approval_state <> 'approved' or (
      reviewed_by is not null and reviewed_at is not null and rejection_reason is null
      and status in ('draft_ready', 'needs_coach_decision')
      and (approved_training_version_id is not null or approved_nutrition_version_id is not null)
      and approved_training_version_id is not distinct from training_program_version_id
      and approved_nutrition_version_id is not distinct from nutrition_plan_version_id
      and approved_content_hashes is not null
    )
  ),
  add constraint unified_program_proposals_rejected_reviewed check (
    approval_state <> 'rejected' or (reviewed_by is not null and reviewed_at is not null
      and approved_training_version_id is null and approved_nutrition_version_id is null and approved_content_hashes is null)
  );

create or replace function app_private.guard_unified_proposal_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.plan_version_status;
  v_review_write boolean;
begin
  if old.approval_state <> 'proposed' then
    raise exception 'unified_program_proposals: a % proposal is immutable', old.approval_state;
  end if;

  v_review_write := new.approval_state <> 'proposed'
    or new.coach_decisions is distinct from old.coach_decisions
    or new.review_revisions is distinct from old.review_revisions
    or (old.status in ('draft_ready', 'needs_coach_decision', 'incomplete') and (
      new.training_program_version_id is distinct from old.training_program_version_id
      or new.nutrition_plan_version_id is distinct from old.nutrition_plan_version_id));

  -- Only the client's assigned coach or a workspace admin reviews (service-role maintenance has no auth.uid()).
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
        select v.status into v_status from public.training_program_versions v where v.id = new.training_program_version_id;
        if v_status is distinct from 'draft' then raise exception 'unified_program_proposals: the approved training version must still be a draft (got %)', v_status; end if;
      end if;
      if new.nutrition_plan_version_id is not null then
        select v.status into v_status from public.nutrition_plan_versions v where v.id = new.nutrition_plan_version_id;
        if v_status is distinct from 'draft' then raise exception 'unified_program_proposals: the approved nutrition version must still be a draft (got %)', v_status; end if;
      end if;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function app_private.guard_unified_proposal_review() from public;

create trigger unified_program_proposals_review
  before update on public.unified_program_proposals
  for each row execute function app_private.guard_unified_proposal_review();
