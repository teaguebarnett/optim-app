"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TextArea } from "@/components/ui/textarea";
import { cn } from "@/lib/cn";
import { mealOptionHasIngredient } from "@/lib/nutrition/view-model";
import { BOUNDED_SUBSTITUTION_RULES } from "@/lib/nutrition/substitution";
import { saveCoachMealPlanEntry } from "@/lib/coach/nutrition-authoring";
import { MEAL_OPTIONS, MEAL_PERIOD_LABELS } from "@/lib/mock-data";
import type { AppState } from "@/lib/state";
import type { MealPeriod } from "@/lib/types";
import type { ClientProfileId, CoachProfileId } from "@/lib/tenancy/types";

const PERIOD_ORDER: MealPeriod[] = ["breakfast", "postWorkout", "lunch", "dinner", "snack"];

/**
 * Gate 3C — a coach's own edit surface for one client's per-meal-period
 * Meal Intent and eligible substitution boundaries, plus a live preview of
 * exactly what the client's own plan-view rows will show. Reuses the shared
 * MEAL_OPTIONS catalog and BOUNDED_SUBSTITUTION_RULES contract unchanged —
 * this only ever writes the coach's own overlay (see
 * lib/coach/nutrition-authoring.ts's saveCoachMealPlanEntry), never a
 * second catalog or a second substitution model. Writing here changes what
 * components/meals/meal-selection-sheet.tsx actually renders for this
 * client the next time they open that period — the preview below and the
 * client's own screen can never diverge, because both read the identical
 * `coachMealPlan` field off this same client's AppState.
 */
