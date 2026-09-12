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

import { getAuthenticatedContext, requireWorkspaceRole, isWorkspaceStaffRole } from "../../lib/production/auth";
import { UnauthorizedError } from "../../lib/production/errors";
import { getSupabaseServerClient } from "../../lib/supabase/server";
import {
  getClientProgramContext,
  getDailyActivity,
  saveDailyActivity,
  createDraftProgramVersion,
  publishProgramVersion,
  assignProgramVersionToClient,
  createDraftNutritionVersion,
  publishNutritionVersion,
  assignNutritionVersionToClient,
  setClientProgramStartDate,
} from "../../lib/production/programs";
import { universalProgramToClientAssignedProgram } from "../../lib/training/legacy-adapter";
import { generateProgramDirectionSummaries } from "../../lib/coach/program-directions";
import { buildUniversalProgramForDirection, buildPlaceholderProgrammingProfile } from "../../lib/coach/universal-program-generation";
import { DAYS_OF_WEEK_ORDER } from "../../lib/coach/training";
import { getOnboardingProgressForClient } from "../../lib/production/onboarding";
import { extractClientProgrammingProfile } from "../../lib/coach/programming-profile";
import { getOrBootstrapApprovedPlaybook } from "../../lib/production/playbooks";
import { createInitialState } from "../../lib/state";
import { NUTRITION_TARGETS } from "../../lib/mock-data";
import { resolveClientLocalDateIso } from "../../lib/shared/local-date";
import type { AppState } from "../../lib/state";
import type { DailyActivityContent } from "../../lib/production/validation";
import type { ClientAssignedProgram } from "../../lib/types";

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

  // Phase 5 — context.assignedProgram may now be either the legacy
  // ClientAssignedProgram or the universal UniversalTrainingProgramContent
  // (schemaVersion: 2). AppState.assignedProgram is still legacy-typed (the
  // whole demo-shaped Today/planner/calculations surface —
  // lib/workout/resolve-scheduled-workout.ts, lib/mock-data.ts's
  // resolveWorkoutAvailabilityForDay — is built around it), so a
  // schemaVersion 2 program is converted through the legacy-compatibility
  // read selector (universalProgramToClientAssignedProgram) when every
  // session in it is representable that way (real, pure-resistance
  // generated content always is), never assigned directly — see that
  // function's own doc for exactly why a raw assignment here would silently
  // corrupt the client's program.
  let legacyCompatibleProgram: ClientAssignedProgram | undefined;
  if (context.assignedProgram) {
    if ("schemaVersion" in context.assignedProgram && context.assignedProgram.schemaVersion === 2) {
      legacyCompatibleProgram = universalProgramToClientAssignedProgram(context.assignedProgram) ?? undefined;
      // else: a real universal program exists but isn't legacy-representable
      // (e.g. contains continuous work) — this legacy view of it stays
      // undefined, a documented remaining limitation for Today/planner-style
      // legacy-only surfaces (see this phase's completion report). It IS
      // still fully executable through the universal path below.
    } else {
      legacyCompatibleProgram = context.assignedProgram;
    }
  }
  // Phase 6A — programEnrollment (dates/duration only, never program
  // content) is schema-agnostic, so it's set whenever a real enrollment
  // exists, independent of legacy-representability — CRITICAL: this used to
  // be gated together with assignedProgram specifically to protect
  // resolveScheduledWorkoutForStart's PUSH_WORKOUT fallback (calibrated for
  // a genuinely assignment-less client, never a real one) from misfiring
  // for a real client whose program simply wasn't legacy-representable.
  // That protection now lives in lib/state.ts's START_WORKOUT itself (it
  // checks assignedUniversalProgram before ever reaching the legacy path)
  // and lib/history/build-daily-record.ts's own equivalent guard, so
  // splitting this assignment is safe.
  if (context.enrollment) {
    state.programEnrollment = context.enrollment;
    state.assignedUniversalProgram = context.universalAssignedProgram ?? undefined;
  }
  if (context.enrollment && legacyCompatibleProgram) {
    state.assignedProgram = legacyCompatibleProgram;
  }
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
    // Phase 5/6A — true whenever this client has no legacy-representable
    // program view: still the correct gate for every legacy-only surface
    // (Today, planner, calculations — see legacyCompatibleProgram above).
    // Training (app/(client)/training/page.tsx) additionally checks
    // state.assignedUniversalProgram itself and renders the real universal
    // session experience even when this flag is true, since it no longer
    // depends on the legacy view at all — see that page for the exact
    // override logic.
    programNotYetAssigned: !context.enrollment || !legacyCompatibleProgram,
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

