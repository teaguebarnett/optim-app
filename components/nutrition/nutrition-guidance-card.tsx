"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Info } from "lucide-react";
import type { AssignedNutritionPlan } from "@/lib/types";
import { summarizeNutritionPlan } from "@/lib/nutrition/plan-display";

/**
 * Phase 5.5A — the client-facing surface for the richer nutrition
 * prescription a coach approved (see lib/coach/nutrition-directions.ts).
 * Additive to the existing FuelOverview/MealTimeline, never replacing
 * them — this only appears once a real plan has actually been assigned.
 */
export function NutritionGuidanceCard({ plan, coachName }: { plan: AssignedNutritionPlan; coachName: string }) {
  const [expanded, setExpanded] = useState(false);
  // U3A — a method plan (calories and protein, habits, portions, baseline first) shows exactly what the coach set.
  const summary = plan.method ? summarizeNutritionPlan(plan) : null;

  return (
    <div className="mx-4 mt-4 rounded-[var(--radius-md)] border border-border bg-surface-raised p-4">
      <div className="flex items-start gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brass-soft text-brass-strong">
          <Info size={15} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-off-white">Your nutrition guidance from {coachName}</p>
          <p className="mt-0.5 text-meta text-neutral">
            {summary ? [summary.approach, ...summary.targets, `${plan.mealsPerDay} meals/day`].join(" · ") : `${plan.mealsPerDay} meals/day · ${plan.hydrationOzPerDay} oz water · ${plan.fiberGramsPerDay}g fiber`}
          </p>
        </div>
      </div>

      <button type="button" onClick={() => setExpanded((v) => !v)} className="mt-2.5 flex items-center gap-1 text-sm font-medium text-accent-fg">
        {expanded ? "Show less" : "Show more"}
        {expanded ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
      </button>

      {expanded && summary ? (
        <div className="mt-3 space-y-2 border-t border-border pt-3 text-sm text-off-white">
          {summary.note ? <p className="text-neutral">{summary.note}</p> : null}
          {summary.dayVariation ? <p className="text-neutral">{summary.dayVariation}</p> : null}
          {summary.meals.map((m) => (
            <p key={m.name}>
              <span className="font-medium">{m.name}</span> <span className="text-neutral">({m.timing})</span> — {m.intent}
              {m.foods.length ? <span className="text-neutral"> e.g. {m.foods.join(", ")}</span> : null}
            </p>
          ))}
          {summary.habits.length ? <p className="text-neutral">{summary.habits.join(" ")}</p> : null}
          <p className="text-neutral">{plan.preTrainingGuidance}</p>
          <p className="text-neutral">{plan.postTrainingGuidance}</p>
          {summary.substitutions.length ? <p className="text-neutral">Swaps your coach approved: {summary.substitutions.join("; ")}</p> : null}
          {summary.monitoring ? <p className="text-neutral">Tracking: {summary.monitoring}</p> : null}
        </div>
      ) : expanded ? (
        <div className="mt-3 space-y-2 border-t border-border pt-3 text-sm text-off-white">
          <p>{plan.mealStructureDescription}</p>
          <p className="text-neutral">{plan.preTrainingGuidance}</p>
          <p className="text-neutral">{plan.postTrainingGuidance}</p>
          {plan.usesTrainingRestSplit && plan.trainingDayTargets && plan.restDayTargets ? (
            <p className="text-neutral">
              Training days: {plan.trainingDayTargets.calories} kcal · Rest days: {plan.restDayTargets.calories} kcal
            </p>
          ) : null}
          <p className="text-neutral">{plan.substitutionGuidance}</p>
          <p className="text-neutral">{plan.supplementGuidance}</p>
        </div>
      ) : null}
    </div>
  );
}
