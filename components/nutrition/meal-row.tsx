"use client";

import { ChevronRight, Check } from "lucide-react";
import { MEAL_OPTIONS, MEAL_PERIOD_LABELS } from "@/lib/mock-data";
import { SKIP_REASON_LABELS } from "@/components/ui/reason-picker";
import type { MealPeriod, MealSelection } from "@/lib/types";

export function MealRow({
  period,
  selection,
  timeLabel,
  onClick,
}: {
  period: MealPeriod;
  selection?: MealSelection;
  /** Recommended/logged time caption from the shared meal schedule — see
   * lib/planning/meal-schedule.ts. Passed in rather than recomputed so this
   * always matches what Today shows for the same meal. */
  timeLabel?: string;
  onClick: () => void;
}) {
  const label = MEAL_PERIOD_LABELS[period];
  const isLogged = selection?.source === "option" || selection?.source === "manual";
  const optionName =
    selection?.source === "option"
      ? MEAL_OPTIONS[period].find((o) => o.id === selection.optionId)?.name
      : selection?.manualName;

  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-[var(--radius-md)] border border-border bg-charcoal px-4 py-3.5 text-left hover:border-accent/30"
    >
      <span
        className={
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full " +
          (isLogged ? "bg-success-soft text-success" : "bg-off-white/[0.05] text-neutral")
        }
      >
        {isLogged ? <Check size={15} /> : null}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-off-white">{label}</p>
        {isLogged ? (
          <p className="truncate text-xs text-neutral">
            {optionName}
            {selection?.isEstimate ? " · Estimate" : ""} · {selection?.macros?.calories} cal
          </p>
        ) : selection?.source === "skipped" ? (
          <p className="text-xs text-neutral">Skipped — {SKIP_REASON_LABELS[selection.skipReason ?? "other"]}</p>
        ) : selection?.source === "planned-later" ? (
          <p className="text-xs text-neutral">Planned for later</p>
        ) : (
          <p className="text-xs text-neutral">Not logged yet</p>
        )}
        {timeLabel ? <p className="mt-0.5 text-xs text-neutral">{timeLabel}</p> : null}
      </div>
      <ChevronRight size={16} className="shrink-0 text-neutral" />
    </button>
  );
}