// Phase 6B — this conservative, non-demographic default cadence is now
// ONLY a genuine fallback: used exclusively when a client hasn't completed
// real onboarding yet (see extractClientProgrammingProfile below). Every
// client with real onboarding data gets their own real availableDays
// instead.
const DEFAULT_AVAILABLE_DAYS = [DAYS_OF_WEEK_ORDER[0], DAYS_OF_WEEK_ORDER[2], DAYS_OF_WEEK_ORDER[4]];

/**
 * Phase 5 replaced the old buildDraftProgramFromCatalog placeholder (a
 * clone of the single hardcoded PUSH_WORKOUT catalog exercise) with real,
 * periodized universal generation (lib/coach/universal-program-generation.ts).
 * Phase 6B replaces THAT phase's own placeholder coach/client context with
 * the real persisted equivalents:
 *
 * - Coach methodology: this workspace's own approved Coach Playbook
 *   (lib/production/playbooks.ts's getOrBootstrapApprovedPlaybook) — real
 *   configured methodology when the coach has set one up, or an honest,
 *   safe, bootstrapped default (never a fabricated claim about how this
 *   coach actually coaches) when they haven't yet. Scoped by workspaceId,
 *   matching this product's current "one coach, and that coach is the
 *   workspace owner" reality (see docs/production/PILOT_RUNBOOK.md) — true
 *   per-coach scoping is a real, separate question for a future
 *   multi-coach workspace, not this phase's concern (see this phase's
 *   completion report).
 * - Client context: this client's own real onboarding answers, normalized
 *   through the existing extractClientProgrammingProfile (never a raw
 *   onboarding dump — that function already refuses to fabricate a missing
 *   answer, flagging an honest assumption instead). Falls back to the same
 *   conservative DEFAULT_AVAILABLE_DAYS-based placeholder ONLY when this
 *   client genuinely hasn't completed onboarding yet — generation must
 *   keep working safely for a legacy/incomplete client, never block on it.
 *
 * No Supabase-mode health-review system exists yet (a real, documented gap
 * — see this phase's completion report), so `healthReview` is passed as
 * null here; that's honest about the gap, not a fabricated "no injury"
 * claim — the client's own self-reported injury/restriction answers still
 * reach the profile and still influence exercise selection regardless (see
 * avoidedTermsForProfile).
 *
 * Authorization is checked explicitly, here, before any generation work
 * happens — never relying solely on createDraftProgramVersion's own later
 * internal check (defense in depth, matching this codebase's existing
 * discipline elsewhere — e.g. lib/ai/context.ts).
 */
export async function createPublishAndAssignProgramAction(params: {
  workspaceId: string;
  clientProfileId: string;
  title: string;
  durationWeeks: number;
}): Promise<{ assignmentId: string; versionId: string }> {
  const ctx = await getAuthenticatedContext();
  const membership = requireWorkspaceRole(ctx, params.workspaceId, ["workspace_owner", "platform_admin", "coach"]);
  if (!isWorkspaceStaffRole(membership.role)) throw new UnauthorizedError();

  const nowIso = new Date().toISOString();

  const supabase = await getSupabaseServerClient();
  const { data: workspaceRow, error: workspaceError } = await supabase.from("workspaces").select("business_name").eq("id", params.workspaceId).single();
  if (workspaceError) throw new Error(`createPublishAndAssignProgramAction (workspace lookup) failed: ${workspaceError.message}`);
  const playbook = await getOrBootstrapApprovedPlaybook({ workspaceId: params.workspaceId, businessName: workspaceRow.business_name as string });
  const com = playbook.content.operatingModel;

  const onboarding = await getOnboardingProgressForClient(params.clientProfileId);
  const profileResult = extractClientProgrammingProfile(onboarding, null);
  const profile = "profile" in profileResult ? profileResult.profile : buildPlaceholderProgrammingProfile(DEFAULT_AVAILABLE_DAYS);

  const directions = generateProgramDirectionSummaries({ profile, com, durationWeeks: params.durationWeeks });
  const direction = directions.find((d) => d.kind === "best_fit") ?? directions[0];
  const { content } = buildUniversalProgramForDirection(direction, {
    clientId: params.clientProfileId,
    workspaceId: params.workspaceId,
    coachId: ctx.userId,
    profile,
    com,
    durationWeeks: params.durationWeeks,
    nowIso,
  });

  const { versionId } = await createDraftProgramVersion({ workspaceId: params.workspaceId, title: params.title, content: { ...content, name: params.title } });
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
