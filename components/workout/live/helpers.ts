// Phase 4.4B-2 — small shared pure helpers for the live guided-flow panels.
// Nothing here fabricates data; every function reads real Exercise/
// ExerciseLog fields already on the catalog/session.

import { recommendRest } from "@/lib/workout/rest-policy";
import type { Exercise, ExerciseLog, PrescribedSet } from "@/lib/types";

export function workingPrescribedSets(exercise: Exercise): PrescribedSet[] {
  return exercise.prescribedSets.filter((s) => !s.isWarmup).sort((a, b) => a.setNumber - b.setNumber);
}

/** The 0-based position of `setNumber` among this exercise's working sets —
 * what "Last time" comparisons and previousPerformance indexing use. */
export function workingSetDisplayIndex(exercise: Exercise, setNumber: number): number {
  return workingPrescribedSets(exercise).findIndex((s) => s.setNumber === setNumber);
}

export function prescribedWorkingSet(exercise: Exercise, setNumber: number): PrescribedSet | undefined {
  return workingPrescribedSets(exercise).find((s) => s.setNumber === setNumber);
}

export function completedWorkingSetCount(log: ExerciseLog | undefined): number {
  if (!log) return 0;
  return log.loggedSets.filter((s) => !s.isWarmup && s.status === "completed").length;
}

// Phase 3.1.1 §3 — a simple, non-disruptive line pulled from this exercise's
// own prescribed rest interval, never the same fixed value for every
// exercise. Phase 4.4B-2.1 — delegates to the one rest-recommendation policy
// (lib/workout/rest-policy.ts) with no RPE yet known, so the baseline-only
// preview shown before a set is logged can never drift from the RPE-aware
// number shown after it.
export function formatRestRecommendation(restSeconds?: number): string {
  return recommendRest(restSeconds, null, 8).label;
}
