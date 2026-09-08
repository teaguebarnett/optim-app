// Phase 5.4A — the activation-generation lifecycle: idempotent generation,
// regeneration-with-history, and the one real write path that makes an
// approved selection reach the client's actual Today/Training/Nutrition
// experience (Part X of the phase brief).
//
// Every pure decision (what state a client is in, whether generation is
// idempotent, what regenerating produces) lives here as a testable function
// — see lib/coach/verify-activation-lifecycle.mts. The one genuinely
// side-effecting function, approveActivation, follows the exact same
// "direct AppState read/merge/write, PlatformState change handled
// separately by the caller" split already established by
// lib/coach/setup.ts/program-assignment.ts/review-lifecycle.ts — there is
// no transaction system in this client-side prototype, so "atomic" here
// means "every write is derived from data computed before any write
// begins, executed in one synchronous call with no intervening async gap,"
// not a real multi-store transaction. This is disclosed, not hidden.

import { applyCoachSetup } from "./setup.ts";
import { saveClientProgram } from "./program-assignment.ts";
import { loadClientAppState } from "../tenancy/client-state-store.ts";
import { getHealthReview } from "./repository.ts";
import { RESOLVED_HEALTH_REVIEW_STATUSES } from "./types.ts";
import { extractClientSnapshot, generateThreeNutritionStrategies, generateThreeTrainingOptions, type GeneratedNutritionStrategy, type GeneratedTrainingOption } from "./activation-generation.ts";
import { extractClientProgrammingProfile, resolveProgrammingProfileReadiness, type ClientProgrammingProfile } from "./programming-profile.ts";
import { generateProgramDirectionSummaries, buildFullProgramForDirection, combineDirections, type ProgramDirectionSummary } from "./program-directions.ts";
import { buildCompleteNutritionPrescription, type CompleteNutritionPrescription, type NutritionRevisionRecord } from "./nutrition-directions.ts";
import { saveClientNutritionPlan, toAssignedNutritionPlan } from "./nutrition-assignment.ts";
import { sendRelayedCoachDecisionMessage } from "./coach-messaging.ts";
import { buildInitialCommunicationPolicy, type ClientCommunicationPolicy } from "./communication-policy.ts";
import type { CoachOperatingModel } from "./operating-model.ts";
import type { CoachAiAuthoritySettings } from "./ai-authority.ts";
import type { PlatformState } from "./platform-store.ts";
import type { ProgramRevisionRecord } from "./program-revision.ts";
import type { ClientAssignedProgram } from "../types";
import type { ClientProfile, ClientProfileId, CoachProfileId, WorkspaceId } from "../tenancy/types";
import type { OnboardingProgress } from "./types";

export const ACTIVATION_GENERATOR_VERSION = "5.4A-deterministic-1";
export const PROGRAM_COMPOSER_VERSION = "5.5-deterministic-1";

export type ActivationLifecycleState =
  | "awaiting_coach_calibration"
  | "awaiting_client_onboarding"
  | "ready_to_generate"
  | "generating"
  /** Phase 5.5 — three lightweight directions exist; no full program has
   * been built yet (spec Part 2). */
  | "directions_ready"
  | "ready_for_review"
  /** Phase 5.5 — a conversational revision has been computed and is
   * awaiting the coach's explicit confirmation (spec Part 5) — never
   * applied to the record the coach is viewing until confirmed. */
  | "revision_prepared"
  | "blocked"
  | "approved"
  | "activated"
  | "superseded"
  | "generation_failed";

export interface ActivationApprovalRecord {
  approvedByCoachId: CoachProfileId;
  approvedAtIso: string;
  aiAuthorityLevelAtApproval: string;
  resultingProgramId: string;
}

export interface ActivationGenerationRecord {
  id: string;
  clientId: ClientProfileId;
  workspaceId: WorkspaceId;
  coachId: CoachProfileId;
  coachModelVersion: number;
  generatorVersion: string;
  /** Real idempotency key — see computeIdempotencyKey. Two generation
   * requests with the same key always resolve to the SAME record (see
   * findExistingGeneration), never a duplicate. */
  idempotencyKey: string;
  state: ActivationLifecycleState;
  createdAtIso: string;
  updatedAtIso: string;
  trainingOptions: GeneratedTrainingOption[];
  nutritionOptions: GeneratedNutritionStrategy[];
  blockedReasons?: string[];
  selectedTrainingOptionId?: string;
  selectedNutritionOptionId?: string;
  regeneratedFromRecordId?: string;
  regenerationInstruction?: string;
  approval?: ActivationApprovalRecord;
  failureReason?: string;

