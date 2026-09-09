-- Phase 6.0A — Production Foundation.
--
-- Operation-specific RLS policies for every table, built from
-- 20260909000007's helpers. Every table already has RLS enabled with zero
-- policies (fail-closed default from the migrations that created them), so
-- this file only ever widens access, never narrows it — and any table this
-- file doesn't mention stays fully default-deny for every role except the
-- service-role key (which bypasses RLS entirely by design, and is only
-- ever used from lib/production/*.ts server-only modules).
--
-- Grants: Postgres requires a base table-level GRANT in addition to a
-- matching RLS policy — a policy alone does not create access. `anon`
-- receives no grants anywhere in this file (unauthenticated access to any
-- protected table is impossible at the grant level, not just the policy
-- level). `authenticated` receives SELECT/INSERT/UPDATE broadly, with
-- DELETE granted only on the small set of genuinely mutable tables — every
-- immutable table (conversation_messages, publication_events,
-- import_review_events, coach_notes, escalations' own audit shape) has its
-- DELETE grant revoked outright as defense-in-depth, so "no policy" isn't
-- the only thing standing between those rows and deletion.

revoke all on all tables in schema public from anon;
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke delete on
  public.conversation_messages,
  public.publication_events,
  public.import_review_events,
  public.coach_notes,
  public.escalations,
  public.training_program_versions,
  public.nutrition_plan_versions
from authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or app_private.shares_active_workspace_with(id));

create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- workspaces
-- ---------------------------------------------------------------------------
create policy workspaces_select on public.workspaces for select to authenticated
  using (app_private.is_workspace_member(id));

create policy workspaces_update_admin on public.workspaces for update to authenticated
  using (app_private.is_workspace_admin(id))
  with check (app_private.is_workspace_admin(id));

-- ---------------------------------------------------------------------------
-- workspace_memberships
-- ---------------------------------------------------------------------------
create policy workspace_memberships_select on public.workspace_memberships for select to authenticated
  using (user_id = auth.uid() or app_private.is_workspace_admin(workspace_id));

create policy workspace_memberships_insert_admin on public.workspace_memberships for insert to authenticated
  with check (app_private.is_workspace_admin(workspace_id));

create policy workspace_memberships_update_admin on public.workspace_memberships for update to authenticated
  using (app_private.is_workspace_admin(workspace_id))
  with check (app_private.is_workspace_admin(workspace_id));

create policy workspace_memberships_delete_admin on public.workspace_memberships for delete to authenticated
  using (app_private.is_workspace_admin(workspace_id));

-- ---------------------------------------------------------------------------
-- workspace_invitations — acceptance (status -> accepted, accepted_by) is
-- performed by a SECURITY DEFINER function (see 20260909000009), not by
-- this UPDATE policy, since the invitee has no workspace membership yet
-- and so cannot satisfy is_workspace_admin at the moment they accept.
-- ---------------------------------------------------------------------------
create policy workspace_invitations_select_admin on public.workspace_invitations for select to authenticated
  using (app_private.is_workspace_admin(workspace_id));

create policy workspace_invitations_insert_admin on public.workspace_invitations for insert to authenticated
  with check (app_private.is_workspace_admin(workspace_id) and invited_by = auth.uid());

create policy workspace_invitations_update_admin on public.workspace_invitations for update to authenticated
  using (app_private.is_workspace_admin(workspace_id))
  with check (app_private.is_workspace_admin(workspace_id));

-- ---------------------------------------------------------------------------
-- client_profiles
-- ---------------------------------------------------------------------------
create policy client_profiles_select on public.client_profiles for select to authenticated
  using (app_private.can_access_client(id));

create policy client_profiles_insert_staff on public.client_profiles for insert to authenticated
  with check (app_private.is_workspace_staff(workspace_id));

create policy client_profiles_update_staff on public.client_profiles for update to authenticated
  using (app_private.can_manage_client(id))
  with check (app_private.can_manage_client(id));

-- ---------------------------------------------------------------------------
-- coach_client_assignments
-- ---------------------------------------------------------------------------
create policy coach_client_assignments_select on public.coach_client_assignments for select to authenticated
  using (app_private.can_access_client(client_profile_id));

create policy coach_client_assignments_insert_admin on public.coach_client_assignments for insert to authenticated
  with check (app_private.is_workspace_admin(workspace_id));

create policy coach_client_assignments_update_admin on public.coach_client_assignments for update to authenticated
  using (app_private.is_workspace_admin(workspace_id))
  with check (app_private.is_workspace_admin(workspace_id));

create policy coach_client_assignments_delete_admin on public.coach_client_assignments for delete to authenticated
  using (app_private.is_workspace_admin(workspace_id));

-- ---------------------------------------------------------------------------
-- client_enrollments
-- ---------------------------------------------------------------------------
create policy client_enrollments_select on public.client_enrollments for select to authenticated
  using (app_private.can_access_client(client_profile_id));

create policy client_enrollments_insert_staff on public.client_enrollments for insert to authenticated
  with check (app_private.can_manage_client(client_profile_id));

create policy client_enrollments_update_staff on public.client_enrollments for update to authenticated
  using (app_private.can_manage_client(client_profile_id))
  with check (app_private.can_manage_client(client_profile_id));

-- ---------------------------------------------------------------------------
-- training_programs / training_program_versions / program_assignments
-- ---------------------------------------------------------------------------
create policy training_programs_select_staff on public.training_programs for select to authenticated
  using (app_private.is_workspace_staff(workspace_id));

create policy training_programs_insert_staff on public.training_programs for insert to authenticated
  with check (app_private.is_workspace_staff(workspace_id) and created_by = auth.uid());

create policy training_programs_update_staff on public.training_programs for update to authenticated
  using (app_private.is_workspace_staff(workspace_id))
  with check (app_private.is_workspace_staff(workspace_id));

create policy training_program_versions_select on public.training_program_versions for select to authenticated
  using (
    app_private.is_workspace_staff(workspace_id)
    or exists (
      select 1 from public.program_assignments pa
      where pa.program_version_id = training_program_versions.id
        and app_private.is_client_self(pa.client_profile_id)
    )
  );

create policy training_program_versions_insert_staff on public.training_program_versions for insert to authenticated
  with check (app_private.is_workspace_staff(workspace_id) and created_by = auth.uid() and status = 'draft');

create policy training_program_versions_update_staff on public.training_program_versions for update to authenticated
  using (app_private.is_workspace_staff(workspace_id))
  with check (app_private.is_workspace_staff(workspace_id));

create policy program_assignments_select on public.program_assignments for select to authenticated
  using (app_private.can_access_client(client_profile_id));

create policy program_assignments_insert_staff on public.program_assignments for insert to authenticated
  with check (app_private.can_manage_client(client_profile_id) and assigned_by = auth.uid());

create policy program_assignments_update_staff on public.program_assignments for update to authenticated
  using (app_private.can_manage_client(client_profile_id))
  with check (app_private.can_manage_client(client_profile_id));

-- ---------------------------------------------------------------------------
-- nutrition_plans / nutrition_plan_versions / nutrition_plan_assignments —
-- identical policy shape to the training trio above.
-- ---------------------------------------------------------------------------
create policy nutrition_plans_select_staff on public.nutrition_plans for select to authenticated
  using (app_private.is_workspace_staff(workspace_id));

create policy nutrition_plans_insert_staff on public.nutrition_plans for insert to authenticated
  with check (app_private.is_workspace_staff(workspace_id) and created_by = auth.uid());

create policy nutrition_plans_update_staff on public.nutrition_plans for update to authenticated
  using (app_private.is_workspace_staff(workspace_id))
  with check (app_private.is_workspace_staff(workspace_id));

create policy nutrition_plan_versions_select on public.nutrition_plan_versions for select to authenticated
  using (
    app_private.is_workspace_staff(workspace_id)
    or exists (
      select 1 from public.nutrition_plan_assignments na
      where na.plan_version_id = nutrition_plan_versions.id
        and app_private.is_client_self(na.client_profile_id)
    )
  );

create policy nutrition_plan_versions_insert_staff on public.nutrition_plan_versions for insert to authenticated
  with check (app_private.is_workspace_staff(workspace_id) and created_by = auth.uid() and status = 'draft');

create policy nutrition_plan_versions_update_staff on public.nutrition_plan_versions for update to authenticated
  using (app_private.is_workspace_staff(workspace_id))
  with check (app_private.is_workspace_staff(workspace_id));

create policy nutrition_plan_assignments_select on public.nutrition_plan_assignments for select to authenticated
  using (app_private.can_access_client(client_profile_id));

create policy nutrition_plan_assignments_insert_staff on public.nutrition_plan_assignments for insert to authenticated
  with check (app_private.can_manage_client(client_profile_id) and assigned_by = auth.uid());

create policy nutrition_plan_assignments_update_staff on public.nutrition_plan_assignments for update to authenticated
  using (app_private.can_manage_client(client_profile_id))
  with check (app_private.can_manage_client(client_profile_id));

-- ---------------------------------------------------------------------------
-- publication_events — select only for staff; insert requires
-- self-attested actor_user_id; no update/delete policy exists (and DELETE
-- is grant-revoked above), so these rows are permanent once written.
-- ---------------------------------------------------------------------------
create policy publication_events_select_staff on public.publication_events for select to authenticated
  using (app_private.is_workspace_staff(workspace_id));

create policy publication_events_insert_staff on public.publication_events for insert to authenticated
  with check (app_private.is_workspace_staff(workspace_id) and actor_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------------
create policy notifications_select_self on public.notifications for select to authenticated
  using (recipient_user_id = auth.uid());

create policy notifications_insert_member on public.notifications for insert to authenticated
  with check (app_private.is_workspace_member(workspace_id));

create policy notifications_update_self on public.notifications for update to authenticated
  using (recipient_user_id = auth.uid())
  with check (recipient_user_id = auth.uid());

create policy notifications_delete_self on public.notifications for delete to authenticated
  using (recipient_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- conversations
-- ---------------------------------------------------------------------------
create policy conversations_select on public.conversations for select to authenticated
  using (app_private.can_access_client(client_profile_id));

create policy conversations_insert_staff on public.conversations for insert to authenticated
  with check (app_private.can_manage_client(client_profile_id));

create policy conversations_update_staff on public.conversations for update to authenticated
  using (app_private.can_manage_client(client_profile_id))
  with check (app_private.can_manage_client(client_profile_id));

-- ---------------------------------------------------------------------------
-- conversation_messages — no update/delete policy anywhere (messages are
-- immutable) and DELETE is grant-revoked above. Insert is split by actor:
-- a client may only insert their own client-authored message; staff may
-- only insert their own coach-authored message. assistant/system messages
-- have no authenticated-role insert path at all in this phase — they are
-- written exclusively by server-only privileged code using the
-- service-role key (see lib/production/env.ts's admin client), which
-- bypasses RLS by design and is never reachable from the browser.
-- ---------------------------------------------------------------------------
create policy conversation_messages_select on public.conversation_messages for select to authenticated
  using (app_private.can_access_client_via_conversation(conversation_id));

create policy conversation_messages_insert_client on public.conversation_messages for insert to authenticated
  with check (
    actor_type = 'client'
    and actor_user_id = auth.uid()
    and app_private.is_client_self(app_private.conversation_client_id(conversation_id))
  );

create policy conversation_messages_insert_coach on public.conversation_messages for insert to authenticated
  with check (
    actor_type = 'coach'
    and actor_user_id = auth.uid()
    and app_private.can_manage_client_via_conversation(conversation_id)
  );

-- ---------------------------------------------------------------------------
-- escalations — no authenticated-role insert policy in this phase (see
-- this table's own comment in 20260909000005): only server-only privileged
-- code inserts a real escalation. Coaches/admins may read and update
-- (approve/edit/resolve) escalations for clients they manage; a client can
-- read their own escalation's status but can never write to it, matching
-- "clients ... cannot ... resolve escalations."
-- ---------------------------------------------------------------------------
create policy escalations_select on public.escalations for select to authenticated
  using (app_private.can_access_client(client_profile_id));

create policy escalations_update_staff on public.escalations for update to authenticated
  using (app_private.can_manage_client(client_profile_id))
  with check (app_private.can_manage_client(client_profile_id));

-- ---------------------------------------------------------------------------
-- coach_notes — one-way, immutable (no update/delete policy; DELETE
-- grant-revoked above). Visible to the client it's about, same as any other
-- client-owned record.
-- ---------------------------------------------------------------------------
create policy coach_notes_select on public.coach_notes for select to authenticated
  using (app_private.can_access_client(client_profile_id));

create policy coach_notes_insert_staff on public.coach_notes for insert to authenticated
  with check (app_private.can_manage_client(client_profile_id) and author_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- campaigns / campaign_recipients — internal to staff until published; a
-- client only ever sees their own campaign_recipients row (their
-- personalized copy), never the campaigns table itself.
-- ---------------------------------------------------------------------------
create policy campaigns_select_staff on public.campaigns for select to authenticated
  using (app_private.is_workspace_staff(workspace_id));

create policy campaigns_insert_staff on public.campaigns for insert to authenticated
  with check (app_private.is_workspace_staff(workspace_id) and author_user_id = auth.uid());

create policy campaigns_update_staff on public.campaigns for update to authenticated
  using (app_private.is_workspace_staff(workspace_id))
  with check (app_private.is_workspace_staff(workspace_id));

create policy campaign_recipients_select on public.campaign_recipients for select to authenticated
  using (app_private.can_access_client(client_profile_id) or app_private.is_workspace_staff(workspace_id));

create policy campaign_recipients_insert_staff on public.campaign_recipients for insert to authenticated
  with check (app_private.is_workspace_staff(workspace_id));

create policy campaign_recipients_update_staff on public.campaign_recipients for update to authenticated
  using (app_private.is_workspace_staff(workspace_id))
  with check (app_private.is_workspace_staff(workspace_id));

-- ---------------------------------------------------------------------------
-- import_batches / import_sources / staged_clients / staged_client_fields /
-- import_review_events — staff-only across the board. Never visible to any
-- client, including one a staged row matches, until the coach explicitly
-- activates it (which happens through a server-only transaction — see
-- lib/production/repository.ts — not through any RLS policy granting a
-- client access to import_* tables, because none exists).
-- ---------------------------------------------------------------------------
create policy import_batches_select_staff on public.import_batches for select to authenticated
  using (app_private.is_workspace_staff(workspace_id));

create policy import_batches_insert_staff on public.import_batches for insert to authenticated
  with check (app_private.is_workspace_staff(workspace_id) and created_by = auth.uid());

create policy import_batches_update_staff on public.import_batches for update to authenticated
  using (app_private.is_workspace_staff(workspace_id))
  with check (app_private.is_workspace_staff(workspace_id));

create policy import_sources_select_staff on public.import_sources for select to authenticated
  using (app_private.is_workspace_staff(workspace_id));

create policy import_sources_insert_staff on public.import_sources for insert to authenticated
  with check (app_private.is_workspace_staff(workspace_id) and uploaded_by = auth.uid());

create policy staged_clients_select_staff on public.staged_clients for select to authenticated
  using (app_private.is_workspace_staff(workspace_id));

create policy staged_clients_insert_staff on public.staged_clients for insert to authenticated
  with check (app_private.is_workspace_staff(workspace_id));

create policy staged_clients_update_staff on public.staged_clients for update to authenticated
  using (app_private.is_workspace_staff(workspace_id))
  with check (app_private.is_workspace_staff(workspace_id));

create policy staged_client_fields_select_staff on public.staged_client_fields for select to authenticated
  using (app_private.is_workspace_staff(workspace_id));

create policy staged_client_fields_insert_staff on public.staged_client_fields for insert to authenticated
  with check (app_private.is_workspace_staff(workspace_id));

create policy staged_client_fields_update_staff on public.staged_client_fields for update to authenticated
  using (app_private.is_workspace_staff(workspace_id))
  with check (app_private.is_workspace_staff(workspace_id));

create policy import_review_events_select_staff on public.import_review_events for select to authenticated
  using (app_private.is_workspace_staff(workspace_id));

create policy import_review_events_insert_staff on public.import_review_events for insert to authenticated
  with check (app_private.is_workspace_staff(workspace_id) and actor_user_id = auth.uid());
