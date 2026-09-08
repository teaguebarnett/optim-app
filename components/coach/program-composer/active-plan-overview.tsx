"use client";

import { Card } from "@/components/ui/card";
import type { NutritionTargets } from "@/lib/types";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-meta text-neutral">{label}</p>
      <p className="font-medium text-off-white">{value}</p>
    </div>
  );
}

/**
 * Phase 5.6A.2 — one concise "what is this client currently following"
 * overview (spec Part 1), replacing the old plan header's raw program name
 * as the coach's at-a-glance summary. Real facts only — a client whose
 * coach doesn't offer nutrition coaching simply omits the nutrition stats,
 * never a fabricated placeholder.
 */
export function ActivePlanOverview({
  trainingName,
  frequencyPerWeek,
  sessionLengthMin,
  currentWeekNumber,
  nutritionName,
  nutritionTargets,
}: {
  trainingName: string;
  frequencyPerWeek: number;
  sessionLengthMin: number | null;
  currentWeekNumber: number;
  nutritionName: string | null;
  nutritionTargets: NutritionTargets | null;
}) {
  return (
    <Card>
      <p className="text-subheading text-off-white">{trainingName}</p>
      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-4">
        <Stat label="Weekly frequency" value={`${frequencyPerWeek}x/week`} />
        <Stat label="Session duration" value={sessionLengthMin ? `~${sessionLengthMin} min` : "Varies"} />
        <Stat label="Current week" value={`Week ${currentWeekNumber}`} />
        {nutritionName ? <Stat label="Nutrition approach" value={nutritionName} /> : null}
        {nutritionTargets ? (
          <>
            <Stat label="Calories" value={`${nutritionTargets.calories} kcal`} />
            <Stat label="Protein" value={`${nutritionTargets.proteinG}g`} />
            <Stat label="Carbs" value={`${nutritionTargets.carbsG}g`} />
            <Stat label="Fat" value={`${nutritionTargets.fatG}g`} />
          </>
        ) : null}
      </div>
    </Card>
  );
}
