// Gate 4.0C-2 — what each split the coach can choose means structurally:
// which session purposes it produces for a given number of days, and what
// each purpose trains. Splits are the coach's vocabulary (t_splits); these
// templates only make them executable. A split that doesn't naturally fit a
// day count returns null rather than being bent to fit.

import type { MovementPatternId, MuscleId } from "../../knowledge/taxonomy.ts";
import type { SplitId } from "./method.ts";

export interface SessionPurpose {
  id: string;
  label: string;
  /** Muscles this session is responsible for, highest priority first. */
  targets: MuscleId[];
  /** Patterns a main lift for this session would come from, in order. */
  leadPatterns: MovementPatternId[];
}

const P = {
  upper: { id: "upper", label: "Upper", targets: ["chest", "lats", "mid_back", "side_delts", "triceps", "biceps", "rear_delts"], leadPatterns: ["horizontal_push", "horizontal_pull", "vertical_push", "vertical_pull"] },
  lower: { id: "lower", label: "Lower", targets: ["quadriceps", "hamstrings", "glutes", "calves", "adductors", "abductors", "abdominals"], leadPatterns: ["squat", "hinge", "single_leg", "hip_thrust"] },
  push: { id: "push", label: "Push", targets: ["chest", "front_delts", "side_delts", "triceps"], leadPatterns: ["horizontal_push", "vertical_push"] },
  pull: { id: "pull", label: "Pull", targets: ["lats", "mid_back", "rear_delts", "biceps"], leadPatterns: ["vertical_pull", "horizontal_pull"] },
  legs: { id: "legs", label: "Legs", targets: ["quadriceps", "hamstrings", "glutes", "calves", "adductors", "abductors", "abdominals"], leadPatterns: ["squat", "hinge", "single_leg", "hip_thrust"] },
  full: { id: "full_body", label: "Full body", targets: ["quadriceps", "chest", "lats", "hamstrings", "glutes", "mid_back", "side_delts", "triceps", "biceps", "calves", "abdominals"], leadPatterns: ["squat", "horizontal_push", "horizontal_pull", "hinge", "vertical_push", "vertical_pull"] },
  chest: { id: "chest", label: "Chest", targets: ["chest", "front_delts", "triceps"], leadPatterns: ["horizontal_push"] },
  back: { id: "back", label: "Back", targets: ["lats", "mid_back", "rear_delts", "biceps"], leadPatterns: ["vertical_pull", "horizontal_pull"] },
  shoulders: { id: "shoulders", label: "Shoulders", targets: ["side_delts", "front_delts", "rear_delts", "upper_traps"], leadPatterns: ["vertical_push"] },
  arms: { id: "arms", label: "Arms", targets: ["biceps", "triceps", "forearms"], leadPatterns: [] },
  shouldersArms: { id: "shoulders_arms", label: "Shoulders & arms", targets: ["side_delts", "rear_delts", "biceps", "triceps"], leadPatterns: ["vertical_push"] },
} satisfies Record<string, SessionPurpose>;

const alternate = (a: SessionPurpose, b: SessionPurpose, n: number) => Array.from({ length: n }, (_, i) => (i % 2 === 0 ? a : b));

/** Session purposes for a split at a day count, or null if it doesn't fit. */
export function splitSessions(split: SplitId, days: number): SessionPurpose[] | null {
  switch (split) {
    case "full_body":
      return days >= 1 && days <= 4 ? Array.from({ length: days }, () => P.full) : null;
    case "full_body_high_frequency":
      return days >= 3 && days <= 6 ? Array.from({ length: days }, () => P.full) : null;
    case "upper_lower":
      return days >= 2 && days <= 6 ? alternate(P.upper, P.lower, days) : null;
    case "push_pull_legs":
      return days === 3 ? [P.push, P.pull, P.legs] : days === 6 ? [P.push, P.pull, P.legs, P.push, P.pull, P.legs] : null;
    case "body_part_split":
      return days === 4 ? [P.chest, P.back, P.legs, P.shouldersArms] : days === 5 ? [P.chest, P.back, P.legs, P.shoulders, P.arms] : null;
  }
}

/** Muscles a plan is expected to train each week (omission is surfaced). */
export const MAJOR_TARGETS: MuscleId[] = ["chest", "lats", "mid_back", "side_delts", "biceps", "triceps", "quadriceps", "hamstrings", "glutes", "calves", "abdominals"];

export function labelSessions(purposes: SessionPurpose[]): string[] {
  const seen = new Map<string, number>();
  const total = new Map<string, number>();
  for (const p of purposes) total.set(p.id, (total.get(p.id) ?? 0) + 1);
  return purposes.map((p) => {
    const n = (seen.get(p.id) ?? 0) + 1;
    seen.set(p.id, n);
    return total.get(p.id)! > 1 ? `${p.label} ${String.fromCharCode(64 + n)}` : p.label;
  });
}
