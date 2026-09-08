"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RANK_LABEL, meaningfulTrainingDirectionName, meaningfulNutritionStrategyName } from "@/lib/coach/plan-presentation";
import type { ProgramDirectionSummary } from "@/lib/coach/program-directions";
import type { GeneratedNutritionStrategy } from "@/lib/coach/activation-generation";

/**
 * Phase 5.6A.1 — alternatives as compact, secondary rows (spec Part 2):
 * never three equal-weight columns, never a forced-equal-height layout when
 * one explanation expands, and never an enormous empty card. Each row is
 * independently collapsible — expanding one never resizes its neighbor.
 */
export function PlanAlternatives({
  directions,
  selectedDirectionId,
  onSelectDirection,
  nutritionOptions,
  selectedNutritionId,
  onSelectNutrition,
}: {
  directions: ProgramDirectionSummary[];
  selectedDirectionId: string | null;
  onSelectDirection: (id: string) => void;
  nutritionOptions: GeneratedNutritionStrategy[];
  selectedNutritionId: string | null;
  onSelectNutrition: (id: string) => void;
}) {
  const alternateDirections = directions.filter((d) => d.id !== selectedDirectionId);
  const alternateNutrition = nutritionOptions.filter((o) => o.id !== selectedNutritionId);

  if (alternateDirections.length === 0 && alternateNutrition.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {alternateDirections.length > 0 ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral">Alternative training directions</p>
          <div className="mt-2 space-y-1.5">
            {alternateDirections.map((d) => (
              <AlternativeRow key={d.id} rankLabel={RANK_LABEL[d.kind]} name={meaningfulTrainingDirectionName(d)} differentiator={d.tradeoff} onUse={() => onSelectDirection(d.id)} />
            ))}
          </div>
        </div>
      ) : null}
      {alternateNutrition.length > 0 ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral">Alternative nutrition directions</p>
          <div className="mt-2 space-y-1.5">
            {alternateNutrition.map((o) => (
              <AlternativeRow key={o.id} rankLabel={RANK_LABEL[o.kind]} name={meaningfulNutritionStrategyName(o)} differentiator={o.explanation.tradeoff} onUse={() => onSelectNutrition(o.id)} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AlternativeRow({ rankLabel, name, differentiator, onUse }: { rankLabel: string; name: string; differentiator: string; onUse: () => void }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-[var(--radius-sm)] border border-border-strong bg-surface-raised px-3.5 py-2.5">
      <button type="button" onClick={() => setExpanded((v) => !v)} className="flex w-full items-center justify-between gap-2 text-left">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-brass-strong">{rankLabel}</p>
          <p className="truncate text-sm font-medium text-off-white">{name}</p>
        </div>
        {expanded ? <ChevronUp size={15} className="shrink-0 text-neutral" aria-hidden="true" /> : <ChevronDown size={15} className="shrink-0 text-neutral" aria-hidden="true" />}
      </button>
      {expanded ? (
        <div className="mt-2">
          <p className="text-sm text-neutral">{differentiator}</p>
          <Button size="sm" variant="secondary" className="mt-2" onClick={onUse}>
            Use this instead
          </Button>
        </div>
      ) : null}
    </div>
  );
}
