// Phase 6.0B — Persist the Complete Revenue Loop.
//
// Runtime structural validation for every `content jsonb` payload the
// Supabase adapter reads back out of training_program_versions,
// nutrition_plan_versions, and daily_records, before it's ever cast to
// lib/types.ts's ClientAssignedProgram/AssignedNutritionPlan or
// lib/history/types.ts's TrainingDaySnapshot/NutritionDaySnapshot. Postgres
// only guarantees `content` is well-formed JSON (see
// 20260909000004_programs_and_nutrition.sql's own header) — it says nothing
// about shape. A row written by this app's own repository (see
// lib/production/programs.ts) will always pass; these guards exist for
// everything else that could put a jsonb value there or corrupt one already
// there (a hand-edited row, a future writer that doesn't go through this
// repository, storage-level corruption) — see
// lib/production/errors.ts's InvalidPersistedContentError doc: the
// contract is "throw a controlled error," never "cast and hope."
//
// Deliberately not exhaustive field-by-field validation (no schema library
// is in this project's dependencies, and Part 3's own documented tradeoff
// already anticipates "a Zod-equivalent runtime check belongs [at the
// application layer] once Phase 6.0B actually writes real content" as
// future-hardenable, not a blocker) — this checks every field the live
// engine (lib/workout/resolve-scheduled-workout.ts,
// lib/scheduling/enrollment.ts, the nutrition totals/remaining
// calculations) actually reads, so a structurally broken payload fails
// loudly here instead of crashing deep inside a render or silently
// producing wrong totals.

import { InvalidPersistedContentError } from "./errors.ts";
import type { ClientAssignedProgram, AssignedNutritionPlan, Exercise, Workout, ProgramDay, ProgramWeek } from "../types";
import type { TrainingDaySnapshot, NutritionDaySnapshot } from "../history/types";
import type { CoachPlaybookContent } from "../coach/playbook";
import type {
  UniversalTrainingProgramContent,
  UniversalProgramWeek,
  UniversalProgramDay,
  Session,
  Block,
  TrainingItemInstance,
  Prescription,
} from "../training/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(what: string, reason: string): never {
  throw new InvalidPersistedContentError(what, reason);
}

function requireString(value: unknown, field: string, what: string): string {
  if (typeof value !== "string") fail(what, `"${field}" must be a string, got ${typeof value}`);
  return value;
}

function requireNumber(value: unknown, field: string, what: string): number {
  if (typeof value !== "number" || Number.isNaN(value)) fail(what, `"${field}" must be a number, got ${typeof value}`);
  return value;
}

function requireArray(value: unknown, field: string, what: string): unknown[] {
  if (!Array.isArray(value)) fail(what, `"${field}" must be an array, got ${typeof value}`);
  return value;
}

function requireBoolean(value: unknown, field: string, what: string): boolean {
  if (typeof value !== "boolean") fail(what, `"${field}" must be a boolean, got ${typeof value}`);
  return value;
}

function requireOneOf<T extends string>(value: unknown, allowed: readonly T[], field: string, what: string): T {
  const str = requireString(value, field, what);
  if (!(allowed as readonly string[]).includes(str)) {
    fail(what, `"${field}" must be one of ${allowed.join("/")}, got "${str}"`);
  }
  return str as T;
}

function validateExercise(raw: unknown, what: string): Exercise {
  if (!isRecord(raw)) fail(what, "exercise entry is not an object");
  requireString(raw.id, "exercise.id", what);
  requireNumber(raw.order, "exercise.order", what);
  requireString(raw.name, "exercise.name", what);
  requireNumber(raw.warmupSets, "exercise.warmupSets", what);
  requireNumber(raw.workingSets, "exercise.workingSets", what);
  requireNumber(raw.targetRepsLow, "exercise.targetRepsLow", what);
  requireNumber(raw.targetRepsHigh, "exercise.targetRepsHigh", what);
  requireNumber(raw.targetRpe, "exercise.targetRpe", what);
  requireNumber(raw.restSeconds, "exercise.restSeconds", what);
  requireString(raw.tempo, "exercise.tempo", what);
  requireString(raw.cue, "exercise.cue", what);
  requireArray(raw.previousPerformance, "exercise.previousPerformance", what);
  requireArray(raw.prescribedSets, "exercise.prescribedSets", what);
  return raw as unknown as Exercise;
}

