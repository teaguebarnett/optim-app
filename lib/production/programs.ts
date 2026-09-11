// Phase 6.0B — Persist the Complete Revenue Loop.
//
// The Supabase-mode program/nutrition/daily-activity service — the actual
// "replace PUSH_WORKOUT" seam Phase 6.0A's FOUNDATION.md §10 described.
// Supabase-only by construction (every function here assumes an
// authenticated Supabase session and queries real tables) — demo mode never
// imports this module at all, so there's no "DemoProgramRepository" stub to
// maintain: the existing client-side reducer/localStorage path in
// hooks/use-prototype-state.tsx keeps working completely unchanged and
// never calls anything here. This is what keeps demo mode byte-for-byte
// unaffected by this phase.
//
// Every write here either (a) is an ordinary RLS-governed insert/update the
// existing 20260909000008 policies already gate (draft creation, publish),
// or (b) goes through one of the two SECURITY DEFINER "make this the active
// assignment" functions added in 20260909000011 — see that migration's own
// header for why the active-assignment transition specifically needs to be
// atomic rather than a plain two-step client update. Authorization is
// checked at TWO layers, deliberately redundant: this module calls
// getAuthenticatedContext()/requireWorkspaceRole itself before attempting a
// privileged write (never relies on RLS alone to be the only backstop for a
// server-side decision — Part 2's own requirement), and RLS/the SECURITY
// DEFINER functions' own internal checks are the backstop if that's ever
// skipped.

import "server-only";
import { randomUUID } from "node:crypto";
import { getSupabaseServerClient } from "../supabase/server";
import { getAuthenticatedContext, requireWorkspaceRole, isWorkspaceStaffRole } from "./auth";
import { UnauthorizedError } from "./errors";
import {
  validateClientAssignedProgramContent,
  validateAssignedNutritionPlanContent,
  validateDailyActivityContent,
  type DailyActivityContent,
} from "./validation";
import { PUSH_WORKOUT } from "../mock-data";
import { DEFAULT_WEEK_STARTS_ON } from "../shared/local-date";
import type { ClientAssignedProgram, AssignedNutritionPlan, Workout, ProgramWeek, ProgramDay } from "../types";
import type { ProgramEnrollment } from "../scheduling/types";

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export interface ActiveProgramAssignment {
  assignmentId: string;
  versionId: string;
  versionNumber: number;
  content: ClientAssignedProgram;
}

export interface ActiveNutritionAssignment {
  assignmentId: string;
  versionId: string;
  versionNumber: number;
  content: AssignedNutritionPlan;
}

/** The two real inputs lib/workout/resolve-scheduled-workout.ts's
 * resolveScheduledWorkoutForStart (and every other pure scheduling
 * function it composes with) needs — enrollment is null whenever this
 * client has no real start date configured yet (client_enrollments row
 * missing, or original_program_start_date not yet set), which callers
 * must treat as "program not configured," never as license to fall back to
 * PUSH_WORKOUT or any other fixture. durationWeeks is deliberately sourced
 * from the active assigned program's own content, not a separate
 * client_enrollments column — the program version a client is actually
 * assigned to is the one true source of how many weeks it covers; a
 * second, independently-set duration column could silently disagree with
 * it. */
export interface ClientProgramContext {
  enrollment: ProgramEnrollment | null;
  assignedProgram: ClientAssignedProgram | null;
  nutritionPlan: AssignedNutritionPlan | null;
}

export async function getActiveProgramAssignment(clientProfileId: string): Promise<ActiveProgramAssignment | null> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("program_assignments")
    .select("id, program_version_id, training_program_versions!inner(id, version_number, status, content)")
    .eq("client_profile_id", clientProfileId)
    .eq("status", "active")
    .maybeSingle();

  if (error) throw new Error(`getActiveProgramAssignment failed: ${error.message}`);
  if (!data) return null;

  const version = data.training_program_versions as unknown as { id: string; version_number: number; status: string; content: unknown };
  // Defensive re-check even though 20260909000011's WITH CHECK already
  // guarantees this at insert time — an assignment row is only ever
  // trustworthy as "active" for this loop if it still genuinely points at
  // published content.
  if (version.status !== "published") return null;

  const content = validateClientAssignedProgramContent(version.content);
  return {
    assignmentId: data.id as string,
    versionId: version.id,
    versionNumber: version.version_number,
    content: { ...content, status: "assigned" },
  };
}

