// Phase 5.0A — the one central activation-readiness check.
// Phase 5.0B — nutrition configuration became its own independent, real
// signal (AppState.nutritionTargets, written by lib/coach/setup.ts) rather
// than being folded into program_assignment_exists.
//
// Pure and deterministic: given what's actually known about a client, it
// reports exactly which requirements are met and which aren't, each with an
// honest, specific reason — never a vague "not ready." A coach can only
// activate a client (transition them into the real Today/Training/
// Nutrition/Progress/Chat interface) once every requirement is met; see
// app/coach/clients/[clientId]/page.tsx for the one place this gates the
// "Activate" action.

import type { ClientProfileId, CoachProfileId } from "../tenancy/types";
import type { ClientAssignedProgram } from "../types";
import { RESOLVED_HEALTH_REVIEW_STATUSES } from "./types.ts";
import { isValidWeek1 } from "./training.ts";
import type {
  ActivationReadiness,
  ActivationRequirementResult,
  ClientIntendedProgram,
  HealthReviewRecord,
  OnboardingProgress,
  ProgramAssignmentRef,
} from "./types";

export interface ActivationReadinessInput {
  clientId: ClientProfileId;
  onboarding: OnboardingProgress | null;
  /** Used only to help derive hasStartDate below — a resolved
   * ProgramAssignmentRef implies coach setup has already run at least once,
   * which stamps a real start date onto the client's programEnrollment. The
   * actual training-content requirement is assignedProgram below. */
  programAssignment: ProgramAssignmentRef | null;
  intendedProgram: ClientIntendedProgram | null;
  assignedCoachId: CoachProfileId | null;
  /** Whether this client has their own real, coach-set nutrition targets
   * (see lib/state.ts's AppState.nutritionTargets) — independent of
   * programAssignment even though this phase's single "Save setup" action
   * currently always sets both together (see lib/coach/setup.ts). */
  nutritionConfigured: boolean;
  /** This client's own training-protocol copy (see lib/coach/training.ts),
   * if a coach has created or assigned one — null for a client no coach has
   * touched yet. Activation requires it to exist, be "assigned" (not a
   * draft), and have a genuinely usable Week 1 — see isValidWeek1. The
   * coach may still be building out later weeks; only Week 1 gates
   * activation. */
  assignedProgram: ClientAssignedProgram | null;
  /** null when no health review was ever triggered for this client — in
   * that (the common) case, no "health review" row appears in the
   * checklist at all, matching the Phase 5.1 brief's "never expose...
   * beyond a necessary flag" and keeping the common case's checklist
   * exactly as clean as before this feature existed. */
  healthReview: HealthReviewRecord | null;
}

function week1RequirementReason(assignedProgram: ClientAssignedProgram | null): string | undefined {
  if (!assignedProgram) return "No training protocol has been assigned yet.";
  if (assignedProgram.status !== "assigned") return "The training protocol is still a draft — assign it before activating.";
  if (!isValidWeek1(assignedProgram)) {
    return "Week 1 isn't fully built out yet — every day needs a training/rest choice, and each training day needs at least one usable exercise.";
  }
  return undefined;
}

export function checkActivationReadiness(input: ActivationReadinessInput): ActivationReadiness {
  const hasStartDate = !!input.programAssignment || !!input.intendedProgram?.intendedStartDateIso;
  const week1Reason = week1RequirementReason(input.assignedProgram);

  const requirements: ActivationRequirementResult[] = [
    {
      id: "onboarding_complete",
      label: "Onboarding complete",
      met: !!input.onboarding?.completedAtIso,
      reason: input.onboarding?.completedAtIso ? undefined : "The client hasn't finished their onboarding intake yet.",
    },
    {
      id: "assigned_coach_exists",
      label: "Assigned coach",
      met: !!input.assignedCoachId,
      reason: input.assignedCoachId ? undefined : "No coach is assigned to this client.",
    },
    {
      id: "start_date_exists",
      label: "Start date",
      met: hasStartDate,
      reason: hasStartDate ? undefined : "No intended or assigned start date has been set for this client.",
    },
    {
      id: "week1_program_assigned",
      label: "Training protocol",
      met: !week1Reason,
      reason: week1Reason,
    },
    {
      id: "nutrition_configuration_exists",
      label: "Nutrition configuration",
      met: input.nutritionConfigured,
      reason: input.nutritionConfigured ? undefined : "No calorie or macro targets have been set for this client yet.",
    },
  ];

  if (input.healthReview) {
    const resolved = RESOLVED_HEALTH_REVIEW_STATUSES.has(input.healthReview.status);
    requirements.push({
      id: "health_review_resolved",
      label: "Health review",
      met: resolved,
      reason: resolved ? undefined : "The client's intake flagged something that needs your review before activation.",
    });
  }

  return { ready: requirements.every((r) => r.met), requirements };
}