function validateWorkout(raw: unknown, what: string): Workout {
  if (!isRecord(raw)) fail(what, "workout is not an object");
  requireString(raw.id, "workout.id", what);
  requireString(raw.workspaceId, "workout.workspaceId", what);
  requireString(raw.name, "workout.name", what);
  requireString(raw.dayOfWeek, "workout.dayOfWeek", what);
  requireString(raw.focus, "workout.focus", what);
  requireNumber(raw.estimatedDurationMin, "workout.estimatedDurationMin", what);
  requireString(raw.warmupOverview, "workout.warmupOverview", what);
  requireString(raw.coachNote, "workout.coachNote", what);
  const exercises = requireArray(raw.exercises, "workout.exercises", what);
  exercises.forEach((e) => validateExercise(e, what));
  return raw as unknown as Workout;
}

function validateProgramDay(raw: unknown, what: string): ProgramDay {
  if (!isRecord(raw)) fail(what, "program day is not an object");
  requireString(raw.dayOfWeek, "day.dayOfWeek", what);
  const type = requireString(raw.type, "day.type", what);
  if (type !== "training" && type !== "rest") fail(what, `day.type must be "training" or "rest", got "${type}"`);
  if (type === "training") {
    if (raw.workout === undefined) fail(what, `day.type is "training" but day.workout is missing`);
    validateWorkout(raw.workout, what);
  }
  return raw as unknown as ProgramDay;
}

function validateProgramWeek(raw: unknown, what: string): ProgramWeek {
  if (!isRecord(raw)) fail(what, "program week is not an object");
  requireNumber(raw.weekNumber, "week.weekNumber", what);
  const days = requireArray(raw.days, "week.days", what);
  if (days.length !== 7) fail(what, `week.days must have exactly 7 entries, got ${days.length}`);
  days.forEach((d) => validateProgramDay(d, what));
  return raw as unknown as ProgramWeek;
}

// ---------------------------------------------------------------------------
// Universal training grammar (Phase 1) — validates a training_program_
// versions.content payload shaped by lib/training/types.ts's
// UniversalTrainingProgramContent (schemaVersion: 2). Additive only: no
// existing call site produces or reads this shape yet — see
// validateTrainingProgramVersionContent's own doc below for the dispatch
// rule, and lib/training/types.ts's module doc for why no database
// migration is required to introduce it.
// ---------------------------------------------------------------------------

const EXECUTION_FAMILIES = ["resistance", "continuous", "interval", "circuit", "quality"] as const;
const BLOCK_KINDS = ["straight", "superset", "circuit", "interval", "warmup", "cooldown", "custom"] as const;
const PRESCRIPTION_LOAD_UNITS = ["lb", "kg"] as const;
const PRESCRIPTION_DISTANCE_UNITS = ["m", "mi", "km"] as const;
const PRESCRIPTION_PACE_UNITS = ["min_per_mi", "min_per_km"] as const;
const PRESCRIPTION_SIDES = ["left", "right", "alternating", "bilateral"] as const;

function validatePrescriptionReps(raw: unknown, what: string): void {
  if (!isRecord(raw)) fail(what, `"reps" is not an object`);
  requireNumber(raw.low, "reps.low", what);
  requireNumber(raw.high, "reps.high", what);
}

function validatePrescriptionLoad(raw: unknown, what: string): void {
  if (!isRecord(raw)) fail(what, `"load" is not an object`);
  requireNumber(raw.value, "load.value", what);
  requireOneOf(raw.unit, PRESCRIPTION_LOAD_UNITS, "load.unit", what);
  if (raw.percent1rm !== undefined) requireNumber(raw.percent1rm, "load.percent1rm", what);
}

function validatePrescriptionDuration(raw: unknown, what: string): void {
  if (!isRecord(raw)) fail(what, `"duration" is not an object`);
  requireNumber(raw.seconds, "duration.seconds", what);
}

function validatePrescriptionDistance(raw: unknown, what: string): void {
  if (!isRecord(raw)) fail(what, `"distance" is not an object`);
  requireNumber(raw.value, "distance.value", what);
  requireOneOf(raw.unit, PRESCRIPTION_DISTANCE_UNITS, "distance.unit", what);
}

function validatePrescriptionPace(raw: unknown, what: string): void {
  if (!isRecord(raw)) fail(what, `"pace" is not an object`);
  requireNumber(raw.value, "pace.value", what);
  requireOneOf(raw.unit, PRESCRIPTION_PACE_UNITS, "pace.unit", what);
}

