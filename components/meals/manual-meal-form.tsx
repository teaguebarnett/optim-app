"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { NumberField } from "@/components/ui/number-field";
import { isValidMacro } from "@/lib/calculations";
import type { MacroValues } from "@/lib/types";

interface ManualMealFormProps {
  onSave: (name: string, macros: MacroValues) => void;
  onCancel: () => void;
}

export function ManualMealForm({ onSave, onCancel }: ManualMealFormProps) {
  const [name, setName] = useState("");
  const [calories, setCalories] = useState<number | "">("");
  const [protein, setProtein] = useState<number | "">("");
  const [carbs, setCarbs] = useState<number | "">("");
  const [fat, setFat] = useState<number | "">("");
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    if (!name.trim()) {
      setError("Give this meal a name.");
      return;
    }
    const values = [calories, protein, carbs, fat];
    if (values.some((v) => v === "")) {
      setError("Fill in an estimate for every field — rough numbers are fine.");
      return;
    }
    const macros = {
      calories: calories as number,
      proteinG: protein as number,
      carbsG: carbs as number,
      fatG: fat as number,
    };
    if (Object.values(macros).some((v) => !isValidMacro(v))) {
      setError("Those numbers look off — double check them.");
      return;
    }
    onSave(name.trim(), macros);
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
        <Button className="flex-1" onClick={handleSave}>
          Save estimate
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
