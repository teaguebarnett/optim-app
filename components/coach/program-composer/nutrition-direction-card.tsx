"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { GeneratedNutritionStrategy } from "@/lib/coach/activation-generation";

const KIND_LABEL: Record<string, string> = { best_fit: "Best fit", strong_alternative: "Strong alternative", wildcard: "Strategic wildcard" };

/** The nutrition equivalent of DirectionCard — concise at a glance, the
 * full client/coach reasoning one level deeper behind "See why OPTIM
 * designed this." */
export function NutritionDirectionCard({ strategy, selected, onSelect }: { strategy: GeneratedNutritionStrategy; selected: boolean; onSelect: () => void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className={selected ? "border-l-2 border-l-brass" : ""}>
      <p className="text-xs font-semibold uppercase tracking-wide text-brass-strong">{KIND_LABEL[strategy.kind] ?? strategy.kind}</p>
      <p className="mt-1 text-subheading text-off-white">{strategy.label}</p>
      <p className="mt-1 text-sm text-neutral">
        {strategy.targets.calories} kcal · {strategy.targets.proteinG}p / {strategy.targets.carbsG}c / {strategy.targets.fatG}f
      </p>
      <p className="mt-2 text-sm text-off-white">{strategy.explanation.whyItFits}</p>
      <p className="mt-2 text-meta text-neutral">Tradeoff: {strategy.explanation.tradeoff}</p>

      <button type="button" onClick={() => setExpanded((v) => !v)} className="mt-3 flex items-center gap-1 text-sm font-medium text-brass-strong hover:underline">
        <Sparkles size={13} aria-hidden="true" />
        See why OPTIM designed this
        {expanded ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
      </button>

      {expanded ? (
        <div className="mt-3 space-y-3 rounded-[var(--radius-md)] border border-border-strong bg-surface-raised p-3.5 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral">Client data applied</p>
            <ul className="mt-1 space-y-0.5 text-off-white">
              {strategy.explanation.clientFactsUsed.map((fact) => (
                <li key={fact}>&bull; {fact}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral">Coach model applied</p>
            <ul className="mt-1 space-y-0.5 text-off-white">
              {strategy.explanation.coachingRulesUsed.map((rule) => (
                <li key={rule}>&bull; {rule}</li>
              ))}
            </ul>
            <p className="mt-1 text-meta text-neutral">{strategy.mealStructureDescription}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral">Constraints honored</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {strategy.constraints.checks.map((c) => (
                <span key={c.id} className={`rounded-full px-2 py-0.5 text-xs font-medium ${c.passed ? "bg-success-soft text-success" : "bg-error-soft text-error-strong"}`} title={c.reason}>
                  {c.label}
                </span>
              ))}
            </div>
          </div>
          {strategy.assumptions.length > 0 ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral">Assumptions</p>
              <ul className="mt-1 space-y-0.5 text-neutral">
                {strategy.assumptions.map((a) => (
                  <li key={a}>&bull; {a}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3">
        <Button size="sm" variant={selected ? "primary" : "secondary"} onClick={onSelect}>
          {selected ? "Selected" : "Select"}
        </Button>
      </div>
    </Card>
  );
}