function validatePrescriptionHeartRate(raw: unknown, what: string): void {
  if (!isRecord(raw)) fail(what, `"heartRate" is not an object`);
  requireNumber(raw.low, "heartRate.low", what);
  requireNumber(raw.high, "heartRate.high", what);
  if (raw.zoneLabel !== undefined) requireString(raw.zoneLabel, "heartRate.zoneLabel", what);
}

function validatePrescriptionPower(raw: unknown, what: string): void {
  if (!isRecord(raw)) fail(what, `"power" is not an object`);
  requireNumber(raw.watts, "power.watts", what);
}

function validatePrescriptionIntervalField(raw: unknown, field: string, what: string): void {
  if (!isRecord(raw)) fail(what, `"${field}" is not an object`);
  requireNumber(raw.seconds, `${field}.seconds`, what);
}

function validatePrescription(raw: unknown, what: string): Prescription {
  if (!isRecord(raw)) fail(what, "prescription is not an object");
  requireOneOf(raw.family, EXECUTION_FAMILIES, "prescription.family", what);
  if (raw.sets !== undefined) requireNumber(raw.sets, "prescription.sets", what);
  if (raw.warmupSets !== undefined) requireNumber(raw.warmupSets, "prescription.warmupSets", what);
  if (raw.reps !== undefined) validatePrescriptionReps(raw.reps, what);
  if (raw.load !== undefined) validatePrescriptionLoad(raw.load, what);
  if (raw.rpe !== undefined) requireNumber(raw.rpe, "prescription.rpe", what);
  if (raw.rir !== undefined) requireNumber(raw.rir, "prescription.rir", what);
  if (raw.duration !== undefined) validatePrescriptionDuration(raw.duration, what);
  if (raw.distance !== undefined) validatePrescriptionDistance(raw.distance, what);
  if (raw.pace !== undefined) validatePrescriptionPace(raw.pace, what);
  if (raw.heartRate !== undefined) validatePrescriptionHeartRate(raw.heartRate, what);
  if (raw.power !== undefined) validatePrescriptionPower(raw.power, what);
  if (raw.rounds !== undefined) requireNumber(raw.rounds, "prescription.rounds", what);
  if (raw.workInterval !== undefined) validatePrescriptionIntervalField(raw.workInterval, "prescription.workInterval", what);
  if (raw.recoveryInterval !== undefined)
    validatePrescriptionIntervalField(raw.recoveryInterval, "prescription.recoveryInterval", what);
  if (raw.restSeconds !== undefined) requireNumber(raw.restSeconds, "prescription.restSeconds", what);
  if (raw.tempo !== undefined) requireString(raw.tempo, "prescription.tempo", what);
  if (raw.cadence !== undefined) requireNumber(raw.cadence, "prescription.cadence", what);
  if (raw.amrap !== undefined) requireBoolean(raw.amrap, "prescription.amrap", what);
  if (raw.completionTarget !== undefined) requireString(raw.completionTarget, "prescription.completionTarget", what);
  if (raw.side !== undefined) requireOneOf(raw.side, PRESCRIPTION_SIDES, "prescription.side", what);
  if (raw.warmupInstruction !== undefined) requireString(raw.warmupInstruction, "prescription.warmupInstruction", what);
  return raw as unknown as Prescription;
}

function validateTrainingItemInstance(raw: unknown, what: string): TrainingItemInstance {
  if (!isRecord(raw)) fail(what, "training item instance is not an object");
  requireString(raw.id, "item.id", what);
  requireNumber(raw.order, "item.order", what);
  requireString(raw.name, "item.name", what);
  requireOneOf(raw.category, EXECUTION_FAMILIES, "item.category", what);
  if (raw.catalogItemId !== undefined) requireString(raw.catalogItemId, "item.catalogItemId", what);
  if (raw.coachCue !== undefined) requireString(raw.coachCue, "item.coachCue", what);
  if (raw.substituteItemId !== undefined) requireString(raw.substituteItemId, "item.substituteItemId", what);
  if (raw.prescription === undefined) fail(what, `"item.prescription" is missing`);
  validatePrescription(raw.prescription, what);
  return raw as unknown as TrainingItemInstance;
}

