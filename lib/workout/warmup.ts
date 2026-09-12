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
import { buildPrescribedSets } from "../coach/training.ts";
import type { Session, TrainingItemInstance } from "../training/types.ts";

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

// ---------------------------------------------------------------------------
// Phase 3 — the same two derivations above, proven sufficient from the
// universal Session/TrainingItemInstance grammar alone (Phase 3 spec section
// 9: "do not re-derive [warm-up behavior] from legacy Exercise after the
// Session conversion if the universal Prescription already contains the
// necessary information"). Used by lib/state.ts's live-session reducer
// cases; the two legacy functions above are UNCHANGED and still used
// directly by components/workout/live/exercise-intro-panel.tsx and
// exercise-warmup-panel.tsx, which already receive a legacy Exercise prop —
// see lib/training/verify-legacy-adapter's proven round-trip equivalence
// (and this module's own verify-workout-flow coverage) for why both paths
// are guaranteed to agree for any real content, so having both coexist
// during this transition creates no risk of disagreement.
// ---------------------------------------------------------------------------

/** Session-level equivalent of resolveSessionWarmupConfig above — Session
 * and Workout carry the identical warmupOverview string, so this is a
 * direct field read, not a re-derivation. */
export function resolveSessionWarmupConfigFromSession(session: Session): SessionWarmupConfig {
  const instruction = session.warmupOverview?.trim();
  if (!instruction) return { mode: "none" };
  return { mode: "confirmation", instruction };
}

/**
 * Training-item equivalent of resolveExerciseWarmupConfig above, in the same
 * priority order:
 * 1. Prescription.warmupInstruction (mirrors Exercise.warmupInstruction).
 * 2. Individually stepped ramping sets, regenerated from the item's own
 *    Prescription (warmupSets/sets/reps/rpe/load) via the exact same
 *    generator lib/coach/training.ts's buildPrescribedSets already uses to
 *    build a legacy Exercise's real prescribedSets — never a second,
 *    independently-drifting formula.
 * 3. "none" when neither exists, or the item doesn't carry enough of a
 *    resistance prescription to generate steps from (e.g. no rep range or
 *    RPE target) — a real, honest configuration, not an error state.
 */
export function resolveTrainingItemWarmupConfig(item: TrainingItemInstance): ExerciseWarmupConfig {
  const instruction = item.prescription.warmupInstruction?.trim();
  if (instruction) return { mode: "instruction", instruction };

  const warmupSets = item.prescription.warmupSets ?? 0;
  const workingSets = item.prescription.sets ?? 0;
  const reps = item.prescription.reps;
  const targetRpe = item.prescription.rpe;
  if (warmupSets <= 0 || reps === undefined || targetRpe === undefined) return { mode: "none" };

  const generatedSets = buildPrescribedSets({
    warmupSets,
    workingSets,
    targetRepsLow: reps.low,
    targetRepsHigh: reps.high,
    targetRpe,
    workingWeightLb: item.prescription.load?.value,
  });

  const steps: ExerciseWarmupStep[] = generatedSets
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
