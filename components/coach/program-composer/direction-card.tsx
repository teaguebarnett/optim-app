"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RANK_LABEL, meaningfulTrainingDirectionName } from "@/lib/coach/plan-presentation";
import type { ProgramDirectionSummary } from "@/lib/coach/program-directions";

/**
 * Phase 5.5A Part 4 — a recommendation card scannable at a glance: rank,
 * name, split/frequency/length, one benefit sentence, one tradeoff, and
 * three actions. Everything else (client data applied, coach-model
 * reasoning, constraints honored, why it ranked here, assumptions) lives
 * one level deeper behind "See why OPTIM designed this" — never on the
 * collapsed card, and never repeated boilerplate across all three cards.
 */
export function DirectionCard({
  direction,
  selectedPrimary,
  selectedSecondary,
  onSelectPrimary,
  onToggleCombine,
}: {
  direction: ProgramDirectionSummary;
  selectedPrimary: boolean;
  selectedSecondary: boolean;
  onSelectPrimary: () => void;
  onToggleCombine: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className={selectedPrimary ? "border-l-2 border-l-brass" : selectedSecondary ? "border-l-2 border-l-brass/40" : ""}>
      <p className="text-xs font-semibold uppercase tracking-wide text-brass-strong">{RANK_LABEL[direction.kind] ?? direction.kind}</p>
      <p className="mt-1 text-subheading text-off-white">{meaningfulTrainingDirectionName(direction)}</p>
      <p className="mt-1 text-sm text-neutral">
        {direction.splitName} · {direction.frequencyPerWeek}x/week · ~{direction.estimatedSessionLengthMin} min
      </p>
      <p className="mt-2 text-sm text-off-white">{direction.whyItFits}</p>
      <p className="mt-2 text-meta text-neutral">Tradeoff: {direction.tradeoff}</p>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mt-3 flex items-center gap-1 text-sm font-medium text-brass-strong hover:underline"
      >
        <Sparkles size={13} aria-hidden="true" />
        See why OPTIM designed this
        {expanded ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
      </button>

      {expanded ? (
        <div className="mt-3 space-y-3 rounded-[var(--radius-md)] border border-border-strong bg-surface-raised p-3.5 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral">Client data applied</p>
            <ul className="mt-1 space-y-0.5 text-off-white">
              {direction.explanation.clientFactsUsed.map((fact) => (
                <li key={fact}>&bull; {fact}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral">Coach model applied</p>
            <ul className="mt-1 space-y-0.5 text-off-white">
              {direction.explanation.coachingRulesUsed.map((rule) => (
                <li key={rule}>&bull; {rule}</li>
              ))}
            </ul>
            <p className="mt-1 text-meta text-neutral">
              {direction.periodizationApproach} {direction.approxVolumeDescription} {direction.approxIntensityDescription} {direction.specializationEmphasis} {direction.cardioIntegration}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral">Constraints honored</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {direction.constraintsHonored.map((c) => (
                <span key={c} className="rounded-full bg-success-soft px-2 py-0.5 text-xs font-medium text-success">
                  {c}
                </span>
              ))}
            </div>
          </div>
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

      <div className="mt-3 flex gap-2">
        <Button size="sm" variant={selectedPrimary ? "primary" : "secondary"} onClick={onSelectPrimary}>
          {selectedPrimary ? "Selected" : "Select"}
        </Button>
        <Button size="sm" variant={selectedSecondary ? "primary" : "outline"} onClick={onToggleCombine} disabled={selectedPrimary}>
          {selectedSecondary ? "Combining" : "Combine"}
        </Button>
      </div>
    </Card>
  );
}
