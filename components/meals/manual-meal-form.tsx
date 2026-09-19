"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { NumberField } from "@/components/ui/number-field";
import { isValidMacro } from "@/lib/calculations";
import type { MacroValues } from "@/lib/types";

interface ManualMealFormProps {
  /** Correction pass — `unknownMacroFields` names which of `macros`' fields
   * the client never actually entered a value for (0 in `macros` itself for
   * those, but never to be shown or summed as if measured — see
   * MealSelection.unknownMacroFields' own doc in lib/types.ts). Always
   * passed, even when empty (every field was entered). */
  onSave: (name: string, macros: MacroValues, unknownMacroFields: (keyof MacroValues)[]) => void;
  onCancel: () => void;
  /** Prefills the form for correcting a previously logged entry rather than
   * starting from a blank meal — see the "Edit" path in
   * components/meals/meal-selection-sheet.tsx's summary view. A field named
   * in `unknownMacroFields` restores as blank, not as the stored 0 — re-
   * opening a partial estimate must never present an unentered field as if
   * the client had typed a real zero. */
  initial?: { name: string; macros: MacroValues; unknownMacroFields?: (keyof MacroValues)[] };
  submitLabel?: string;
}

export function ManualMealForm({ onSave, onCancel, initial, submitLabel = "Save estimate" }: ManualMealFormProps) {
  const initialUnknown = new Set(initial?.unknownMacroFields ?? []);
  const [name, setName] = useState(initial?.name ?? "");
  const [calories, setCalories] = useState<number | "">(initialUnknown.has("calories") ? "" : (initial?.macros.calories ?? ""));
  const [protein, setProtein] = useState<number | "">(initialUnknown.has("proteinG") ? "" : (initial?.macros.proteinG ?? ""));
  const [carbs, setCarbs] = useState<number | "">(initialUnknown.has("carbsG") ? "" : (initial?.macros.carbsG ?? ""));
  const [fat, setFat] = useState<number | "">(initialUnknown.has("fatG") ? "" : (initial?.macros.fatG ?? ""));
  const [error, setError] = useState<string | null>(null);

  // Correction pass — a description and at least one meaningful positive
  // value is the real bar for "there's actual evidence here," not "every
  // field happens to be filled in." Missing evidence must stay missing —
  // an untouched blank form (no description, nothing but zeros) can never
  // become a zero-calorie logged meal, so `canSave` (used to disable the
  // button below) and this function's own guard use the exact same two
  // conditions. A field left blank is still recorded as 0 in the macros
  // object saved (so totals math elsewhere never has to special-case an
  // absent number), but is also named in `unknownMacroFields` below so
  // every reader of this selection can tell "genuinely zero" apart from
  // "never entered."
  const hasDescription = name.trim().length > 0;
  const hasPositiveValue = [calories, protein, carbs, fat].some((v) => typeof v === "number" && v > 0);
  const canSave = hasDescription && hasPositiveValue;

  function handleSave() {
    if (!hasDescription) {
      setError("Give this meal a name.");
      return;
    }
    if (!hasPositiveValue) {
      setError("Add at least one nutrition value greater than zero.");
      return;
    }
    const macros = {
      calories: calories === "" ? 0 : calories,
      proteinG: protein === "" ? 0 : protein,
      carbsG: carbs === "" ? 0 : carbs,
      fatG: fat === "" ? 0 : fat,
    };
    if (Object.values(macros).some((v) => !isValidMacro(v))) {
      setError("Those numbers look off — double check them.");
      return;
    }
    const unknownMacroFields: (keyof MacroValues)[] = [];
    if (calories === "") unknownMacroFields.push("calories");
    if (protein === "") unknownMacroFields.push("proteinG");
    if (carbs === "") unknownMacroFields.push("carbsG");
    if (fat === "") unknownMacroFields.push("fatG");
    onSave(name.trim(), macros, unknownMacroFields);
  }

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="manual-meal-name" className="mb-1.5 block text-sm font-medium text-off-white">
          What did you eat?
        </label>
        <input
          id="manual-meal-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Chipotle burrito bowl"
          className="h-11 w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3 text-[15px] text-off-white outline-none placeholder:text-neutral/60 focus-visible:border-accent"
        />
      </div>

      <p className="text-xs text-neutral">
        Estimates are fine — these values will be clearly labeled as estimates in your nutrition totals.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <NumberField id="manual-calories" label="Calories" value={calories} onChange={setCalories} step={10} min={0} />
        <NumberField id="manual-protein" label="Protein" value={protein} onChange={setProtein} step={1} min={0} suffix="g" />
        <NumberField id="manual-carbs" label="Carbs" value={carbs} onChange={setCarbs} step={1} min={0} suffix="g" />
        <NumberField id="manual-fat" label="Fat" value={fat} onChange={setFat} step={1} min={0} suffix="g" />
      </div>

      {error ? <p className="text-xs text-error">{error}</p> : null}

      <div className="flex gap-2">
        <Button className="flex-1" onClick={handleSave} disabled={!canSave}>
          {submitLabel}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