export function CoachMealPlanCard({
  clientId,
  clientAppState,
  coachId,
  coachName,
  onChanged,
}: {
  clientId: ClientProfileId;
  clientAppState: AppState;
  coachId: CoachProfileId;
  coachName: string;
  onChanged: () => void;
}) {
  const [period, setPeriod] = useState<MealPeriod>("breakfast");
  const [previewSelectedOptionId, setPreviewSelectedOptionId] = useState<string | null>(null);

  const entry = clientAppState.coachMealPlan[period];
  const options = MEAL_OPTIONS[period];
  const label = MEAL_PERIOD_LABELS[period];

  // Draft state — never written until "Save," so browsing periods or
  // reopening this card never silently commits a half-typed edit.
  const [draftIntent, setDraftIntent] = useState(entry?.mealIntentOverride ?? "");
  const [draftEligibleIds, setDraftEligibleIds] = useState<string[] | undefined>(entry?.eligibleSubstitutionRuleIds);
  const [loadedPeriod, setLoadedPeriod] = useState<MealPeriod>(period);
  const [savedJustNow, setSavedJustNow] = useState(false);

  // Re-seed the draft only when switching periods (or when this exact
  // period's saved entry changes underneath us) — never on every render,
  // which would silently discard in-progress typing.
  if (loadedPeriod !== period) {
    setLoadedPeriod(period);
    setDraftIntent(entry?.mealIntentOverride ?? "");
    setDraftEligibleIds(entry?.eligibleSubstitutionRuleIds);
    setPreviewSelectedOptionId(null);
    setSavedJustNow(false);
  }

  // Only rules whose source ingredient actually appears in at least one of
  // this period's real catalog options are ever shown here — never a rule
  // the client could never realistically be asked about for this meal.
  const relevantRules = BOUNDED_SUBSTITUTION_RULES.filter(
    (rule) => (rule.period === null || rule.period === period) && options.some((option) => mealOptionHasIngredient(option, rule.fromLabel))
  );

  function isEligible(ruleId: string): boolean {
    return draftEligibleIds === undefined || draftEligibleIds.includes(ruleId);
  }

  function toggleEligible(ruleId: string) {
    const current = draftEligibleIds ?? relevantRules.map((r) => r.id);
    setDraftEligibleIds(current.includes(ruleId) ? current.filter((id) => id !== ruleId) : [...current, ruleId]);
  }

  function handleSave() {
    const result = saveCoachMealPlanEntry({
      clientId,
      period,
      mealIntentOverride: draftIntent,
      eligibleSubstitutionRuleIds: draftEligibleIds,
      coachId,
      coachName,
      nowIso: new Date().toISOString(),
    });
    if (result.ok) {
      setSavedJustNow(true);
      onChanged();
    }
  }

  const effectiveIntentFor = (optionDescription: string) => draftIntent.trim() || optionDescription;
  const previewOption = previewSelectedOptionId ? options.find((o) => o.id === previewSelectedOptionId) : null;

  return (
    <Card className="space-y-4">
      <div>
        <p className="text-subheading text-off-white">Nutrition plan</p>
        <p className="mt-0.5 text-meta text-neutral">Edit this client&apos;s Meal Intent and which registered swaps they can see, per meal.</p>
      </div>

      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Meal period">
        {PERIOD_ORDER.map((p) => (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={period === p}
            onClick={() => setPeriod(p)}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
              period === p ? "bg-accent text-on-accent" : "bg-surface-raised text-neutral hover:text-off-white"
            )}
          >
            {MEAL_PERIOD_LABELS[p]}
          </button>
        ))}
      </div>

      <div>
        <TextArea
          id={`coach-meal-intent-${period}`}
          label={`Meal Intent for ${label.toLowerCase()}`}
          value={draftIntent}
          onChange={(e) => {
            setDraftIntent(e.target.value);
            setSavedJustNow(false);
          }}
          placeholder={options[0]?.description ?? "Why this meal, for this client, right now"}
          rows={2}
        />
        <p className="mt-1 text-meta text-neutral">
          {draftIntent.trim() ? "Overrides the catalog's own description for every option this period." : "Blank — the client sees each option's own catalog description."}
        </p>
      </div>

      <div>
        <p className="text-label text-neutral">Eligible swaps for {label.toLowerCase()}</p>
        {relevantRules.length === 0 ? (
          <p className="mt-1.5 text-sm text-neutral">No registered swap applies to any of this period&apos;s options.</p>
        ) : (
          <div className="mt-1.5 space-y-1.5">
            {relevantRules.map((rule) => {
              const eligible = isEligible(rule.id);
              return (
                <button
                  key={rule.id}
                  type="button"
                  onClick={() => {
                    toggleEligible(rule.id);
                    setSavedJustNow(false);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between rounded-[var(--radius-sm)] border px-3 py-2 text-left text-sm transition-colors",
                    eligible ? "border-accent/40 bg-accent-soft text-off-white" : "border-border-strong text-neutral"
                  )}
                >
                  <span>
                    {rule.fromLabel} → {rule.toLabel}
                  </span>
                  <span className={cn("text-xs font-medium", eligible ? "text-accent-fg" : "text-neutral")}>
                    {eligible ? "Eligible" : "Not eligible"}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={handleSave}>
          Save
        </Button>
        {savedJustNow ? <span className="text-meta text-success">Saved.</span> : null}
      </div>

      <div className="border-t border-border pt-3">
        <p className="text-label text-neutral">Preview — exactly what {label.toLowerCase()} looks like to the client</p>
        <div className="mt-2 divide-y divide-border rounded-[var(--radius-md)] bg-surface-raised px-3.5">
          {options.map((option) => {
            const isSelected = previewSelectedOptionId === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setPreviewSelectedOptionId(isSelected ? null : option.id)}
                className="w-full py-3 text-left"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className={cn("text-sm font-medium", isSelected ? "text-accent-fg" : "text-off-white")}>{option.name}</p>
                    <p className="mt-0.5 text-xs text-neutral">{effectiveIntentFor(option.description)}</p>
                  </div>
                  <ChevronRight size={13} className={cn("mt-0.5 shrink-0 text-neutral transition-transform", isSelected && "rotate-90")} aria-hidden="true" />
                </div>
              </button>
            );
          })}
        </div>
        {previewOption ? (
          <p className="mt-2 text-meta text-neutral">
            If shown &ldquo;I need help with this meal&rdquo; for {previewOption.name.toLowerCase()}, this client would see:{" "}
            {relevantRules.filter((r) => isEligible(r.id) && mealOptionHasIngredient(previewOption, r.fromLabel)).length > 0
              ? relevantRules
                  .filter((r) => isEligible(r.id) && mealOptionHasIngredient(previewOption, r.fromLabel))
                  .map((r) => `${r.fromLabel} → ${r.toLabel}`)
                  .join(", ")
              : "no registered swaps — only the option to ask a free-text question."}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
