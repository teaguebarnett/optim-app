"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { ExpandableCard } from "./expandable-card";
import { StatusBadge } from "./status-badge";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { useDemoQuery } from "@/hooks/use-historical-day-review";
import type { NutritionCardModel, NutritionDaySummaryModel } from "@/lib/progress/types";

function mealPlanBadge(day: NutritionDaySummaryModel) {
  if (day.mealPlanOutcome === "complete") return <StatusBadge label="On plan" tone="success" />;
  if (day.mealPlanOutcome === "partial") return <StatusBadge label="Partial" tone="warning" />;
  if (day.mealPlanOutcome === "missed") return <StatusBadge label="Missed" tone="error" />;
  if (day.mealPlanOutcome === "future") return <StatusBadge label="Upcoming" tone="neutral" />;
  return <StatusBadge label="No record" tone="neutral" />;
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-[var(--radius-sm)] bg-off-white/[0.03] px-3 py-2.5">
      <p className="text-sm text-off-white">{label}</p>
      <p className="text-sm text-neutral">{value}</p>
    </div>
  );
}

export function NutritionCard({ nutrition }: { nutrition: NutritionCardModel }) {
  const { state } = usePrototypeState();
  const demoQuery = useDemoQuery();
  const mealPlanText =
    nutrition.mealPlanStatus === "ok" && nutrition.mealPlanAdherenceRatio !== null
      ? `${Math.round(nutrition.mealPlanAdherenceRatio * 100)}% of planned meals`
      : "Not enough data yet";

  return (
    <ExpandableCard
      title="Nutrition"
      detailTitle="This week's nutrition"
      detail={
        <div className="space-y-4">
          <div className="space-y-2">
            <MetricRow label="Meal-plan adherence" value={mealPlanText} />
            <MetricRow
              label="Calorie target met"
              value={nutrition.calorieDaysEvaluable > 0 ? `${nutrition.calorieDaysMet} of ${nutrition.calorieDaysEvaluable} evaluable days` : "Not enough data yet"}
            />
            <MetricRow
              label="Protein target met"
              value={nutrition.proteinDaysEvaluable > 0 ? `${nutrition.proteinDaysMet} of ${nutrition.proteinDaysEvaluable} evaluable days` : "Not enough data yet"}
            />
          </div>
          <ul className="space-y-2">
            {nutrition.days.map((day) => {
              // Gate 2D — a past day's meal log is real, archived evidence
              // (the same Historical Day Review every other Progress card
              // links into); today's own row and any future day stay plain —
              // Nutrition has no separate "prescribed day" browsing in Plan
              // (it only ever shows the current day), so there is no honest
              // destination to invent for those.
              const isToday = day.dateIso === state.dateIso;
              const isPast = !isToday && day.mealPlanOutcome !== "future";
              const rowContent = (
                <>
                  <p className="text-sm text-off-white">{day.dayOfWeek}</p>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {mealPlanBadge(day)}
                    {isPast ? <ChevronRight size={14} className="text-neutral" aria-hidden="true" /> : null}
                  </span>
                </>
              );
              return isPast ? (
                <li key={day.dateIso}>
                  <Link
                    href={`/progress/history/${day.dateIso}${demoQuery}`}
                    className="flex items-center justify-between rounded-[var(--radius-sm)] bg-off-white/[0.03] px-3 py-2.5 transition-colors hover:bg-off-white/[0.06]"
                  >
                    {rowContent}
                  </Link>
                </li>
              ) : (
                <li key={day.dateIso} className="flex items-center justify-between rounded-[var(--radius-sm)] bg-off-white/[0.03] px-3 py-2.5">
                  {rowContent}
                </li>
              );
            })}
          </ul>
        </div>
      }
    >
      <p className="text-lg font-semibold text-off-white">{mealPlanText}</p>
      {nutrition.calorieDaysEvaluable === 0 && nutrition.proteinDaysEvaluable === 0 ? (
        <p className="mt-1 text-xs text-neutral">Calorie/protein detail unknown this week</p>
      ) : null}
    </ExpandableCard>
  );
}