export async function getActiveNutritionAssignment(clientProfileId: string): Promise<ActiveNutritionAssignment | null> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("nutrition_plan_assignments")
    .select("id, plan_version_id, nutrition_plan_versions!inner(id, version_number, status, content)")
    .eq("client_profile_id", clientProfileId)
    .eq("status", "active")
    .maybeSingle();

  if (error) throw new Error(`getActiveNutritionAssignment failed: ${error.message}`);
  if (!data) return null;

  const version = data.nutrition_plan_versions as unknown as { id: string; version_number: number; status: string; content: unknown };
  if (version.status !== "published") return null;

  const content = validateAssignedNutritionPlanContent(version.content);
  return { assignmentId: data.id as string, versionId: version.id, versionNumber: version.version_number, content };
}

export async function getClientProgramContext(params: {
  workspaceId: string;
  clientProfileId: string;
}): Promise<ClientProgramContext> {
  const supabase = await getSupabaseServerClient();
  const [{ data: enrollmentRow, error: enrollmentError }, assignedProgram, nutritionPlan] = await Promise.all([
    supabase
      .from("client_enrollments")
      .select("original_program_start_date, timezone")
      .eq("client_profile_id", params.clientProfileId)
      .maybeSingle(),
    getActiveProgramAssignment(params.clientProfileId),
    getActiveNutritionAssignment(params.clientProfileId),
  ]);

  if (enrollmentError) throw new Error(`getClientProgramContext failed: ${enrollmentError.message}`);

  let enrollment: ProgramEnrollment | null = null;
  if (enrollmentRow?.original_program_start_date && assignedProgram) {
    const nowIso = new Date().toISOString();
    enrollment = {
      id: `enrollment-${params.workspaceId}-${params.clientProfileId}`,
      schemaVersion: 1,
      workspaceId: params.workspaceId,
      clientId: params.clientProfileId,
      programId: assignedProgram.content.id,
      startDateIso: enrollmentRow.original_program_start_date as string,
      durationWeeks: assignedProgram.content.durationWeeks,
      timeZone: (enrollmentRow.timezone as string) || "UTC",
      weekStartsOn: DEFAULT_WEEK_STARTS_ON,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };
  }

  return { enrollment, assignedProgram: assignedProgram?.content ?? null, nutritionPlan: nutritionPlan?.content ?? null };
}

export async function getDailyActivity(clientProfileId: string, dateIso: string): Promise<DailyActivityContent | null> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("daily_records")
    .select("content")
    .eq("client_profile_id", clientProfileId)
    .eq("date_iso", dateIso)
    .maybeSingle();

  if (error) throw new Error(`getDailyActivity failed: ${error.message}`);
  if (!data) return null;
  return validateDailyActivityContent(data.content);
}

// ---------------------------------------------------------------------------
// Client-side writes (the client's own logged activity)
// ---------------------------------------------------------------------------

/** Upserts today's { training, nutrition } snapshot — RLS (daily_records_
 * insert_self/update_self) is the actual enforcement that this can only
 * ever write the CALLER's own row; this function additionally confirms a
 * real authenticated session exists before attempting the write at all, so
 * a misconfigured/unauthenticated caller gets a clear UnauthenticatedError
 * instead of an opaque RLS-denied Postgres error. */
