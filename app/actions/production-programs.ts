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
  getPendingProgramProposal,
  getProgramProposalVersion,
  getOriginalProposalVersion,
  rejectProgramProposalVersion,
  createDraftNutritionVersion,
  publishNutritionVersion,
  assignNutritionVersionToClient,
  setClientProgramStartDate,
} from "../../lib/production/programs";
import { universalProgramToClientAssignedProgram } from "../../lib/training/legacy-adapter";
import { generateProgramDirectionSummaries, avoidedTermsForProfile } from "../../lib/coach/program-directions";
import { buildUniversalProgramForDirection, buildPlaceholderProgrammingProfile } from "../../lib/coach/universal-program-generation";
import { DAYS_OF_WEEK_ORDER } from "../../lib/coach/training";
import { getOnboardingProgressForClient } from "../../lib/production/onboarding";
import { extractClientProgrammingProfile } from "../../lib/coach/programming-profile";
import { getOrBootstrapApprovedPlaybook } from "../../lib/production/playbooks";
import { resolveHealthReviewRecordForClient } from "../../lib/production/pain-safety";
import { createInitialState } from "../../lib/state";
import { NUTRITION_TARGETS } from "../../lib/mock-data";
import { projectProgramApprovalDecision, projectProgramRejectionDecision, type ProgramProposalSummary } from "../../lib/decisions/project-program-generation";
import { projectPrescriptionEditDecision } from "../../lib/decisions/project-prescription-edit";
import { recordDecisionEvidence } from "../../lib/production/decision-evidence";
import { locateTrainingItem, applyTrainingItemPatch, diffProgramProposal, groupDeltasByItem, findRestrictionConflicts, type TrainingItemPath, type TrainingItemPatch } from "../../lib/training/program-proposal-editing";
import { validateUniversalTrainingProgramContent } from "../../lib/production/validation";
import { resolveClientLocalDateIso } from "../../lib/shared/local-date";
import type { AppState } from "../../lib/state";
import type { DailyActivityContent } from "../../lib/production/validation";
import type { ClientAssignedProgram } from "../../lib/types";
import type { UniversalTrainingProgramContent } from "../../lib/training/types";

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

/** Phase 8C — the one authorization gate every proposal review/edit/
 * approve/reject/regenerate action shares: workspace staff role AND,
 * unless the caller is a workspace admin, genuinely assigned to THIS
 * client (coach_client_assignments — the same relationship
 * app_private.can_manage_client already enforces at the RPC layer for the
 * final assign step). The underlying training_program_versions RLS
 * policies remain workspace-staff-scoped (unchanged Phase 5/6A behavior,
 * left alone rather than retrofitted here) — this app-layer gate is what
 * actually makes "an unrelated coach in the same workspace cannot review/
 * edit/approve/reject another coach's client's proposal" true for these
 * specific actions, checked BEFORE any of them touch the database (defense
 * in depth, matching this file's own established pattern). */
async function requireAssignedCoachAuthority(workspaceId: string, clientProfileId: string) {
  const ctx = await getAuthenticatedContext();
  const membership = requireWorkspaceRole(ctx, workspaceId, ["workspace_owner", "platform_admin", "coach"]);
  if (!isWorkspaceStaffRole(membership.role)) throw new UnauthorizedError();
  if (membership.role === "coach") {
    const supabase = await getSupabaseServerClient();
    const { data } = await supabase.from("coach_client_assignments").select("coach_user_id").eq("client_profile_id", clientProfileId).eq("coach_user_id", ctx.userId).maybeSingle();
    if (!data) throw new UnauthorizedError();
  }
  return ctx;
}

/**
 * Phase 5/6B's real generation pipeline (Coach Playbook + real onboarding +
 * real health review, normalized through extractClientProgrammingProfile),
 * unchanged in substance — Phase 8C only extracts it into its own function
 * so it can be called from createProgramProposalAction WITHOUT also
 * publishing/assigning the result (see this phase's own completion report,
 * "program lifecycle before vs after"). See the prior version of this file
 * (git history) for the full original doc on why each of these context
 * sources is resolved the way it is.
 */
