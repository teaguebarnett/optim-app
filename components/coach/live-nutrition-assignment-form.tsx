"use client";

// The live client workspace's "Create, publish & assign" nutrition form
// (components/coach/live-client-workspace.tsx). A client component only so
// a validation failure renders inline — the same { ok, message } result
// pattern components/coach's invite form uses — instead of a thrown error
// that production redacts to a generic crash.
//
// Inputs start blank unless a real assigned plan exists, in which case they
// hold that plan's own saved targets. There are no default numbers: see
// lib/coach/nutrition-targets-input.ts for why.

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { NutritionTargets } from "@/lib/types";

export type NutritionAssignResult = { ok: true } | { ok: false; message: string } | null;

const INPUTS: Array<{ name: keyof NutritionTargets; label: string; min: number; max: number; width: string }> = [
  { name: "calories", label: "Calories", min: 500, max: 10000, width: "w-24" },
  { name: "proteinG", label: "Protein g", min: 0, max: 1000, width: "w-20" },
  { name: "carbsG", label: "Carbs g", min: 0, max: 1000, width: "w-20" },
  { name: "fatG", label: "Fat g", min: 0, max: 1000, width: "w-20" },
];

export function LiveNutritionAssignmentForm({
  action,
  assignedTargets,
}: {
  action: (prev: NutritionAssignResult, formData: FormData) => Promise<NutritionAssignResult>;
  assignedTargets: NutritionTargets | null;
}) {
  const [result, formAction, pending] = useActionState(action, null);

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
              // Keyed on the saved value so a fresh assignment re-seeds the
              // uncontrolled input after revalidation.
              key={`${input.name}-${assignedTargets?.[input.name] ?? "blank"}`}
              defaultValue={assignedTargets ? assignedTargets[input.name] : ""}
              className={`${input.width} rounded border border-border-strong bg-transparent px-2 py-1 text-off-white`}
            />
          </label>
        ))}
        <Button type="submit" variant="primary" size="sm" loading={pending}>
          Create, publish &amp; assign
        </Button>
      </div>
      {result && !result.ok ? <p className="text-sm text-error">{result.message}</p> : null}
    </form>
  );
}