export async function saveDailyActivity(params: {
  workspaceId: string;
  clientProfileId: string;
  dateIso: string;
  programAssignmentId: string | null;
  content: DailyActivityContent;
}): Promise<void> {
  await getAuthenticatedContext(); // throws UnauthenticatedError if not signed in
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.from("daily_records").upsert(
    {
      workspace_id: params.workspaceId,
      client_profile_id: params.clientProfileId,
      program_assignment_id: params.programAssignmentId,
      date_iso: params.dateIso,
      content: params.content,
    },
    { onConflict: "client_profile_id,date_iso" }
  );
  if (error) throw new Error(`saveDailyActivity failed: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Coach-side authoring/publish/assign
// ---------------------------------------------------------------------------

/** A real, honest draft built from this prototype's one actually-authored
 * catalog Workout (PUSH_WORKOUT — see lib/mock-data.ts's own doc: no other
 * day in this prototype has ever had real, loggable exercise content behind
 * it, only a display label). Every Monday of the requested duration gets a
 * deep, freshly-id'd clone; every other day is an honest rest day — never a
 * fabricated workout for a day this product has never actually authored
 * content for, matching resolveScheduledWorkoutForStart's own
 * "no_assignment" honesty principle. This is a deliberately minimal
 * content-authoring path (Part 7 forbids a broad new authoring UI in this
 * phase) proving the real persistence/publish/assign loop against real,
 * non-fabricated content — a fuller program composer wired to Supabase is
 * future work, not this vertical slice's job. */
function cloneWorkoutWithFreshIds(workout: Workout): Workout {
  return {
    ...workout,
    id: `workout-${randomUUID()}`,
    exercises: workout.exercises.map((exercise) => ({ ...exercise, id: `exercise-${randomUUID()}` })),
  };
}

export function buildDraftProgramFromCatalog(params: {
  workspaceId: string;
  clientId: string;
  coachId: string;
  name: string;
  durationWeeks: number;
  nowIso: string;
}): ClientAssignedProgram {
  const days: ProgramDay["dayOfWeek"][] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const weeks: ProgramWeek[] = Array.from({ length: params.durationWeeks }, (_, i) => ({
    weekNumber: i + 1,
    days: days.map((dayOfWeek): ProgramDay =>
      dayOfWeek === "Monday"
        ? { dayOfWeek, type: "training", workout: cloneWorkoutWithFreshIds(PUSH_WORKOUT) }
        : { dayOfWeek, type: "rest" }
    ),
  }));
  return {
    id: `program-${randomUUID()}`,
    workspaceId: params.workspaceId,
    clientId: params.clientId,
    coachId: params.coachId,
    name: params.name,
    durationWeeks: params.durationWeeks,
    weeks,
    status: "draft",
    createdAtIso: params.nowIso,
    updatedAtIso: params.nowIso,
  };
}

async function requireCoachAuthority(workspaceId: string) {
  const ctx = await getAuthenticatedContext();
  const membership = requireWorkspaceRole(ctx, workspaceId, ["workspace_owner", "platform_admin", "coach"]);
  if (!isWorkspaceStaffRole(membership.role)) throw new UnauthorizedError();
  return ctx;
}

/** Creates a new training_programs "family" (if programId omitted) plus its
 * version-1 draft, or a new draft version under an existing program family.
 * Draft content is private to the coach: training_program_versions_select's
 * own RLS policy only ever lets a client see a version once it's actually
 * referenced by one of their own assignment rows — never merely by
 * belonging to their workspace's staff-visible program family. */
export async function createDraftProgramVersion(params: {
  workspaceId: string;
  programId?: string;
  title: string;
  content: ClientAssignedProgram;
}): Promise<{ programId: string; versionId: string }> {
  const ctx = await requireCoachAuthority(params.workspaceId);
  const supabase = await getSupabaseServerClient();

  let programId = params.programId;
  if (!programId) {
    const { data, error } = await supabase
      .from("training_programs")
      .insert({ workspace_id: params.workspaceId, created_by: ctx.userId, title: params.title })
      .select("id")
      .single();
    if (error) throw new Error(`createDraftProgramVersion (program) failed: ${error.message}`);
    programId = data.id as string;
  }

  const { data: existingVersions, error: versionsError } = await supabase
    .from("training_program_versions")
    .select("version_number")
    .eq("program_id", programId)
    .order("version_number", { ascending: false })
    .limit(1);
  if (versionsError) throw new Error(`createDraftProgramVersion (version lookup) failed: ${versionsError.message}`);
  const nextVersionNumber = (existingVersions?.[0]?.version_number ?? 0) + 1;

  const { data: versionRow, error: insertError } = await supabase
    .from("training_program_versions")
    .insert({
      program_id: programId,
      workspace_id: params.workspaceId,
      version_number: nextVersionNumber,
      status: "draft",
      content: params.content,
      created_by: ctx.userId,
    })
    .select("id")
    .single();
  if (insertError) throw new Error(`createDraftProgramVersion (version insert) failed: ${insertError.message}`);

  return { programId, versionId: versionRow.id as string };
}

export async function publishProgramVersion(params: { workspaceId: string; versionId: string }): Promise<void> {
  const ctx = await requireCoachAuthority(params.workspaceId);
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase
    .from("training_program_versions")
    .update({ status: "published", published_by: ctx.userId, published_at: new Date().toISOString() })
    .eq("id", params.versionId)
    .eq("status", "draft"); // idempotent no-op if already published — see migration header
  if (error) throw new Error(`publishProgramVersion failed: ${error.message}`);
}

/** The one atomic "make this the client's active program" call — see
 * 20260909000011_program_publication_and_activity.sql's
 * assign_active_program_version for why this is a single SECURITY DEFINER
 * RPC rather than a plain client-side update+insert. */
export async function assignProgramVersionToClient(params: {
  workspaceId: string;
  clientProfileId: string;
  versionId: string;
}): Promise<string> {
  await requireCoachAuthority(params.workspaceId);
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("assign_active_program_version", {
    p_client_profile_id: params.clientProfileId,
    p_program_version_id: params.versionId,
  });
  if (error) throw new Error(`assignProgramVersionToClient failed: ${error.message}`);
  return data as string;
}

export async function createDraftNutritionVersion(params: {
  workspaceId: string;
  planId?: string;
  title: string;
  content: AssignedNutritionPlan;
}): Promise<{ planId: string; versionId: string }> {
  const ctx = await requireCoachAuthority(params.workspaceId);
  const supabase = await getSupabaseServerClient();

  let planId = params.planId;
  if (!planId) {
    const { data, error } = await supabase
      .from("nutrition_plans")
      .insert({ workspace_id: params.workspaceId, created_by: ctx.userId, title: params.title })
      .select("id")
      .single();
    if (error) throw new Error(`createDraftNutritionVersion (plan) failed: ${error.message}`);
    planId = data.id as string;
  }

  const { data: existingVersions, error: versionsError } = await supabase
    .from("nutrition_plan_versions")
    .select("version_number")
    .eq("plan_id", planId)
    .order("version_number", { ascending: false })
    .limit(1);
  if (versionsError) throw new Error(`createDraftNutritionVersion (version lookup) failed: ${versionsError.message}`);
  const nextVersionNumber = (existingVersions?.[0]?.version_number ?? 0) + 1;

  const { data: versionRow, error: insertError } = await supabase
    .from("nutrition_plan_versions")
    .insert({
      plan_id: planId,
      workspace_id: params.workspaceId,
      version_number: nextVersionNumber,
      status: "draft",
      content: params.content,
      created_by: ctx.userId,
    })
    .select("id")
    .single();
  if (insertError) throw new Error(`createDraftNutritionVersion (version insert) failed: ${insertError.message}`);

  return { planId, versionId: versionRow.id as string };
}

export async function publishNutritionVersion(params: { workspaceId: string; versionId: string }): Promise<void> {
  const ctx = await requireCoachAuthority(params.workspaceId);
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase
    .from("nutrition_plan_versions")
    .update({ status: "published", published_by: ctx.userId, published_at: new Date().toISOString() })
    .eq("id", params.versionId)
    .eq("status", "draft");
  if (error) throw new Error(`publishNutritionVersion failed: ${error.message}`);
}

export async function assignNutritionVersionToClient(params: {
  workspaceId: string;
  clientProfileId: string;
  versionId: string;
}): Promise<string> {
  await requireCoachAuthority(params.workspaceId);
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("assign_active_nutrition_plan_version", {
    p_client_profile_id: params.clientProfileId,
    p_plan_version_id: params.versionId,
  });
  if (error) throw new Error(`assignNutritionVersionToClient failed: ${error.message}`);
  return data as string;
}

/** Sets/updates a client's real program start date — required before
 * getClientProgramContext can ever build a real ProgramEnrollment for them
 * (see that function's own doc: no start date means "program not
 * configured," never a fabricated one). A plain RLS-governed upsert (staff
 * can manage any client_enrollments row they can manage the client for —
 * see 20260909000008's client_enrollments_insert_staff/update_staff).
 *
 * Phase 6.0D-B fix — the real "calendar/start-date inconsistency in the
 * production path" this phase's own brief called out: this used to force
 * status: "active" on every call, which meant setting a start date (a
 * config step a coach might reasonably do WHILE a client is still mid-
 * onboarding, to have it ready) silently activated them — jumping straight
 * past "coach_setup"/awaiting-review, and past
 * lib/production/roster.ts's own deriveLifecycle entirely, for a client who
 * may not have finished onboarding at all yet. Setting a start date now
 * only ever sets the date/timezone; only an explicit, separate coach action
 * — activateClientEnrollment, in lib/production/roster.ts — ever flips
 * status to "active", and it refuses to unless a real program AND
 * nutrition assignment already exist.
 * Preserves whatever status already exists (defaults to the column's own
 * "invited" default on first insert) rather than guessing one here. */
export async function setClientProgramStartDate(params: {
  workspaceId: string;
  clientProfileId: string;
  startDateIso: string;
  timeZone: string;
}): Promise<void> {
  await requireCoachAuthority(params.workspaceId);
  const supabase = await getSupabaseServerClient();
  const { data: existing, error: readError } = await supabase
    .from("client_enrollments")
    .select("status")
    .eq("client_profile_id", params.clientProfileId)
    .maybeSingle();
  if (readError) throw new Error(`setClientProgramStartDate (read) failed: ${readError.message}`);

  const { error } = await supabase.from("client_enrollments").upsert(
    {
      workspace_id: params.workspaceId,
      client_profile_id: params.clientProfileId,
      original_program_start_date: params.startDateIso,
      timezone: params.timeZone,
      ...(existing ? {} : { status: "onboarding" }),
    },
    { onConflict: "client_profile_id" }
  );
  if (error) throw new Error(`setClientProgramStartDate failed: ${error.message}`);
}
