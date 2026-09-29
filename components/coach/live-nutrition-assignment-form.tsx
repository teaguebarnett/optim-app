"use client";

// The live client workspace's nutrition assignment form
// (components/coach/live-client-workspace.tsx). A client component so the
// result renders inline — pending, success, or the real validation error —
// instead of a thrown error that production redacts to a generic crash.
//
// Inputs start blank unless a real assigned plan exists, in which case they
// hold that plan's own saved targets (see lib/coach/nutrition-targets-input.ts
// for why there are no default numbers). Once a plan is assigned the button
// becomes "Save as new version" and stays disabled until a value actually
// changes; the server also refuses to publish a version identical to the
// assigned one (createPublishAndAssignNutritionAction), so a double click or
// retry never creates an extra version.

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import type { NutritionTargets } from "@/lib/types";

export type NutritionAssignResult = { ok: true; message: string } | { ok: false; message: string } | null;

type Field = keyof NutritionTargets;

const INPUTS: Array<{ name: Field; label: string; min: number; max: number; width: string }> = [
  { name: "calories", label: "Calories", min: 500, max: 10000, width: "w-24" },
  { name: "proteinG", label: "Protein g", min: 0, max: 1000, width: "w-20" },
  { name: "carbsG", label: "Carbs g", min: 0, max: 1000, width: "w-20" },
  { name: "fatG", label: "Fat g", min: 0, max: 1000, width: "w-20" },
];

function toStrings(targets: NutritionTargets | null): Record<Field, string> {
  return {
    calories: targets ? String(targets.calories) : "",
    proteinG: targets ? String(targets.proteinG) : "",
    carbsG: targets ? String(targets.carbsG) : "",
    fatG: targets ? String(targets.fatG) : "",
  };
}

export function LiveNutritionAssignmentForm({
  action,
  assignedTargets,
  assignedVersionNumber,
}: {
  action: (prev: NutritionAssignResult, formData: FormData) => Promise<NutritionAssignResult>;
  assignedTargets: NutritionTargets | null;
  assignedVersionNumber: number | null;
}) {
  const [result, formAction, pending] = useActionState(action, null);
  const saved = toStrings(assignedTargets);
  const [values, setValues] = useState(saved);
  // Re-seed from the saved plan after a successful save revalidates the page.
  const savedKey = JSON.stringify(saved);
  const [seededFrom, setSeededFrom] = useState(savedKey);
  if (seededFrom !== savedKey) {
    setSeededFrom(savedKey);
    setValues(saved);
  }

  const unchanged = assignedTargets !== null && INPUTS.every((i) => values[i.name].trim() === saved[i.name]);
  const label = assignedTargets ? `Save as new version${assignedVersionNumber ? ` (v${assignedVersionNumber + 1})` : ""}` : "Create, publish & assign";

  return (
    <form action={formAction} className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        {INPUTS.map((input) => (
          <label key={input.name} className="flex flex-col text-xs text-neutral">
            {input.label}
            <input
              type="number"
              name={input.name}
              required
              min={input.min}
              max={input.max}
              step={1}
              inputMode="numeric"
              value={values[input.name]}
              onChange={(e) => setValues((v) => ({ ...v, [input.name]: e.target.value }))}
              className={`${input.width} rounded border border-border-strong bg-transparent px-2 py-1 text-off-white`}
            />
          </label>
        ))}
        <Button type="submit" variant="primary" size="sm" loading={pending} disabled={pending || unchanged}>
          {label}
        </Button>
      </div>
      {unchanged && !result ? <p className="text-meta text-neutral">These targets are assigned. Change a value to save a new version.</p> : null}
      {result ? (
        <p role="status" className={`text-sm ${result.ok ? "text-success" : "text-error"}`}>
          {result.message}
        </p>
      ) : null}
    </form>
  );
}
