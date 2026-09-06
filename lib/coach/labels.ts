// Shared display copy for coach-facing lifecycle/review-kind values — kept
// in one place so every coach screen describes the same status the same
// way.

import type { ReviewRequestKind } from "../types";
import type { AttentionItemKind, ClientLifecycleStatus, HealthReviewStatus } from "./types";

export const LIFECYCLE_LABELS: Record<ClientLifecycleStatus, string> = {
  invited: "Invited",
  onboarding: "Onboarding",
  coach_setup: "Coach setup",
  ready_to_activate: "Ready to activate",
  active: "Active",
  paused: "Paused",
  completed: "Completed",
};

export const REVIEW_KIND_LABELS: Record<ReviewRequestKind, string> = {
  "pain-report": "Pain reported",
  "program-change-request": "Program change requested",
  "rpe-anomaly": "RPE worth a look",
  "workout-skipped": "Workout skipped",
  "technique-flag": "Technique question flagged",
  "schedule-change": "Schedule changed",
  "performance-pattern": "Repeated RPE mismatch",
  "adherence-pattern": "Repeated missed sessions",
  "recovery-deterioration": "Recovery/adherence declining",
  "ai-authority-boundary": "OPTIM held for your review",
  "adaptation-proposal": "Program adjustment proposed",
  milestone: "Worth a personal touch",
};

/** Every AttentionQueueItem's kind, including the one ("health_review")
 * that isn't a real ReviewRequestKind — see lib/coach/attention-queue.ts. */
export const ATTENTION_KIND_LABELS: Record<AttentionItemKind, string> = {
  ...REVIEW_KIND_LABELS,
  health_review: "Health review needed",
};

/** A short, deterministic decision question for the command center's focus
 * surface — a plain-language template keyed off the item's real kind,
 * never a simulated AI-generated question. `{name}` is substituted with
 * the real client's first name by the caller. */
export const ATTENTION_KIND_QUESTIONS: Record<AttentionItemKind, string> = {
  health_review: "Does {name} need anything resolved before you activate them?",
  "pain-report": "Is it safe for {name} to continue training as planned?",
  "program-change-request": "Should {name}'s program change as requested?",
  "rpe-anomaly": "Is {name}'s current training load still right for them?",
  "workout-skipped": "Does {name} need a check-in about missed training?",
  "technique-flag": "Does {name} need coaching on this movement before their next session?",
  "schedule-change": "Does {name}'s plan need to adjust for their new schedule?",
  "performance-pattern": "Is {name}'s current training load still right for them?",
  "adherence-pattern": "Does {name} need a real check-in about consistency?",
  "recovery-deterioration": "Does {name}'s plan still fit their current capacity?",
  "ai-authority-boundary": "What should OPTIM tell {name}?",
  "adaptation-proposal": "Should {name}'s upcoming training change based on how they're actually performing?",
  milestone: "Want to send {name} a quick note?",
};

export const HEALTH_REVIEW_STATUS_LABELS: Record<HealthReviewStatus, string> = {
  review_needed: "Review needed",
  discuss_with_client: "Discuss with client",
  professional_guidance_requested: "Professional guidance requested",
  professional_guidance_confirmed: "Professional guidance confirmed",
  reviewed_by_coach: "Reviewed by coach",
};