async function generateUniversalProgramProposalContent(params: { workspaceId: string; clientProfileId: string; coachId: string; title: string; durationWeeks: number }) {
  const supabase = await getSupabaseServerClient();
  const { data: workspaceRow, error: workspaceError } = await supabase.from("workspaces").select("business_name").eq("id", params.workspaceId).single();
  if (workspaceError) throw new Error(`generateUniversalProgramProposalContent (workspace lookup) failed: ${workspaceError.message}`);
  const playbook = await getOrBootstrapApprovedPlaybook({ workspaceId: params.workspaceId, businessName: workspaceRow.business_name as string });
  const com = playbook.content.operatingModel;

  const onboarding = await getOnboardingProgressForClient(params.clientProfileId);
  const healthReview = await resolveHealthReviewRecordForClient(params.clientProfileId, params.workspaceId);
  const profileResult = extractClientProgrammingProfile(onboarding, healthReview);
  const profile = "profile" in profileResult ? profileResult.profile : buildPlaceholderProgrammingProfile(DEFAULT_AVAILABLE_DAYS);

  const directions = generateProgramDirectionSummaries({ profile, com, durationWeeks: params.durationWeeks });
  const direction = directions.find((d) => d.kind === "best_fit") ?? directions[0];
  const nowIso = new Date().toISOString();
  const { content } = buildUniversalProgramForDirection(direction, {
    clientId: params.clientProfileId,
    workspaceId: params.workspaceId,
    coachId: params.coachId,
    profile,
    com,
    durationWeeks: params.durationWeeks,
    nowIso,
  });

  return { content: { ...content, name: params.title }, direction, profile, com, nowIso };
}

function proposalSummaryFrom(content: { durationWeeks: number; directionLabel?: string; generationRationale?: string }): ProgramProposalSummary {
  return { durationWeeks: content.durationWeeks, directionLabel: content.directionLabel ?? "Unlabeled direction", rationale: content.generationRationale ?? "No rationale recorded." };
}

/** Step 1 of the Phase 8C lifecycle: GENERATE a real, reviewable proposal.
 * Persists it as a real draft training_program_versions row, tagged with
 * WHO it's for (proposedForClientProfileId) so it survives navigation/
 * reload — but never publishes or assigns it. The client's currently
 * active program (if any) is completely untouched: nothing here ever
 * calls assign_active_program_version. No decision evidence is recorded
 * yet either — nothing has been decided. */
export async function createProgramProposalAction(params: { workspaceId: string; clientProfileId: string; title: string; durationWeeks: number }): Promise<{ programId: string; versionId: string; versionNumber: number }> {
  const ctx = await requireAssignedCoachAuthority(params.workspaceId, params.clientProfileId);
  const { content } = await generateUniversalProgramProposalContent({ ...params, coachId: ctx.userId });
  return createDraftProgramVersion({ workspaceId: params.workspaceId, title: params.title, content, proposedForClientProfileId: params.clientProfileId });
}

export interface ProgramProposalReviewView {
  versionId: string;
  programId: string;
  versionNumber: number;
  /** True once at least one real edit has been saved — the review UI uses
   * this to show "edited" rather than "as generated." */
  wasEdited: boolean;
  content: UniversalTrainingProgramContent;
  /** Non-blocking — see lib/training/program-proposal-editing.ts's
   * findRestrictionConflicts doc: coach authority remains final, but the
   * coach must never be left unable to see an active restriction. */
  restrictionWarnings: string[];
}

/** Step 2: the coach's review surface reads this. Returns null when there
 * is no pending proposal for this client (nothing to review right now). */
export async function getProgramProposalForReviewAction(params: { workspaceId: string; clientProfileId: string }): Promise<ProgramProposalReviewView | null> {
  await requireAssignedCoachAuthority(params.workspaceId, params.clientProfileId);
  const pending = await getPendingProgramProposal(params.workspaceId, params.clientProfileId);
  if (!pending) return null;

  const onboarding = await getOnboardingProgressForClient(params.clientProfileId);
  const healthReview = await resolveHealthReviewRecordForClient(params.clientProfileId, params.workspaceId);
  const profileResult = extractClientProgrammingProfile(onboarding, healthReview);
  const profile = "profile" in profileResult ? profileResult.profile : buildPlaceholderProgrammingProfile(DEFAULT_AVAILABLE_DAYS);
  const playbook = await getOrBootstrapApprovedPlaybook({ workspaceId: params.workspaceId, businessName: "" });
  const avoidedTerms = avoidedTermsForProfile(profile, playbook.content.operatingModel);

  return {
    versionId: pending.versionId,
    programId: pending.programId,
    versionNumber: pending.versionNumber,
    wasEdited: pending.versionNumber > 1,
    content: pending.content,
    restrictionWarnings: findRestrictionConflicts(pending.content, avoidedTerms),
  };
}

