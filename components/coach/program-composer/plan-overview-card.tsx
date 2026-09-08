"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Sparkles, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { meaningfulTrainingDirectionName, meaningfulNutritionStrategyName } from "@/lib/coach/plan-presentation";
import type { ProgramDirectionSummary } from "@/lib/coach/program-directions";
import type { GeneratedNutritionStrategy } from "@/lib/coach/activation-generation";

/**
 * Phase 5.6A.1 — the first thing a coach sees in the plan review workspace
 * (spec Part 2): OPTIM's currently-selected training and nutrition
 * direction, side by side, each with a real name (not "Best fit" standing
 * in for a name), the decision-useful structure facts, and 2-3 concrete
 * reasons — never the full explanation/constraint wall by default.
 */
export function PlanOverviewCard({
  direction,
  nutritionStrategy,
  materialAssumptions,
  assumptionsAcknowledged,
  onAcknowledgeAssumptions,
}: {
  direction: ProgramDirectionSummary | null;
  nutritionStrategy: GeneratedNutritionStrategy | null;
  materialAssumptions: string[];
  assumptionsAcknowledged: boolean;
  onAcknowledgeAssumptions: (v: boolean) => void;
}) {
  return (
    <Card className="space-y-5">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 md:divide-x md:divide-border">
        <div className="md:pr-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-brass-strong">Training — Best fit</p>
          {direction ? (
            <TrainingSummary direction={direction} />
          ) : (
            <p className="mt-2 text-sm text-neutral">No training direction selected yet.</p>
          )}
        </div>
        <div className="md:pl-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-brass-strong">Nutrition — Best fit</p>
          {nutritionStrategy ? (
            <NutritionSummary strategy={nutritionStrategy} />
          ) : (
            <p className="mt-2 text-sm text-neutral">Nutrition coaching isn&apos;t part of this coach&apos;s service.</p>
          )}
        </div>
      </div>

      {materialAssumptions.length > 0 ? (
        <div className="flex items-start gap-2.5 rounded-[var(--radius-sm)] border border-warning/30 bg-warning-soft px-3.5 py-3">
          <TriangleAlert size={16} className="mt-0.5 shrink-0 text-warning-strong" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-off-white">Requires your attention before approving</p>
            <ul className="mt-1 space-y-0.5 text-sm text-warning-strong">
              {materialAssumptions.map((a) => (
                <li key={a}>&bull; {a}</li>
              ))}
            </ul>
            <label className="mt-2.5 flex items-center gap-2 text-sm text-off-white">
              <input type="checkbox" checked={assumptionsAcknowledged} onChange={(e) => onAcknowledgeAssumptions(e.target.checked)} className="h-4 w-4 rounded border-border-strong accent-[var(--color-accent)]" />
              I&apos;ve reviewed this and confirm it&apos;s fine to proceed
            </label>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function TrainingSummary({ direction }: { direction: ProgramDirectionSummary }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div>
      <p className="mt-1 text-heading text-off-white">{meaningfulTrainingDirectionName(direction)}</p>
      <p className="mt-1 text-sm text-neutral">
        {direction.frequencyPerWeek}x/week · ~{direction.estimatedSessionLengthMin} min sessions · {direction.progressionMethodDescription}
      </p>
      <ul className="mt-2 space-y-1 text-sm text-off-white">
        <li>&bull; {direction.whyItFits}</li>
        <li>&bull; {direction.specializationEmphasis}</li>
      </ul>
      <p className="mt-2 text-meta text-neutral">Tradeoff: {direction.tradeoff}</p>

      <button type="button" onClick={() => setExpanded((v) => !v)} className="mt-3 flex items-center gap-1 text-sm font-medium text-brass-strong hover:underline">
        <Sparkles size={13} aria-hidden="true" /> See why OPTIM designed this
        {expanded ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
      </button>
      {expanded ? (
        <div className="mt-3 space-y-3 rounded-[var(--radius-md)] border border-border-strong bg-surface-raised p-3.5 text-sm">
          <Detail label="Client data applied" items={direction.explanation.clientFactsUsed} />
          <Detail label="Coach model applied" items={direction.explanation.coachingRulesUsed} />
          <Detail label="Constraints honored" items={direction.constraintsHonored} chip />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral">Why it ranked here</p>
            <p className="mt-1 text-off-white">{direction.rankingRationale}</p>
          </div>
          {direction.confidenceNote ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral">Assumptions</p>
              <p className="mt-1 text-neutral">{direction.confidenceNote}</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function NutritionSummary({ strategy }: { strategy: GeneratedNutritionStrategy }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div>
      <p className="mt-1 text-heading text-off-white">{meaningfulNutritionStrategyName(strategy)}</p>
      <p className="mt-1 text-sm text-neutral">
        {strategy.targets.calories} kcal · {strategy.targets.proteinG}p / {strategy.targets.carbsG}c / {strategy.targets.fatG}f
      </p>
      <ul className="mt-2 space-y-1 text-sm text-off-white">
        <li>&bull; {strategy.explanation.whyItFits}</li>
        <li>&bull; {strategy.mealStructureDescription}</li>
      </ul>
      <p className="mt-2 text-meta text-neutral">Tradeoff: {strategy.explanation.tradeoff}</p>

      <button type="button" onClick={() => setExpanded((v) => !v)} className="mt-3 flex items-center gap-1 text-sm font-medium text-brass-strong hover:underline">
        <Sparkles size={13} aria-hidden="true" /> See why OPTIM designed this
        {expanded ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
      </button>
      {expanded ? (
        <div className="mt-3 space-y-3 rounded-[var(--radius-md)] border border-border-strong bg-surface-raised p-3.5 text-sm">
          <Detail label="Client data applied" items={strategy.explanation.clientFactsUsed} />
          <Detail label="Coach model applied" items={strategy.explanation.coachingRulesUsed} />
          {strategy.assumptions.length > 0 ? <Detail label="Assumptions" items={strategy.assumptions} /> : null}
        </div>
      ) : null}
    </div>
  );
}

function Detail({ label, items, chip }: { label: string; items: string[]; chip?: boolean }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral">{label}</p>
      {chip ? (
        <div className="mt-1 flex flex-wrap gap-1.5">
          {items.map((i) => (
            <span key={i} className="rounded-full bg-success-soft px-2 py-0.5 text-xs font-medium text-success">
              {i}
            </span>
          ))}
        </div>
      ) : (
        <ul className="mt-1 space-y-0.5 text-off-white">
          {items.map((i) => (
            <li key={i}>&bull; {i}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
