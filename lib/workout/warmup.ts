// Phase 4.4B-2 — coach-controlled warm-up configuration derivation.
//
// Warm-ups are program/configuration data, never a universal OPTIM behavior
// and never something the client authors mid-session. Every function here is
// a pure derivation from real Workout/Exercise fields already on the
// catalog — nothing here invents a weight, percentage, or instruction. A
// future coach-authoring surface would simply populate the same fields
// (Exercise.warmupInstruction, Exercise.prescribedSets' warm-up entries,
// Workout.warmupOverview) that these functions already read.

import type { Exercise, Workout } from "../types";

export type SessionWarmupConfig =
  | { mode: "none" }
  | { mode: "confirmation"; instruction: string };

/** The once-per-session preparation routine, sourced from the workout's own
 * real `warmupOverview` text (already authored on every catalog workout —
 * see lib/mock-data.ts). "none" is architecturally supported for a future
 * workout with no session-level routine, but no current catalog entry omits
 * one. */
export function resolveSessionWarmupConfig(workout: Workout): SessionWarmupConfig {
  const instruction = workout.warmupOverview?.trim();
  if (!instruction) return { mode: "none" };
  return { mode: "confirmation", instruction };
}

export interface ExerciseWarmupStep {
  setNumber: number;
  targetRepsLow: number;
  targetRepsHigh: number;
  prescribedWeightLb?: number;
}

export type ExerciseWarmupConfig =
  | { mode: "none" }
  | { mode: "instruction"; instruction: string }
  | { mode: "stepped"; steps: ExerciseWarmupStep[] };

/**
 * Per-exercise warm-up, in priority order:
 * 1. A coach-authored free-text override (Exercise.warmupInstruction) — a
 *    simple instruction like "Complete 1–2 light feeler sets."
 * 2. Individually stepped ramping sets, derived from this exercise's own
 *    real prescribed warm-up sets (Exercise.prescribedSets where
 *    isWarmup === true) — every current catalog exercise uses this form.
 * 3. "none" when neither exists — a real, honest configuration, not an
 *    error state.
 */
export function resolveExerciseWarmupConfig(exercise: Exercise): ExerciseWarmupConfig {
  const instruction = exercise.warmupInstruction?.trim();
  if (instruction) return { mode: "instruction", instruction };

  const steps: ExerciseWarmupStep[] = exercise.prescribedSets
    .filter((s) => s.isWarmup)
    .sort((a, b) => a.setNumber - b.setNumber)
    .map((s, i) => ({
      setNumber: i + 1,
      targetRepsLow: s.targetRepsLow,
      targetRepsHigh: s.targetRepsHigh,
      prescribedWeightLb: s.prescribedWeightLb,
    }));

  if (steps.length === 0) return { mode: "none" };
  return { mode: "stepped", steps };
}