function validateBlock(raw: unknown, what: string): Block {
  if (!isRecord(raw)) fail(what, "block is not an object");
  requireString(raw.id, "block.id", what);
  requireOneOf(raw.kind, BLOCK_KINDS, "block.kind", what);
  requireNumber(raw.order, "block.order", what);
  if (raw.rounds !== undefined) requireNumber(raw.rounds, "block.rounds", what);
  if (raw.restBetweenItemsSeconds !== undefined) requireNumber(raw.restBetweenItemsSeconds, "block.restBetweenItemsSeconds", what);
  if (raw.restBetweenRoundsSeconds !== undefined) requireNumber(raw.restBetweenRoundsSeconds, "block.restBetweenRoundsSeconds", what);
  if (raw.timeCapSeconds !== undefined) requireNumber(raw.timeCapSeconds, "block.timeCapSeconds", what);
  if (raw.completionRule !== undefined) requireString(raw.completionRule, "block.completionRule", what);
  const items = requireArray(raw.items, "block.items", what);
  if (items.length === 0) fail(what, `"block.items" must have at least one item`);
  items.forEach((i) => validateTrainingItemInstance(i, what));
  return raw as unknown as Block;
}

/** Exported (Phase 2) so the legacy adapter's own verify suite
 * (lib/training/verify-legacy-adapter.mts) can validate a bare converted
 * Session directly, without wrapping it in a full program-content payload it
 * doesn't otherwise need. */
export function validateSession(raw: unknown, what: string): Session {
  if (!isRecord(raw)) fail(what, "session is not an object");
  requireString(raw.id, "session.id", what);
  requireString(raw.name, "session.name", what);
  requireString(raw.focus, "session.focus", what);
  requireNumber(raw.estimatedDurationMin, "session.estimatedDurationMin", what);
  if (raw.warmupOverview !== undefined) requireString(raw.warmupOverview, "session.warmupOverview", what);
  if (raw.coachNote !== undefined) requireString(raw.coachNote, "session.coachNote", what);
  const blocks = requireArray(raw.blocks, "session.blocks", what);
  if (blocks.length === 0) fail(what, `"session.blocks" must have at least one block`);
  blocks.forEach((b) => validateBlock(b, what));
  return raw as unknown as Session;
}

function validateUniversalProgramDay(raw: unknown, what: string): UniversalProgramDay {
  if (!isRecord(raw)) fail(what, "program day is not an object");
  requireString(raw.dayOfWeek, "day.dayOfWeek", what);
  const type = requireString(raw.type, "day.type", what);
  if (type !== "training" && type !== "rest") fail(what, `"day.type" must be "training" or "rest", got "${type}"`);
  if (type === "training") {
    const sessions = requireArray(raw.sessions, "day.sessions", what);
    if (sessions.length === 0) fail(what, `day.type is "training" but "day.sessions" is empty`);
    sessions.forEach((s) => validateSession(s, what));
  }
  return raw as unknown as UniversalProgramDay;
}

function validateUniversalProgramWeek(raw: unknown, what: string): UniversalProgramWeek {
  if (!isRecord(raw)) fail(what, "program week is not an object");
  requireNumber(raw.weekNumber, "week.weekNumber", what);
  const days = requireArray(raw.days, "week.days", what);
  if (days.length !== 7) fail(what, `"week.days" must have exactly 7 entries, got ${days.length}`);
  days.forEach((d) => validateUniversalProgramDay(d, what));
  return raw as unknown as UniversalProgramWeek;
}

/** Validates a training_program_versions.content payload shaped by
 * lib/training/types.ts's UniversalTrainingProgramContent — same
 * "not exhaustive, just structural" discipline as
 * validateClientAssignedProgramContent below. Requires `schemaVersion` to be
 * exactly 2; use validateTrainingProgramVersionContent to dispatch a raw
 * payload of unknown shape to whichever of the two validators applies. */