  // -- Phase 5.5: two-stage direction generation + revision history --------
  /** Stage A output (spec Part 2) — three concise, structurally distinct
   * directions with no full weeks built yet. Always populated together
   * with nutritionOptions at "directions_ready"; trainingOptions stays
   * empty until a direction is actually chosen and fully generated. */
  directions?: ProgramDirectionSummary[];
  selectedDirectionId?: string;
  /** Set only when the coach combined two directions (spec Part 2's
   * "combine useful elements") — the id of the second, contributing
   * direction; selectedDirectionId stays the primary one. */
  combinedWithDirectionId?: string;
  /** The real Client Programming Profile this generation run used — stored
   * for provenance (spec's "retain provenance linking to... the client-
   * onboarding snapshot") without needing to re-extract it later to explain
   * a past decision. */
  programmingProfile?: ClientProgrammingProfile;
  /** Append-only conversational-revision history (spec Part 5) — never
   * overwritten; restoring an earlier revision creates a new entry that
   * copies its program rather than deleting anything after it. */
  revisions?: ProgramRevisionRecord[];

  // -- Phase 5.5A: the nutrition side of the unified OPTIM Plan ------------
  /** The complete, enriched prescription built from whichever
   * nutritionOptions entry the coach selected (see
   * buildCompleteNutritionPrescription) — the nutrition equivalent of
   * trainingOptions[0].program. Undefined until the coach picks one. */
  selectedNutritionPrescription?: CompleteNutritionPrescription;
  /** Append-only nutrition revision history, exactly mirroring
   * `revisions` above but for nutrition's own real levers (protein,
   * calories, meal count, training/rest split). */
  nutritionRevisions?: NutritionRevisionRecord[];
}

export function computeIdempotencyKey(input: { clientId: ClientProfileId; onboardingCompletedAtIso: string; coachModelVersion: number; regenerationInstruction?: string }): string {
  const suffix = input.regenerationInstruction ? `::regen:${input.regenerationInstruction.trim().toLowerCase()}` : "";
  return `${input.clientId}::${input.onboardingCompletedAtIso}::com-v${input.coachModelVersion}::${ACTIVATION_GENERATOR_VERSION}${suffix}`;
}

/** Real idempotency — retrying the same generation request (same client,
 * same completed onboarding, same active Coach Operating Model version,
 * same generator version, same/no regeneration instruction) always returns
 * the existing record rather than creating a duplicate. See this phase's
 * brief §V and §XV.22. */
export function findExistingGeneration(records: ActivationGenerationRecord[], idempotencyKey: string): ActivationGenerationRecord | null {
  return records.find((r) => r.idempotencyKey === idempotencyKey) ?? null;
}

export function latestGenerationForClient(records: ActivationGenerationRecord[], clientId: ClientProfileId): ActivationGenerationRecord | null {
  const forClient = records.filter((r) => r.clientId === clientId).sort((a, b) => (a.createdAtIso < b.createdAtIso ? 1 : -1));
  return forClient[0] ?? null;
}

export interface DetermineStateInput {
  onboarding: OnboardingProgress | null;
  activeCoachOperatingModel: CoachOperatingModel | null;
  healthReviewResolved: boolean | "no_review_needed";
}

/** The honest lifecycle state for a client BEFORE any generation attempt —
 * see this phase's brief §V's state list. Never returns "ready_to_generate"
 * unless every real prerequisite is actually met. */
export function determinePreGenerationState(input: DetermineStateInput): ActivationLifecycleState {
  if (!input.activeCoachOperatingModel) return "awaiting_coach_calibration";
  if (!input.onboarding?.completedAtIso) return "awaiting_client_onboarding";
  if (input.healthReviewResolved === false) return "blocked";
  return "ready_to_generate";
}

