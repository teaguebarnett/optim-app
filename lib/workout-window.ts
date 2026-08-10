// Centralized workout-window recommendation rule.
//
// This is a deliberately simple placeholder: the real coaching product will
// eventually replace `computeRecommendedWorkoutWindow` with logic driven by
// Teague's programming, the client's schedule, and recovery data. Every
// consumer in the app calls this single function rather than hardcoding an
// offset, so that swap only has to happen in one place.

export const WORKOUT_WINDOW_MIN_OFFSET_MINUTES = 60;
export const WORKOUT_WINDOW_MAX_OFFSET_MINUTES = 120;

export interface WorkoutWindowRecommendation {
  startIso: string;
  endIso: string;
}

/**
 * Given when the client confirmed their pre-workout meal, returns the
 * recommended training window: MIN–MAX minutes after that confirmation.
 */
export function computeRecommendedWorkoutWindow(mealConfirmedAtIso: string): WorkoutWindowRecommendation {
  const reference = new Date(mealConfirmedAtIso).getTime();
  const startIso = new Date(reference + WORKOUT_WINDOW_MIN_OFFSET_MINUTES * 60_000).toISOString();
  const endIso = new Date(reference + WORKOUT_WINDOW_MAX_OFFSET_MINUTES * 60_000).toISOString();
  return { startIso, endIso };
}

export type WorkoutWindowPhase = "before" | "open" | "passed";

export function getWorkoutWindowPhase(nowMs: number, startMs: number, endMs: number): WorkoutWindowPhase {
  if (nowMs < startMs) return "before";
  if (nowMs <= endMs) return "open";
  return "passed";
}

/**
 * Prototype-only demo acceleration so a tester doesn't have to wait a real
 * 60-120 minutes to see the countdown resolve. The underlying timestamps
 * above are always real wall-clock times — only the on-screen countdown
 * ticks faster. Remove this multiplier (set to 1) once real scheduling
 * logic replaces the placeholder rule.
 */
export const WORKOUT_WINDOW_DEMO_SPEED_MULTIPLIER = 60;