export function validateUniversalTrainingProgramContent(raw: unknown): UniversalTrainingProgramContent {
  const what = "training program version (universal grammar)";
  if (!isRecord(raw)) fail(what, "content is not an object");
  if (raw.schemaVersion !== 2) fail(what, `"schemaVersion" must be 2, got ${JSON.stringify(raw.schemaVersion)}`);
  requireString(raw.id, "id", what);
  requireString(raw.workspaceId, "workspaceId", what);
  requireString(raw.clientId, "clientId", what);
  requireString(raw.coachId, "coachId", what);
  if (raw.sourceTemplateId !== undefined) requireString(raw.sourceTemplateId, "sourceTemplateId", what);
  if (raw.generationRationale !== undefined) requireString(raw.generationRationale, "generationRationale", what);
  if (raw.appliedLearnedRuleIds !== undefined) requireArray(raw.appliedLearnedRuleIds, "appliedLearnedRuleIds", what).forEach((id, i) => requireString(id, `appliedLearnedRuleIds[${i}]`, what));
  if (raw.methodologyConflictedLearnedRuleIds !== undefined) requireArray(raw.methodologyConflictedLearnedRuleIds, "methodologyConflictedLearnedRuleIds", what).forEach((id, i) => requireString(id, `methodologyConflictedLearnedRuleIds[${i}]`, what));
  requireString(raw.name, "name", what);
  requireNumber(raw.durationWeeks, "durationWeeks", what);
  const weeks = requireArray(raw.weeks, "weeks", what);
  weeks.forEach((w) => validateUniversalProgramWeek(w, what));
  const status = requireString(raw.status, "status", what);
  if (status !== "draft" && status !== "assigned") fail(what, `"status" must be "draft" or "assigned", got "${status}"`);
  requireString(raw.createdAtIso, "createdAtIso", what);
  requireString(raw.updatedAtIso, "updatedAtIso", what);
  return raw as unknown as UniversalTrainingProgramContent;
}

export type TrainingProgramVersionContent = ClientAssignedProgram | UniversalTrainingProgramContent;

/** Dispatches a training_program_versions.content payload to the legacy
 * (no schemaVersion field: ClientAssignedProgram/Exercise/Workout) or
 * universal-grammar (schemaVersion: 2: UniversalTrainingProgramContent)
 * validator, by that one tag. Phase 5 — lib/production/programs.ts's
 * getActiveProgramAssignment now calls this directly (not
 * validateClientAssignedProgramContent) so both legacy and real generated
 * universal content read back correctly through the one production read
 * path, without that path ever needing to branch on shape itself. */
export function validateTrainingProgramVersionContent(raw: unknown): TrainingProgramVersionContent {
  if (isRecord(raw) && raw.schemaVersion === 2) {
    return validateUniversalTrainingProgramContent(raw);
  }
  return validateClientAssignedProgramContent(raw);
}

/** Validates a training_program_versions.content payload into a real
 * ClientAssignedProgram — throws InvalidPersistedContentError rather than
 * casting on any structural mismatch. `status` is intentionally NOT
 * re-derived from the DB row here (draft/assigned in this domain type
 * predates and doesn't map 1:1 onto the DB's draft/published/archived —
 * see lib/production/programs.ts's own mapping), so callers overwrite
 * `.status` themselves after this returns. */
export function validateClientAssignedProgramContent(raw: unknown): ClientAssignedProgram {
  const what = "training program version";
  if (!isRecord(raw)) fail(what, "content is not an object");
  requireString(raw.id, "id", what);
  requireString(raw.workspaceId, "workspaceId", what);
  requireString(raw.clientId, "clientId", what);
  requireString(raw.coachId, "coachId", what);
  requireString(raw.name, "name", what);
  requireNumber(raw.durationWeeks, "durationWeeks", what);
  const weeks = requireArray(raw.weeks, "weeks", what);
  weeks.forEach((w) => validateProgramWeek(w, what));
  requireString(raw.status, "status", what);
  requireString(raw.createdAtIso, "createdAtIso", what);
  requireString(raw.updatedAtIso, "updatedAtIso", what);
  return raw as unknown as ClientAssignedProgram;
}

/** Validates a nutrition_plan_versions.content payload into a real
 * AssignedNutritionPlan. */
export function validateAssignedNutritionPlanContent(raw: unknown): AssignedNutritionPlan {
  const what = "nutrition plan version";
  if (!isRecord(raw)) fail(what, "content is not an object");
  requireString(raw.id, "id", what);
  if (!isRecord(raw.targets)) fail(what, `"targets" is not an object`);
  requireNumber(raw.targets.calories, "targets.calories", what);
  requireNumber(raw.targets.proteinG, "targets.proteinG", what);
  requireNumber(raw.targets.carbsG, "targets.carbsG", what);
  requireNumber(raw.targets.fatG, "targets.fatG", what);
  if (typeof raw.usesTrainingRestSplit !== "boolean") fail(what, `"usesTrainingRestSplit" must be a boolean`);
  return raw as unknown as AssignedNutritionPlan;
}

export interface DailyActivityContent {
  training: TrainingDaySnapshot;
  nutrition: NutritionDaySnapshot;
}