export interface GenerateActivationInput {
  clientId: ClientProfileId;
  workspaceId: WorkspaceId;
  coachId: CoachProfileId;
  onboarding: OnboardingProgress | null;
  activeCoachOperatingModel: CoachOperatingModel | null;
  healthReviewResolved: boolean | "no_review_needed";
  existingRecords: ActivationGenerationRecord[];
  durationWeeks?: number;
  regenerationInstruction?: string;
  nowIso: string;
}

export interface GenerateActivationResult {
  record: ActivationGenerationRecord;
  /** True when an existing record was returned instead of generating a new
   * one — the idempotency path. */
  reused: boolean;
}

/**
 * The one real generation orchestrator. Pure: given the same inputs, always
 * produces the same decision. Deterministic generation is synchronous in
 * this prototype (no real model call to await), so "generating" is never
 * actually observed as a persisted state — it is still a real, valid value
 * of ActivationLifecycleState for a future async provider (see this
 * phase's final report §16) to use.
 */
export function generateActivation(input: GenerateActivationInput): GenerateActivationResult {
  const preState = determinePreGenerationState({ onboarding: input.onboarding, activeCoachOperatingModel: input.activeCoachOperatingModel, healthReviewResolved: input.healthReviewResolved });

  if (preState !== "ready_to_generate") {
    const reasons =
      preState === "awaiting_coach_calibration"
        ? ["This coach hasn't completed coach onboarding yet — no active Coach Operating Model exists."]
        : preState === "awaiting_client_onboarding"
          ? ["This client hasn't completed onboarding yet."]
          : ["The client's intake flagged something that needs coach review before activation can proceed."];
    return {
      reused: false,
      record: {
        id: `activation-${input.clientId}-${Date.now()}`,
        clientId: input.clientId,
        workspaceId: input.workspaceId,
        coachId: input.coachId,
        coachModelVersion: input.activeCoachOperatingModel?.version ?? 0,
        generatorVersion: ACTIVATION_GENERATOR_VERSION,
        idempotencyKey: `${input.clientId}::${preState}`,
        state: preState,
        createdAtIso: input.nowIso,
        updatedAtIso: input.nowIso,
        trainingOptions: [],
        nutritionOptions: [],
        blockedReasons: reasons,
      },
    };
  }

  const idempotencyKey = computeIdempotencyKey({
    clientId: input.clientId,
    onboardingCompletedAtIso: input.onboarding!.completedAtIso!,
    coachModelVersion: input.activeCoachOperatingModel!.version,
    regenerationInstruction: input.regenerationInstruction,
  });
  const existing = findExistingGeneration(input.existingRecords, idempotencyKey);
  // "blocked" (every option failed a hard constraint) and "generation_failed"
  // (an exception) are never treated as a valid cached result to reuse —
  // both represent an attempt that produced nothing usable, so a coach
  // retrying (after e.g. a fix to the generator, or updated client data)
  // must always get a fresh run rather than the same non-result forever.
  if (existing && existing.state !== "generation_failed" && existing.state !== "blocked") return { record: existing, reused: true };

  // Lineage for the audit trail (Part XIV): a plain retry of the identical
  // request links back to the exact same-key record it's replacing (the
  // blocked/failed case above). A genuine "regenerate with instruction"
  // request always computes a DIFFERENT idempotency key (see
  // computeIdempotencyKey's regenerationInstruction suffix), so `existing`
  // is never a match for it — without this, regeneratedFromRecordId would
  // silently stay unset for every real regeneration, breaking the "new
  // version, old one preserved and traceable" requirement. Link instead to
  // this client's most recent prior record.
  const lineageSource = existing ?? (input.regenerationInstruction ? latestGenerationForClient(input.existingRecords, input.clientId) : null);

  const snapshotResult = extractClientSnapshot(input.onboarding);
  if ("missing" in snapshotResult) {
    return {
      reused: false,
      record: {
        id: `activation-${input.clientId}-${Date.now()}`,
        clientId: input.clientId,
        workspaceId: input.workspaceId,
        coachId: input.coachId,
        coachModelVersion: input.activeCoachOperatingModel!.version,
        generatorVersion: ACTIVATION_GENERATOR_VERSION,
        idempotencyKey,
        state: "blocked",
        createdAtIso: input.nowIso,
        updatedAtIso: input.nowIso,
        trainingOptions: [],
        nutritionOptions: [],
        blockedReasons: snapshotResult.missing,
      },
    };
  }

  try {
    const durationWeeks = input.durationWeeks ?? input.activeCoachOperatingModel!.practice.typicalProgramLengthWeeks ?? 12;
    const trainingOptions = generateThreeTrainingOptions({
      clientId: input.clientId,
      workspaceId: input.workspaceId,
      coachId: input.coachId,
      snapshot: snapshotResult.snapshot,
      com: input.activeCoachOperatingModel!,
      durationWeeks,
      nowIso: input.nowIso,
    });
    const nutritionOptions = generateThreeNutritionStrategies({ snapshot: snapshotResult.snapshot, com: input.activeCoachOperatingModel!, nowIso: input.nowIso });

    const anyHardConstraintFailure = trainingOptions.every((o) => !o.constraints.passed);
    const record: ActivationGenerationRecord = {
      id: `activation-${input.clientId}-${Date.now()}`,
      clientId: input.clientId,
      workspaceId: input.workspaceId,
      coachId: input.coachId,
      coachModelVersion: input.activeCoachOperatingModel!.version,
      generatorVersion: ACTIVATION_GENERATOR_VERSION,
      idempotencyKey,
      state: anyHardConstraintFailure ? "blocked" : "ready_for_review",
      createdAtIso: input.nowIso,
      updatedAtIso: input.nowIso,
      trainingOptions,
      nutritionOptions,
      blockedReasons: anyHardConstraintFailure ? ["Every generated training option failed a hard constraint check — see each option's constraint results."] : undefined,
      regeneratedFromRecordId: lineageSource?.id,
      regenerationInstruction: input.regenerationInstruction,
    };
    return { record, reused: false };
  } catch (err) {
    return {
      reused: false,
      record: {
        id: `activation-${input.clientId}-${Date.now()}`,
        clientId: input.clientId,
        workspaceId: input.workspaceId,
        coachId: input.coachId,
        coachModelVersion: input.activeCoachOperatingModel!.version,
        generatorVersion: ACTIVATION_GENERATOR_VERSION,
        idempotencyKey,
        state: "generation_failed",
        createdAtIso: input.nowIso,
        updatedAtIso: input.nowIso,
        trainingOptions: [],
        nutritionOptions: [],
        failureReason: err instanceof Error ? err.message : "Unknown generation error.",
      },
    };
  }
}

