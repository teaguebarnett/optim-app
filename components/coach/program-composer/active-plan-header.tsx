"use client";

import { ArrowLeft } from "lucide-react";
import { StatusBadge } from "@/components/progress/status-badge";

/**
 * Phase 5.6A.2 — the active-plan screen's header (spec Part 1): honest
 * "Active" framing with real schedule facts, replacing the generic program-
 * name-only header the plan-management screen used to open with.
 */
export function ActivePlanHeader({
  clientName,
  currentWeekNumber,
  durationWeeks,
  startDateLabel,
  lastUpdatedLabel,
  onBack,
}: {
  clientName: string;
  currentWeekNumber: number;
  durationWeeks: number;
  startDateLabel: string;
  lastUpdatedLabel: string | null;
  onBack: () => void;
}) {
  return (
    <div className="space-y-3">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-neutral hover:text-off-white">
        <ArrowLeft size={16} aria-hidden="true" /> Back to {clientName}
      </button>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-display text-off-white">{clientName}&apos;s Plan</h1>
          <p className="mt-1 text-meta text-neutral">
            Week {currentWeekNumber} of {durationWeeks} &middot; Start {startDateLabel}
            {lastUpdatedLabel ? ` · Last updated ${lastUpdatedLabel}` : ""}
          </p>
        </div>
        <StatusBadge label="Active" tone="success" />
      </div>
    </div>
  );
}
