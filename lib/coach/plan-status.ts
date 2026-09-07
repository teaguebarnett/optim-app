// Phase 5.5A — a clear, coach-facing status for the training and nutrition
// sides of a client's unified OPTIM Plan (spec Part 2's "Training plan —
// recommendations ready / coach approval needed / blocked by health
// review / approved" requirement).
//
// Deliberately kept separate from lib/coach/activation.ts's
// checkActivationReadiness, which stays exactly as it was — it's reused
// broadly (the clients-list "next action" column, activation gating
// itself) and this phase doesn't touch its contract. This is a pure
// presentation-layer enrichment consumed only by the client workspace UI.

import type { ActivationGenerationRecord } from "./activation-lifecycle.ts";

export type PlanStatus = "not_started" | "blocked_by_health_review" | "recommendations_ready" | "coach_approval_needed" | "generation_failed" | "approved";

export interface PlanStatusResult {
  status: PlanStatus;
  label: string;
}

const LABELS: Record<PlanStatus, string> = {
  not_started: "Training plan — not started",
  blocked_by_health_review: "Training plan — blocked by health review",
  recommendations_ready: "Training plan — recommendations ready",
  coach_approval_needed: "Training plan — coach approval needed",
  generation_failed: "Training plan — generation failed",
  approved: "Training plan — approved",
};

/**
 * Resolves a single, honest status for the training side of a client's
 * unified OPTIM Plan. Health review always wins — an unresolved concern is
 * the one thing that overrides whatever generation state already exists,
 * matching Part 3's safety-first framing.
 */
export function resolveTrainingPlanStatus(input: { latestGeneration: ActivationGenerationRecord | null; healthReviewResolved: boolean | "no_review_needed" }): PlanStatusResult {
  if (input.healthReviewResolved === false) return { status: "blocked_by_health_review", label: LABELS.blocked_by_health_review };

  const state = input.latestGeneration?.state;
  if (state === "activated" || state === "approved") return { status: "approved", label: LABELS.approved };
  // A complete plan (or a revision to one) exists and is waiting on the
  // coach's own explicit Approve & Assign action — more specific than the
  // generic "recommendations ready" below, since there's a concrete plan
  // to act on, not just directions to choose between.
  if (state === "ready_for_review" || state === "revision_prepared") return { status: "coach_approval_needed", label: LABELS.coach_approval_needed };
  if (state === "directions_ready") return { status: "recommendations_ready", label: LABELS.recommendations_ready };
  // Phase 5.6A — an attempt that produced nothing usable (every option
  // failed a hard constraint, or generation threw) must never silently
  // collapse back into "not_started": that's exactly the "coach is left
  // thinking nothing was ever tried" bug this phase's brief calls out.
  if (state === "generation_failed" || state === "blocked") return { status: "generation_failed", label: LABELS.generation_failed };

  return { status: "not_started", label: LABELS.not_started };
}

// ---------------------------------------------------------------------------
// Phase 5.6A — the client-detail page's single unified journey stage.
// ---------------------------------------------------------------------------

/** Every stage the pre-active Activation Workspace can honestly show —
 * "approved"/activated clients never render this page at all (see
 * app/coach/clients/[clientId]/page.tsx's lifecycle switch, which shows the
 * Client Workspace instead the moment lifecycle becomes "active"), so this
 * only ever needs to describe what comes before that. */
export type ClientJourneyStage = "awaiting_onboarding" | PlanStatus;

/**
 * The ONE status the client-detail page's primary card is built from —
 * folds "has the client even finished their intake yet" in ahead of the
 * training-plan status above, since a coach must never see a plan-shaped
 * status (even "not started") before there's a client to generate one for
 * (spec's State 1: "Do not show 'Review OPTIM Plan'... or imply that a plan
 * exists"). Every other stage delegates straight to resolveTrainingPlanStatus
 * so the two can never disagree about a client who HAS finished onboarding.
 */
export function resolveClientJourneyStage(input: {
  onboardingCompleted: boolean;
  latestGeneration: ActivationGenerationRecord | null;
  healthReviewResolved: boolean | "no_review_needed";
}): ClientJourneyStage {
  if (!input.onboardingCompleted) return "awaiting_onboarding";
  return resolveTrainingPlanStatus({ latestGeneration: input.latestGeneration, healthReviewResolved: input.healthReviewResolved }).status;
}
