"use client";

import type { ChangeEvent } from "react";
import { X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { nextId } from "@/lib/state";
import { isValidMacro } from "@/lib/calculations";
import type { MealEstimateItem } from "@/lib/types";

interface EstimateItemEditorProps {
  items: MealEstimateItem[];
  onChange: (items: MealEstimateItem[]) => void;
}

/**
 * Lets the client add, remove, rename, or correct every item in a photo
 * estimate before confirming — the review step's core editable surface (see
 * photo-meal-flow.tsx). Never dispatches anything itself; the parent only
 * reads the current `items` back out once the client confirms.
 */
export function EstimateItemEditor({ items, onChange }: EstimateItemEditorProps) {
  function updateItem(id: string, patch: Partial<MealEstimateItem>) {
    onChange(items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function updateMacro(id: string, key: keyof MealEstimateItem["macros"], rawValue: number) {
    const value = isValidMacro(rawValue) ? rawValue : 0;
    const current = items.find((item) => item.id === id);
    if (!current) return;
    updateItem(id, { macros: { ...current.macros, [key]: value } });
  }

  function removeItem(id: string) {
    onChange(items.filter((item) => item.id !== id));
  }

  function addItem() {
    onChange([
      ...items,
      {
        id: nextId("estimate-item"),
        name: "",
        quantityLabel: "1 serving",
        macros: { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
      },
    ]);
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.id} className="rounded-[var(--radius-md)] border border-border-strong p-3">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1 space-y-2">
              <input
                aria-label="Item name"
                value={item.name}
                onChange={(e) => updateItem(item.id, { name: e.target.value })}
                placeholder="Item name"
                className="h-9 w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface px-2.5 text-[14px] text-off-white outline-none focus-visible:border-accent"
              />
              <input
                aria-label="Quantity"
                value={item.quantityLabel}
                onChange={(e) => updateItem(item.id, { quantityLabel: e.target.value })}
                placeholder="Quantity (e.g. 1 cup)"
                className="h-9 w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface px-2.5 text-[13px] text-neutral outline-none focus-visible:border-accent"
              />
            </div>
            <Button
              variant="ghost"
              size="icon"
              type="button"
              aria-label={`Remove ${item.name || "item"}`}
              onClick={() => removeItem(item.id)}
              className="shrink-0"
            >
              <X size={16} />
            </Button>
          </div>
          <div className="mt-2.5 grid grid-cols-4 gap-1.5">
            <MacroMiniField label="Cal" value={item.macros.calories} onChange={(v) => updateMacro(item.id, "calories", v)} />
            <MacroMiniField label="Protein" value={item.macros.proteinG} onChange={(v) => updateMacro(item.id, "proteinG", v)} />
            <MacroMiniField label="Carbs" value={item.macros.carbsG} onChange={(v) => updateMacro(item.id, "carbsG", v)} />
            <MacroMiniField label="Fat" value={item.macros.fatG} onChange={(v) => updateMacro(item.id, "fatG", v)} />
          </div>
        </div>
      ))}
      <Button variant="outline" size="sm" type="button" className="w-full" onClick={addItem}>
        <Plus size={15} aria-hidden="true" /> Add item
      </Button>
    </div>
  );
}

function MacroMiniField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const parsed = Number(e.target.value);
    onChange(Number.isFinite(parsed) ? Math.max(0, parsed) : 0);
  }

  return (
    <label className="block">
      <span className="mb-1 block text-center text-[10px] font-semibold uppercase tracking-wide text-neutral">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        min={0}
        value={value}
        onChange={handleChange}
        aria-label={label}
        className="h-9 w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface px-1 text-center text-[13px] text-off-white outline-none focus-visible:border-accent"
      />
    </label>
  );
}
