"use client";

import { useState } from "react";
import { Camera, ChevronRight } from "lucide-react";
import { FuelOverview } from "@/components/nutrition/fuel-overview";
import { MacroDetailSheet } from "@/components/nutrition/macro-detail-sheet";
import { MealTimeline } from "@/components/nutrition/meal-timeline";
import { PhotoMealSheet } from "@/components/nutrition/photo/photo-meal-sheet";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { ScreenSkeleton } from "@/components/ui/skeleton";
import { NUTRITION_TARGETS } from "@/lib/mock-data";
import { deriveNutritionStatusLine } from "@/lib/nutrition/status";
import { MACRO_FIELD, nextRelevantMealPeriod } from "@/lib/nutrition/view-model";
import type { MacroKey } from "@/lib/nutrition/view-model";
import type { MealPeriod } from "@/lib/types";

// Nutrition's visual architecture (see docs/design/OPTIM_VISUAL_CONSTITUTION.md
// and this feature's product spec): one coordinated instrument panel (the
// calorie ring + three dedicated macro tiles), a brief intelligent status
// line, the primary meal-photo estimator action, and today's meal sequence —
// composed, not stacked, and reusing exactly the same computed
// nutritionTotals/dailyPlan every other screen already reads from
// usePrototypeState() so nothing here can ever drift from Today.
export default function NutritionPage() {
  const { isHydrated, state, nutritionTotals, dailyPlan } = usePrototypeState();
  const [activeMacro, setActiveMacro] = useState<MacroKey | null>(null);
  const [photoSheetOpen, setPhotoSheetOpen] = useState(false);

  if (!isHydrated) return <ScreenSkeleton />;

  const statusLine = deriveNutritionStatusLine({
    state,
    dailyPlan,
    totals: nutritionTotals,
    targets: NUTRITION_TARGETS,
    now: new Date(),
  });

  const periodsInPlan = Object.keys(dailyPlan.mealSchedule.entries) as MealPeriod[];
  const suggestedPeriod: MealPeriod = nextRelevantMealPeriod(state, dailyPlan) ?? periodsInPlan[0] ?? "breakfast";

  return (
    <div className="pb-6 pt-5">
      <div className="px-4">
        <h1 className="text-display text-off-white">Nutrition</h1>
      </div>

      <FuelOverview
        totals={nutritionTotals}
        targets={NUTRITION_TARGETS}
        onOpenMacro={setActiveMacro}
        statusLine={statusLine}
      />

      <div className="px-4 mt-3">
        <button
          type="button"
          onClick={() => setPhotoSheetOpen(true)}
          className="flex w-full items-center gap-3 rounded-[var(--radius-md)] bg-accent px-4 py-3 text-left shadow-[var(--shadow-subtle)] transition-transform duration-150 active:scale-[0.99]"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-on-accent">
            <Camera size={17} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-subheading text-on-accent">Log a meal photo</span>
            <span className="block text-meta text-on-accent/70">Get an OPTIM estimate, then review and confirm.</span>
          </span>
          <ChevronRight size={18} className="shrink-0 text-on-accent/70" aria-hidden="true" />
        </button>
      </div>

      <h2 className="mx-4 mb-2 mt-6 text-label text-neutral">Today&apos;s meals</h2>
      <div className="px-4">
        <MealTimeline />
      </div>

      {activeMacro ? (
        <MacroDetailSheet
          macro={activeMacro}
          open={!!activeMacro}
          onClose={() => setActiveMacro(null)}
          consumed={nutritionTotals[MACRO_FIELD[activeMacro]]}
          target={NUTRITION_TARGETS[MACRO_FIELD[activeMacro]]}
        />
      ) : null}

      <PhotoMealSheet open={photoSheetOpen} onClose={() => setPhotoSheetOpen(false)} suggestedPeriod={suggestedPeriod} />
    </div>
  );
}
