"use client";

import { useState } from "react";
import { ProgressRing } from "@/components/ui/progress-ring";
import { MacroRow } from "@/components/nutrition/macro-row";
import { MealRow } from "@/components/nutrition/meal-row";
import { MealSelectionSheet } from "@/components/meals/meal-selection-sheet";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { ScreenSkeleton } from "@/components/ui/skeleton";
import { NUTRITION_TARGETS } from "@/lib/mock-data";
import type { MealPeriod } from "@/lib/types";

const MEAL_ORDER: MealPeriod[] = ["breakfast", "postWorkout", "lunch", "dinner", "snack"];

export default function NutritionPage() {
  const { isHydrated, state, nutritionTotals, nutritionMessage } = usePrototypeState();
  const [activePeriod, setActivePeriod] = useState<MealPeriod | null>(null);

  if (!isHydrated) return <ScreenSkeleton />;

  const caloriePercent = (nutritionTotals.calories / NUTRITION_TARGETS.calories) * 100;

  return (
    <div className="px-4 pb-6 pt-5">
      <h1 className="text-xl font-semibold text-off-white">Nutrition</h1>
      <p className="mt-1 text-sm text-neutral">{nutritionMessage}</p>

      <div className="mt-5 flex items-center gap-5 rounded-[var(--radius-lg)] border border-border bg-charcoal p-4">
        <ProgressRing
          percent={caloriePercent}
          label={String(Math.round(nutritionTotals.calories))}
          sublabel={`of ${NUTRITION_TARGETS.calories}`}
        />
        <div className="min-w-0 flex-1 space-y-1 text-sm">
          <p className="text-off-white">
            <span className="font-semibold">{Math.round(nutritionTotals.calories)}</span> cal consumed
          </p>
          <p className="text-neutral">
            {Math.max(0, NUTRITION_TARGETS.calories - Math.round(nutritionTotals.calories))} cal remaining
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-4 rounded-[var(--radius-lg)] border border-border bg-charcoal p-4">
        <MacroRow label="Protein" consumed={nutritionTotals.proteinG} target={NUTRITION_TARGETS.proteinG} unit="g" color="var(--pc-accent)" />
        <MacroRow label="Carbs" consumed={nutritionTotals.carbsG} target={NUTRITION_TARGETS.carbsG} unit="g" color="var(--pc-success)" />
        <MacroRow label="Fat" consumed={nutritionTotals.fatG} target={NUTRITION_TARGETS.fatG} unit="g" color="var(--pc-warning)" />
      </div>

      <h2 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-neutral">Today&apos;s meals</h2>
      <div className="space-y-2">
        {MEAL_ORDER.map((period) => (
          <MealRow key={period} period={period} selection={state.meals[period]} onClick={() => setActivePeriod(period)} />
        ))}
      </div>

      {activePeriod ? (
        <MealSelectionSheet period={activePeriod} open={!!activePeriod} onClose={() => setActivePeriod(null)} />
      ) : null}
    </div>
  );
}
