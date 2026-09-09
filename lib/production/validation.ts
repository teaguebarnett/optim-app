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
