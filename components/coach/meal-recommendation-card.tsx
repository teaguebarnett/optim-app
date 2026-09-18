import { UtensilsCrossed } from "lucide-react";
import { Card } from "@/components/ui/card";
import { MEAL_RECOMMENDATION_TAG_LABELS } from "@/lib/coach/meal-recommendations";
import type { MealRecommendation } from "@/lib/coach/types";

const CATEGORY_LABELS: Record<MealRecommendation["category"], string> = {
  breakfast: "Breakfast",
  postWorkout: "Post-workout",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

/**
 * The one read-only rendering of a MealRecommendation — used both for a
 * coach's own library preview and the client Nutrition page's "Recommended
 * by {coach}" section (see app/(client)/nutrition/page.tsx), so a coach
 * previewing a recommendation sees exactly what their client will. Never
 * fabricates macros: the macro row only renders fields the coach actually
 * supplied.
 */
export function MealRecommendationCard({ recommendation, coachName }: { recommendation: MealRecommendation; coachName?: string }) {
  const macros = recommendation.macros;
  const hasMacros = macros && (macros.calories != null || macros.proteinG != null || macros.carbsG != null || macros.fatG != null);

  return (
    <Card className="space-y-2.5">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-fg">
          <UtensilsCrossed size={16} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-off-white">{recommendation.name || "Untitled recommendation"}</p>
            <span className="rounded-full bg-surface-raised px-2 py-0.5 text-xs text-neutral">{CATEGORY_LABELS[recommendation.category]}</span>
          </div>
          {coachName ? <p className="mt-0.5 text-meta text-neutral">Recommended by {coachName}</p> : null}
        </div>
      </div>

      {recommendation.ingredients ? (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-neutral">Ingredients</p>
          <p className="mt-0.5 text-sm text-off-white">{recommendation.ingredients}</p>
        </div>
      ) : null}

      {recommendation.instructions ? (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-neutral">Preparation</p>
          <p className="mt-0.5 text-sm text-off-white">{recommendation.instructions}</p>
        </div>
      ) : null}

      {hasMacros ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-neutral">
          {macros!.calories != null ? <span>{macros!.calories} cal</span> : null}
          {macros!.proteinG != null ? <span>{macros!.proteinG}g protein</span> : null}
          {macros!.carbsG != null ? <span>{macros!.carbsG}g carbs</span> : null}
          {macros!.fatG != null ? <span>{macros!.fatG}g fat</span> : null}
        </div>
      ) : null}

      {recommendation.tags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {recommendation.tags.map((tag) => (
            <span key={tag} className="rounded-full border border-border-strong px-2 py-0.5 text-xs text-neutral">
              {MEAL_RECOMMENDATION_TAG_LABELS[tag]}
            </span>
          ))}
        </div>
      ) : null}
    </Card>
  );
}
