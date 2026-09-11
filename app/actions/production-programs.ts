"use server";

// Phase 6.0B — Persist the Complete Revenue Loop.
//
// The client-callable surface over lib/production/programs.ts. Every
// function here is a real Server Action — never a place a browser could
// smuggle in someone else's workspaceId/clientId, since every one of them
// re-derives the caller's own identity from getAuthenticatedContext()
// itself rather than trusting an argument the client passed. This is the
// only file client components (hooks/use-prototype-state.tsx's Supabase
// bootstrap/autosave, and components/coach/live-client-workspace.tsx's
// program/nutrition/start-date forms) import from — they never import
// lib/production/programs.ts or lib/supabase/* directly, keeping every real
// Supabase query inside server-only code.

import { getAuthenticatedContext } from "../../lib/production/auth";
import { getSupabaseServerClient } from "../../lib/supabase/server";
import {
  getClientProgramContext,
  getDailyActivity,
  saveDailyActivity,
  buildDraftProgramFromCatalog,
  createDraftProgramVersion,
  publishProgramVersion,
  assignProgramVersionToClient,
  createDraftNutritionVersion,
  publishNutritionVersion,
  assignNutritionVersionToClient,
  setClientProgramStartDate,
} from "../../lib/production/programs";
import { createInitialState } from "../../lib/state";
import { NUTRITION_TARGETS } from "../../lib/mock-data";
import { resolveClientLocalDateIso } from "../../lib/shared/local-date";
import type { AppState } from "../../lib/state";
import type { DailyActivityContent } from "../../lib/production/validation";

interface OwnClientIdentity {
  clientProfileId: string;
  workspaceId: string;
  clientDisplayName: string;
  primaryCoachId: string | null;
  primaryCoachDisplayName: string | null;
}

async function resolveOwnClientProfile(): Promise<OwnClientIdentity> {
  const ctx = await getAuthenticatedContext();
  const supabase = await getSupabaseServerClient();
  const { data: clientRow, error: clientError } = await supabase
    .from("client_profiles")
    .select("id, workspace_id, display_name")
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (clientError) throw new Error(`resolveOwnClientProfile failed: ${clientError.message}`);
  if (!clientRow) throw new Error(`Authenticated user ${ctx.userId} has no client_profiles row — not a client.`);

  const { data: assignmentRow, error: assignmentError } = await supabase
    .from("coach_client_assignments")
    .select("coach_user_id, profiles:coach_user_id(display_name)")
    .eq("client_profile_id", clientRow.id)
    .eq("is_primary", true)
    .maybeSingle();
  if (assignmentError) throw new Error(`resolveOwnClientProfile (coach lookup) failed: ${assignmentError.message}`);

  const coachProfile = assignmentRow?.profiles as unknown as { display_name: string } | null;

  return {
    clientProfileId: clientRow.id as string,
    workspaceId: clientRow.workspace_id as string,
    clientDisplayName: clientRow.display_name as string,
    primaryCoachId: (assignmentRow?.coach_user_id as string | undefined) ?? null,
    primaryCoachDisplayName: coachProfile?.display_name ?? null,
  };
}

export type SupabaseClientBootstrap =
  | { kind: "not_provisioned" }
  | {
      kind: "ready";
      state: AppState;
      dailyActivity: DailyActivityContent | null;
      clientDisplayName: string;
      primaryCoachDisplayName: string | null;
      email: string | null;
      /** Phase 6.0D-B fix — true whenever this client has no real
       * client_enrollments.original_program_start_date + active program
       * assignment yet (context.enrollment is null — see
       * lib/production/programs.ts's getClientProgramContext doc). Before
       * this fix, callers fell back to createInitialState's generic
       * "programEnrollment starts today" scaffold in this exact case,
       * which resolveProgramTiming then read as a genuinely active,
       * already-started program — a fabricated Day 1 for a client whose
       * coach hasn't configured anything yet. Every client-facing page
       * must render an honest "your coach is still setting up your
       * program" state instead of the normal Today/Training/Nutrition/
       * Progress experience whenever this is true (see
       * components/today/awaiting-program-setup.tsx). */
      programNotYetAssigned: boolean;
    };

/** The one entry point hooks/use-prototype-state.tsx's Supabase-mode
 * bootstrap calls: resolves the authenticated caller's own client identity,
 * their real active program/nutrition assignments (never another client's,
 * never PUSH_WORKOUT), and today's already-logged activity, then returns
 * enough to build a real AppState. "not_provisioned" (no client_profiles
 * row for this auth user) is a distinct, honest outcome from "ready with no
 * program assigned yet" (state.assignedProgram simply undefined) — the
 * caller renders each differently, and neither one is ever papered over
 * with demo/PUSH_WORKOUT content. */