/** Step 3a: EDIT — applies one real, bounded patch (spec section 8's V1
 * field scope) to one real training item, validates the result as real
 * universal-grammar content, and persists it as a NEW draft version (the
 * original proposal, version_number 1, is never mutated — see
 * lib/production/programs.ts's own doc). Emits exactly one decision-
 * evidence record for the edited item, comparing the untouched ORIGINAL
 * proposal's value for that item against what the coach just chose —
 * never the whole program, never fields the coach didn't touch (spec test
 * J). Idempotent: submitting the identical patch again (a literal retry)
 * produces byte-identical content and is detected as a no-op — no new
 * version, no duplicate evidence. */
export async function editProgramProposalItemAction(params: { workspaceId: string; clientProfileId: string; versionId: string; path: TrainingItemPath; patch: TrainingItemPatch }): Promise<{ versionId: string; warnings: string[] }> {
  const ctx = await requireAssignedCoachAuthority(params.workspaceId, params.clientProfileId);
  const current = await getProgramProposalVersion(params.workspaceId, params.versionId);
  if (!current || current.status !== "draft") throw new Error("editProgramProposalItemAction: no pending draft proposal at that version");

  const original = await getOriginalProposalVersion(params.workspaceId, current.programId);
  if (!original) throw new Error("editProgramProposalItemAction: original proposal version missing");

  const beforeItem = locateTrainingItem(current.content, params.path);
  if (!beforeItem) throw new Error("editProgramProposalItemAction: no item at that path");

  const patchedContent = applyTrainingItemPatch(current.content, params.path, params.patch);
  validateUniversalTrainingProgramContent(patchedContent);

  if (JSON.stringify(patchedContent) === JSON.stringify(current.content)) {
    // A genuine no-op retry (identical patch resubmitted) — never create a
    // redundant version or duplicate evidence for a change that didn't
    // actually change anything.
    return { versionId: current.versionId, warnings: [] };
  }

  const { versionId: newVersionId } = await createDraftProgramVersion({
    workspaceId: params.workspaceId,
    programId: current.programId,
    title: current.content.name,
    content: patchedContent,
    proposedForClientProfileId: params.clientProfileId,
  });

  const originalItem = locateTrainingItem(original.content, params.path);
  if (originalItem) {
    const deltas = diffProgramProposal(original.content, patchedContent).filter((d) => d.weekNumber === params.path.weekNumber && d.dayOfWeek === params.path.dayOfWeek && d.sessionIndex === params.path.sessionIndex && d.blockId === params.path.blockId && d.itemId === params.path.itemId);
    const [group] = groupDeltasByItem(deltas);
    if (group) {
      const isContinuous = beforeItem.item.category === "continuous";
      const isSubstitution = group.fields.some((f) => f.field === "name");
      const proposedFields: Record<string, unknown> = {};
      const chosenFields: Record<string, unknown> = {};
      for (const f of group.fields) {
        const key = f.field === "name" ? (isContinuous ? "activityName" : "exerciseName") : f.field;
        proposedFields[key] = f.from;
        chosenFields[key] = f.to;
      }
      try {
        await recordDecisionEvidence(
          projectPrescriptionEditDecision({
            workspaceId: params.workspaceId,
            coachUserId: ctx.userId,
            clientProfileId: params.clientProfileId,
            editedVersionId: newVersionId,
            path: params.path,
            isContinuous,
            proposedFields,
            chosenFields,
            isSubstitution,
            decidedAtIso: new Date().toISOString(),
          })
        );
      } catch (evidenceError) {
        console.error(`editProgramProposalItemAction: decision evidence projection failed (canonical edit already saved): ${evidenceError instanceof Error ? evidenceError.message : String(evidenceError)}`);
      }
    }
  }

  const onboarding = await getOnboardingProgressForClient(params.clientProfileId);
  const healthReview = await resolveHealthReviewRecordForClient(params.clientProfileId, params.workspaceId);
  const profileResult = extractClientProgrammingProfile(onboarding, healthReview);
  const profile = "profile" in profileResult ? profileResult.profile : buildPlaceholderProgrammingProfile(DEFAULT_AVAILABLE_DAYS);
  const playbook = await getOrBootstrapApprovedPlaybook({ workspaceId: params.workspaceId, businessName: "" });
  const warnings = findRestrictionConflicts(patchedContent, avoidedTermsForProfile(profile, playbook.content.operatingModel));

  return { versionId: newVersionId, warnings };
}

