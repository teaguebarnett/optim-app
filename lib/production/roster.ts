// Phase 6.0D-B — Controlled Live-Client Pilot and Production Client Lifecycle.
//
// The Supabase-mode client roster/lifecycle service. Supabase-only by
// construction, matching lib/production/programs.ts's own established
// precedent ("demo mode never imports this module at all... this is what
// keeps demo mode byte-for-byte unaffected") — app/coach/clients/page.tsx's
// demo branch keeps reading hooks/use-coach-data.ts exactly as before this
// phase; only the new Supabase branch calls anything here. Produces the
// exact same RosterRow shape lib/coach/roster.ts's buildRosterRows already
// produces for demo mode, so components/coach/client-roster-table.tsx and
// client-roster-mobile-list.tsx render either mode's data identically —
// one presentation, two real data sources, never a redesigned table.
//
// Lifecycle is DERIVED, not stored as its own column: a client's
// invited/onboarding/coach_setup/active/paused/completed status comes from
// composing (a) client_enrollments.status — staff-controlled, RLS-gated to
// admin/assigned-coach writes only (20260909000008) — with (b) whether/when
// this client's own client_onboarding_progress row exists and is complete
// (client-controlled — see that table's own migration header). This keeps
// "what the client has declared about their own progress" and "what the
// coach has decided about this client's program position" as two genuinely
// separate authorities that can never silently overwrite each other,
// exactly like daily_records vs. program_assignments already are.

import "server-only";
import { randomUUID } from "node:crypto";
import { getSupabaseServerClient } from "../supabase/server";
import { getSupabaseAdminClient } from "../supabase/admin";
import { getAuthenticatedContext, requireWorkspaceRole, resolveOwnStaffWorkspace } from "./auth";
import { ActivationNotReadyError } from "./errors";
import { inviteToWorkspace } from "./invite";
import { resolveOwnClientIdentity } from "./identity";
import { getActiveProgramAssignment, getActiveNutritionAssignment } from "./programs";
import { resolveProgramTiming, describeProgramTimingForCoach } from "../scheduling/program-timing";
import { resolveNextCoachAction } from "../coach/next-action";
import { DEFAULT_WEEK_STARTS_ON } from "../shared/local-date";
import { deriveLifecycle } from "../coach/roster";
import type { RosterRow } from "../coach/roster";
import type { ClientLifecycleStatus } from "../coach/types";
import type { ProgramEnrollment } from "../scheduling/types";
import type { NutritionTargets } from "../types";

export { deriveLifecycle };

// ---------------------------------------------------------------------------
// Roster read
// ---------------------------------------------------------------------------

interface RawClientRow {
  id: string;
  display_name: string;
  goal: string | null;
  created_at: string;
  coach_client_assignments: { coach_user_id: string; is_primary: boolean; profiles: { display_name: string } | null }[] | null;
  // client_profile_id carries a UNIQUE constraint on both these tables
  // (20260909000003_coaching_relationships.sql, 20260911000013_client_
  // onboarding_progress.sql), so PostgREST embeds them as a single object,
  // not an array — confirmed live against the real Supabase instance. A
  // prior `?.[0]` here silently evaluated to undefined for every row,
  // making every real client show as "Invited" regardless of actual status.
  client_enrollments: { status: string; original_program_start_date: string | null; timezone: string; archived_at: string | null } | null;
  client_onboarding_progress: { completed_at: string | null; updated_at: string } | null;
}

