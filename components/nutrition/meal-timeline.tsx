"use client";

import { MealCard } from "@/components/nutrition/meal-card";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { MEAL_ORDER } from "@/lib/calculations";
import type { MealPeriod } from "@/lib/types";

/**
 * Today's meal sequence (product spec §3) — every meal period in today's
 * actual plan, in chronological order, each rendered by MealCard so its own
 * status/emphasis logic decides how loud it is. Reads the same
 * dailyPlan.mealSchedule every other screen reads, so this can never drift
 * from Today or the planner.
 */
export function MealTimeline() {
  const { dailyPlan } = usePrototypeState();
  const periods = Object.keys(dailyPlan.mealSchedule.entries) as MealPeriod[];
  const orderedPeriods = MEAL_ORDER.filter((p) => periods.includes(p));

  return (
    <div className="space-y-2">
      {orderedPeriods.map((period) => (
        <MealCard key={period} period={period} />
      ))}
    </div>
  );
}