/** Validates a daily_records.content payload — the { training, nutrition }
 * envelope lib/production/programs.ts writes via
 * lib/history/build-daily-record.ts's own pure snapshot builder. Deliberately
 * loose on the two nested snapshots themselves (they're already produced by
 * that trusted, pure, already-tested function on every write this app makes
 * — the risk this guards against is a malformed/foreign row, not a
 * legitimate write disagreeing with its own producer) — just enough
 * structure to prove it's shaped like day activity at all before handing it
 * to any reducer/derivation code that assumes the real shape. */
export function validateDailyActivityContent(raw: unknown): DailyActivityContent {
  const what = "daily activity record";
  if (!isRecord(raw)) fail(what, "content is not an object");
  if (!isRecord(raw.training)) fail(what, `"training" is not an object`);
  if (!isRecord(raw.nutrition)) fail(what, `"nutrition" is not an object`);
  requireString(raw.training.trainingDayType, "training.trainingDayType", what);
  if (!isRecord(raw.training.exerciseLogs)) fail(what, `"training.exerciseLogs" is not an object`);
  requireNumber(raw.training.workingSetsCompleted, "training.workingSetsCompleted", what);
  requireNumber(raw.training.workingSetsPrescribed, "training.workingSetsPrescribed", what);
  if (!isRecord(raw.nutrition.meals)) fail(what, `"nutrition.meals" is not an object`);
  requireArray(raw.nutrition.periodsInPlan, "nutrition.periodsInPlan", what);
  if (!isRecord(raw.nutrition.targetsSnapshot)) fail(what, `"nutrition.targetsSnapshot" is not an object`);
  return raw as unknown as DailyActivityContent;
}

/** Validates a coach_playbooks.content payload (Phase 6.0C) — checks the
 * sections lib/ai/context.ts's buildSystemPrompt and
 * lib/coach/ai-authority.ts's resolver actually read, same "not exhaustive,
 * just what the live engine reads" tradeoff this file's own header
 * documents for program/nutrition content. A malformed row (hand-edited,
 * foreign writer, storage corruption) throws here rather than silently
 * assembling a broken or empty system prompt for a real client. */
export function validatePlaybookContent(raw: unknown): CoachPlaybookContent {
  const what = "coach playbook";
  if (!isRecord(raw)) fail(what, "content is not an object");
  if (!isRecord(raw.operatingModel)) fail(what, `"operatingModel" is not an object`);
  const m = raw.operatingModel;
  if (!isRecord(m.communication)) fail(what, `"operatingModel.communication" is not an object`);
  requireString(m.communication.tone, "operatingModel.communication.tone", what);
  requireString(m.communication.conciseness, "operatingModel.communication.conciseness", what);
  if (!isRecord(m.programArchitecture)) fail(what, `"operatingModel.programArchitecture" is not an object`);
  requireString(m.programArchitecture.substitutionLogic, "operatingModel.programArchitecture.substitutionLogic", what);
  requireString(m.programArchitecture.proximityToFailure, "operatingModel.programArchitecture.proximityToFailure", what);
  requireString(m.programArchitecture.progressionMethod, "operatingModel.programArchitecture.progressionMethod", what);
  if (!isRecord(m.nutritionPhilosophy)) fail(what, `"operatingModel.nutritionPhilosophy" is not an object`);
  requireString(m.nutritionPhilosophy.calorieTargetPhilosophy, "operatingModel.nutritionPhilosophy.calorieTargetPhilosophy", what);
  requireString(m.nutritionPhilosophy.adherenceStandard, "operatingModel.nutritionPhilosophy.adherenceStandard", what);
  if (!isRecord(m.safety)) fail(what, `"operatingModel.safety" is not an object`);
  requireString(m.safety.painResponsePolicy, "operatingModel.safety.painResponsePolicy", what);
  requireString(m.safety.injuryResponsePolicy, "operatingModel.safety.injuryResponsePolicy", what);
  requireString(m.safety.medicalConcernPolicy, "operatingModel.safety.medicalConcernPolicy", what);
  requireArray(m.safety.absoluteOverrideRules, "operatingModel.safety.absoluteOverrideRules", what);

  if (!isRecord(raw.aiAuthority)) fail(what, `"aiAuthority" is not an object`);
  if (!isRecord(raw.aiAuthority.global)) fail(what, `"aiAuthority.global" is not an object`);
  requireString(raw.aiAuthority.global.level, "aiAuthority.global.level", what);
  if (!isRecord(raw.aiAuthority.clientOverrides)) fail(what, `"aiAuthority.clientOverrides" is not an object`);

  requireArray(raw.examples, "examples", what);

  return raw as unknown as CoachPlaybookContent;
}