export function selectActivationOptions(record: ActivationGenerationRecord, trainingOptionId: string, nutritionOptionId: string | null, nowIso: string): ActivationGenerationRecord {
  return { ...record, selectedTrainingOptionId: trainingOptionId, selectedNutritionOptionId: nutritionOptionId ?? undefined, updatedAtIso: nowIso };
}

export interface ApproveActivationInput {
  record: ActivationGenerationRecord;
  client: ClientProfile;
  approvedByCoachId: CoachProfileId;
  aiAuthorityLevelAtApproval: string;
  clientFirstName: string;
  coachName: string;
  businessName: string;
  com: CoachOperatingModel;
  aiMayRespondDirectlyForRoutine: boolean;
  assignWeeklyCheckIn: boolean;
  startDateIso: string;
  nowIso: string;
}

export interface ApproveActivationResult {
  updatedRecord: ActivationGenerationRecord;
  communicationPolicy: ClientCommunicationPolicy;
}

/** Thrown by approveActivation when the client-side write can't be
 * verified to have actually landed — see the function's own doc. Never
 * caught internally; the caller (useProgramComposer's approveInitial) is
 * responsible for surfacing this as a real, actionable error rather than
 * a silent no-op or a false "activated" state. */
export class ActivationPersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActivationPersistenceError";
  }
}

