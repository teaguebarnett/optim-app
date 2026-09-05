"use client";

import { cn } from "@/lib/cn";
import type { GeneratedNutritionStrategy } from "@/lib/coach/activation-generation";

const RANK_TONE: Record<string, string> = {
  best_fit: "bg-success-soft text-success",
  strong_alternative: "bg-accent-soft text-accent-strong",
  wildcard: "bg-warning-soft text-warning-strong",
};

export function RankedNutritionCard({ option, selected, onSelect }: { option: GeneratedNutritionStrategy; selected: boolean; onSelect: () => void }) {
  return (
    <div className={cn("rounded-[var(--radius-lg)] border-2 p-5 transition-colors", selected ? "border-accent bg-selected-bg" : "border-border-strong bg-charcoal")} style={{ transitionDuration: "var(--motion-fast)" }}>
      <div className="flex items-start justify-between gap-3">
        <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-meta font-semibold uppercase tracking-wide", RANK_TONE[option.kind])}>{option.label}</span>
        <p className="text-heading text-accent-strong">{option.score.total}</p>
      </div>

      <p className="mt-2 text-heading text-off-white">{option.targets.calories} kcal</p>
      <p className="text-meta text-neutral">
        {option.targets.proteinG}p / {option.targets.carbsG}c / {option.targets.fatG}f
      </p>
      {option.trainingDayTargets && option.restDayTargets ? (
        <p className="mt-1 text-meta text-neutral">
          Training day: {option.trainingDayTargets.calories} kcal · Rest day: {option.restDayTargets.calories} kcal
        </p>
      ) : null}

      <p className="mt-3 text-sm text-off-white">{option.mealStructureDescription}</p>
      <p className="mt-2 text-meta text-neutral">{option.explanation.whyItFits}</p>

      {option.requiresCoachApproval ? <p className="mt-2 text-meta text-warning-strong">Requires your explicit review before it reaches the client.</p> : null}

      <div className="mt-3 space-y-1">
        {option.assumptions.map((a) => (
          <p key={a} className="text-meta text-neutral">
            · {a}
          </p>
        ))}
      </div>

      <button
        type="button"
        onClick={onSelect}
        className={cn("mt-4 rounded-[var(--radius-sm)] px-3.5 py-2 text-sm font-medium transition-colors", selected ? "bg-accent text-on-accent" : "border border-border-strong text-off-white hover:border-accent/50")}
        style={{ transitionDuration: "var(--motion-fast)" }}
      >
        {selected ? "Selected" : "Select this strategy"}
      </button>
    </div>
  );
}
