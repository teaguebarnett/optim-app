// Priority-card derivation — Phase 4 Required Derivation Correction #6: a
// strict, deterministic precedence, never a fabricated "all caught up" when
// something genuinely outstanding exists. Six explicit levels, most urgent
// first:
//
//   1. Unread coach feedback needing acknowledgment
//   2. An approved adjustment needing the client's review
//   3. An overdue weekly check-in
//   4. A currently-due (not yet overdue) weekly check-in
//   5. A correction needed for materially incomplete archived info
//   6. Any other genuinely derived action (never fabricated)
//
// Deliberately takes already-computed inputs rather than reaching into
// chatMessages/reviewRequests/etc. itself — this app has no read/unread
// tracking on ChatMessage yet, and inventing one here would be a silent,
// out-of-scope addition. A future UI layer is responsible for gathering
// these booleans from wherever "unread"/"approved adjustment" state
// eventually lives; this function only encodes the precedence and
// tie-breaking rule once those signals are known. See the Phase 4.1 report.

import { compareLocalDates } from "../shared/local-date.ts";
import type { CheckInStatus } from "../scheduling/types";

export type PriorityActionKind =
  | "unread_coach_feedback"
  | "approved_adjustment_review"
  | "checkin_overdue"
  | "checkin_due"
  | "correction_needed"
  | "other_derived_action";

export interface PriorityAction {
  kind: PriorityActionKind;
  targetDateIso?: string;
  detail?: string;
}

export interface PriorityActionInputs {
  hasUnreadCoachFeedback: boolean;
  hasApprovedAdjustmentNeedingReview: boolean;
  checkInStatus: CheckInStatus;
  /** Local dates whose archived DailyRecord is materially incomplete and
   * needs a client correction — order doesn't matter, the function
   * deterministically picks the oldest. */
  correctionNeededDates: string[];
  /** A real, non-fabricated action to offer when nothing above applies —
   * e.g. "review this week's progress." Pass null when there is genuinely
   * nothing further to surface (a bare `null` return, not an invented
   * "all caught up" message, is the caller's honest empty state). */
  fallbackAction: PriorityAction | null;
}

export function derivePriorityAction(inputs: PriorityActionInputs): PriorityAction | null {
  if (inputs.hasUnreadCoachFeedback) return { kind: "unread_coach_feedback" };
  if (inputs.hasApprovedAdjustmentNeedingReview) return { kind: "approved_adjustment_review" };
  if (inputs.checkInStatus === "overdue") return { kind: "checkin_overdue" };
  if (inputs.checkInStatus === "due") return { kind: "checkin_due" };
  if (inputs.correctionNeededDates.length > 0) {
    const oldest = inputs.correctionNeededDates.slice().sort(compareLocalDates)[0];
    return { kind: "correction_needed", targetDateIso: oldest };
  }
  return inputs.fallbackAction;
}
