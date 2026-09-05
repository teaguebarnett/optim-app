// Phase 5.2 — coach-owned meal recommendations.
//
// A recommendation is coach guidance shown alongside a client's nutrition
// targets — never a generic loggable meal (see lib/types.ts's MealOption,
// which stays entirely separate) and never a rigid meal plan. Macros are
// optional and are never fabricated when the coach hasn't supplied them.

import type { ClientProfileId, CoachProfileId, WorkspaceId } from "../tenancy/types";
import type { MealRecommendation, MealRecommendationTag } from "./types";
import type { MealPeriod } from "../types";

let idCounter = 0;
function nextMealRecommendationId(): string {
  idCounter += 1;
  return `meal-rec-${Date.now()}-${idCounter}`;
}

export function createEmptyMealRecommendation(input: {
  workspaceId: WorkspaceId;
  coachId: CoachProfileId;
  category?: MealPeriod;
  nowIso: string;
}): MealRecommendation {
  return {
    id: nextMealRecommendationId(),
    workspaceId: input.workspaceId,
    coachId: input.coachId,
    name: "",
    category: input.category ?? "breakfast",
    ingredients: "",
    instructions: "",
    macros: undefined,
    tags: [],
    status: "active",
    assignedClientIds: [],
    createdAtIso: input.nowIso,
    updatedAtIso: input.nowIso,
  };
}

/** A coach reusing their own recommendation for a different client — a
 * genuinely new record (own id, no assignments carried over), never a
 * shared reference with the original. */
export function duplicateMealRecommendation(source: MealRecommendation, nowIso: string): MealRecommendation {
  return {
    ...source,
    id: nextMealRecommendationId(),
    name: `${source.name} (copy)`,
    assignedClientIds: [],
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };
}

export function isAssignedToClient(recommendation: MealRecommendation, clientId: ClientProfileId): boolean {
  return recommendation.assignedClientIds.includes(clientId);
}

export const MEAL_RECOMMENDATION_TAG_LABELS: Record<MealRecommendationTag, string> = {
  quick: "Quick",
  pre_workout: "Pre-workout",
  post_workout: "Post-workout",
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};
