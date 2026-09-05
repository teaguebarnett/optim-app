"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, CircleCheck } from "lucide-react";
import { EvidenceChip } from "@/components/ui/evidence-chip";
import { cn } from "@/lib/cn";
import type { GeneratedTrainingOption } from "@/lib/coach/activation-generation";

const RANK_TONE: Record<string, string> = {
  best_fit: "bg-success-soft text-success",
  strong_alternative: "bg-accent-soft text-accent-strong",
  wildcard: "bg-warning-soft text-warning-strong",
};

/**
 * One ranked training option — collapsed to rank/score/advantage/tradeoff
 * by default, expandable to the full generated program (every week, every
 * exercise — see lib/coach/activation-generation.ts) so a coach can inspect
 * the real content before selecting it, per this phase's brief §IX's
 * "Expand the complete program."
 */
export function RankedTrainingCard({ option, selected, onSelect }: { option: GeneratedTrainingOption; selected: boolean; onSelect: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const week1 = option.program.weeks.find((w) => w.weekNumber === 1);
  const trainingDays = week1?.days.filter((d) => d.type === "training") ?? [];

  return (
    <div className={cn("rounded-[var(--radius-lg)] border-2 p-5 transition-colors", selected ? "border-accent bg-selected-bg" : "border-border-strong bg-charcoal")} style={{ transitionDuration: "var(--motion-fast)" }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-meta font-semibold uppercase tracking-wide", RANK_TONE[option.kind])}>{option.label}</span>
          <p className="mt-2 text-heading text-off-white">{option.program.name}</p>
          <p className="text-meta text-neutral">
            {option.program.durationWeeks} weeks · {trainingDays.length} training days/week
          </p>
        </div>
        <div className="text-right">
          <p className="text-display text-accent-strong">{option.score.total}</p>
          <p className="text-meta text-neutral">fit score</p>
        </div>
      </div>

      {!option.constraints.passed ? (
        <p className="mt-3 rounded-[var(--radius-sm)] bg-error-soft px-3 py-2 text-meta text-error-strong">Failed a hard constraint — see details below.</p>
      ) : null}

      <p className="mt-3 text-sm text-off-white">{option.explanation.whyItFits}</p>
      <div className="mt-3 grid grid-cols-2 gap-3 text-meta">
        <div>
          <p className="font-semibold text-success">Advantage</p>
          <p className="text-neutral">{option.explanation.primaryAdvantage}</p>
        </div>
        <div>
          <p className="font-semibold text-warning-strong">Tradeoff</p>
          <p className="text-neutral">{option.explanation.tradeoff}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {option.explanation.clientFactsUsed.map((f) => (
          <EvidenceChip key={f} icon={CircleCheck} label={f} toneClassName="bg-surface-raised text-neutral" />
        ))}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={onSelect}
          className={cn("rounded-[var(--radius-sm)] px-3.5 py-2 text-sm font-medium transition-colors", selected ? "bg-accent text-on-accent" : "border border-border-strong text-off-white hover:border-accent/50")}
          style={{ transitionDuration: "var(--motion-fast)" }}
        >
          {selected ? "Selected" : "Select this option"}
        </button>
        <button type="button" onClick={() => setExpanded((v) => !v)} className="flex items-center gap-1 text-meta text-accent-strong hover:underline">
          {expanded ? "Hide" : "Expand"} full program {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {expanded ? (
        <div className="mt-4 space-y-3 border-t border-border pt-4">
          <p className="text-meta font-semibold uppercase tracking-wide text-neutral">Week 1</p>
          {trainingDays.map((day) => (
            <div key={day.dayOfWeek} className="rounded-[var(--radius-sm)] bg-surface-input p-3">
              <p className="text-sm font-semibold text-off-white">
                {day.dayOfWeek} — {day.workout?.name}
              </p>
              <p className="text-meta text-neutral">{day.workout?.focus} · ~{day.workout?.estimatedDurationMin} min</p>
              <ul className="mt-2 space-y-1">
                {day.workout?.exercises.map((ex) => (
                  <li key={ex.id} className="text-meta text-off-white">
                    {ex.name} — {ex.workingSets} × {ex.targetRepsLow}-{ex.targetRepsHigh} @ RPE {ex.targetRpe}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {option.constraints.checks.map((c) => (
            <p key={c.id} className={cn("text-meta", c.passed ? "text-success" : "text-error-strong")}>
              {c.passed ? "✓" : "✗"} {c.label}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
