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
  "client-requested": "Wants to talk directly",
};

/** Every AttentionQueueItem's kind, including the two ("health_review",
 * "plan_approval") that aren't real ReviewRequestKinds — see
 * lib/coach/attention-queue.ts. */
export const ATTENTION_KIND_LABELS: Record<AttentionItemKind, string> = {
  ...REVIEW_KIND_LABELS,
  health_review: "Health review needed",
  plan_approval: "Plan approval required",
};

/** A short, deterministic decision question for the command center's focus
 * surface — a plain-language template keyed off the item's real kind,
 * never a simulated AI-generated question. `{name}` is substituted with
 * the real client's first name by the caller. */
export const ATTENTION_KIND_QUESTIONS: Record<AttentionItemKind, string> = {
  health_review: "Does {name} need anything resolved before you activate them?",
  plan_approval: "{name}'s plan needs your approval",
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
  "client-requested": "What should you tell {name}?",
};

export const HEALTH_REVIEW_STATUS_LABELS: Record<HealthReviewStatus, string> = {
  review_needed: "Not decided yet",
  discuss_with_client: "Follow up with the client first",
  professional_guidance_requested: "Waiting on professional guidance",
  professional_guidance_confirmed: "Professional guidance received",
  reviewed_by_coach: "No training changes needed",
  proceed_with_limitations: "Train around limitations",
};

/** One plain sentence per decision, shown under each option. None is medical clearance: every resolved status records
 * the coach's planning decision only. */
export const HEALTH_REVIEW_STATUS_HELP: Record<HealthReviewStatus, string> = {
  review_needed: "You haven't decided yet. Planning stays paused.",
  discuss_with_client: "You need more information from the client. Planning stays paused.",
  professional_guidance_requested: "You've asked the client to check with a qualified professional. Planning stays paused.",
  professional_guidance_confirmed: "You have a qualified professional's guidance. If it sets limits, choose \"Train around limitations\" instead.",
  reviewed_by_coach: "You've reviewed it and it doesn't change what OPTIM may program. Restrictions the client wrote down still need your confirmation.",
  proceed_with_limitations: "It changes what OPTIM may program. Describe what to avoid or limit — you'll confirm the exact exercise restrictions next.",
};

/** Phase 5.6A.1 — the health-review decision card's own pending/resolved
 * grouping (spec's "clearly distinguish pending actions from completed
 * resolutions"), kept alongside the labels above so every surface groups
 * the same five statuses the same way. */
export const PENDING_HEALTH_REVIEW_STATUSES: HealthReviewStatus[] = ["review_needed", "discuss_with_client", "professional_guidance_requested"];
export const RESOLVED_HEALTH_REVIEW_STATUS_ORDER: HealthReviewStatus[] = ["proceed_with_limitations", "reviewed_by_coach", "professional_guidance_confirmed"];
