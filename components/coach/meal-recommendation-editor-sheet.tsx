"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { TextArea } from "@/components/ui/textarea";
import { MEAL_RECOMMENDATION_TAG_LABELS } from "@/lib/coach/meal-recommendations";
import { cn } from "@/lib/cn";
import type { MealRecommendation, MealRecommendationTag } from "@/lib/coach/types";
import type { MealPeriod } from "@/lib/types";

const CATEGORY_OPTIONS: { value: MealPeriod; label: string }[] = [
  { value: "breakfast", label: "Breakfast" },
  { value: "postWorkout", label: "Post-workout" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
  { value: "snack", label: "Snack" },
];

const ALL_TAGS: MealRecommendationTag[] = ["quick", "pre_workout", "post_workout", "breakfast", "lunch", "dinner", "snack"];

function numberOrUndefined(raw: string): number | undefined {
  if (raw.trim() === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Create/edit form for exactly one of the coach's own MealRecommendations —
 * a Sheet rather than a separate route, matching the AddClientSheet
 * pattern for a form this focused. Saves a complete draft on submit;
 * nothing is written until then.
 */
export function MealRecommendationEditorSheet({
  open,
  onClose,
  initial,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  initial: MealRecommendation | null;
  onSave: (recommendation: MealRecommendation) => void;
}) {
  const [draft, setDraft] = useState<MealRecommendation | null>(initial);
  const [syncedId, setSyncedId] = useState(initial?.id);

  if (initial && initial.id !== syncedId) {
    setSyncedId(initial.id);
    setDraft(initial);
  }

  if (!open || !draft) return null;

  function toggleTag(tag: MealRecommendationTag) {
    setDraft((prev) => (prev ? { ...prev, tags: prev.tags.includes(tag) ? prev.tags.filter((t) => t !== tag) : [...prev.tags, tag] } : prev));
  }

  function handleSave() {
    if (!draft || draft.name.trim().length === 0) return;
    onSave(draft);
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={initial?.name ? "Edit recommendation" : "New recommendation"}
      footer={
        <Button className="w-full" size="lg" disabled={draft.name.trim().length === 0} onClick={handleSave}>
          Save recommendation
        </Button>
      }
    >
      <div className="space-y-4">
        <TextField id="meal-name" label="Meal name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Greek yogurt power bowl" required />

        <div>
          <p className="mb-1.5 text-sm font-medium text-off-white">Category</p>
          <div className="grid grid-cols-3 gap-2">
            {CATEGORY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setDraft({ ...draft, category: opt.value })}
                aria-pressed={draft.category === opt.value}
                className={cn(
                  "rounded-[var(--radius-sm)] border-2 px-2 py-2.5 text-sm font-medium transition-colors",
                  draft.category === opt.value ? "border-accent bg-selected-bg text-accent-fg" : "border-border-strong text-off-white hover:border-accent/40"
                )}
                style={{ transitionDuration: "var(--motion-fast)" }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <TextArea
          id="meal-ingredients"
          label="Ingredients and serving guidance"
          value={draft.ingredients}
          onChange={(e) => setDraft({ ...draft, ingredients: e.target.value })}
          placeholder="e.g. 1 cup Greek yogurt, 1/2 cup berries, 2 tbsp granola"
          rows={3}
        />

        <TextArea
          id="meal-instructions"
          label="Preparation / coach notes (optional)"
          value={draft.instructions ?? ""}
          onChange={(e) => setDraft({ ...draft, instructions: e.target.value })}
          placeholder="Anything the client should know about preparing or timing this"
          rows={2}
        />

        <div>
          <p className="mb-1.5 text-sm font-medium text-off-white">Macros (optional — leave blank if unknown)</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <label className="text-xs text-neutral">
              Calories
              <input
                type="number"
                min={0}
                value={draft.macros?.calories ?? ""}
                onChange={(e) => setDraft({ ...draft, macros: { ...draft.macros, calories: numberOrUndefined(e.target.value) } })}
                className="mt-1 h-9 w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface px-2.5 text-sm text-off-white outline-none focus-visible:border-accent"
              />
            </label>
            <label className="text-xs text-neutral">
              Protein (g)
              <input
                type="number"
                min={0}
                value={draft.macros?.proteinG ?? ""}
                onChange={(e) => setDraft({ ...draft, macros: { ...draft.macros, proteinG: numberOrUndefined(e.target.value) } })}
                className="mt-1 h-9 w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface px-2.5 text-sm text-off-white outline-none focus-visible:border-accent"
              />
            </label>
            <label className="text-xs text-neutral">
              Carbs (g)
              <input
                type="number"
                min={0}
                value={draft.macros?.carbsG ?? ""}
                onChange={(e) => setDraft({ ...draft, macros: { ...draft.macros, carbsG: numberOrUndefined(e.target.value) } })}
                className="mt-1 h-9 w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface px-2.5 text-sm text-off-white outline-none focus-visible:border-accent"
              />
            </label>
            <label className="text-xs text-neutral">
              Fat (g)
              <input
                type="number"
                min={0}
                value={draft.macros?.fatG ?? ""}
                onChange={(e) => setDraft({ ...draft, macros: { ...draft.macros, fatG: numberOrUndefined(e.target.value) } })}
                className="mt-1 h-9 w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface px-2.5 text-sm text-off-white outline-none focus-visible:border-accent"
              />
            </label>
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-sm font-medium text-off-white">Tags</p>
          <div className="flex flex-wrap gap-1.5">
            {ALL_TAGS.map((tag) => {
              const active = draft.tags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  aria-pressed={active}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    active ? "border-accent bg-selected-bg text-accent-fg" : "border-border-strong text-neutral"
                  )}
                >
                  {MEAL_RECOMMENDATION_TAG_LABELS[tag]}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </Sheet>
  );
}
