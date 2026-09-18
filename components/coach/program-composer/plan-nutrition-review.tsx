"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { CompleteNutritionPrescription } from "@/lib/coach/nutrition-directions";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-meta text-neutral">{label}</p>
      <p className="font-medium text-off-white">{value}</p>
    </div>
  );
}

/**
 * Phase 5.6A.1 — the selected nutrition approach's concrete prescription
 * (spec Part 2's Nutrition review): the numbers a coach actually needs to
 * assign this with confidence, with the deeper adherence/monitoring
 * mechanics one level behind "See details" rather than always-on.
 */
export function PlanNutritionReview({ prescription }: { prescription: CompleteNutritionPrescription }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card>
      <p className="text-subheading text-off-white">{prescription.label}</p>
      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-4">
        <Stat label="Calories" value={`${prescription.targets.calories} kcal`} />
        <Stat label="Protein" value={`${prescription.targets.proteinG}g`} />
        <Stat label="Carbs" value={`${prescription.targets.carbsG}g`} />
        <Stat label="Fat" value={`${prescription.targets.fatG}g`} />
        <Stat label="Meals/day" value={String(prescription.mealsPerDay)} />
        <Stat label="Hydration" value={`${prescription.hydrationOzPerDay} oz`} />
        <Stat label="Fiber" value={`${prescription.fiberGramsPerDay}g`} />
        {prescription.usesTrainingRestSplit && prescription.trainingDayTargets && prescription.restDayTargets ? (
          <>
            <Stat label="Training-day calories" value={`${prescription.trainingDayTargets.calories} kcal`} />
            <Stat label="Rest-day calories" value={`${prescription.restDayTargets.calories} kcal`} />
          </>
        ) : (
          <Stat label="Training/rest split" value="Flat — same every day" />
        )}
      </div>

      <div className="mt-4 space-y-1.5 border-t border-border pt-3 text-sm text-neutral">
        <p>{prescription.mealStructureDescription}</p>
        <p>{prescription.preTrainingGuidance}</p>
        <p>{prescription.postTrainingGuidance}</p>
        <p>{prescription.substitutionGuidance}</p>
      </div>

      <button type="button" onClick={() => setExpanded((v) => !v)} className="mt-3 flex items-center gap-1 text-sm font-medium text-accent-fg hover:underline">
        See adherence &amp; monitoring details
        {expanded ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
      </button>
      {expanded ? (
        <div className="mt-3 space-y-2 rounded-[var(--radius-md)] border border-border-strong bg-surface-raised p-3.5 text-sm">
          <p className="text-off-white">{prescription.adherenceStrategy}</p>
          <p className="text-neutral">Monitoring: {prescription.metricsToMonitor.join(", ")}</p>
          <p className="text-neutral">Weekly adjustment: {prescription.weeklyAdjustmentRule}</p>
          <p className="text-neutral">{prescription.supplementGuidance}</p>
        </div>
      ) : null}
    </Card>
  );
}
