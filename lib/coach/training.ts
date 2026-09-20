// Phase 5.2 — coach-authored training protocols.
//
// Builds directly on the existing Workout/Exercise/PrescribedSet/
// CardioPrescription shapes (see lib/types.ts) rather than a second,
// disconnected representation — a ProgramDay's `workout` is a real,
// loggable Workout, the exact shape the client Training/Today experience
// already knows how to render (see lib/mock-data.ts's
// resolveWorkoutAvailabilityForDay, which now prefers a client's
// assignedProgram when one exists).

import type { ClientAssignedProgram, DayOfWeek, Exercise, PrescribedSet, ProgramDay, ProgramWeek, RpeValue, Workout } from "../types";
import type { ClientProfileId, CoachProfileId, WorkspaceId } from "../tenancy/types";
import type { CoachProgramTemplate } from "./types";

let idCounter = 0;
function nextTrainingId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now()}-${idCounter}`;
}

export const DAYS_OF_WEEK_ORDER: DayOfWeek[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function createEmptyProgramDay(dayOfWeek: DayOfWeek): ProgramDay {
  return { dayOfWeek, type: "rest" };
}

export function createEmptyProgramWeek(weekNumber: number): ProgramWeek {
  return { weekNumber, days: DAYS_OF_WEEK_ORDER.map(createEmptyProgramDay) };
}

export function createEmptyExercise(order: number): Exercise {
  return {
    id: nextTrainingId("exercise"),
    order,
    name: "",
    warmupSets: 0,
    workingSets: 3,
    targetRepsLow: 8,
    targetRepsHigh: 10,
    targetRpe: 8,
    restSeconds: 90,
    tempo: "",
    cue: "",
    previousPerformance: [],
    prescribedSets: [],
  };
}

/**
 * Real, loggable PrescribedSet entries from an exercise's own working-set
 * config — the one gap found auditing this file for Phase 5.4A: the coach
 * program editor has never populated this array (every coach-authored
 * exercise persists with `prescribedSets: []`, see createEmptyExercise
 * above), which the client's live guided workout flow depends on
 * (lib/workout/session-flow.ts reads exercise.prescribedSets directly).
 * lib/mock-data.ts's own catalog has always populated an equivalent array
 * by hand for its demo content (see its private makeSetPrescriptions) —
 * this is that same real logic, exported so any real write path (the
 * editor, or Phase 5.4A's activation-generation.ts) can produce a genuinely
 * live-loggable exercise rather than a preview-only one.
 */
export function buildPrescribedSets(input: {
  warmupSets: number;
  workingSets: number;
  targetRepsLow: number;
  targetRepsHigh: number;
  targetRpe: RpeValue;
  workingWeightLb?: number;
}): PrescribedSet[] {
  const sets: PrescribedSet[] = [];
  const warmupWeightLb = input.workingWeightLb !== undefined ? Math.round((input.workingWeightLb * 0.55) / 5) * 5 : undefined;
  const workingReps = Math.round((input.targetRepsLow + input.targetRepsHigh) / 2);
  for (let i = 1; i <= input.warmupSets; i++) {
    sets.push({ setNumber: i, isWarmup: true, targetRepsLow: 10, targetRepsHigh: 12, targetRpe: 6, prescribedWeightLb: warmupWeightLb, prescribedReps: 11 });
  }
  for (let i = 1; i <= input.workingSets; i++) {
    sets.push({
      setNumber: input.warmupSets + i,
      isWarmup: false,
      targetRepsLow: input.targetRepsLow,
      targetRepsHigh: input.targetRepsHigh,
      targetRpe: input.targetRpe,
      prescribedWeightLb: input.workingWeightLb,
      prescribedReps: workingReps,
    });
  }
  return sets;
}

export function createEmptyWorkout(workspaceId: WorkspaceId, dayOfWeek: DayOfWeek): Workout {
  return {
    id: nextTrainingId("workout"),
    workspaceId,
    name: "",
    dayOfWeek,
    focus: "",
    estimatedDurationMin: 60,
    warmupOverview: "",
    coachNote: "",
    exercises: [],
  };
}

export function createEmptyClientProgram(input: {
  workspaceId: WorkspaceId;
  clientId: ClientProfileId;
  coachId: CoachProfileId;
  name: string;
  durationWeeks: number;
  nowIso: string;
}): ClientAssignedProgram {
  return {
    id: nextTrainingId("program"),
    workspaceId: input.workspaceId,
    clientId: input.clientId,
    coachId: input.coachId,
    name: input.name,
    durationWeeks: input.durationWeeks,
    weeks: [createEmptyProgramWeek(1)],
    status: "draft",
    createdAtIso: input.nowIso,
    updatedAtIso: input.nowIso,
  };
}

export function createEmptyTemplate(input: {
  workspaceId: WorkspaceId;
  coachId: CoachProfileId;
  name: string;
  durationWeeks: number;
  nowIso: string;
}): CoachProgramTemplate {
  return {
    id: nextTrainingId("template"),
    workspaceId: input.workspaceId,
    coachId: input.coachId,
    name: input.name,
    durationWeeks: input.durationWeeks,
    weeks: [createEmptyProgramWeek(1)],
    createdAtIso: input.nowIso,
    updatedAtIso: input.nowIso,
  };
}

/** A deep, structurally independent copy of a coach's template for exactly
 * one client — every nested id (workout, exercise) is regenerated so this
 * copy can never be confused for the template's own content, and later
 * edits to either the template or this client's copy can never affect the
 * other. Always starts "assigned" (the coach explicitly chose to hand this
 * to a client, distinct from a from-scratch program that starts "draft"
 * until they say otherwise). */
export function assignTemplateToClient(
  template: CoachProgramTemplate,
  input: { clientId: ClientProfileId; nowIso: string }
): ClientAssignedProgram {
  return {
    id: nextTrainingId("program"),
    workspaceId: template.workspaceId,
    clientId: input.clientId,
    coachId: template.coachId,
    sourceTemplateId: template.id,
    name: template.name,
    durationWeeks: template.durationWeeks,
    weeks: template.weeks.map(deepCloneWeekWithFreshIds),
    status: "assigned",
    createdAtIso: input.nowIso,
    updatedAtIso: input.nowIso,
  };
}

function deepCloneWeekWithFreshIds(week: ProgramWeek): ProgramWeek {
  return { weekNumber: week.weekNumber, days: week.days.map(deepCloneDayWithFreshIds) };
}

function deepCloneDayWithFreshIds(day: ProgramDay): ProgramDay {
  return { dayOfWeek: day.dayOfWeek, type: day.type, workout: day.workout ? deepCloneWorkoutWithFreshIds(day.workout) : undefined };
}

function deepCloneWorkoutWithFreshIds(workout: Workout): Workout {
  return { ...workout, id: nextTrainingId("workout"), exercises: workout.exercises.map((ex) => ({ ...ex, id: nextTrainingId("exercise") })) };
}

/** Copies one day's content onto another day within the same week — the
 * editor's "duplicate day" action. Regenerates ids so the two days' workout
 * content is never accidentally shared by reference. */
export function duplicateDayWithinWeek(week: ProgramWeek, fromDay: DayOfWeek, toDay: DayOfWeek): ProgramWeek {
  const source = week.days.find((d) => d.dayOfWeek === fromDay);
  if (!source) return week;
  const cloned: ProgramDay = { dayOfWeek: toDay, type: source.type, workout: source.workout ? deepCloneWorkoutWithFreshIds(source.workout) : undefined };
  return { ...week, days: week.days.map((d) => (d.dayOfWeek === toDay ? cloned : d)) };
}

/** Copies an entire week's content into another week number — the editor's
 * "duplicate week" action, shared by both a coach's template and a
 * specific client's program (only `weeks`/`durationWeeks` are read, so
 * either shape works). Creates the target week if it doesn't exist yet
 * (capped at durationWeeks); returns `weeks` unchanged if the source week
 * doesn't exist or the target is out of range. */
export function duplicateWeek<T extends { weeks: ProgramWeek[]; durationWeeks: number }>(program: T, fromWeekNumber: number, toWeekNumber: number): T {
  const source = program.weeks.find((w) => w.weekNumber === fromWeekNumber);
  if (!source || toWeekNumber < 1 || toWeekNumber > program.durationWeeks) return program;
  const cloned = deepCloneWeekWithFreshIds({ ...source, weekNumber: toWeekNumber });
  const exists = program.weeks.some((w) => w.weekNumber === toWeekNumber);
  const weeks = exists ? program.weeks.map((w) => (w.weekNumber === toWeekNumber ? cloned : w)) : [...program.weeks, cloned].sort((a, b) => a.weekNumber - b.weekNumber);
  return { ...program, weeks };
}

/** Moves one exercise within a workout and renumbers `order` sequentially —
 * the editor's reordering action. A no-op if either index is out of range. */
export function reorderExercises(workout: Workout, fromIndex: number, toIndex: number): Workout {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= workout.exercises.length || toIndex >= workout.exercises.length) {
    return workout;
  }
  const next = [...workout.exercises];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return { ...workout, exercises: next.map((ex, i) => ({ ...ex, order: i + 1 })) };
}

/** A single exercise counts as genuinely prescribed — not just a name typed
 * in — when it has real working sets and a rep range a client can actually
 * follow. Mirrors the minimum the existing client workout flow already
 * assumes every catalog exercise has. */
function isExerciseUsable(exercise: Exercise): boolean {
  return exercise.name.trim().length > 0 && exercise.workingSets > 0 && exercise.targetRepsLow > 0 && exercise.targetRepsHigh >= exercise.targetRepsLow;
}

/** Whether this program has a deliberate, genuinely usable Week 1 — the
 * activation bar (see lib/coach/activation.ts): every training day has a
 * real workout with at least one usable exercise, and at least one day is
 * actually a training day (a week of all rest days is indistinguishable
 * from a week the coach never touched — every fresh week starts that way,
 * see createEmptyProgramWeek — so it can never satisfy this on its own).
 * Coach may still be building out later weeks; only Week 1 gates
 * activation. */
export function isValidWeek1(program: ClientAssignedProgram): boolean {
  if (program.status !== "assigned") return false;
  const week1 = program.weeks.find((w) => w.weekNumber === 1);
  if (!week1 || week1.days.length !== 7) return false;
  const hasAtLeastOneTrainingDay = week1.days.some((day) => day.type === "training");
  if (!hasAtLeastOneTrainingDay) return false;
  return week1.days.every((day) => {
    if (day.type === "rest") return true;
    return !!day.workout && day.workout.exercises.length > 0 && day.workout.exercises.every(isExerciseUsable);
  });
}

/**
 * Gate 4D — a real, honest account of where a client's CURRENT assigned
 * program actually came from, using only fields the two existing writers
 * already produce (lib/coach/program-assignment.ts's manual save path, and
 * lib/coach/activation-lifecycle.ts's approveActivation) — never a
 * fabricated or inferred origin, and never a third program model. A
 * template-sourced program always says so (sourceTemplateId survives the
 * copy — see assignTemplateToClient above). An OPTIM-generated one is
 * recognized by the one real link between the two systems:
 * ActivationApprovalRecord.resultingProgramId, which approveActivation
 * stamps with the exact id of the program it just wrote via
 * saveClientProgram — the same id already displayed on the OPTIM Plan page
 * itself (see app/coach/clients/[clientId]/activate/page.tsx). Anything
 * else (no template, no matching approval) was built directly in the
 * manual editor.
 */
export type ProgramOrigin = { kind: "template"; templateId: string; templateName: string } | { kind: "optim_generated"; approvedAtIso: string } | { kind: "manual" };

export function resolveProgramOrigin(
  program: ClientAssignedProgram,
  activationGenerations: readonly { clientId: ClientProfileId; approval?: { resultingProgramId: string; approvedAtIso: string } }[],
  templates: readonly { id: string; name: string }[]
): ProgramOrigin {
  if (program.sourceTemplateId) {
    const template = templates.find((t) => t.id === program.sourceTemplateId);
    return { kind: "template", templateId: program.sourceTemplateId, templateName: template?.name || "a saved template" };
  }
  const approvedGeneration = activationGenerations.find((g) => g.clientId === program.clientId && g.approval?.resultingProgramId === program.id);
  if (approvedGeneration?.approval) {
    return { kind: "optim_generated", approvedAtIso: approvedGeneration.approval.approvedAtIso };
  }
  return { kind: "manual" };
}
