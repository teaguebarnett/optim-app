import { Utensils } from "lucide-react";
import { SectionCard } from "./section-card";
import { StatusBadge } from "@/components/progress/status-badge";
import { SKIP_REASON_LABELS } from "@/components/ui/reason-picker";
import type { HistoricalMealModel, HistoricalNutritionModel } from "@/lib/progress/types";

function mealStatusBadge(meal: HistoricalMealModel) {
  if (meal.status === "completed") return <StatusBadge label="Logged" tone="success" />;
  if (meal.status === "replaced") return <StatusBadge label="Replaced" tone="accent" />;
  if (meal.status === "skipped") return <StatusBadge label="Skipped" tone="error" />;
  if (meal.status === "planned_later") return <StatusBadge label="Planned for later" tone="neutral" />;
  return <StatusBadge label="Not logged" tone="neutral" />;
}

function targetMetLabel(result: "met" | "not_met" | "insufficient_data"): string {
  if (result === "met") return "On target";
  if (result === "not_met") return "Off target";
  return "Not enough data";
}

/** Gate 3D — the same provenance vocabulary the live meal card already uses
 * (see lib/nutrition/view-model.ts's mealProvenanceLabel), reconstructed
 * here from this model's own already-derived `status` plus whether a Meal
 * Intent was actually preserved — never a new label, never a guess. A
 * "replaced" meal with no preserved intent (a plain manual entry, or a
 * photo estimate) intentionally falls back to no label at all here, exactly
 * as it already did before this field existed — this only adds the one
 * distinction Gate 3D asks for (Accepted substitution vs. Coach-approved
 * option), never a redesign of the existing status badge above it. */
function provenanceLabel(meal: HistoricalMealModel): string | null {
  if (meal.status === "completed") return "Coach-approved option";
  if (meal.status === "replaced" && meal.mealIntent) return "Accepted substitution";
  return null;
}

export function NutritionSection({ nutrition }: { nutrition: HistoricalNutritionModel }) {
  if (nutrition.meals.length === 0) {
    return (
      <SectionCard title="Nutrition" icon={<Utensils size={16} aria-hidden="true" />}>
        <p className="text-sm text-neutral">Nothing recorded for this day.</p>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Nutrition" icon={<Utensils size={16} aria-hidden="true" />}>
      {nutrition.totals ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <p className="text-off-white">
            {nutrition.totals.calories} <span className="text-neutral">/ {nutrition.targets.calories} cal</span>
          </p>
          <p className="text-neutral">{targetMetLabel(nutrition.calorieResult)}</p>
          <p className="text-off-white">
            {nutrition.totals.proteinG}g <span className="text-neutral">/ {nutrition.targets.proteinG}g protein</span>
          </p>
          <p className="text-neutral">{targetMetLabel(nutrition.proteinResult)}</p>
        </div>
      ) : (
        <p className="text-sm text-neutral">Not enough logged macro data for calorie/protein totals this day.</p>
      )}

      <ul className="mt-3 space-y-2">
        {nutrition.meals.map((meal) => (
          <li key={meal.period} className="flex items-start justify-between gap-3 rounded-[var(--radius-sm)] bg-off-white/[0.03] px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-medium text-off-white">{meal.label}</p>
              {meal.itemName ? (
                <p className="truncate text-xs text-neutral">
                  {meal.itemName}
                  {meal.isEstimate ? " (estimate)" : ""}
                </p>
              ) : null}
              {provenanceLabel(meal) ? <p className="text-xs text-neutral">{provenanceLabel(meal)}</p> : null}
              {meal.mealIntent ? <p className="mt-0.5 text-xs italic text-neutral">{meal.mealIntent}</p> : null}
              {meal.skipReason ? <p className="text-xs text-neutral">Reason: {SKIP_REASON_LABELS[meal.skipReason]}</p> : null}
              {meal.actualTimeLabel ? <p className="text-xs text-neutral">Logged {meal.actualTimeLabel}</p> : null}
            </div>
            <div className="shrink-0">{mealStatusBadge(meal)}</div>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
