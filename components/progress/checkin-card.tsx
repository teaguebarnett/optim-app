import { ExpandableCard } from "./expandable-card";
import { StatusBadge, type BadgeTone } from "./status-badge";
import type { CheckInStatus } from "@/lib/scheduling/types";
import type { CheckInCardModel } from "@/lib/progress/types";

const STATUS_LABEL: Record<CheckInStatus, string> = {
  not_available: "Not yet available",
  due: "Due",
  overdue: "Overdue",
  in_progress: "In progress",
  submitted: "Submitted",
  reviewed: "Reviewed",
  adjustments_ready: "Adjustments ready",
  completed: "Completed",
  insufficient_data: "Not configured",
};

const STATUS_TONE: Record<CheckInStatus, BadgeTone> = {
  not_available: "neutral",
  due: "accent",
  overdue: "warning",
  in_progress: "accent",
  submitted: "accent",
  reviewed: "success",
  adjustments_ready: "accent",
  completed: "success",
  insufficient_data: "neutral",
};

/**
 * Read-only status surface — Phase 4.2 has no check-in submission flow to
 * link into (Phase 4.4), so this never renders a "Start check-in" or
 * "Coming soon" control, only what's actually known.
 */
export function CheckInCard({ checkIn }: { checkIn: CheckInCardModel }) {
  return (
    <ExpandableCard
      title={checkIn.title}
      detailTitle={checkIn.title}
      detail={
        <div className="space-y-4 text-sm">
          <StatusBadge label={STATUS_LABEL[checkIn.status]} tone={STATUS_TONE[checkIn.status]} />
          <p className="text-neutral">
            Opens {checkIn.openTimeLocal} local time, due within {checkIn.dueWindowHours} hours of opening.
          </p>
          {checkIn.reviewSummary ? (
            <div className="rounded-[var(--radius-sm)] bg-off-white/[0.03] p-3">
              {checkIn.reviewSummary.clientNote ? (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-neutral">Your note</p>
                  <p className="mt-1 text-off-white">{checkIn.reviewSummary.clientNote}</p>
                </div>
              ) : null}
              {checkIn.reviewSummary.coachNote ? (
                <div className={checkIn.reviewSummary.clientNote ? "mt-3" : ""}>
                  <p className="text-xs font-medium uppercase tracking-wide text-neutral">
                    {checkIn.reviewSummary.coachNoteAuthorKind === "coach" ? "Coach note" : "OPTIM note"}
                  </p>
                  <p className="mt-1 text-off-white">{checkIn.reviewSummary.coachNote}</p>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      }
    >
      <StatusBadge label={STATUS_LABEL[checkIn.status]} tone={STATUS_TONE[checkIn.status]} />
    </ExpandableCard>
  );
}