async function buildRosterRow(raw: RawClientRow, workspaceId: string, nowIso: string): Promise<RosterRow & { archived: boolean }> {
  const enrollment = raw.client_enrollments ?? null;
  const onboarding = raw.client_onboarding_progress ?? null;
  const primaryAssignment = raw.coach_client_assignments?.find((a) => a.is_primary) ?? raw.coach_client_assignments?.[0] ?? null;
  const coachName = primaryAssignment?.profiles?.display_name ?? "Unassigned";

  const lifecycle = deriveLifecycle({
    enrollmentStatus: enrollment?.status ?? null,
    onboardingExists: onboarding !== null,
    onboardingCompletedAtIso: onboarding?.completed_at ?? null,
  });

  const [program, nutrition] = await Promise.all([getActiveProgramAssignment(raw.id), getActiveNutritionAssignment(raw.id)]);

  let programWeekLabel: string | null = null;
  let programPhase: RosterRow["programPhase"] = null;
  if (enrollment?.original_program_start_date && program) {
    const fakeEnrollment: ProgramEnrollment = {
      id: `enrollment-${workspaceId}-${raw.id}`,
      schemaVersion: 1,
      workspaceId,
      clientId: raw.id,
      programId: program.content.id,
      startDateIso: enrollment.original_program_start_date,
      durationWeeks: program.content.durationWeeks,
      timeZone: enrollment.timezone || "UTC",
      weekStartsOn: DEFAULT_WEEK_STARTS_ON,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };
    const localDateIso = nowIso.slice(0, 10);
    const timing = resolveProgramTiming(fakeEnrollment, localDateIso);
    programPhase = timing.phase;
    programWeekLabel = describeProgramTimingForCoach(
      timing,
      program.content.durationWeeks,
      new Date(`${enrollment.original_program_start_date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    );
  }

  const lastActivityIso = onboarding?.updated_at ?? raw.created_at;
  const lastActivityLabel = new Date(lastActivityIso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  const readinessReady = !!enrollment?.original_program_start_date && !!program && !!nutrition;

  return {
    clientId: raw.id,
    name: raw.display_name,
    lifecycle,
    coachName,
    programWeekLabel,
    programPhase,
    attentionCount: 0, // filled in by the caller, which has the workspace's escalations in one query
    lastActivityLabel,
    nextAction: resolveNextCoachAction(lifecycle, false, readinessReady),
    archived: !!enrollment?.archived_at,
  };
}

export interface LiveRoster {
  workspaceId: string;
  coachDisplayName: string;
  rows: (RosterRow & { archived: boolean })[];
}

export async function listRosterForOwnWorkspace(): Promise<LiveRoster> {
  const { workspaceId, coachDisplayName } = await resolveOwnStaffWorkspace();
  const supabase = await getSupabaseServerClient();

  // RLS (client_profiles_select -> can_access_client) already scopes this
  // to exactly the rows the CALLER is allowed to see — a plain coach gets
  // only their own assigned clients even though the query itself asks for
  // "every client in the workspace," matching the same discipline
  // lib/production/repository.ts's listClientsForWorkspace already
  // documents (RLS is the backstop; requireWorkspaceRole inside
  // resolveOwnStaffWorkspace is the primary gate for even reaching here).
  const { data, error } = await supabase
    .from("client_profiles")
    .select(
      `id, display_name, goal, created_at,
       coach_client_assignments(coach_user_id, is_primary, profiles:coach_user_id(display_name)),
       client_enrollments(status, original_program_start_date, timezone, archived_at),
       client_onboarding_progress(completed_at, updated_at)`
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listRosterForOwnWorkspace failed: ${error.message}`);

  const { data: openEscalations, error: escError } = await supabase
    .from("escalations")
    .select("client_profile_id")
    .eq("workspace_id", workspaceId)
    .in("status", ["pending", "proposed", "approved", "coach_responded"]);
  if (escError) throw new Error(`listRosterForOwnWorkspace (escalations) failed: ${escError.message}`);
  const attentionCountByClient = new Map<string, number>();
  for (const row of openEscalations ?? []) {
    const id = row.client_profile_id as string;
    attentionCountByClient.set(id, (attentionCountByClient.get(id) ?? 0) + 1);
  }

  const nowIso = new Date().toISOString();
  const rows = await Promise.all(
    (data as unknown as RawClientRow[] | null ?? []).map(async (raw) => {
      const row = await buildRosterRow(raw, workspaceId, nowIso);
      const attentionCount = attentionCountByClient.get(raw.id) ?? 0;
      return {
        ...row,
        attentionCount,
        nextAction: attentionCount > 0 ? "Review flagged item" : row.nextAction,
      };
    })
  );

  return { workspaceId, coachDisplayName, rows };
}

// ---------------------------------------------------------------------------
// Client detail
// ---------------------------------------------------------------------------

export interface LiveClientDetail {
  clientId: string;
  workspaceId: string;
  displayName: string;
  goal: string | null;
  invitedEmail: string | null;
  hasSignedIn: boolean;
  lifecycle: ClientLifecycleStatus;
  archived: boolean;
  startDateIso: string | null;
  timezone: string;
  hasConfirmedTimezone: boolean;
  onboarding: { currentStepIndex: number; answers: unknown; completedAtIso: string | null } | null;
  activeProgram: { versionId: string; versionNumber: number; name: string; durationWeeks: number } | null;
  /** targets are the assigned published version's own saved values —
   * never a form default. Null means nutrition is genuinely not assigned. */
  activeNutrition: { versionId: string; versionNumber: number; targets: NutritionTargets } | null;
}

async function requireCoachAuthority(workspaceId: string) {
  const ctx = await getAuthenticatedContext();
  requireWorkspaceRole(ctx, workspaceId, ["workspace_owner", "platform_admin", "coach"]);
  return ctx;
}

export async function getClientDetail(clientProfileId: string): Promise<LiveClientDetail> {
  const ctx = await getAuthenticatedContext();
  const supabase = await getSupabaseServerClient();

  const { data: client, error } = await supabase
    .from("client_profiles")
    .select("id, workspace_id, display_name, goal, invited_email, user_id")
    .eq("id", clientProfileId)
    .single();
  if (error) throw new Error(`getClientDetail failed: ${error.message}`);

  requireWorkspaceRole(ctx, client.workspace_id as string, ["workspace_owner", "platform_admin", "coach"]);

  const [{ data: enrollment }, { data: onboarding }, program, nutrition] = await Promise.all([
    supabase
      .from("client_enrollments")
      .select("status, original_program_start_date, timezone, timezone_source, archived_at")
      .eq("client_profile_id", clientProfileId)
      .maybeSingle(),
    supabase
      .from("client_onboarding_progress")
      .select("current_step_index, answers, completed_at")
      .eq("client_profile_id", clientProfileId)
      .maybeSingle(),
    getActiveProgramAssignment(clientProfileId),
    getActiveNutritionAssignment(clientProfileId),
  ]);

  const lifecycle = deriveLifecycle({
    enrollmentStatus: enrollment?.status ?? null,
    onboardingExists: onboarding !== null,
    onboardingCompletedAtIso: onboarding?.completed_at ?? null,
  });

  return {
    clientId: client.id as string,
    workspaceId: client.workspace_id as string,
    displayName: client.display_name as string,
    goal: client.goal as string | null,
    invitedEmail: client.invited_email as string | null,
    hasSignedIn: client.user_id !== null,
    lifecycle,
    archived: !!enrollment?.archived_at,
    startDateIso: (enrollment?.original_program_start_date as string | null) ?? null,
    timezone: (enrollment?.timezone as string) || "UTC",
    hasConfirmedTimezone: !!enrollment?.timezone_source,
    onboarding: onboarding ? { currentStepIndex: onboarding.current_step_index as number, answers: onboarding.answers, completedAtIso: onboarding.completed_at as string | null } : null,
    activeProgram: program ? { versionId: program.versionId, versionNumber: program.versionNumber, name: program.content.name, durationWeeks: program.content.durationWeeks } : null,
    activeNutrition: nutrition ? { versionId: nutrition.versionId, versionNumber: nutrition.versionNumber, targets: nutrition.content.targets } : null,
  };
}

// ---------------------------------------------------------------------------
// The client's own view of their lifecycle — powers
// app/setup-status/[clientId]/page.tsx's Supabase-mode branch (the "you're
// not in the daily app yet" screen for every state short of active).
// ---------------------------------------------------------------------------

export interface OwnLifecycleStatus {
  clientId: string;
  lifecycle: ClientLifecycleStatus;
  coachDisplayName: string;
  startDateIso: string | null;
  hasActiveProgram: boolean;
}

export async function getOwnLifecycleStatus(): Promise<OwnLifecycleStatus> {
  const identity = await resolveOwnClientIdentity();
  const supabase = await getSupabaseServerClient();

  const [{ data: enrollment }, { data: onboarding }, program] = await Promise.all([
    supabase.from("client_enrollments").select("status, original_program_start_date").eq("client_profile_id", identity.clientProfileId).maybeSingle(),
    supabase.from("client_onboarding_progress").select("completed_at").eq("client_profile_id", identity.clientProfileId).maybeSingle(),
    getActiveProgramAssignment(identity.clientProfileId),
  ]);

  const lifecycle = deriveLifecycle({
    enrollmentStatus: enrollment?.status ?? null,
    onboardingExists: onboarding !== null,
    onboardingCompletedAtIso: onboarding?.completed_at ?? null,
  });

  return {
    clientId: identity.clientProfileId,
    lifecycle,
    coachDisplayName: identity.coachDisplayName,
    startDateIso: (enrollment?.original_program_start_date as string | null) ?? null,
    hasActiveProgram: !!program,
  };
}

// ---------------------------------------------------------------------------
// Invite one client — the smallest secure single-client workflow: creates
// the client_profiles/coach_client_assignments/client_enrollments rows this
// pilot needs, then reuses lib/production/invite.ts's existing
// inviteToWorkspace (role: "client") for the actual auth-user-creation +
// email send, which is deliberately the ONLY code path (besides the manual
// bootstrap script) ever allowed to create a new Supabase Auth user.
// Sequential, not one atomic RPC: this is a low-frequency, coach-initiated,
// non-concurrent action (one coach adding one client at a time), so the
// existing per-table RLS policies (already sufficient authorization on
// their own) are used directly rather than introducing a new SECURITY
// DEFINER function purely for atomicity this action doesn't actually need.
//
// Real bug fix (found live, Gate 6B testing): re-inviting an email that
// already has a client_profiles row in this workspace used to reach
// inviteToWorkspace, which throws on workspace_invitations'
// pending_email_idx unique constraint — but by then client_profiles,
// coach_client_assignments, and client_enrollments had ALL already been
// created, and the catch block's compensating delete used the caller's own
// RLS-bound client. client_profiles has no DELETE policy at all (grep-
// confirmed against supabase/migrations/20260909000008_rls_policies.sql),
// so that delete silently affected zero rows — `error` was null, so nothing
// alerted the code that cleanup never happened. Two independent fixes:
//
// 1. Fail BEFORE creating anything if a client_profiles row for this email
//    already exists in this workspace — the actual, meaningful duplicate
//    signal (a real client record already exists), checked directly rather
//    than waiting to hit workspace_invitations' constraint indirectly. This
//    also covers an already-ACCEPTED invitation for the same email
//    (workspace_invitations.status = 'accepted' would never trip the old
//    'pending'-only constraint at all) — a case this fix incidentally
//    closes but was never separately reported/reproduced, so it isn't
//    separately tested here.
// 2. If something fails AFTER client_profiles is created for any OTHER
//    reason, the compensating delete now uses the admin (service-role)
//    client, which bypasses RLS — restoring the cleanup this code already
//    intended (see its own prior comment) but which never actually worked.
// ---------------------------------------------------------------------------

export async function inviteClient(params: { workspaceId: string; email: string; displayName: string; goal: string }): Promise<{ clientProfileId: string }> {
  const ctx = await requireCoachAuthority(params.workspaceId);
  const supabase = await getSupabaseServerClient();
  const email = params.email.trim().toLowerCase();

  const { data: existingClient, error: existingClientError } = await supabase
    .from("client_profiles")
    .select("id, display_name")
    .eq("workspace_id", params.workspaceId)
    .eq("invited_email", email)
    .maybeSingle();
  if (existingClientError) throw new Error(`inviteClient (duplicate check) failed: ${existingClientError.message}`);
  if (existingClient) {
    throw new Error(`${(existingClient.display_name as string | null) || email} has already been invited to this workspace.`);
  }

  // The check above is a SELECT-then-INSERT — real, but not by itself
  // race-proof: two concurrent invite requests for the same brand-new email
  // can both pass it before either commits. client_profiles_workspace_
  // invited_email_idx (20260921000024) is the actual atomicity guarantee —
  // a partial unique index on (workspace_id, invited_email), so Postgres
  // itself makes it impossible for both concurrent inserts below to
  // succeed. The losing request's insert fails with 23505 (unique_
  // violation), caught just below and turned into the identical friendly
  // message the pre-check above already gives the common (non-racing)
  // case — never a raw constraint-violation string, and never a duplicate
  // row silently created only to be rolled back afterward.
  //
  // Live-verification finding: chaining .select().single() onto this
  // INSERT (forcing a RETURNING clause) triggers a real, reproducible
  // PostgreSQL RLS defect — confirmed against a local Postgres 17.6 stack
  // and matching the class of bug tracked upstream as postgresql.org bug
  // #19015 ("STABLE function in SELECT policy doesn't see... with
  // RETURNING"). client_profiles is the one table in this schema whose own
  // SELECT policy (client_profiles_select -> can_access_client(id) ->
  // client_workspace_id(id)) self-queries client_profiles itself for the
  // row a RETURNING clause would expose — every other client-owned table's
  // SELECT policy resolves through a FOREIGN KEY into an already-existing
  // client_profiles row, never self-referentially into the table being
  // inserted into, which is why this is the only insert path affected.
  // Fixed by generating the id client-side and never asking Postgres to
  // RETURNING it — a plain INSERT (no implicit SELECT-policy check at all)
  // is all this needs, and the caller already knows the id it chose.
  const clientProfileId = randomUUID();
  const { error: clientError } = await supabase
    .from("client_profiles")
    .insert({ id: clientProfileId, workspace_id: params.workspaceId, invited_email: email, display_name: params.displayName.trim() || email, goal: params.goal.trim() || null });
  if (clientError) {
    if ((clientError as { code?: string }).code === "23505") {
      // Lost the race against a concurrent invite for this exact email in
      // this exact workspace — client_profiles_workspace_invited_email_idx
      // is what actually caught it. No row exists from THIS request; no
      // cleanup is needed.
      throw new Error(`${params.displayName.trim() || email} has already been invited to this workspace.`);
    }
    throw new Error(`inviteClient (client_profiles) failed: ${clientError.message}`);
  }

  try {
    const { error: assignmentError } = await supabase
      .from("coach_client_assignments")
      .insert({ workspace_id: params.workspaceId, coach_user_id: ctx.userId, client_profile_id: clientProfileId, is_primary: true });
    if (assignmentError) throw new Error(`inviteClient (coach_client_assignments) failed: ${assignmentError.message}`);

    const { error: enrollmentError } = await supabase
      .from("client_enrollments")
      .insert({ workspace_id: params.workspaceId, client_profile_id: clientProfileId, status: "invited" });
    if (enrollmentError) throw new Error(`inviteClient (client_enrollments) failed: ${enrollmentError.message}`);

    await inviteToWorkspace({ workspaceId: params.workspaceId, email, role: "client" });
  } catch (err) {
    // Best-effort rollback — never leaves an orphaned client_profiles row
    // silently on a failed invite. Uses the ADMIN (service-role) client
    // deliberately: client_profiles has no DELETE policy at all (by design
    // — no client-facing code should ever delete a client record), so the
    // caller's own RLS-bound client silently deletes zero rows here, which
    // is the exact defect this fix addresses (see this function's own
    // module doc). coach_client_assignments/client_enrollments both
    // reference client_profiles with ON DELETE CASCADE, so deleting the one
    // row here correctly removes all three.
    const admin = getSupabaseAdminClient();
    const { error: cleanupError, count } = await admin.from("client_profiles").delete({ count: "exact" }).eq("id", clientProfileId);
    if (cleanupError || count !== 1) {
      // The ORIGINAL error is still what the caller needs to see — a failed
      // cleanup must never mask it, only be visible in server logs for
      // whoever investigates an orphaned row.
      console.error(`inviteClient rollback failed for client_profiles id=${clientProfileId}: ${cleanupError?.message ?? `expected to delete 1 row, deleted ${count}`}`);
    }
    throw err;
  }

  return { clientProfileId };
}

// ---------------------------------------------------------------------------
// Lifecycle transitions — pause / resume / complete / archive. Never
// deletes anything; every one of these is a plain client_enrollments.status
// (or archived_at) update, RLS-gated to admin/assigned-coach
// (can_manage_client) exactly like setClientProgramStartDate already is.
// ---------------------------------------------------------------------------

export type LifecycleAction = "pause" | "resume" | "complete" | "archive" | "unarchive";

export async function setClientLifecycleAction(params: { workspaceId: string; clientProfileId: string; action: LifecycleAction }): Promise<void> {
  await requireCoachAuthority(params.workspaceId);
  const supabase = await getSupabaseServerClient();

  if (params.action === "archive" || params.action === "unarchive") {
    const { error } = await supabase
      .from("client_enrollments")
      .update({ archived_at: params.action === "archive" ? new Date().toISOString() : null })
      .eq("client_profile_id", params.clientProfileId);
    if (error) throw new Error(`setClientLifecycleAction (archive) failed: ${error.message}`);
    return;
  }

  const nextStatus = params.action === "pause" ? "paused" : params.action === "resume" ? "active" : "offboarded";
  const { error } = await supabase.from("client_enrollments").update({ status: nextStatus }).eq("client_profile_id", params.clientProfileId);
  if (error) throw new Error(`setClientLifecycleAction failed: ${error.message}`);
}

/** The explicit "make this client active" transition — deliberately
 * separate from setClientProgramStartDate (see that function's own updated
 * doc in lib/production/programs.ts): setting a start date must never, by
 * itself, silently activate a client who hasn't finished onboarding or
 * whose coach hasn't finished reviewing them yet. Requires a real program
 * AND nutrition assignment AND a start date to already exist — mirrors the
 * demo prototype's own checkActivationReadiness gate in spirit (never lets
 * a coach "activate" a client with nothing actually configured), without
 * porting that full readiness-requirement UI into this vertical slice. */
export async function activateClientEnrollment(params: { workspaceId: string; clientProfileId: string }): Promise<void> {
  await requireCoachAuthority(params.workspaceId);
  const [program, nutrition] = await Promise.all([getActiveProgramAssignment(params.clientProfileId), getActiveNutritionAssignment(params.clientProfileId)]);
  const supabase = await getSupabaseServerClient();
  const { data: enrollment, error: enrollmentReadError } = await supabase
    .from("client_enrollments")
    .select("original_program_start_date, timezone_source")
    .eq("client_profile_id", params.clientProfileId)
    .maybeSingle();
  if (enrollmentReadError) throw new Error(`activateClientEnrollment (read) failed: ${enrollmentReadError.message}`);
  if (!program || !nutrition || !enrollment?.original_program_start_date) {
    throw new ActivationNotReadyError("Cannot activate: this client needs a start date, an assigned program, and an assigned nutrition plan first.");
  }
  // Gate 6F — timezone_source is null only when NEITHER the client's own
  // browser-detected timezone (set_client_detected_timezone, fired from
  // their "about you" onboarding chapter) NOR an explicit coach override
  // (setClientProgramStartDate) has ever been recorded — e.g. the client's
  // browser detection genuinely failed. Every one of this client's
  // date-derived activity (daily_records, "today") would silently compute
  // against the raw 'UTC' schema default otherwise, exactly the bug this
  // gate closes. Refuses activation rather than guessing.
  if (!enrollment.timezone_source) {
    throw new ActivationNotReadyError(
      "Cannot activate: no confirmed timezone for this client yet (their browser detection may have failed) — set one from their start date above first."
    );
  }
  const { error } = await supabase.from("client_enrollments").update({ status: "active" }).eq("client_profile_id", params.clientProfileId);
  if (error) throw new Error(`activateClientEnrollment failed: ${error.message}`);
}
