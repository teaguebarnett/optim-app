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
import { UnauthenticatedError, UnauthorizedError } from "../../lib/production/errors";
import { ownerMatches, type ClientOwner, type OwnedWriteResult } from "../../lib/production/client-ownership";
import { getSupabaseServerClient } from "../../lib/supabase/server";
import { validateNutritionTargets, nutritionTargetsEqual } from "../../lib/coach/nutrition-targets-input";
import {
  getClientProgramContext,
  getActiveProgramAssignment,
  getActiveNutritionAssignment,
  archiveUnverifiedPendingProposalsForClient,
  getDailyActivity,
  saveDailyActivity,
  createDraftProgramVersion,
  publishProgramVersion,
  assignProgramVersionToClient,
  getPendingProgramProposal,
  getProgramProposalVersion,
  getOriginalProposalVersion,
  getGeneratedVersionForJob,
  rejectProgramProposalVersion,
  archiveSiblingDraftVersions,
  createDraftNutritionVersion,
  publishNutritionVersion,
  assignNutritionVersionToClient,
  setClientProgramStartDate,
} from "../../lib/production/programs";
import { universalProgramToClientAssignedProgram } from "../../lib/training/legacy-adapter";
import { generateProgramDirectionSummaries, avoidedTermsForProfile } from "../../lib/coach/program-directions";
import { buildUniversalProgramForDirection } from "../../lib/coach/universal-program-generation";
import { getOnboardingProgressForClient } from "../../lib/production/onboarding";
import { extractClientProgrammingProfile } from "../../lib/coach/programming-profile";
import { resolveCoachIntelligenceForClient } from "../../lib/production/coach-brain";
import { draftMethodVersionIdOf, methodDraftStaleness } from "../../lib/coach/coach-brain";
import { resolveProgramLengthHint } from "../../lib/coach/method-resolution";
import { buildGenerationInputs, hasVerifiedGenerationInputs, checkProposalApproval, isUnverifiedFreshProposal, GenerationPrerequisitesError, type MissingPrerequisite } from "../../lib/coach/generation-prerequisites";
import { resolveHealthReviewRecordForClient } from "../../lib/production/pain-safety";
import { resolveApplicableCoachRules, getLearnedRuleProvenance, type LearnedRuleProvenance } from "../../lib/production/rule-resolution";
import { analyzeClientStateForClient, resolveEvidenceDetails } from "../../lib/production/client-state-evidence";
import { resolveAdjustmentProposal, type AdjustmentResolution } from "../../lib/production/adjustment-proposals";
import { selectFindingsForCoachUI, type PresentedFinding } from "../../lib/client-state/presentation";
import type { ClientStateAnalysis } from "../../lib/client-state/types";
import type { EvidenceDetailLine } from "../../lib/client-state/evidence-display";
import { createInitialState } from "../../lib/state";
import { projectProgramApprovalDecision, projectProgramRejectionDecision, type ProgramProposalSummary } from "../../lib/decisions/project-program-generation";
import { projectPrescriptionEditDecision } from "../../lib/decisions/project-prescription-edit";
import { recordDecisionEvidence } from "../../lib/production/decision-evidence";
import {
  locateTrainingItem,
  applyTrainingItemPatch,
  applyBlockPatch,
  removeTrainingItem,
  addTrainingItem,
  moveTrainingItem,
  moveBlock,
  renameSession,
  convertTrainingDayToRest,
  buildCoachAuthoredItem,
  diffProgramProposal,
  describeProgramDiffEntry,
  groupDeltasByItem,
  findRestrictionConflicts,
  type TrainingItemPath,
  type SessionPath,
  type BlockPath,
  type TrainingItemPatch,
  type BlockPatch,
} from "../../lib/training/program-proposal-editing";
import { projectItemRemovedDecision, projectItemAddedDecision, projectSessionRenamedDecision, projectDayConvertedToRestDecision } from "../../lib/decisions/project-structural-edit";
import { validateUniversalTrainingProgramContent } from "../../lib/production/validation";
import { resolveClientLocalDateIso } from "../../lib/shared/local-date";
import type { AppState } from "../../lib/state";
import type { DailyActivityContent } from "../../lib/production/validation";
import type { ClientAssignedProgram } from "../../lib/types";
import type { UniversalTrainingProgramContent } from "../../lib/training/types";
import { summarizeLegacyProposal, type LegacyProposalSummary } from "../../lib/coach/legacy-proposal-summary";
import type { DayOfWeek } from "../../lib/types";
import { loadSynthesisInputForClient } from "../../lib/production/synthesis";
import { getLatestReasonerJob, getReasonerRunForJob, isReasonerProposalEnabled, isRepairReasoningEnabled, productionRepairModel } from "../../lib/production/reasoner-proposals";
import { planningContextFor, queueAfterPreflightAnswers, queueRevisionIfMaterial, resolveGenerationContext, startReasonerGeneration, type RevisionQueueResult } from "../../lib/production/reasoner-lifecycle";
import { recordExerciseFitDecisions, type ExerciseFitDecisionInput } from "../../lib/production/structured-limitations";
import { setConfirmedApparatus } from "../../lib/production/equipment-profile";
import { applyReplacement, checkReplacement, defaultReplacement, parseRepairOutput, REPAIR_PROMPT_VERSION, REPAIR_SYSTEM_PROMPT, repairInput, validateRepair, type Replacement } from "../../lib/synthesis/reasoner/edit-impact";
import { methodFor } from "../../lib/synthesis/planners/resistance/planner";
import { clientFacingProgramContent, findClientCopyLeaks, reasonerReviewModel, removeExerciseEverywhere, sideOnlyNames, supportedSetupNames, type ReasonerReviewModel } from "../../lib/synthesis/reasoner/review-gate";
import { FOUNDATION_KNOWLEDGE } from "../../lib/synthesis/knowledge/registry";
import type { ReasonerJobView } from "../../lib/synthesis/reasoner/proposal-job";

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
  | { kind: "not_provisioned"; userId: string }
  | {
      kind: "ready";
      /** The auth user this state was built for — the provider binds to it and rebinds if the session changes. */
      userId: string;
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
  // Throws UnauthenticatedError for an anonymous caller — the same fail-closed outcome as before.
  const ctx = await getAuthenticatedContext();
  let identity: OwnClientIdentity;
  try {
    identity = await resolveOwnClientProfile();
  } catch (err) {
    // resolveOwnClientProfile's very first step is getAuthenticatedContext()
    // — an unauthenticated caller must fail closed here, never be folded
    // into the same "not_provisioned" outcome a real signed-in user with no
    // client_profiles row gets. Before this fix, app/(client)/layout.tsx had
    // no server-side auth gate of its own, and this catch-all was the exact
    // reason an anonymous visitor's session ended up rendering /today with
    // demo content instead of hitting a sign-in wall (see that layout's own
    // doc for the full incident this closes).
    if (err instanceof UnauthenticatedError) throw err;
    return { kind: "not_provisioned", userId: ctx.userId };
  }

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
  // No assigned plan = no targets. This used to substitute the demo
  // NUTRITION_TARGETS (3000 kcal / 200P / 360C / 85F), which every client
  // screen, the planner, and the saved daily snapshot then presented as
  // this real client's prescription.
  if (context.nutritionPlan) {
    state.assignedNutritionPlan = context.nutritionPlan;
    state.nutritionTargets = context.nutritionPlan.targets;
  } else {
    state.assignedNutritionPlan = undefined;
    state.nutritionTargets = null;
  }

  const dateIso = resolveClientLocalDateIso(new Date(), state.programEnrollment.timeZone);
  state.dateIso = dateIso;

  const dailyActivity = await getDailyActivity(identity.clientProfileId, dateIso);

  return {
    kind: "ready",
    userId: ctx.userId,
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
  /** Cross-client integrity — the client this day belongs to (the identity the caller's state was hydrated for). */
  owner: ClientOwner;
}): Promise<OwnedWriteResult> {
  const identity = await resolveOwnClientProfile();
  // The cookie says who is signed in NOW; the owner says whose day this is. A mismatch is another client's retained
  // or in-flight state (account switch, stale tab) — refused before anything is written, never re-attributed.
  if (!ownerMatches(params.owner, identity)) return { ok: false, reason: "owner_mismatch" };
  await saveDailyActivity({
    workspaceId: identity.workspaceId,
    clientProfileId: identity.clientProfileId,
    dateIso: params.dateIso,
    programAssignmentId: params.programAssignmentId,
    content: params.content,
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Coach-side actions — the minimal, real create/publish/assign loop. Called
// from components/coach/live-client-workspace.tsx (folded into the real,
// connected client detail surface — see that file's own doc for why this is
// no longer a standalone "proof page").
// ---------------------------------------------------------------------------

// Phase 6B — this conservative, non-demographic default cadence is now

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

/** Resolves everything a NEW proposal may be generated from, and whether
 * it is allowed at all (lib/coach/generation-prerequisites.ts): a
 * coach-confirmed method, completed intake, and no open health review.
 *
 * Gate 3 — the method is the client's PRIMARY coach's confirmed Coach Brain
 * (lib/production/coach-brain.ts's canonical read path), never the legacy
 * workspace playbook and never the acting coach's own method. No confirmed
 * Brain → no method → generation is refused. Callers authorize the client
 * first (requireAssignedCoachAuthority). */
// resolveGenerationContext lives in lib/production/reasoner-lifecycle.ts (shared with the revision lifecycle).

/**
 * Phase 5/6B's real generation pipeline (Coach Playbook + real onboarding +
 * real health review, normalized through extractClientProgrammingProfile).
 * It now refuses to run without a coach-confirmed method and completed
 * intake — the placeholder client profile and the bootstrapped default
 * method it used to fall back to are never generation inputs — and records
 * exactly what it used as content.generationInputs.
 */
async function generateUniversalProgramProposalContent(params: { workspaceId: string; clientProfileId: string; coachId: string; title: string; durationWeeks: number }) {
  const { intelligence, method, onboarding, prerequisites } = await resolveGenerationContext(params.workspaceId, params.clientProfileId);
  if (!prerequisites.ready) throw new GenerationPrerequisitesError(prerequisites.missing);
  // evaluateGenerationPrerequisites only returns ready with both present.
  const com = method!.operatingModel;
  const profile = prerequisites.profile;

  const directions = generateProgramDirectionSummaries({ profile, com, durationWeeks: params.durationWeeks });
  const direction = directions.find((d) => d.kind === "best_fit") ?? directions[0];
  const nowIso = new Date().toISOString();
  // Phase 9C — the coach's own real, active, applicable learned rules
  // (coach-general + this-client's client-specific, never a
  // PatternCandidate) resolved through the ONE centralized boundary (spec
  // section 8/20). A failure here degrades to zero rules, never blocks
  // generation (lib/production/rule-resolution.ts's own failure-semantics
  // doc) — a coach with no learned rules yet generates exactly as before
  // Phase 9C (spec section 36).
  // Gate 3 — the method owner's (primary coach's) learned rules, not the
  // acting coach's.
  const applicableRules = await resolveApplicableCoachRules({ clientProfileId: params.clientProfileId, owner: intelligence.owner ?? undefined });
  const { content, ruleApplication } = buildUniversalProgramForDirection(direction, {
    clientId: params.clientProfileId,
    workspaceId: params.workspaceId,
    coachId: params.coachId,
    profile,
    com,
    durationWeeks: params.durationWeeks,
    nowIso,
    applicableRules,
  });
  if (ruleApplication.appliedRuleIds.length > 0 || ruleApplication.skippedRules.length > 0) {
    console.log(`generateUniversalProgramProposalContent: rule application — applied ${ruleApplication.appliedRuleIds.length}, skipped ${ruleApplication.skippedRules.length} (${ruleApplication.skippedRules.map((s) => s.reason).join(", ")})`);
  }

  // Phase 10A — freeze the real, immutable historical provenance onto the
  // content itself, at the exact moment it's generated, so a later review
  // of THIS proposal never depends on whichever rules happen to be active
  // "now" (spec section 18/41). Only ever set when non-empty — an absent
  // field reads as "no provenance," identical to legacy content.
  const methodologyConflictedLearnedRuleIds = ruleApplication.skippedRules.filter((s) => s.reason === "explicit_methodology_conflict").map((s) => s.ruleId);
  const generationInputs = buildGenerationInputs({
    playbookVersion: method!.version,
    methodVersionId: method!.versionId,
    operatingModel: com,
    onboarding: onboarding!,
    profile,
    assumptions: prerequisites.assumptions,
    nowIso,
    rationale: direction.explanation.whyItFits,
    whyThisPlan: [direction.explanation.primaryAdvantage, `Trade-off: ${direction.explanation.tradeoff}`],
  });
  const contentWithProvenance = {
    ...content,
    name: params.title,
    generationInputs,
    ...(ruleApplication.appliedRuleIds.length > 0 ? { appliedLearnedRuleIds: ruleApplication.appliedRuleIds } : {}),
    ...(methodologyConflictedLearnedRuleIds.length > 0 ? { methodologyConflictedLearnedRuleIds } : {}),
  };

  return { content: contentWithProvenance, direction, profile, com, nowIso, ruleApplication };
}

/** Gate 4.0C-2A (internal QA) — runs the LEGACY generator in memory for
 * side-by-side comparison with the new resistance planner. Nothing is
 * persisted: generateUniversalProgramProposalContent only reads, and its
 * result is summarized and discarded. */
export async function previewLegacyProposalForComparisonAction(params: { workspaceId: string; clientProfileId: string; durationWeeks: number }): Promise<{ ok: true; summary: LegacyProposalSummary } | { ok: false; message: string }> {
  const ctx = await requireAssignedCoachAuthority(params.workspaceId, params.clientProfileId);
  try {
    const { content } = await generateUniversalProgramProposalContent({ workspaceId: params.workspaceId, clientProfileId: params.clientProfileId, coachId: ctx.userId, title: "Legacy comparison (not saved)", durationWeeks: params.durationWeeks });
    return { ok: true, summary: summarizeLegacyProposal(content) };
  } catch (err) {
    return { ok: false, message: err instanceof GenerationPrerequisitesError ? `Legacy generator refused: ${err.message}` : err instanceof Error ? err.message : "Legacy generation failed." };
  }
}

export interface GenerationPrerequisitesView {
  ready: boolean;
  missing: MissingPrerequisite[];
  /** Gate 3.1 — the client's primary coach's usual program length, when
   * their confirmed method states one (a hint, never a silent default). */
  programLengthHint: { min: number; max: number | null; preferred: number | null } | null;
}

/** The client-setup page's view of whether a new proposal can be generated,
 * and what's missing (with links to the screens that resolve it). */
export async function getGenerationPrerequisitesAction(params: { workspaceId: string; clientProfileId: string }): Promise<GenerationPrerequisitesView> {
  await requireAssignedCoachAuthority(params.workspaceId, params.clientProfileId);
  const { prerequisites, method } = await resolveGenerationContext(params.workspaceId, params.clientProfileId);
  const programLengthHint = resolveProgramLengthHint(method?.operatingModel ?? null);
  return prerequisites.ready ? { ready: true, missing: [], programLengthHint } : { ready: false, missing: prerequisites.missing, programLengthHint };
}

function proposalSummaryFrom(content: { durationWeeks: number; directionLabel?: string; generationRationale?: string }): ProgramProposalSummary {
  return { durationWeeks: content.durationWeeks, directionLabel: content.directionLabel ?? "Unlabeled direction", rationale: content.generationRationale ?? "No rationale recorded." };
}

/** The client's real programming profile, or null when intake isn't
 * complete — never a placeholder standing in for missing answers. */
async function resolveClientProgrammingProfile(workspaceId: string, clientProfileId: string) {
  const onboarding = await getOnboardingProgressForClient(clientProfileId);
  const healthReview = await resolveHealthReviewRecordForClient(clientProfileId, workspaceId);
  const profileResult = extractClientProgrammingProfile(onboarding, healthReview);
  return "profile" in profileResult ? profileResult.profile : null;
}

/** The one shared "apply a pure transform to the current draft, validate,
 * and persist as a new version if it actually changed anything" step every
 * proposal mutation (edit/remove/add/move/rename/convert) is built from.
 * Returns `changed: false` (the SAME versionId, nothing new persisted) for
 * a genuine no-op — e.g. a retried request producing byte-identical
 * content, or moveTrainingItem's own no-op at a list boundary — so callers
 * never create a redundant version or emit evidence for nothing. */
async function saveProposalDraft(params: { workspaceId: string; clientProfileId: string; current: { programId: string; content: UniversalTrainingProgramContent; versionId: string }; nextContent: UniversalTrainingProgramContent }): Promise<{ versionId: string; changed: boolean }> {
  validateUniversalTrainingProgramContent(params.nextContent);
  if (JSON.stringify(params.nextContent) === JSON.stringify(params.current.content)) {
    return { versionId: params.current.versionId, changed: false };
  }
  const { versionId } = await createDraftProgramVersion({
    workspaceId: params.workspaceId,
    programId: params.current.programId,
    title: params.current.content.name,
    content: params.nextContent,
    proposedForClientProfileId: params.clientProfileId,
  });
  return { versionId, changed: true };
}

/** Loads the current draft + the immutable original proposal for the same
 * family, or throws a clear error — the one authorization+existence check
 * every mutation action performs before touching content. */
async function loadDraftAndOriginal(workspaceId: string, versionId: string, actionName: string) {
  const current = await getProgramProposalVersion(workspaceId, versionId);
  if (!current || current.status !== "draft") throw new Error(`${actionName}: no pending draft proposal at that version`);
  const original = await originalForDraft(workspaceId, current);
  if (!original) throw new Error(`${actionName}: original proposal version missing`);
  return { current, original };
}

/** The immutable "as generated" version a draft's edits are measured from: for a Reasoner draft the version its
 * own job generated (a revision is a later version of the same program); otherwise version 1. */
async function originalForDraft(workspaceId: string, draft: { programId: string; content: UniversalTrainingProgramContent }) {
  const jobId = draft.content.reasonerProvenance?.jobId;
  if (jobId && !draft.content.clientFacingFrom) {
    const generated = await getGeneratedVersionForJob(workspaceId, draft.programId, jobId);
    if (generated) return generated;
  }
  return getOriginalProposalVersion(workspaceId, draft.programId);
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
  // One pending proposal per client: a second click (or tab) must not create
  // a parallel proposal family that later resurfaces after a rejection.
  const existing = await getPendingProgramProposal(params.workspaceId, params.clientProfileId);
  if (existing) throw new Error("This client already has a pending proposal. Approve or reject it before generating another.");
  const { content } = await generateUniversalProgramProposalContent({ ...params, coachId: ctx.userId });
  return createDraftProgramVersion({ workspaceId: params.workspaceId, title: params.title, content, proposedForClientProfileId: params.clientProfileId });
}

// ---------------------------------------------------------------------------
// Gate 4.0C-4 — Fitness Reasoner proposals (controlled rollout).
//
// Same authority, prerequisites and one-pending-proposal rule as
// createProgramProposalAction; the difference is WHO prepares the draft and
// WHEN: the Reasoner runs in the background (after()), the coach's request
// returns immediately, and the result is a DRAFT in the existing review /
// approve lifecycle. No publish, no assignment, no fallback planner.
// ---------------------------------------------------------------------------

export type ReasonerProposalRequestResult =
  | { ok: true; started: boolean; job: ReasonerJobView }
  | { ok: false; reason: "not_enabled" | "prerequisites" | "pending_proposal"; message: string; missing?: MissingPrerequisite[] };

/** Whether the Reasoner path is enabled for this client (server-side allowlist). Authorized read. */
export async function getReasonerProposalAvailabilityAction(params: { workspaceId: string; clientProfileId: string }): Promise<{ enabled: boolean; job: ReasonerJobView | null }> {
  await requireAssignedCoachAuthority(params.workspaceId, params.clientProfileId);
  if (!isReasonerProposalEnabled(params.clientProfileId)) return { enabled: false, job: null };
  return { enabled: true, job: await getLatestReasonerJob(params.workspaceId, params.clientProfileId) };
}

/** Polling read for the coach's workspace while a job prepares. */
export async function getReasonerJobAction(params: { workspaceId: string; clientProfileId: string }): Promise<ReasonerJobView | null> {
  await requireAssignedCoachAuthority(params.workspaceId, params.clientProfileId);
  if (!isReasonerProposalEnabled(params.clientProfileId)) return null;
  return getLatestReasonerJob(params.workspaceId, params.clientProfileId);
}

export async function requestReasonerProposalAction(params: { workspaceId: string; clientProfileId: string; title: string }): Promise<ReasonerProposalRequestResult> {
  const ctx = await requireAssignedCoachAuthority(params.workspaceId, params.clientProfileId);
  if (!isReasonerProposalEnabled(params.clientProfileId)) return { ok: false, reason: "not_enabled", message: "OPTIM's reasoner isn't enabled for this client." };
  const title = params.title.trim().slice(0, 120) || "Training program";
  const { prerequisites } = await resolveGenerationContext(params.workspaceId, params.clientProfileId);
  if (!prerequisites.ready) return { ok: false, reason: "prerequisites", message: "Before OPTIM can prepare a proposal:", missing: prerequisites.missing };
  if (await getPendingProgramProposal(params.workspaceId, params.clientProfileId)) return { ok: false, reason: "pending_proposal", message: "This client already has a pending proposal. Approve or reject it before preparing another." };

  // Gate 4.0C-5 — the job records the planning state it was started for (a result solved under another state is never saved).
  const { state } = await planningContextFor(params.clientProfileId);
  const { started, job } = await startReasonerGeneration({ workspaceId: params.workspaceId, clientProfileId: params.clientProfileId, coachId: ctx.userId, title, intent: { planningKey: state.key, trigger: "initial" } });
  return { ok: true, started, job };
}

export interface ProgramProposalReviewView {
  versionId: string;
  programId: string;
  versionNumber: number;
  /** True once at least one real edit has been saved — the review UI uses
   * this to show "edited" rather than "as generated." */
  wasEdited: boolean;
  content: UniversalTrainingProgramContent;
  /** Non-blocking, computed across the WHOLE proposal (every week, not
   * just week 1 — spec section 20) — see
   * lib/training/program-proposal-editing.ts's findRestrictionConflicts
   * doc: coach authority remains final, but the coach must never be left
   * unable to see an active restriction anywhere in the proposal. */
  restrictionWarnings: string[];
  /** Phase 8D — one real, readable line per accumulated change so far,
   * computed by diffing the immutable original proposal against the
   * current draft (spec section 15: "3 changes: ..."). Empty when nothing
   * has been edited yet. */
  changesSummary: string[];
  /** Phase 10A — real, historically-accurate rule provenance resolved from
   * this exact proposal's own frozen appliedLearnedRuleIds (never from
   * "whichever rules are active now" — see lib/training/types.ts's own
   * doc on the field). Empty whenever the proposal carries no provenance
   * (legacy content, or a coach/client with no applicable rules at
   * generation time) — never fabricated. */
  appliedRuleProvenance: LearnedRuleProvenance[];
  /** False for a fresh-generation proposal with no verified generation
   * inputs (made before these checks, or from placeholders): it cannot be
   * approved and must be rejected and regenerated. Always true for an
   * adjustment proposal, which is checked against the active plan instead. */
  inputsVerified: boolean;
  /** A deliberately narrow, bounded subset — see lib/training/types.ts's
   * methodologyConflictedLearnedRuleIds doc: only the one skip reason
   * that's materially coach-meaningful ("this would have applied but your
   * explicit setup took priority"). */
  methodologyConflictedRuleProvenance: LearnedRuleProvenance[];
  /** Gate 3 — set when this draft was prepared under a method version that
   * isn't the client's primary coach's active one (or before Gate 3). Such
   * a draft can't be approved; it must be rejected and regenerated. */
  methodStaleMessage: string | null;
  /** Gate 4.0C-4 — review model + approval gate for a Reasoner-prepared draft (null otherwise). */
  reasonerReview: ReasonerReviewModel | null;
  /** Whether OPTIM may make a (paid) repair-reasoning call for this draft — off unless enabled server-side. */
  repairReasoningEnabled: boolean;
  /** Gate 4.0C-5 — the latest Reasoner job when it concerns this draft's lineage (a revision preparing / failed /
   * needing input), so the review can show it. */
  revisionJob: ReasonerJobView | null;
}

/** Step 2: the coach's review surface reads this. Returns null when there
 * is no pending proposal for this client (nothing to review right now). */
export async function getProgramProposalForReviewAction(params: { workspaceId: string; clientProfileId: string }): Promise<ProgramProposalReviewView | null> {
  await requireAssignedCoachAuthority(params.workspaceId, params.clientProfileId);
  const pending = await getPendingProgramProposal(params.workspaceId, params.clientProfileId);
  if (!pending) return null;

  const profile = await resolveClientProgrammingProfile(params.workspaceId, params.clientProfileId);
  // Gate 3 — the client's primary coach's confirmed method (no Brain → no
  // coach-avoided exercises to add; nothing is filled in from defaults).
  const intelligence = await resolveCoachIntelligenceForClient({ workspaceId: params.workspaceId, clientProfileId: params.clientProfileId });
  const methodModel = intelligence.method?.operatingModel ?? null;
  const avoidedTerms = profile && methodModel ? avoidedTermsForProfile(profile, methodModel) : methodModel ? [...methodModel.programArchitecture.exercisesAvoided] : [];
  const staleness = methodDraftStaleness(draftMethodVersionIdOf(pending.content), intelligence.method?.versionId ?? null);

  // Gate 4.0C-5 — a revision is the next version of the same program: "the original" is the version ITS job generated.
  const original = await originalForDraft(params.workspaceId, pending);
  const changesSummary = original ? diffProgramProposal(original.content, pending.content).map(describeProgramDiffEntry) : [];
  const rp = pending.content.reasonerProvenance;
  const latestJob = rp ? await getLatestReasonerJob(params.workspaceId, params.clientProfileId).catch(() => null) : null;
  const revisionJob = latestJob && latestJob.outcome.intent?.supersedesJobId === rp?.jobId && latestJob.programVersionId === null ? latestJob : null;

  // Phase 10A — resolved from THIS proposal's own frozen ids, never
  // re-derived from current rule state (spec section 18/41). A failure
  // here degrades to no provenance shown, never blocks the review surface
  // (spec section 34) — getLearnedRuleProvenance already swallows its own
  // errors internally.
  const appliedIds = pending.content.appliedLearnedRuleIds ?? [];
  const methodologyConflictedIds = pending.content.methodologyConflictedLearnedRuleIds ?? [];
  const [appliedRuleProvenance, methodologyConflictedRuleProvenance] = await Promise.all([getLearnedRuleProvenance(appliedIds), getLearnedRuleProvenance(methodologyConflictedIds)]);

  return {
    versionId: pending.versionId,
    programId: pending.programId,
    versionNumber: pending.versionNumber,
    wasEdited: !!original && original.versionId !== pending.versionId,
    content: pending.content,
    restrictionWarnings: findRestrictionConflicts(pending.content, avoidedTerms),
    changesSummary,
    appliedRuleProvenance,
    inputsVerified: !!pending.content.adjustmentProvenance || hasVerifiedGenerationInputs(pending.content),
    methodStaleMessage: staleness.stale ? staleness.message : null,
    methodologyConflictedRuleProvenance,
    reasonerReview: pending.content.reasonerProvenance
      ? reasonerReviewModel({
          content: pending.content,
          run: await getReasonerRunForJob(params.workspaceId, pending.content.reasonerProvenance.jobId),
          knowledge: FOUNDATION_KNOWLEDGE,
          original: original?.content ?? null,
          // A read failure shows the draft against its own snapshot; approval re-loads and fails closed.
          current: await planningContextFor(params.clientProfileId).then((c) => c.current).catch(() => null),
        })
      : null,
    repairReasoningEnabled: !!pending.content.reasonerProvenance && isRepairReasoningEnabled(),
    revisionJob,
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
export async function editProgramProposalItemAction(params: { workspaceId: string; clientProfileId: string; versionId: string; path: TrainingItemPath; patch: TrainingItemPatch }): Promise<{ versionId: string }> {
  const ctx = await requireAssignedCoachAuthority(params.workspaceId, params.clientProfileId);
  const { current, original } = await loadDraftAndOriginal(params.workspaceId, params.versionId, "editProgramProposalItemAction");

  const beforeItem = locateTrainingItem(current.content, params.path);
  if (!beforeItem) throw new Error("editProgramProposalItemAction: no item at that path");

  const patchedContent = applyTrainingItemPatch(current.content, params.path, params.patch);
  const { versionId: newVersionId, changed } = await saveProposalDraft({ workspaceId: params.workspaceId, clientProfileId: params.clientProfileId, current, nextContent: patchedContent });
  if (!changed) return { versionId: newVersionId };

  const originalItem = locateTrainingItem(original.content, params.path);
  if (originalItem) {
    const deltas = diffProgramProposal(original.content, patchedContent).filter(
      (d): d is Extract<typeof d, { kind: "field" }> =>
        d.kind === "field" && d.weekNumber === params.path.weekNumber && d.dayOfWeek === params.path.dayOfWeek && d.sessionIndex === params.path.sessionIndex && d.blockId === params.path.blockId && d.itemId === params.path.itemId
    );
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

  return { versionId: newVersionId };
}

/** Removes one proposed item outright — "at minimum, removal/replacement
 * should be practical" (spec section 9). Records a real, immediate
 * rejection of that one item (never a fabricated replacement). */
export async function removeProgramProposalItemAction(params: { workspaceId: string; clientProfileId: string; versionId: string; path: TrainingItemPath }): Promise<{ versionId: string }> {
  const ctx = await requireAssignedCoachAuthority(params.workspaceId, params.clientProfileId);
  const { current } = await loadDraftAndOriginal(params.workspaceId, params.versionId, "removeProgramProposalItemAction");
  const located = locateTrainingItem(current.content, params.path);
  if (!located) throw new Error("removeProgramProposalItemAction: no item at that path");

  const nextContent = removeTrainingItem(current.content, params.path);
  const { versionId: newVersionId, changed } = await saveProposalDraft({ workspaceId: params.workspaceId, clientProfileId: params.clientProfileId, current, nextContent });
  if (!changed) return { versionId: newVersionId };

  try {
    await recordDecisionEvidence(
      projectItemRemovedDecision({ workspaceId: params.workspaceId, coachUserId: ctx.userId, clientProfileId: params.clientProfileId, editedVersionId: newVersionId, path: params.path, exerciseName: located.item.name, decidedAtIso: new Date().toISOString() })
    );
  } catch (evidenceError) {
    console.error(`removeProgramProposalItemAction: decision evidence projection failed (canonical removal already saved): ${evidenceError instanceof Error ? evidenceError.message : String(evidenceError)}`);
  }
  return { versionId: newVersionId };
}

/** Adds one new, coach-authored exercise to a session — a bounded
 * addition (real minimal defaults, immediately editable via the standard
 * per-item form), never a blank-canvas builder (spec section 9/26). Lands
 * as its own new block, matching real generated content's own one-
 * exercise-per-block shape (see lib/training/program-proposal-editing.ts's
 * addTrainingItem doc) — never merged into an existing exercise's block as
 * an unintended superset. */
export async function addProgramProposalItemAction(params: { workspaceId: string; clientProfileId: string; versionId: string; sessionPath: SessionPath; name: string; category: "resistance" | "continuous" }): Promise<{ versionId: string }> {
  const ctx = await requireAssignedCoachAuthority(params.workspaceId, params.clientProfileId);
  const { current } = await loadDraftAndOriginal(params.workspaceId, params.versionId, "addProgramProposalItemAction");
  const week = current.content.weeks.find((w) => w.weekNumber === params.sessionPath.weekNumber);
  const day = week?.days.find((d) => d.dayOfWeek === params.sessionPath.dayOfWeek);
  const session = day?.sessions?.[params.sessionPath.sessionIndex];
  if (!session) throw new Error("addProgramProposalItemAction: no session at that path");

  const newItem = buildCoachAuthoredItem({ dayOfWeek: params.sessionPath.dayOfWeek, order: session.blocks.length + 1, name: params.name, category: params.category });
  const nextContent = addTrainingItem(current.content, params.sessionPath, newItem);
  const { versionId: newVersionId, changed } = await saveProposalDraft({ workspaceId: params.workspaceId, clientProfileId: params.clientProfileId, current, nextContent });
  if (!changed) return { versionId: newVersionId };

  const path: TrainingItemPath = { ...params.sessionPath, blockId: `block-${newItem.id}`, itemId: newItem.id };
  try {
    await recordDecisionEvidence(
      projectItemAddedDecision({ workspaceId: params.workspaceId, coachUserId: ctx.userId, clientProfileId: params.clientProfileId, editedVersionId: newVersionId, path, exerciseName: newItem.name, category: params.category, decidedAtIso: new Date().toISOString() })
    );
  } catch (evidenceError) {
    console.error(`addProgramProposalItemAction: decision evidence projection failed (canonical addition already saved): ${evidenceError instanceof Error ? evidenceError.message : String(evidenceError)}`);
  }
  return { versionId: newVersionId };
}

/** Move-up/move-down reordering within a single block — meaningful only
 * for a real multi-item block (a coach-authored superset/circuit); every
 * block generation itself produces holds exactly one item. No decision
 * evidence: reordering changes no value, only sequence, and order-
 * preference evidence is a separate, undecided modeling question this
 * phase does not resolve (see this phase's completion report). */
export async function moveProgramProposalItemAction(params: { workspaceId: string; clientProfileId: string; versionId: string; path: TrainingItemPath; direction: "up" | "down" }): Promise<{ versionId: string }> {
  await requireAssignedCoachAuthority(params.workspaceId, params.clientProfileId);
  const { current } = await loadDraftAndOriginal(params.workspaceId, params.versionId, "moveProgramProposalItemAction");
  const nextContent = moveTrainingItem(current.content, params.path, params.direction);
  const { versionId } = await saveProposalDraft({ workspaceId: params.workspaceId, clientProfileId: params.clientProfileId, current, nextContent });
  return { versionId };
}

/** Move-up/move-down reordering of a whole exercise (its block) within a
 * session — the practical "reorder exercises" control for real content,
 * since a real generated resistance session places one exercise per block
 * (see lib/training/program-proposal-editing.ts's moveBlock doc). Same
 * no-evidence-for-reordering rationale as moveProgramProposalItemAction. */
export async function moveProgramProposalBlockAction(params: { workspaceId: string; clientProfileId: string; versionId: string; path: BlockPath; direction: "up" | "down" }): Promise<{ versionId: string }> {
  await requireAssignedCoachAuthority(params.workspaceId, params.clientProfileId);
  const { current } = await loadDraftAndOriginal(params.workspaceId, params.versionId, "moveProgramProposalBlockAction");
  const nextContent = moveBlock(current.content, params.path, params.direction);
  const { versionId } = await saveProposalDraft({ workspaceId: params.workspaceId, clientProfileId: params.clientProfileId, current, nextContent });
  return { versionId };
}

/** Phase 11B — edits a BLOCK's own fields (round count, round/item rest,
 * name, time cap) — real circuit editing, spec section 26. Never touches
 * the block's items (see applyBlockPatch's own doc). Same no-evidence
 * posture as moveProgramProposalBlockAction above: diffProgramProposal
 * only understands ITEM-level field deltas today, not block-level ones —
 * a real, documented limitation (see this phase's own completion report),
 * not an oversight; the edit itself still persists safely and correctly
 * either way. */
export async function editProgramProposalBlockAction(params: { workspaceId: string; clientProfileId: string; versionId: string; path: BlockPath; patch: BlockPatch }): Promise<{ versionId: string }> {
  await requireAssignedCoachAuthority(params.workspaceId, params.clientProfileId);
  const { current } = await loadDraftAndOriginal(params.workspaceId, params.versionId, "editProgramProposalBlockAction");
  const nextContent = applyBlockPatch(current.content, params.path, params.patch);
  const { versionId } = await saveProposalDraft({ workspaceId: params.workspaceId, clientProfileId: params.clientProfileId, current, nextContent });
  return { versionId };
}

/** Renames a session (cosmetic, bounded — never touches actual prescribed
 * content). */
export async function renameProgramProposalSessionAction(params: { workspaceId: string; clientProfileId: string; versionId: string; path: SessionPath; name: string }): Promise<{ versionId: string }> {
  const ctx = await requireAssignedCoachAuthority(params.workspaceId, params.clientProfileId);
  const { current } = await loadDraftAndOriginal(params.workspaceId, params.versionId, "renameProgramProposalSessionAction");
  const week = current.content.weeks.find((w) => w.weekNumber === params.path.weekNumber);
  const day = week?.days.find((d) => d.dayOfWeek === params.path.dayOfWeek);
  const session = day?.sessions?.[params.path.sessionIndex];
  if (!session) throw new Error("renameProgramProposalSessionAction: no session at that path");
  const fromName = session.name;

  const nextContent = renameSession(current.content, params.path, params.name);
  const { versionId: newVersionId, changed } = await saveProposalDraft({ workspaceId: params.workspaceId, clientProfileId: params.clientProfileId, current, nextContent });
  if (!changed) return { versionId: newVersionId };

  try {
    await recordDecisionEvidence(
      projectSessionRenamedDecision({ workspaceId: params.workspaceId, coachUserId: ctx.userId, clientProfileId: params.clientProfileId, editedVersionId: newVersionId, path: params.path, fromName, toName: params.name, decidedAtIso: new Date().toISOString() })
    );
  } catch (evidenceError) {
    console.error(`renameProgramProposalSessionAction: decision evidence projection failed (canonical rename already saved): ${evidenceError instanceof Error ? evidenceError.message : String(evidenceError)}`);
  }
  return { versionId: newVersionId };
}

/** Converts a scheduled training day into a real, honest rest day — one
 * direction only (see lib/training/program-proposal-editing.ts's own doc
 * for why the reverse isn't supported: it would require synthesizing real
 * prescriptions from nothing, which is generation infrastructure, not an
 * edit). */
export async function convertProgramProposalDayToRestAction(params: { workspaceId: string; clientProfileId: string; versionId: string; weekNumber: number; dayOfWeek: DayOfWeek }): Promise<{ versionId: string }> {
  const ctx = await requireAssignedCoachAuthority(params.workspaceId, params.clientProfileId);
  const { current } = await loadDraftAndOriginal(params.workspaceId, params.versionId, "convertProgramProposalDayToRestAction");
  const nextContent = convertTrainingDayToRest(current.content, params.weekNumber, params.dayOfWeek);
  const { versionId: newVersionId, changed } = await saveProposalDraft({ workspaceId: params.workspaceId, clientProfileId: params.clientProfileId, current, nextContent });
  if (!changed) return { versionId: newVersionId };

  try {
    await recordDecisionEvidence(
      projectDayConvertedToRestDecision({ workspaceId: params.workspaceId, coachUserId: ctx.userId, clientProfileId: params.clientProfileId, editedVersionId: newVersionId, weekNumber: params.weekNumber, dayOfWeek: params.dayOfWeek, decidedAtIso: new Date().toISOString() })
    );
  } catch (evidenceError) {
    console.error(`convertProgramProposalDayToRestAction: decision evidence projection failed (canonical conversion already saved): ${evidenceError instanceof Error ? evidenceError.message : String(evidenceError)}`);
  }
  return { versionId: newVersionId };
}

/** Step 3b: APPROVE — publishes and assigns whichever draft the coach is
 * actually approving (the original, unedited proposal, or the latest
 * edited draft), through the SAME unchanged canonical publish/assign
 * lifecycle every prior phase already relies on. Records exactly one
 * program-level decision-evidence entry, keyed to the ORIGINAL proposal's
 * identity so a retry never duplicates it. */
/** Gate 4.0C-4 — the coach's explicit resolution of one BLOCKING review decision on a Reasoner
 * draft: keep the exercise under the stated conditions, or remove it from every week. Persisted
 * as a NEW draft version carrying the resolution record (who, when, what) — version history is
 * the audit trail. Never publishes or approves anything. */
export async function resolveReasonerFitDecisionAction(params: { workspaceId: string; clientProfileId: string; versionId: string; decisionKey: string; resolution: "accept" | "remove" }): Promise<{ versionId: string }> {
  const ctx = await requireAssignedCoachAuthority(params.workspaceId, params.clientProfileId);
  const { current } = await loadDraftAndOriginal(params.workspaceId, params.versionId, "resolveReasonerFitDecisionAction");
  const pending = await getPendingProgramProposal(params.workspaceId, params.clientProfileId);
  if (!pending || pending.versionId !== current.versionId) throw new Error("This proposal changed since you opened it — refresh and try again.");
  const rp = current.content.reasonerProvenance;
  if (!rp) throw new Error("resolveReasonerFitDecisionAction: not a Reasoner proposal");
  const review = reasonerReviewModel({ content: current.content, run: await getReasonerRunForJob(params.workspaceId, rp.jobId), knowledge: FOUNDATION_KNOWLEDGE, current: (await planningContextFor(params.clientProfileId)).current });
  const decision = review.decisions.find((d) => d.key === params.decisionKey);
  if (!decision || decision.status !== "unresolved") throw new Error("That decision is already resolved.");
  // Confirmed restrictions are authoritative: an exercise that conflicts with them can't be kept — remove or replace it
  // (or change the confirmed restrictions themselves).
  if (params.resolution === "accept" && decision.fit === "incompatible") throw new Error(`${decision.exerciseName} conflicts with the client's confirmed restrictions — remove or replace it.`);
  let next = current.content;
  if (params.resolution === "remove") {
    const removed = removeExerciseEverywhere(next, decision.exerciseName);
    if (!removed.ok) throw new Error(removed.message);
    next = removed.content;
  }
  // Gate 4.0C-5 — the decision is AUTHORITATIVE planning state first (an exclusion, or a clearance under exactly
  // these conditions), so no future proposal re-decides it; custom exercises (not in knowledge) stay draft-level.
  if (decision.fit !== "unverifiable") {
    const recorded = await recordExerciseFitDecisions({ workspaceId: params.workspaceId, clientProfileId: params.clientProfileId, decisions: [{ exerciseId: decision.exerciseId, verdict: params.resolution === "remove" ? "excluded" : "cleared", source: { kind: "proposal_review", jobId: rp.jobId, versionId: current.versionId, decisionKey: decision.key } }] });
    if (!recorded.ok) throw new Error(recorded.errors.join(" "));
  }
  const nowIso = new Date().toISOString();
  next = {
    ...next,
    reasonerProvenance: { ...next.reasonerProvenance!, decisionResolutions: [...(rp.decisionResolutions ?? []), { key: decision.key, exerciseId: decision.exerciseId, exerciseName: decision.exerciseName, resolution: params.resolution === "remove" ? "removed" : "accepted_with_conditions", conditions: params.resolution === "accept" ? decision.conditions : [], ...(params.resolution === "accept" ? { fitBasis: decision.fitBasis } : {}), resolvedBy: ctx.userId, resolvedAtIso: nowIso }] },
    updatedAtIso: nowIso,
  };
  const saved = await saveProposalDraft({ workspaceId: params.workspaceId, clientProfileId: params.clientProfileId, current: { programId: current.programId, content: current.content, versionId: current.versionId }, nextContent: next });
  // The coach's explicit decision authorizes ONE revision if it supersedes the draft (e.g. removing an exercise the
  // plan was built around left it short). A removal the plan absorbs stays a local edit.
  if (params.resolution === "remove") await queueRevisionQuietly({ workspaceId: params.workspaceId, clientProfileId: params.clientProfileId, coachId: ctx.userId, trigger: "fit_decision" });
  return { versionId: saved.versionId };
}

/** Never lets a revision-queue problem undo the coach's (already saved) decision. */
async function queueRevisionQuietly(p: Parameters<typeof queueRevisionIfMaterial>[0]): Promise<RevisionQueueResult | null> {
  try {
    return await queueRevisionIfMaterial(p);
  } catch (err) {
    console.error(`queueRevisionIfMaterial failed (decision already saved): ${err instanceof Error ? err.name : "unknown"}`);
    return null;
  }
}

/** Gate 4.0C-5 — confirms a draft-only (pre-4.0C-5) fit decision as authoritative planning state: "removed" becomes
 * a confirmed exclusion, "kept under conditions" a clearance. An explicit coach confirmation — if it supersedes the
 * draft, ONE revision is prepared from the current state. Nothing is approved or published. */
export async function confirmDraftFitDecisionAction(params: { workspaceId: string; clientProfileId: string; versionId: string; decisionKey: string }): Promise<{ revision: "queued" | "not_needed" | "already_prepared" | "in_flight" | "unavailable" }> {
  const ctx = await requireAssignedCoachAuthority(params.workspaceId, params.clientProfileId);
  const { current } = await loadDraftAndOriginal(params.workspaceId, params.versionId, "confirmDraftFitDecisionAction");
  const pending = await getPendingProgramProposal(params.workspaceId, params.clientProfileId);
  if (!pending || pending.versionId !== current.versionId) throw new Error("This proposal changed since you opened it — refresh and try again.");
  const rp = current.content.reasonerProvenance;
  if (!rp) throw new Error("confirmDraftFitDecisionAction: not a Reasoner proposal");
  const review = reasonerReviewModel({ content: current.content, run: await getReasonerRunForJob(params.workspaceId, rp.jobId), knowledge: FOUNDATION_KNOWLEDGE, current: (await planningContextFor(params.clientProfileId)).current });
  const decision = review.decisions.find((d) => d.key === params.decisionKey);
  if (!decision || decision.authoritative || (decision.status !== "removed" && decision.status !== "accepted_with_conditions") || decision.fit === "unverifiable") throw new Error("That decision doesn't need confirming.");
  const recorded = await recordExerciseFitDecisions({ workspaceId: params.workspaceId, clientProfileId: params.clientProfileId, decisions: [{ exerciseId: decision.exerciseId, verdict: decision.status === "removed" ? "excluded" : "cleared", source: { kind: "legacy_draft_decision", jobId: rp.jobId, versionId: current.versionId, decisionKey: decision.key } }] });
  if (!recorded.ok) throw new Error(recorded.errors.join(" "));
  return { revision: revisionOutcome(await queueRevisionQuietly({ workspaceId: params.workspaceId, clientProfileId: params.clientProfileId, coachId: ctx.userId, trigger: "fit_decision" })) };
}

const revisionOutcome = (r: RevisionQueueResult | null): "queued" | "not_needed" | "already_prepared" | "in_flight" | "unavailable" => (!r ? "unavailable" : r.queued ? "queued" : r.reason === "already_prepared" || r.reason === "already_attempted" ? "already_prepared" : r.reason === "in_flight" ? "in_flight" : r.reason === "not_material" ? "not_needed" : "unavailable");

/** Gate 4.0C-5 — the coach's explicit fit decisions about specific exercises (preflight questions, or exercises
 * OPTIM withheld as uncertain). Answering a preflight authorizes ONE proposal for the new state; clearing a withheld
 * exercise only makes a better plan possible (the coach asks for the revision explicitly). */
export async function recordExerciseFitDecisionsAction(params: { workspaceId: string; clientProfileId: string; context: "preflight" | "withheld"; decisions: Array<{ exerciseId: string; verdict: "excluded" | "cleared" }> }): Promise<{ ok: true; generation: "queued" | "not_needed" } | { ok: false; errors: string[] }> {
  const ctx = await requireAssignedCoachAuthority(params.workspaceId, params.clientProfileId);
  const decisions: ExerciseFitDecisionInput[] = params.decisions.map((d) => ({ exerciseId: d.exerciseId, verdict: d.verdict === "excluded" ? "excluded" : "cleared", source: { kind: params.context === "preflight" ? "preflight" : "proposal_review" } }));
  const recorded = await recordExerciseFitDecisions({ workspaceId: params.workspaceId, clientProfileId: params.clientProfileId, decisions });
  if (!recorded.ok) return recorded;
  if (params.context !== "preflight") return { ok: true, generation: "not_needed" };
  try {
    const q = await queueAfterPreflightAnswers({ workspaceId: params.workspaceId, clientProfileId: params.clientProfileId, coachId: ctx.userId });
    return { ok: true, generation: q.queued ? "queued" : "not_needed" };
  } catch (err) {
    console.error(`queueAfterPreflightAnswers failed (decisions already saved): ${err instanceof Error ? err.name : "unknown"}`);
    return { ok: true, generation: "not_needed" };
  }
}

/** Equipment specificity — the coach answers whether the client has a specific machine/apparatus ("unknown" returns it
 * to unanswered). A confirmation that supersedes the draft (a planned exercise's equipment is absent) prepares ONE
 * revision; one that only makes more exercises usable leaves the draft valid (a better plan may be possible — the
 * coach asks for it). */
export async function confirmClientEquipmentAction(params: { workspaceId: string; clientProfileId: string; apparatus: string; state: "available" | "unavailable" | "unknown" }): Promise<{ ok: true; revision: "queued" | "not_needed" | "already_prepared" | "in_flight" | "unavailable" } | { ok: false; message: string }> {
  const ctx = await requireAssignedCoachAuthority(params.workspaceId, params.clientProfileId);
  const saved = await setConfirmedApparatus({ workspaceId: params.workspaceId, clientProfileId: params.clientProfileId, coachUserId: ctx.userId, changes: { [params.apparatus]: params.state } });
  if (!saved.ok) return saved;
  return { ok: true, revision: revisionOutcome(await queueRevisionQuietly({ workspaceId: params.workspaceId, clientProfileId: params.clientProfileId, coachId: ctx.userId, trigger: "equipment_confirmed" })) };
}

/** Gate 4.0C-5 — the coach explicitly asks for a revision of a superseded (or improvable) draft: ONE Reasoner call
 * from the current state. Never repeats while one is preparing or after one is ready for this state. */
export async function requestRevisionAction(params: { workspaceId: string; clientProfileId: string }): Promise<{ revision: "queued" | "not_needed" | "already_prepared" | "in_flight" | "unavailable" }> {
  const ctx = await requireAssignedCoachAuthority(params.workspaceId, params.clientProfileId);
  return { revision: revisionOutcome(await queueRevisionIfMaterial({ workspaceId: params.workspaceId, clientProfileId: params.clientProfileId, coachId: ctx.userId, trigger: "coach_requested" })) };
}

/** Gate 4.0C-5 — the coach explicitly accepts the program's current-state limitations/gaps (the exact set shown).
 * Persisted on a new draft version; reopens if the findings change. */
export async function acceptPlanAdequacyAction(params: { workspaceId: string; clientProfileId: string; versionId: string; decisionKey: string }): Promise<{ versionId: string }> {
  const ctx = await requireAssignedCoachAuthority(params.workspaceId, params.clientProfileId);
  const { current, original } = await loadDraftAndOriginal(params.workspaceId, params.versionId, "acceptPlanAdequacyAction");
  const pending = await getPendingProgramProposal(params.workspaceId, params.clientProfileId);
  if (!pending || pending.versionId !== current.versionId) throw new Error("This proposal changed since you opened it — refresh and try again.");
  const rp = current.content.reasonerProvenance;
  if (!rp) throw new Error("acceptPlanAdequacyAction: not a Reasoner proposal");
  const review = reasonerReviewModel({ content: current.content, run: await getReasonerRunForJob(params.workspaceId, rp.jobId), knowledge: FOUNDATION_KNOWLEDGE, original: original.content, current: (await planningContextFor(params.clientProfileId)).current });
  const a = review.adequacy;
  if (!a || a.key !== params.decisionKey) throw new Error("That decision no longer applies — refresh to see the current state.");
  if (a.status !== "unresolved") throw new Error("That decision is already resolved.");
  if (review.lifecycle?.status === "superseded") throw new Error("This proposal is superseded by the client's current state — review the revision instead.");
  const nowIso = new Date().toISOString();
  const next = { ...current.content, reasonerProvenance: { ...rp, decisionResolutions: [...(rp.decisionResolutions ?? []), { key: a.key, exerciseId: "", exerciseName: "", resolution: "accepted_limitation" as const, adequacySignature: a.signature, limitations: [...a.limitations, ...a.deficiencies].map((f) => f.message), conditions: [], resolvedBy: ctx.userId, resolvedAtIso: nowIso }] }, updatedAtIso: nowIso };
  const saved = await saveProposalDraft({ workspaceId: params.workspaceId, clientProfileId: params.clientProfileId, current: { programId: current.programId, content: current.content, versionId: current.versionId }, nextContent: next });
  return { versionId: saved.versionId };
}


/** Loads everything post-edit reasoning needs for the CURRENT pending Reasoner draft, refusing stale views. */
async function loadIntegrityContext(params: { workspaceId: string; clientProfileId: string; versionId: string; decisionKey: string }, needMethod: boolean) {
  const { current, original } = await loadDraftAndOriginal(params.workspaceId, params.versionId, "programIntegrity");
  const pending = await getPendingProgramProposal(params.workspaceId, params.clientProfileId);
  if (!pending || pending.versionId !== current.versionId) throw new Error("This proposal changed since you opened it — refresh and try again.");
  const rp = current.content.reasonerProvenance;
  if (!rp) throw new Error("programIntegrity: not a Reasoner proposal");
  const run = await getReasonerRunForJob(params.workspaceId, rp.jobId);
  const review = reasonerReviewModel({ content: current.content, run, knowledge: FOUNDATION_KNOWLEDGE, original: original.content, current: (await planningContextFor(params.clientProfileId)).current });
  if (review.lifecycle?.status === "superseded") throw new Error("This proposal is superseded by the client's current state — review the revision instead.");
  const integrity = review.integrity;
  if (!run || !integrity || integrity.key !== params.decisionKey) throw new Error("That decision no longer applies — refresh to see the current state.");
  if (integrity.status !== "unresolved") throw new Error("That decision is already resolved.");
  if (!needMethod) return { current, run, rp, integrity, method: null };
  // Coach ranges come from the method the plan was prepared under (approval also enforces this).
  const read = methodFor(await loadSynthesisInputForClient(params.clientProfileId));
  if (!read || !read.ok) throw new Error("Your coaching method can't be read right now.");
  if (run.versions.coachMethod?.versionId && read.method.versionId && run.versions.coachMethod.versionId !== read.method.versionId) throw new Error("Your coaching method changed since this proposal was prepared — reject it and prepare a new one.");
  return { current, run, rp, integrity, method: read.method };
}

/** Gate 4.0C-4 — explicit coach resolution of a POST-EDIT program-integrity consequence:
 *  "replace" adds a feasible alternative (OPTIM's recommendation or another feasible option) on its days in
 *  every week — the program is then re-analysed, so the decision clears only if the function is restored;
 *  "accept_tradeoff" records that the coach consciously accepts the reduced stimulus (with the exact
 *  deficiency, invalidated if the program gets worse). Both persist as a NEW draft version. */
export async function resolveProgramIntegrityAction(params: { workspaceId: string; clientProfileId: string; versionId: string; decisionKey: string; resolution: "replace" | "accept_tradeoff"; exerciseId?: string; fromRecommendation?: boolean }): Promise<{ versionId: string }> {
  const ctx = await requireAssignedCoachAuthority(params.workspaceId, params.clientProfileId);
  const { current, run, rp, integrity, method } = await loadIntegrityContext(params, params.resolution === "replace");
  const nowIso = new Date().toISOString();
  let next = current.content;
  let record: NonNullable<typeof rp.decisionResolutions>[number];
  if (params.resolution === "replace") {
    const candidate = integrity.analysis.candidates.find((c) => c.exerciseId === params.exerciseId);
    if (!candidate) throw new Error("That exercise isn't a feasible option under the client's confirmed restrictions.");
    const rec = integrity.recommendation?.recommendation;
    const m = method!;
    const replacement: Replacement = params.fromRecommendation && rec && rec.exerciseId === candidate.exerciseId ? { exerciseId: rec.exerciseId, days: rec.days as Replacement["days"], sets: rec.sets, reps: rec.reps, rir: rec.rir } : defaultReplacement({ analysis: integrity.analysis, candidate, run, method: m });
    const errors = checkReplacement({ replacement, candidates: integrity.analysis.candidates, method: m, current: current.content });
    if (errors.length) throw new Error(errors.join(" "));
    next = applyReplacement({ content: next, replacement, run, method: m, knowledge: FOUNDATION_KNOWLEDGE });
    record = { key: integrity.key, exerciseId: candidate.exerciseId, exerciseName: candidate.exerciseName, resolution: "accepted_replacement", conditions: candidate.conditions, replacement: { exerciseId: candidate.exerciseId, exerciseName: candidate.exerciseName, days: replacement.days, fromRecommendation: !!params.fromRecommendation }, resolvedBy: ctx.userId, resolvedAtIso: nowIso };
  } else {
    record = { key: integrity.key, exerciseId: "", exerciseName: integrity.analysis.causes.map((c) => c.exerciseName).join(", "), resolution: "accepted_tradeoff", conditions: [], tradeoff: integrity.analysis.deficiencies.map((d) => ({ dimension: `${d.dimension.kind}:${d.dimension.id}`, label: d.label, before: d.before, after: d.after, minAfter: d.minAfter })), resolvedBy: ctx.userId, resolvedAtIso: nowIso };
  }
  next = { ...next, reasonerProvenance: { ...next.reasonerProvenance!, decisionResolutions: [...(rp.decisionResolutions ?? []), record] }, updatedAtIso: nowIso };
  const saved = await saveProposalDraft({ workspaceId: params.workspaceId, clientProfileId: params.clientProfileId, current: { programId: current.programId, content: current.content, versionId: current.versionId }, nextContent: next });
  return { versionId: saved.versionId };
}

/** Gate 4.0C-4 — asks the Fitness Reasoner for a constrained repair recommendation for the current
 * program-integrity consequence (ONE model call; disabled unless OPTIM_REASONER_REPAIR_ENABLED). The
 * answer is validated deterministically and stored on a new draft version as a coach-reviewable
 * recommendation — never applied, never a resolution. */
export async function requestRepairRecommendationAction(params: { workspaceId: string; clientProfileId: string; versionId: string; decisionKey: string }): Promise<{ versionId: string }> {
  const ctx = await requireAssignedCoachAuthority(params.workspaceId, params.clientProfileId);
  if (!isRepairReasoningEnabled()) throw new Error("OPTIM's repair recommendations aren't enabled yet. Choose an option below or accept the reduced stimulus.");
  const { current, run, rp, integrity, method: maybeMethod } = await loadIntegrityContext(params, true);
  const method = maybeMethod!;
  if (integrity.recommendation) throw new Error("OPTIM already prepared a recommendation for this.");
  // Cost control: with no feasible option under the confirmed restrictions there is nothing to judge — no call.
  if (!integrity.analysis.candidates.length) throw new Error("No exercise in OPTIM's knowledge restores this within the client's confirmed restrictions — choose to accept the reduced stimulus, or edit the plan.");
  const model = await productionRepairModel();
  if (!model) throw new Error("OPTIM's repair recommendations aren't available right now.");
  const input = repairInput({ analysis: integrity.analysis, current: current.content, run, method, knowledge: FOUNDATION_KNOWLEDGE });
  let res;
  try {
    res = await model.generate({ systemPrompt: REPAIR_SYSTEM_PROMPT, userMessage: JSON.stringify(input), maxOutputTokens: 6000 });
  } catch {
    throw new Error("OPTIM couldn't prepare a recommendation right now. Nothing was changed — choose an option below or try again later.");
  }
  const parsed = parseRepairOutput(res.json);
  const checked = parsed.ok ? validateRepair({ output: parsed.output, analysis: integrity.analysis, method, current: current.content }) : { verdict: "no_confident_repair" as const, recommendation: null, rejected: [parsed.error] };
  const rec = checked.recommendation;
  const nowIso = new Date().toISOString();
  const record = {
    key: integrity.key,
    verdict: checked.verdict,
    rationale: parsed.ok ? parsed.output.rationale : "OPTIM's answer couldn't be used.",
    recommendation: rec ? { exerciseId: rec.exerciseId, exerciseName: FOUNDATION_KNOWLEDGE.getExercise(rec.exerciseId)?.name ?? rec.exerciseId, days: rec.days, sets: rec.sets, reps: rec.reps, rir: rec.rir, why: rec.why } : null,
    alternatives: parsed.ok ? parsed.output.alternatives.filter((a) => integrity.analysis.candidates.some((c) => c.exerciseId === a)) : [],
    tradeoff: parsed.ok ? parsed.output.tradeoff : null,
    rejected: checked.rejected,
    model: { provider: model.provider, modelId: model.modelId, promptVersion: REPAIR_PROMPT_VERSION, inputTokens: res.usage?.inputTokens ?? null, outputTokens: res.usage?.outputTokens ?? null, latencyMs: res.latencyMs ?? null },
    requestedBy: ctx.userId,
    createdAtIso: nowIso,
  };
  const next = { ...current.content, reasonerProvenance: { ...rp, repairRecommendations: [...(rp.repairRecommendations ?? []), record] }, updatedAtIso: nowIso };
  const saved = await saveProposalDraft({ workspaceId: params.workspaceId, clientProfileId: params.clientProfileId, current: { programId: current.programId, content: current.content, versionId: current.versionId }, nextContent: next });
  return { versionId: saved.versionId };
}

export async function approveProgramProposalAction(params: { workspaceId: string; clientProfileId: string; versionId: string }): Promise<{ assignmentId: string }> {
  const ctx = await requireAssignedCoachAuthority(params.workspaceId, params.clientProfileId);
  const approved = await getProgramProposalVersion(params.workspaceId, params.versionId);
  if (!approved || approved.status !== "draft") throw new Error("approveProgramProposalAction: no pending draft proposal at that version");
  const original = await originalForDraft(params.workspaceId, approved);
  if (!original) throw new Error("approveProgramProposalAction: original proposal version missing");

  // Phase 10B — an adjustment proposal (spec section 17/29) was built
  // against one exact active program version. If the client's real active
  // version has since changed (a different proposal was approved, or the
  // coach otherwise reassigned the client, in the time between proposal
  // creation and this approval), approving it now would silently apply a
  // change computed against a program the client is no longer even on —
  // never approve blindly against stale context. A fresh-generation
  // proposal (no adjustmentProvenance) has no such staleness concept and
  // is unaffected by this check.
  if (approved.content.adjustmentProvenance) {
    const currentActive = await getActiveProgramAssignment(params.clientProfileId);
    if (!currentActive || currentActive.versionId !== approved.content.adjustmentProvenance.activeProgramVersionId) {
      throw new Error("approveProgramProposalAction: this adjustment proposal was built against a program version that is no longer the client's active program — it is stale and cannot be approved. Reject it and let OPTIM re-evaluate against the current active program.");
    }
  }

  // A fresh-generation proposal must carry verified inputs AND its
  // prerequisites must still hold right now (the method could have been
  // unconfirmed or a health review opened since generation). Adjustment
  // proposals are bounded by the active-plan staleness check above.
  const { method, prerequisites } = await resolveGenerationContext(params.workspaceId, params.clientProfileId);
  if (!approved.content.adjustmentProvenance) {
    const gate = checkProposalApproval(approved.content, prerequisites);
    if (!gate.ok) throw new Error(gate.message);
  }
  // Gate 3 — never approve a draft as though it reflects the coach's
  // current method when it was prepared under a different (or no) method
  // version. Nothing is silently changed; the coach regenerates.
  const staleness = methodDraftStaleness(draftMethodVersionIdOf(approved.content), method?.versionId ?? null);
  if (staleness.stale) throw new Error(staleness.message);

  // Gate 4.0C-4 — a client-facing copy made at approval is never itself approvable.
  if (approved.content.clientFacingFrom) throw new Error("approveProgramProposalAction: approve the reviewed proposal, not its client copy.");
  // Gate 4.0C-4 — Reasoner drafts: every BLOCKING coach decision must have an explicit, persisted
  // resolution (approval is never an implicit one), and the client receives a client-facing version:
  // identical training, execution guidance only — no reasoning, review language or provenance.
  let publishVersionId = params.versionId;
  if (approved.content.reasonerProvenance) {
    const run = await getReasonerRunForJob(params.workspaceId, approved.content.reasonerProvenance.jobId);
    let current;
    try {
      current = (await planningContextFor(params.clientProfileId)).current;
    } catch {
      throw new Error("OPTIM couldn't load the client's current planning state, so it can't confirm this plan still fits it. Try again.");
    }
    // Gate 4.0C-5 — fails closed on a superseded draft, open fit / integrity / adequacy decisions, or a missing run.
    const review = reasonerReviewModel({ content: approved.content, run, knowledge: FOUNDATION_KNOWLEDGE, original: original.content, current });
    if (review.approvalBlockedReason) throw new Error(review.approvalBlockedReason);
    const clientContent = clientFacingProgramContent({ content: approved.content, reviewedVersionId: approved.versionId, knowledge: FOUNDATION_KNOWLEDGE, supportedSetup: supportedSetupNames(run, FOUNDATION_KNOWLEDGE), sideOnly: sideOnlyNames(run, FOUNDATION_KNOWLEDGE), nowIso: new Date().toISOString() });
    if (findClientCopyLeaks(clientContent).length) throw new Error("Some session names still contain internal planning notes. Rename those sessions, then approve.");
    const saved = await saveProposalDraft({ workspaceId: params.workspaceId, clientProfileId: params.clientProfileId, current: { programId: approved.programId, content: approved.content, versionId: approved.versionId }, nextContent: clientContent });
    publishVersionId = saved.versionId;
  }

  let assignmentId: string;
  try {
    await publishProgramVersion({ workspaceId: params.workspaceId, versionId: publishVersionId });
    assignmentId = await assignProgramVersionToClient({ workspaceId: params.workspaceId, clientProfileId: params.clientProfileId, versionId: publishVersionId });
  } catch (err) {
    // Never leave an orphaned client copy pending as "the proposal".
    if (publishVersionId !== params.versionId) await rejectProgramProposalVersion({ workspaceId: params.workspaceId, versionId: publishVersionId }).catch(() => undefined);
    throw err;
  }

  try {
    await archiveSiblingDraftVersions({ workspaceId: params.workspaceId, programId: approved.programId, resolvedVersionId: publishVersionId });
  } catch (cleanupError) {
    console.error(`approveProgramProposalAction: sibling draft cleanup failed (canonical approval already succeeded): ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`);
  }

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
        wasEdited: approved.versionId !== original.versionId,
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
/** Rejection never depends on the generation prerequisites (a confirmed
 * method or completed intake) — those govern generating and approving, not
 * clearing a proposal away. It never generates or activates anything. */
export async function rejectProgramProposalAction(params: { workspaceId: string; clientProfileId: string; versionId: string; reason?: string }): Promise<{ otherDraftsArchived: number }> {
  const ctx = await requireAssignedCoachAuthority(params.workspaceId, params.clientProfileId);
  const rejected = await getProgramProposalVersion(params.workspaceId, params.versionId);
  if (!rejected || rejected.status !== "draft") return { otherDraftsArchived: 0 }; // already decided (or gone) — a safe, idempotent no-op
  const original = await getOriginalProposalVersion(params.workspaceId, rejected.programId);
  if (!original) throw new Error("rejectProgramProposalAction: original proposal version missing");

  await rejectProgramProposalVersion({ workspaceId: params.workspaceId, versionId: params.versionId });

  try {
    await archiveSiblingDraftVersions({ workspaceId: params.workspaceId, programId: rejected.programId, resolvedVersionId: params.versionId });
  } catch (cleanupError) {
    console.error(`rejectProgramProposalAction: sibling draft cleanup failed (canonical rejection already succeeded): ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`);
  }

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

  // Clear any other unverified fresh-generation drafts for this client —
  // otherwise the next one surfaces as "the pending proposal" and the
  // rejection looks like it did nothing (the reported live failure).
  try {
    const otherDraftsArchived = await archiveUnverifiedPendingProposalsForClient({ workspaceId: params.workspaceId, clientProfileId: params.clientProfileId, shouldArchive: isUnverifiedFreshProposal });
    return { otherDraftsArchived };
  } catch (cleanupError) {
    throw new Error(`The proposal was rejected, but an older unverified proposal for this client couldn't be cleared: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`);
  }
}

export async function createPublishAndAssignNutritionAction(params: {
  workspaceId: string;
  clientProfileId: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}): Promise<{ assignmentId: string; versionId: string; versionNumber: number | null; unchanged: boolean }> {
  // A minimal, real AssignedNutritionPlan — this proof surface only ever
  // collects the four macro targets from the coach (see the form in
  // assign-live/page.tsx); the richer coaching-guidance fields this type
  // also carries (meal structure, substitution/supplement guidance, etc.)
  // are real product surface built by the existing demo-mode nutrition
  // composer (lib/coach/nutrition-directions.ts) — out of this minimal
  // page's scope, so they're honestly left blank/zero rather than
  // fabricated placeholder coaching advice.
  //
  // Targets are re-validated here, not just in the form: nothing may
  // persist a missing/NaN/out-of-range target as prescribed nutrition.
  const checked = validateNutritionTargets(params);
  if (!checked.ok) throw new Error(checked.message);
  // A resubmission of the targets already assigned (double click, retry,
  // stale tab) must not publish another identical version.
  const active = await getActiveNutritionAssignment(params.clientProfileId);
  if (active && active.content.targets && nutritionTargetsEqual(active.content.targets, checked.targets)) {
    return { assignmentId: active.assignmentId, versionId: active.versionId, versionNumber: active.versionNumber, unchanged: true };
  }
  const content = {
    id: `nutrition-${crypto.randomUUID()}`,
    targets: checked.targets,
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
  const assigned = await getActiveNutritionAssignment(params.clientProfileId);
  return { assignmentId, versionId, versionNumber: assigned?.versionId === versionId ? assigned.versionNumber : null, unchanged: false };
}

export async function setProgramStartDateAction(params: {
  workspaceId: string;
  clientProfileId: string;
  startDateIso: string;
  timeZone: string;
}): Promise<void> {
  await setClientProgramStartDate(params);
}

/** Phase 9D — the one coach-facing entry point for a real client's shadow
 * client-state analysis: a read-only, evidence-backed interpretation of
 * their recent adherence/performance/prescription-completion evidence.
 * Gated by the same requireAssignedCoachAuthority every other real
 * client-scoped coach action in this file uses. Intended for a
 * developer/QA surface (app/dev/client-state) and a later Phase 10
 * coach-facing summary — never exposed to clients (spec section 32). */
export async function analyzeClientStateAction(params: { workspaceId: string; clientProfileId: string }): Promise<ClientStateAnalysis> {
  await requireAssignedCoachAuthority(params.workspaceId, params.clientProfileId);
  return analyzeClientStateForClient(params);
}

/** Phase 10A — the client workspace's real "OPTIM noticed" surface: the
 * same real analysis as analyzeClientStateAction, filtered and bounded
 * through the ONE deterministic presentation filter
 * (lib/client-state/presentation.ts) so the workspace only ever shows a
 * small number of genuinely current, meaningful findings — never the raw
 * five-domain dump the dev/QA panel shows. Failure degrades to an empty
 * array (spec section 34) — the client workspace must render normally
 * either way. */
export async function getClientWorkspaceIntelligenceAction(params: { workspaceId: string; clientProfileId: string }): Promise<PresentedFinding[]> {
  await requireAssignedCoachAuthority(params.workspaceId, params.clientProfileId);
  try {
    const analysis = await analyzeClientStateForClient(params);
    return selectFindingsForCoachUI(analysis);
  } catch (err) {
    console.error(`getClientWorkspaceIntelligenceAction failed, showing no findings: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

/** Phase 10A — the evidence drill-down's one real entry point (spec
 * section 13). `clientProfileId` re-authorizes the SAME coach-client
 * relationship every other action in this file checks — the observation
 * ids themselves are never trusted as sufficient authorization on their
 * own (an id list a coach isn't authorized for resolves to nothing
 * anyway via RLS, but this is the same defense-in-depth posture as every
 * other action here). */
export async function getFindingEvidenceDetailAction(params: { workspaceId: string; clientProfileId: string; observationIds: string[] }): Promise<EvidenceDetailLine[]> {
  await requireAssignedCoachAuthority(params.workspaceId, params.clientProfileId);
  return resolveEvidenceDetails(params.observationIds);
}

/** Phase 10B — the one coach-facing entry point for evidence-backed
 * adjustment proposals. Read-mostly from the client workspace's own point
 * of view: if nothing is currently pending, this evaluates the client's
 * real current findings against the deterministic adjustment engine and,
 * only when a genuinely eligible proposal exists, persists it as a real
 * draft training_program_versions row (spec section 4/18) — the exact
 * same "propose, never mutate the active program" posture
 * createProgramProposalAction already has. Never creates a second
 * pending draft when one already exists (spec section 57). Failure
 * degrades to "no proposal" (spec section 51) — the client workspace and
 * existing proposal review must both keep working regardless. */
export async function resolveAdjustmentProposalAction(params: { workspaceId: string; clientProfileId: string }): Promise<AdjustmentResolution> {
  const ctx = await requireAssignedCoachAuthority(params.workspaceId, params.clientProfileId);
  return resolveAdjustmentProposal({ workspaceId: params.workspaceId, clientProfileId: params.clientProfileId, coachId: ctx.userId });
}