/** Step 3b: APPROVE — publishes and assigns whichever draft the coach is
 * actually approving (the original, unedited proposal, or the latest
 * edited draft), through the SAME unchanged canonical publish/assign
 * lifecycle every prior phase already relies on. Records exactly one
 * program-level decision-evidence entry, keyed to the ORIGINAL proposal's
 * identity so a retry never duplicates it. */
export async function approveProgramProposalAction(params: { workspaceId: string; clientProfileId: string; versionId: string }): Promise<{ assignmentId: string }> {
  const ctx = await requireAssignedCoachAuthority(params.workspaceId, params.clientProfileId);
  const approved = await getProgramProposalVersion(params.workspaceId, params.versionId);
  if (!approved || approved.status !== "draft") throw new Error("approveProgramProposalAction: no pending draft proposal at that version");
  const original = await getOriginalProposalVersion(params.workspaceId, approved.programId);
  if (!original) throw new Error("approveProgramProposalAction: original proposal version missing");

  await publishProgramVersion({ workspaceId: params.workspaceId, versionId: params.versionId });
  const assignmentId = await assignProgramVersionToClient({ workspaceId: params.workspaceId, clientProfileId: params.clientProfileId, versionId: params.versionId });

  try {
    await recordDecisionEvidence(
      projectProgramApprovalDecision({
        workspaceId: params.workspaceId,
        coachUserId: ctx.userId,
        clientProfileId: params.clientProfileId,
        originalVersionId: original.versionId,
        programAssignmentId: assignmentId,
        proposedSummary: proposalSummaryFrom(original.content),
        chosenSummary: proposalSummaryFrom(approved.content),
        wasEdited: approved.versionNumber > 1,
        decidedAtIso: new Date().toISOString(),
      })
    );
  } catch (evidenceError) {
    console.error(`approveProgramProposalAction: decision evidence projection failed (canonical assignment already succeeded): ${evidenceError instanceof Error ? evidenceError.message : String(evidenceError)}`);
  }

  return { assignmentId };
}

/** Step 3c: REJECT — the proposal (whichever draft the coach is currently
 * looking at) becomes 'archived' and can never become active. It remains
 * real historical evidence — never deleted, never overwritten. An optional
 * concise reason is stored as-is; nothing here interprets it. */
export async function rejectProgramProposalAction(params: { workspaceId: string; clientProfileId: string; versionId: string; reason?: string }): Promise<void> {
  const ctx = await requireAssignedCoachAuthority(params.workspaceId, params.clientProfileId);
  const rejected = await getProgramProposalVersion(params.workspaceId, params.versionId);
  if (!rejected || rejected.status !== "draft") return; // already decided (or gone) — a safe, idempotent no-op
  const original = await getOriginalProposalVersion(params.workspaceId, rejected.programId);
  if (!original) throw new Error("rejectProgramProposalAction: original proposal version missing");

  await rejectProgramProposalVersion({ workspaceId: params.workspaceId, versionId: params.versionId });

  try {
    await recordDecisionEvidence(
      projectProgramRejectionDecision({
        workspaceId: params.workspaceId,
        coachUserId: ctx.userId,
        clientProfileId: params.clientProfileId,
        originalVersionId: original.versionId,
        proposedSummary: proposalSummaryFrom(original.content),
        reason: params.reason,
        decidedAtIso: new Date().toISOString(),
      })
    );
  } catch (evidenceError) {
    console.error(`rejectProgramProposalAction: decision evidence projection failed (canonical rejection already saved): ${evidenceError instanceof Error ? evidenceError.message : String(evidenceError)}`);
  }
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