/**
 * The one real write path from an approved selection to the client's
 * actual daily experience (Part X of the phase brief). Requires a selected
 * training option (nutrition is optional — a coach may run
 * training-only). Writes, in order: the real ClientAssignedProgram (full
 * weeks/exercises — see saveClientProgram), the real enrollment + nutrition
 * targets (see applyCoachSetup), and returns the real communication-policy
 * record and the updated generation record for the caller to persist via
 * the platform reducer (SAVE_ACTIVATION_GENERATION,
 * SAVE_COMMUNICATION_POLICY, SET_CLIENT_LIFECYCLE) — see
 * components/coach/activation-studio/ for that call site.
 *
 * Phase 5.6A.3 — approval must never report success on the strength of an
 * in-memory belief alone: after the real writes above, this reads the
 * client's own persisted AppState straight back and confirms the program
 * that's actually there is the one just assigned, for this exact client.
 * If that verification fails (storage blocked/full, a write raced with
 * something else, etc.), this throws ActivationPersistenceError instead of
 * returning — the caller must never dispatch SET_CLIENT_LIFECYCLE
 * "active" (or anything else implying success) when this throws, so a
 * client can never be marked active with no real assigned program behind
 * it. Calling this again after a thrown failure is always safe: every
 * write above is a full-field overwrite keyed by this exact client id,
 * never an append, so a retry (or an accidental double-click) can never
 * produce a duplicate assignment.
 */
