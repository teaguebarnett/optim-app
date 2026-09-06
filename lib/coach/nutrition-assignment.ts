// Phase 5.5A — writing a client's own real, complete nutrition plan.
//
// Exactly the same reasoning as lib/coach/program-assignment.ts's
// saveClientProgram: a client's nutrition plan is a property of their own
// daily AppState, not the coach-side PlatformState, so it's written
// directly into that client's storage — a coach must be able to
// assign/revise a nutrition plan for any of their clients regardless of
// which client this browser currently "acts as."
//
// The one real write path for BOTH the flat `nutritionTargets` every
// existing nutrition screen already reads AND the richer
// `assignedNutritionPlan` (Phase 5.5A) — the two are always written
// together from the same real prescription so they can never drift apart.

import { loadOrCreateClientAppState, saveClientAppState } from "../tenancy/client-state-store.ts";
import type { CompleteNutritionPrescription } from "./nutrition-directions.ts";
import type { AssignedNutritionPlan } from "../types";
import type { ClientProfileId, CoachProfileId, WorkspaceId } from "../tenancy/types";

export function toAssignedNutritionPlan(prescription: CompleteNutritionPrescription, id: string, approvedAtIso: string): AssignedNutritionPlan {
  return {
    id,
    targets: prescription.targets,
    usesTrainingRestSplit: prescription.usesTrainingRestSplit,
    trainingDayTargets: prescription.trainingDayTargets,
    restDayTargets: prescription.restDayTargets,
    mealsPerDay: prescription.mealsPerDay,
    mealStructureDescription: prescription.mealStructureDescription,
    preTrainingGuidance: prescription.preTrainingGuidance,
    postTrainingGuidance: prescription.postTrainingGuidance,
    hydrationOzPerDay: prescription.hydrationOzPerDay,
    fiberGramsPerDay: prescription.fiberGramsPerDay,
    substitutionGuidance: prescription.substitutionGuidance,
    supplementGuidance: prescription.supplementGuidance,
    adherenceStrategy: prescription.adherenceStrategy,
    metricsToMonitor: prescription.metricsToMonitor,
    weeklyAdjustmentRule: prescription.weeklyAdjustmentRule,
    sourceStrategyLabel: prescription.label,
    approvedAtIso,
  };
}

/** The one write path for a client's real nutrition plan — writes the flat
 * `nutritionTargets` (so every existing screen keeps working unmodified)
 * and the richer `assignedNutritionPlan` together, from the same source,
 * so the two can never disagree. */
export function saveClientNutritionPlan(clientId: ClientProfileId, workspaceId: WorkspaceId, primaryCoachId: CoachProfileId, plan: AssignedNutritionPlan): void {
  const appState = loadOrCreateClientAppState(clientId, workspaceId, primaryCoachId);
  saveClientAppState(clientId, { ...appState, nutritionTargets: plan.targets, assignedNutritionPlan: plan });
}
