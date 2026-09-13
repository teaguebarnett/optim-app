// Phase 9A — resolves a real exercise NAME (as stored in decision
// evidence's proposedValue/chosenValue.exerciseName) to its real
// lib/coach/exercise-library.ts MovementPattern family, when the name
// matches a known library exercise exactly (case-insensitive). Returns
// null for anything else — a coach-authored custom item name, a
// misspelling, or any name this codebase's own exercise library doesn't
// recognize — rather than guessing at a family (spec section 12: "do not
// create fake precision"). This is the ONE hierarchy tier ("exact
// activity -> activity/category family") this codebase currently has real
// data to support; there is no broader "modality/domain" taxonomy above
// it beyond decisionDomain itself, so the hierarchy in spec section 12
// stops there deliberately.

import { EXERCISE_LIBRARY } from "../coach/exercise-library.ts";

const NAME_TO_FAMILY = new Map<string, string>(EXERCISE_LIBRARY.map((e) => [e.name.trim().toLowerCase(), e.pattern]));

export function resolveExerciseFamily(exerciseName: string | null | undefined): string | null {
  if (!exerciseName) return null;
  return NAME_TO_FAMILY.get(exerciseName.trim().toLowerCase()) ?? null;
}