export function approveActivation(input: ApproveActivationInput): ApproveActivationResult {
  const selectedTraining = input.record.trainingOptions.find((o) => o.id === input.record.selectedTrainingOptionId);
  if (!selectedTraining) throw new Error("No training option selected — cannot approve activation.");
  const selectedNutrition = input.record.nutritionOptions.find((o) => o.id === input.record.selectedNutritionOptionId) ?? null;

  // Real write #1: the full, real training content — every week, every
  // exercise, every prescribed set (see lib/coach/training.ts's
  // buildPrescribedSets) — exactly what the client's live guided workout
  // flow and Training/Today pages already know how to render.
  saveClientProgram(input.client.id, input.client.workspaceId, input.approvedByCoachId, selectedTraining.program);

  // Real write #2: the enrollment (start date/duration/week derivation) and
  // real nutrition targets on AppState — the same applyCoachSetup path the
  // existing manual coach-setup screen already uses, so a generated
  // activation and a manually-built one are indistinguishable downstream.
  applyCoachSetup({
    clientId: input.client.id,
    workspaceId: input.client.workspaceId,
    primaryCoachId: input.approvedByCoachId,
    startDateIso: input.startDateIso,
    durationWeeks: selectedTraining.program.durationWeeks,
    nutritionTargets: selectedNutrition?.targets ?? { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
    assignWeeklyCheckIn: input.assignWeeklyCheckIn,
    now: new Date(input.nowIso),
  });

  // Real write #3 (Phase 5.5A, optional) — the complete, richer nutrition
  // prescription (meal count, pre/post-training guidance, substitutions,
  // hydration/fiber) when one was actually generated and selected. Runs
  // AFTER applyCoachSetup above so its own nutritionTargets write (the
  // identical numbers, derived from the same prescription) is the one that
  // persists — never a conflicting pair of writes.
  if (input.record.selectedNutritionPrescription) {
    saveClientNutritionPlan(
      input.client.id,
      input.client.workspaceId,
      input.approvedByCoachId,
      toAssignedNutritionPlan(input.record.selectedNutritionPrescription, `nutrition-plan-${input.client.id}-${Date.now()}`, input.nowIso)
    );
  }

  // Verify the write actually landed for THIS exact client before this
  // function ever tells its caller approval succeeded — see this
  // function's own doc and ActivationPersistenceError.
  const persisted = loadClientAppState(input.client.id);
  if (!persisted || persisted.clientId !== input.client.id || !persisted.assignedProgram || persisted.assignedProgram.id !== selectedTraining.program.id) {
    throw new ActivationPersistenceError(`${input.client.name}'s plan couldn't be saved — nothing was activated. Please try approving again.`);
  }

  const communicationPolicy = buildInitialCommunicationPolicy({
    clientId: input.client.id,
    workspaceId: input.client.workspaceId,
    coachId: input.approvedByCoachId,
    clientFirstName: input.clientFirstName,
    coachName: input.coachName,
    businessName: input.businessName,
    com: input.com,
    aiMayRespondDirectlyForRoutine: input.aiMayRespondDirectlyForRoutine,
    nowIso: input.nowIso,
  });

  const updatedRecord: ActivationGenerationRecord = {
    ...input.record,
    state: "activated",
    updatedAtIso: input.nowIso,
    approval: {
      approvedByCoachId: input.approvedByCoachId,
      approvedAtIso: input.nowIso,
      aiAuthorityLevelAtApproval: input.aiAuthorityLevelAtApproval,
      resultingProgramId: selectedTraining.program.id,
    },
  };

  return { updatedRecord, communicationPolicy };
}

/** Whether this client's health status honestly permits auto-activation —
 * consulted independently of (and BEFORE) any AI Authority disposition, per
 * this phase's brief: "Safety rules... override every authority level." */
export function healthReviewPermitsActivation(platform: PlatformState, clientId: ClientProfileId): boolean | "no_review_needed" {
  const review = getHealthReview(platform, clientId);
  if (!review) return "no_review_needed";
  return RESOLVED_HEALTH_REVIEW_STATUSES.has(review.status);
}

/** All AI Authority settings must independently agree AND the health/data
 * checks must pass before OPTIM may auto-activate a client with no
 * per-action coach approval — this phase's brief §XI's "Autonomous" level.
 * Never consulted for Advisor/Copilot/AI-led, which always require at
 * least the concise-confirmation-or-approval path built into the
 * Activation Studio UI. */
export function canAutoActivateWithoutApproval(input: {
  authoritySettings: CoachAiAuthoritySettings;
  clientId: ClientProfileId;
  healthReviewResolved: boolean | "no_review_needed";
  record: ActivationGenerationRecord;
}): boolean {
  if (input.healthReviewResolved === false) return false;
  if (input.record.state !== "ready_for_review") return false;
  const selected = input.record.trainingOptions.find((o) => o.id === input.record.selectedTrainingOptionId);
  if (!selected || !selected.constraints.passed) return false;
  return input.authoritySettings.clientOverrides[input.clientId]?.level === "review_only" || input.authoritySettings.global.level === "review_only";
}

// ---------------------------------------------------------------------------
// Phase 5.5 — two-stage Program Composer orchestration
// ---------------------------------------------------------------------------

export interface GenerateDirectionsInput {
  clientId: ClientProfileId;
  workspaceId: WorkspaceId;
  coachId: CoachProfileId;
  onboarding: OnboardingProgress | null;
  activeCoachOperatingModel: CoachOperatingModel | null;
  healthReview: ReturnType<typeof getHealthReview>;
  healthReviewResolved: boolean | "no_review_needed";
  existingRecords: ActivationGenerationRecord[];
  durationWeeks?: number;
  nowIso: string;
}

/**
 * Stage A (spec Part 2): produces three concise, structurally distinct
 * directions — never full weeks. Shares determinePreGenerationState's exact
 * pre-checks with the legacy generateActivation so the two can never
 * disagree about whether a client is genuinely ready. Idempotent the same
 * way: retrying with identical real inputs returns the existing record.
 */
export function generateProgramDirections(input: GenerateDirectionsInput): GenerateActivationResult {
  const preState = determinePreGenerationState({ onboarding: input.onboarding, activeCoachOperatingModel: input.activeCoachOperatingModel, healthReviewResolved: input.healthReviewResolved });

  if (preState !== "ready_to_generate") {
    const reasons =
      preState === "awaiting_coach_calibration"
        ? ["This coach hasn't completed coach onboarding yet — no active Coaching Method for OPTIM to generate from."]
        : preState === "awaiting_client_onboarding"
          ? ["This client hasn't completed onboarding yet."]
          : ["The client's intake flagged something that needs coach review before generation can proceed."];
    return {
      reused: false,
      record: {
        id: `program-gen-${input.clientId}-${Date.now()}`,
        clientId: input.clientId,
        workspaceId: input.workspaceId,
        coachId: input.coachId,
        coachModelVersion: input.activeCoachOperatingModel?.version ?? 0,
        generatorVersion: PROGRAM_COMPOSER_VERSION,
        idempotencyKey: `${input.clientId}::${preState}`,
        state: preState,
        createdAtIso: input.nowIso,
        updatedAtIso: input.nowIso,
        trainingOptions: [],
        nutritionOptions: [],
        blockedReasons: reasons,
      },
    };
  }

  const idempotencyKey = `${computeIdempotencyKey({ clientId: input.clientId, onboardingCompletedAtIso: input.onboarding!.completedAtIso!, coachModelVersion: input.activeCoachOperatingModel!.version })}::directions`;
  const existing = findExistingGeneration(input.existingRecords, idempotencyKey);
  if (existing && existing.state !== "generation_failed" && existing.state !== "blocked") return { record: existing, reused: true };

  const profileResult = extractClientProgrammingProfile(input.onboarding, input.healthReview);
  const readiness = resolveProgrammingProfileReadiness(profileResult);

  if (readiness.status === "blocked" || readiness.status === "needs_coach_review") {
    return {
      reused: false,
      record: {
        id: `program-gen-${input.clientId}-${Date.now()}`,
        clientId: input.clientId,
        workspaceId: input.workspaceId,
        coachId: input.coachId,
        coachModelVersion: input.activeCoachOperatingModel!.version,
        generatorVersion: PROGRAM_COMPOSER_VERSION,
        idempotencyKey,
        state: "blocked",
        createdAtIso: input.nowIso,
        updatedAtIso: input.nowIso,
        trainingOptions: [],
        nutritionOptions: [],
        blockedReasons: readiness.status === "blocked" ? (readiness.missing ?? [readiness.blockingQuestion ?? "Missing required information."]) : [readiness.reviewReason ?? "Needs coach review."],
      },
    };
  }

  try {
    const durationWeeks = input.durationWeeks ?? input.activeCoachOperatingModel!.practice.typicalProgramLengthWeeks ?? 12;
    const profile = (profileResult as { profile: ClientProgrammingProfile }).profile;
    const directions = generateProgramDirectionSummaries({ profile, com: input.activeCoachOperatingModel!, durationWeeks });
    const nutritionOptions = generateThreeNutritionStrategies({ snapshot: profile, com: input.activeCoachOperatingModel!, nowIso: input.nowIso });

    const record: ActivationGenerationRecord = {
      id: `program-gen-${input.clientId}-${Date.now()}`,
      clientId: input.clientId,
      workspaceId: input.workspaceId,
      coachId: input.coachId,
      coachModelVersion: input.activeCoachOperatingModel!.version,
      generatorVersion: PROGRAM_COMPOSER_VERSION,
      idempotencyKey,
      state: "directions_ready",
      createdAtIso: input.nowIso,
      updatedAtIso: input.nowIso,
      trainingOptions: [],
      nutritionOptions,
      directions,
      programmingProfile: profile,
    };
    return { record, reused: false };
  } catch (err) {
    return {
      reused: false,
      record: {
        id: `program-gen-${input.clientId}-${Date.now()}`,
        clientId: input.clientId,
        workspaceId: input.workspaceId,
        coachId: input.coachId,
        coachModelVersion: input.activeCoachOperatingModel!.version,
        generatorVersion: PROGRAM_COMPOSER_VERSION,
        idempotencyKey,
        state: "generation_failed",
        createdAtIso: input.nowIso,
        updatedAtIso: input.nowIso,
        trainingOptions: [],
        nutritionOptions: [],
        failureReason: err instanceof Error ? err.message : "Unknown generation error.",
      },
    };
  }
}

/**
 * Stage B (spec Part 2/3): called once the coach has selected (or combined)
 * a direction — builds the real, complete, periodized program for exactly
 * that direction and moves the record to "ready_for_review." Never builds
 * more than the one chosen direction's full program.
 */
export function generateFullProgramFromDirection(input: {
  record: ActivationGenerationRecord;
  directionId: string;
  combineWithDirectionId?: string;
  clientId: ClientProfileId;
  workspaceId: WorkspaceId;
  coachId: CoachProfileId;
  com: CoachOperatingModel;
  durationWeeks?: number;
  nowIso: string;
}): ActivationGenerationRecord {
  const { record } = input;
  const primary = record.directions?.find((d) => d.id === input.directionId);
  if (!primary || !record.programmingProfile) throw new Error("No matching direction (or programming profile) found — cannot generate the full program.");

  const direction = input.combineWithDirectionId
    ? combineDirections(primary, record.directions!.find((d) => d.id === input.combineWithDirectionId) ?? primary)
    : primary;

  const durationWeeks = input.durationWeeks ?? input.com.practice.typicalProgramLengthWeeks ?? 12;
  const option = buildFullProgramForDirection(direction, {
    clientId: input.clientId,
    workspaceId: input.workspaceId,
    coachId: input.coachId,
    profile: record.programmingProfile,
    com: input.com,
    durationWeeks,
    nowIso: input.nowIso,
  });

  return {
    ...record,
    state: option.constraints.passed ? "ready_for_review" : "blocked",
    updatedAtIso: input.nowIso,
    trainingOptions: [option],
    selectedTrainingOptionId: option.id,
    selectedDirectionId: primary.id,
    combinedWithDirectionId: input.combineWithDirectionId,
    blockedReasons: option.constraints.passed ? undefined : option.constraints.checks.filter((c) => !c.passed).map((c) => c.reason ?? c.label),
  };
}

/**
 * The nutrition equivalent of generateFullProgramFromDirection — builds the
 * complete prescription for whichever of the three real nutritionOptions
 * the coach selected (spec Part 8). Unlike training there's no separate
 * heavy "Stage B" build (a nutrition prescription has no weeks/exercises to
 * generate), so this just enriches the chosen strategy and stores it.
 */
export function selectNutritionPrescription(input: { record: ActivationGenerationRecord; nutritionOptionId: string; com: CoachOperatingModel; nowIso: string }): ActivationGenerationRecord {
  const { record } = input;
  const strategy = record.nutritionOptions.find((o) => o.id === input.nutritionOptionId);
  if (!strategy || !record.programmingProfile) throw new Error("No matching nutrition strategy (or programming profile) found — cannot build the complete prescription.");

  const prescription = buildCompleteNutritionPrescription(strategy, record.programmingProfile, input.com);
  return { ...record, updatedAtIso: input.nowIso, selectedNutritionOptionId: strategy.id, selectedNutritionPrescription: prescription };
}

// ---------------------------------------------------------------------------
// Phase 5.5 — revision approval for an ALREADY-ACTIVE client (spec Part 6).
// Deliberately narrower than approveActivation: never touches
// programEnrollment/lifecycle — an active client's start date, week
// derivation, and history must never reset just because their upcoming
// training changed.
// ---------------------------------------------------------------------------

export interface ApplyProgramRevisionApprovalInput {
  client: ClientProfile;
  revisedProgram: ClientAssignedProgram;
  approvedByCoachId: CoachProfileId;
  coachName: string;
  clientMessage: string;
}

export function applyProgramRevisionApproval(input: ApplyProgramRevisionApprovalInput): void {
  saveClientProgram(input.client.id, input.client.workspaceId, input.approvedByCoachId, input.revisedProgram);
  sendRelayedCoachDecisionMessage(
    input.client.id,
    input.client.workspaceId,
    input.approvedByCoachId,
    input.coachName,
    input.clientMessage,
    input.revisedProgram.id,
    new Date().toISOString()
  );
}

/** The nutrition equivalent of applyProgramRevisionApproval — writes only
 * the client's real nutrition plan (never programEnrollment/lifecycle). */
export interface ApplyNutritionRevisionApprovalInput {
  client: ClientProfile;
  revisedPrescription: CompleteNutritionPrescription;
  approvedByCoachId: CoachProfileId;
  coachName: string;
  clientMessage: string;
}

export function applyNutritionRevisionApproval(input: ApplyNutritionRevisionApprovalInput): void {
  const nowIso = new Date().toISOString();
  const plan = toAssignedNutritionPlan(input.revisedPrescription, `nutrition-plan-${input.client.id}-${Date.now()}`, nowIso);
  saveClientNutritionPlan(input.client.id, input.client.workspaceId, input.approvedByCoachId, plan);
  sendRelayedCoachDecisionMessage(input.client.id, input.client.workspaceId, input.approvedByCoachId, input.coachName, input.clientMessage, plan.id, nowIso);
}
