"use client";

import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { TextArea } from "@/components/ui/textarea";
import { cn } from "@/lib/cn";
import type { RevisionChange, RevisionPlan } from "@/lib/coach/program-revision";
import type { CompleteNutritionPrescription, NutritionRevisionChange, NutritionRevisionPlan } from "@/lib/coach/nutrition-directions";
import type { ClientAssignedProgram } from "@/lib/types";

export type ReviseScope = "training" | "nutrition" | "both";

interface TrainingPreview {
  plan: RevisionPlan;
  revisedProgram: ClientAssignedProgram;
  changes: RevisionChange[];
}

interface NutritionPreview {
  plan: NutritionRevisionPlan;
  revisedPrescription: CompleteNutritionPrescription;
  changes: NutritionRevisionChange[];
}

/**
 * Phase 5.6A.1 — "Revise with OPTIM" (spec Part 2): one focused composer
 * for a plain-language change request, replacing the permanent, always-
 * visible training and nutrition revision text boxes that used to sit
 * directly on the page. The coach picks a scope, describes the change once,
 * previews the real delta, and accepts or discards it before it touches the
 * draft.
 */
export function ReviseWithOptimSheet({
  open,
  onClose,
  scope,
  onScopeChange,
  hasNutrition,
  instruction,
  onInstructionChange,
  onPreview,
  trainingPreview,
  nutritionPreview,
  onConfirm,
  onDiscard,
}: {
  open: boolean;
  onClose: () => void;
  scope: ReviseScope;
  onScopeChange: (scope: ReviseScope) => void;
  hasNutrition: boolean;
  instruction: string;
  onInstructionChange: (v: string) => void;
  onPreview: () => void;
  trainingPreview: TrainingPreview | null;
  nutritionPreview: NutritionPreview | null;
  onConfirm: () => void;
  onDiscard: () => void;
}) {
  const scopes: { id: ReviseScope; label: string }[] = [
    { id: "training", label: "Training only" },
    ...(hasNutrition ? [{ id: "nutrition" as const, label: "Nutrition only" }, { id: "both" as const, label: "Both" }] : []),
  ];

  const hasPreview = !!trainingPreview || !!nutritionPreview;
  const totalChanges = (trainingPreview?.changes.length ?? 0) + (nutritionPreview?.changes.length ?? 0);

  return (
    <Sheet open={open} onClose={onClose} title="Revise with OPTIM" description="Describe the change in plain language — OPTIM proposes a real delta for you to accept or discard.">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          {scopes.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onScopeChange(s.id)}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                scope === s.id ? "bg-accent text-on-accent" : "border border-border-strong text-off-white hover:bg-surface-raised"
              )}
            >
              {s.label}
            </button>
          ))}
        </div>

        <TextArea
          id="revise-with-optim"
          label="What should change?"
          placeholder="e.g. Keep all workouts under 60 minutes, and reduce carbs slightly on rest days."
          value={instruction}
          onChange={(e) => onInstructionChange(e.target.value)}
          rows={3}
        />
        <Button size="sm" variant="secondary" onClick={onPreview} disabled={!instruction.trim()}>
          Preview change
        </Button>

        {hasPreview ? (
          <div className="space-y-3 border-t border-border pt-3">
            {trainingPreview ? <DeltaPanel title="Training" summary={trainingPreview.plan.summary} changes={trainingPreview.changes.map((c) => `Week ${c.weekNumber}, ${c.dayOfWeek} — ${c.field}: ${c.before} → ${c.after}`)} /> : null}
            {nutritionPreview ? <DeltaPanel title="Nutrition" summary={nutritionPreview.plan.summary} changes={nutritionPreview.changes.map((c) => `${c.field}: ${c.before} → ${c.after}`)} /> : null}

            <div className="flex gap-2">
              <Button size="sm" onClick={onConfirm} disabled={totalChanges === 0}>
                Accept change
              </Button>
              <Button size="sm" variant="secondary" onClick={onDiscard}>
                Discard
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}

function DeltaPanel({ title, summary, changes }: { title: string; summary: string; changes: string[] }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-border-strong bg-surface-raised p-3.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral">{title}</p>
      <p className="mt-1 text-sm font-medium text-off-white">{summary}</p>
      {changes.length === 0 ? (
        <p className="mt-2 text-sm text-neutral">No concrete change resulted — nothing to apply.</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {changes.map((c, i) => (
            <li key={i} className="text-meta text-neutral">
              {c}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
