// Phase 4.4B-2 — pure queue/progression logic for the guided live workout.
//
// This is the one place "what happens next" is decided for exercise
// sequencing, so lib/state.ts's reducer stays thin and every transition is
// independently testable. Nothing here touches React, routing, or
// timestamps beyond what's already on canonical session state — see
// lib/state.ts for where these are wired into actual reducer cases.
//
// Stable-id navigation only (Phase 4.4B-2 correction): every function here
// works in terms of exercise ids, never array indices, so deferring or
// reordering an exercise can never corrupt progress the way an index into
// the coach's original array would.

import { canCompleteExercise } from "../workout-analysis.ts";
import type { Exercise, ExerciseLog, Workout, WorkoutSession, WorkoutSessionPhase } from "../types";

/** The next prescribed working-set number this exercise still needs
 * resolved (completed with a valid RPE, or skipped) — null once every
 * prescribed working set has been addressed. */
export function firstUnresolvedWorkingSetNumber(exercise: Exercise, log: ExerciseLog | undefined): number | null {
  const workingPrescribed = exercise.prescribedSets.filter((s) => !s.isWarmup).sort((a, b) => a.setNumber - b.setNumber);
  const loggedByNumber = new Map((log?.loggedSets ?? []).map((s) => [s.setNumber, s]));
  for (const prescribed of workingPrescribed) {
    const logged = loggedByNumber.get(prescribed.setNumber);
    if (!logged) return prescribed.setNumber;
    if (logged.status === "completed" && logged.rpe === null) return prescribed.setNumber;
  }
  return null;
}

/** An exercise is resolved once it's either explicitly skipped whole, or
 * every prescribed working set has been individually addressed (reuses
 * canCompleteExercise's exact "every prescribed set addressed, at least one
 * really completed" rule — never a second competing formula). */
export function isExerciseResolved(exercise: Exercise, log: ExerciseLog | undefined): boolean {
  if (!log) return false;
  if (log.status === "skipped") return true;
  return canCompleteExercise(exercise, log);
}

export function findExerciseById(workout: Workout, exerciseId: string | null): Exercise | undefined {
  if (!exerciseId) return undefined;
  return workout.exercises.find((e) => e.id === exerciseId);
}

export interface InitialFlowState {
  exerciseQueue: string[];
  currentExerciseId: string;
  actualExerciseOrder: string[];
}

/** The queue/current-exercise shape a brand-new session starts in — the
 * coach's own authored exercise order, untouched. */
export function buildInitialFlowState(workout: Workout): InitialFlowState {
  const exerciseQueue = workout.exercises.map((e) => e.id);
  const currentExerciseId = exerciseQueue[0];
  return { exerciseQueue, currentExerciseId, actualExerciseOrder: currentExerciseId ? [currentExerciseId] : [] };
}

export interface QueueAdvanceResult {
  currentExerciseId: string | null;
  exerciseQueue: string[];
  actualExerciseOrder: string[];
  deferredExerciseIds: string[];
  lastResolvedExerciseId: string | null;
  phase: WorkoutSessionPhase;
  currentSetNumber: number | null;
}

function appendIfNew(order: string[], id: string | null): string[] {
  if (!id || order.includes(id)) return order;
  return [...order, id];
}

/**
 * Called once the CURRENT exercise has just become resolved (its final
 * working set was logged/skipped, or it was explicitly skipped whole).
 * Pops it from the queue and hands off to whatever remains — the next
 * not-yet-attempted or previously-deferred exercise, or the session summary
 * once nothing remains. Never used for a defer (see deferCurrentExercise) —
 * a deferred exercise is requeued, not resolved.
 */
export function advanceAfterExerciseResolved(session: WorkoutSession): QueueAdvanceResult {
  const resolvedId = session.currentExerciseId;
  const remainingQueue = session.exerciseQueue.filter((id) => id !== resolvedId);
  const nextId = remainingQueue[0] ?? null;
  return {
    currentExerciseId: nextId,
    exerciseQueue: remainingQueue,
    actualExerciseOrder: appendIfNew(session.actualExerciseOrder, nextId),
    deferredExerciseIds: session.deferredExerciseIds.filter((id) => id !== resolvedId),
    lastResolvedExerciseId: resolvedId,
    phase: nextId ? "exercise-transition" : "session-summary",
    currentSetNumber: null,
  };
}

/**
 * Moves the current exercise ("Do later") to the back of the queue instead
 * of resolving it. The session naturally returns to it once every other
 * queued exercise has been resolved, since it's still in exerciseQueue —
 * just at the end. A no-op (besides bookkeeping) when it's the only
 * exercise left, since there's nowhere else to go — callers should avoid
 * offering "Do later" in that case.
 */
export function deferCurrentExercise(session: WorkoutSession): QueueAdvanceResult {
  const currentId = session.currentExerciseId;
  if (!currentId) {
    return {
      currentExerciseId: session.currentExerciseId,
      exerciseQueue: session.exerciseQueue,
      actualExerciseOrder: session.actualExerciseOrder,
      deferredExerciseIds: session.deferredExerciseIds,
      lastResolvedExerciseId: session.lastResolvedExerciseId,
      phase: session.phase,
      currentSetNumber: session.currentSetNumber,
    };
  }
  const withoutCurrent = session.exerciseQueue.filter((id) => id !== currentId);
  const requeued = [...withoutCurrent, currentId];
  const nextId = withoutCurrent[0] ?? currentId;
  const deferredExerciseIds = session.deferredExerciseIds.includes(currentId)
    ? session.deferredExerciseIds
    : [...session.deferredExerciseIds, currentId];

  if (nextId === currentId) {
    // Only exercise left in the queue — nothing to hand off to.
    return {
      currentExerciseId: currentId,
      exerciseQueue: requeued,
      actualExerciseOrder: session.actualExerciseOrder,
      deferredExerciseIds,
      lastResolvedExerciseId: session.lastResolvedExerciseId,
      phase: session.phase,
      currentSetNumber: session.currentSetNumber,
    };
  }

  return {
    currentExerciseId: nextId,
    exerciseQueue: requeued,
    actualExerciseOrder: appendIfNew(session.actualExerciseOrder, nextId),
    deferredExerciseIds,
    // Deferred (not resolved) — the transition surface checks
    // deferredExerciseIds to tell these apart and show "you'll come back to
    // this" rather than completion-style copy.
    lastResolvedExerciseId: currentId,
    phase: "exercise-transition",
    currentSetNumber: null,
  };
}