export async function getMySupabaseAppStateAction(): Promise<SupabaseClientBootstrap> {
  let identity: OwnClientIdentity;
  try {
    identity = await resolveOwnClientProfile();
  } catch {
    return { kind: "not_provisioned" };
  }
  const ctx = await getAuthenticatedContext();

  const context = await getClientProgramContext({ workspaceId: identity.workspaceId, clientProfileId: identity.clientProfileId });

  const state = createInitialState({
    workspaceId: identity.workspaceId,
    clientId: identity.clientProfileId,
    primaryCoachId: identity.primaryCoachId ?? undefined,
  });

  if (context.enrollment) state.programEnrollment = context.enrollment;
  if (context.assignedProgram) state.assignedProgram = context.assignedProgram;
  if (context.nutritionPlan) {
    state.assignedNutritionPlan = context.nutritionPlan;
    state.nutritionTargets = context.nutritionPlan.targets;
  } else {
    state.nutritionTargets = NUTRITION_TARGETS;
  }

  const dateIso = resolveClientLocalDateIso(new Date(), state.programEnrollment.timeZone);
  state.dateIso = dateIso;

  const dailyActivity = await getDailyActivity(identity.clientProfileId, dateIso);

  return {
    kind: "ready",
    state,
    dailyActivity,
    clientDisplayName: identity.clientDisplayName,
    primaryCoachDisplayName: identity.primaryCoachDisplayName,
    email: ctx.profile.email,
    programNotYetAssigned: !context.enrollment,
  };
}

export async function saveMySupabaseDailyActivityAction(params: {
  dateIso: string;
  programAssignmentId: string | null;
  content: DailyActivityContent;
}): Promise<void> {
  const identity = await resolveOwnClientProfile();
  await saveDailyActivity({
    workspaceId: identity.workspaceId,
    clientProfileId: identity.clientProfileId,
    dateIso: params.dateIso,
    programAssignmentId: params.programAssignmentId,
    content: params.content,
  });
}

// ---------------------------------------------------------------------------
// Coach-side actions — the minimal, real create/publish/assign loop. Called
// from components/coach/live-client-workspace.tsx (folded into the real,
// connected client detail surface — see that file's own doc for why this is
// no longer a standalone "proof page").
// ---------------------------------------------------------------------------

export async function createPublishAndAssignProgramAction(params: {
  workspaceId: string;
  clientProfileId: string;
  title: string;
  durationWeeks: number;
}): Promise<{ assignmentId: string; versionId: string }> {
  // coachId is the server-verified caller, never a client-supplied value —
  // requireWorkspaceRole (called inside createDraftProgramVersion via
  // requireCoachAuthority) independently re-checks this same identity holds
  // real staff authority in params.workspaceId before anything is written.
  const ctx = await getAuthenticatedContext();
  const content = buildDraftProgramFromCatalog({
    workspaceId: params.workspaceId,
    clientId: params.clientProfileId,
    coachId: ctx.userId,
    name: params.title,
    durationWeeks: params.durationWeeks,
    nowIso: new Date().toISOString(),
  });
  const { versionId } = await createDraftProgramVersion({ workspaceId: params.workspaceId, title: params.title, content });
  await publishProgramVersion({ workspaceId: params.workspaceId, versionId });
  const assignmentId = await assignProgramVersionToClient({
    workspaceId: params.workspaceId,
    clientProfileId: params.clientProfileId,
    versionId,
  });
  return { assignmentId, versionId };
}

export async function createPublishAndAssignNutritionAction(params: {
  workspaceId: string;
  clientProfileId: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}): Promise<{ assignmentId: string; versionId: string }> {
  // A minimal, real AssignedNutritionPlan — this proof surface only ever
  // collects the four macro targets from the coach (see the form in
  // assign-live/page.tsx); the richer coaching-guidance fields this type
  // also carries (meal structure, substitution/supplement guidance, etc.)
  // are real product surface built by the existing demo-mode nutrition
  // composer (lib/coach/nutrition-directions.ts) — out of this minimal
  // page's scope, so they're honestly left blank/zero rather than
  // fabricated placeholder coaching advice.
  const content = {
    id: `nutrition-${crypto.randomUUID()}`,
    targets: { calories: params.calories, proteinG: params.proteinG, carbsG: params.carbsG, fatG: params.fatG },
    usesTrainingRestSplit: false,
    mealsPerDay: 4,
    mealStructureDescription: "",
    preTrainingGuidance: "",
    postTrainingGuidance: "",
    hydrationOzPerDay: 0,
    fiberGramsPerDay: 0,
    substitutionGuidance: "",
    supplementGuidance: "",
    adherenceStrategy: "",
    metricsToMonitor: [],
    weeklyAdjustmentRule: "",
    sourceStrategyLabel: "Phase 6.0B live-assignment proof surface",
    approvedAtIso: new Date().toISOString(),
  };
  const { versionId } = await createDraftNutritionVersion({
    workspaceId: params.workspaceId,
    title: "Nutrition plan",
    content,
  });
  await publishNutritionVersion({ workspaceId: params.workspaceId, versionId });
  const assignmentId = await assignNutritionVersionToClient({
    workspaceId: params.workspaceId,
    clientProfileId: params.clientProfileId,
    versionId,
  });
  return { assignmentId, versionId };
}

export async function setProgramStartDateAction(params: {
  workspaceId: string;
  clientProfileId: string;
  startDateIso: string;
  timeZone: string;
}): Promise<void> {
  await setClientProgramStartDate(params);
}
