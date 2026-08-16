// Priority-card capability filter. Phase 4.1's derivePriorityAction is the
// authoritative precedence — this module only decides which of its
// possible outcomes already have a real Phase 4.2 destination to click
// into. checkin_overdue/checkin_due surface on the weekly check-in card
// instead (see aggregate-checkin.ts); correction_needed stays a real,
// queryable domain state with no client-facing destination until Phase 4.3.
// Neither is ever rendered as this dashboard's clickable priority banner.

import { derivePriorityAction } from "../history/derive-priority-action.ts";
import type { CheckInStatus } from "../scheduling/types";
import type { PriorityCardModel } from "./types";

export interface PriorityAggregationInput {
  /** No read/unread tracking exists anywhere in this app's data model (see
   * the Phase 4.1 report) — always false until a real, auditable read-state
   * mechanism is built. Never fabricated as a presentational-only flag. */
  hasUnreadCoachFeedback: boolean;
  /** No adjustment-approval workflow exists yet — always false for the same
   * reason. */
  hasApprovedAdjustmentNeedingReview: boolean;
  checkInStatus: CheckInStatus;
  correctionNeededDates: string[];
}

export function aggregatePriority(input: PriorityAggregationInput): PriorityCardModel {
  const raw = derivePriorityAction({
    hasUnreadCoachFeedback: input.hasUnreadCoachFeedback,
    hasApprovedAdjustmentNeedingReview: input.hasApprovedAdjustmentNeedingReview,
    checkInStatus: input.checkInStatus,
    correctionNeededDates: input.correctionNeededDates,
    fallbackAction: null,
  });

  if (raw?.kind === "unread_coach_feedback" || raw?.kind === "approved_adjustment_review") {
    return { eligible: true, kind: raw.kind, detail: raw.detail ?? null };
  }
  return { eligible: false, kind: null, detail: null };
}
