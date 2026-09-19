import type { SkipReason } from "@/lib/types";
import { cn } from "@/lib/cn";

export const SKIP_REASON_LABELS: Record<SkipReason, string> = {
  "out-of-time": "Running out of time",
  "pain-or-discomfort": "Pain or discomfort",
  "equipment-unavailable": "Equipment unavailable",
  "feeling-sick": "Feeling sick",
  "excessive-fatigue": "Excessive fatigue",
  "schedule-conflict": "Schedule conflict",
  forgot: "Forgot",
  other: "Other",
  // Correction pass (Gate 3B human-QA) — meal-only reasons; see
  // MEAL_SKIP_REASONS in components/meals/meal-selection-sheet.tsx, the
  // only caller that ever shows these two.
  "not-hungry": "Not hungry",
  "food-unavailable": "Food unavailable",
};

const REASON_ORDER: SkipReason[] = [
  "out-of-time",
  "pain-or-discomfort",
  "equipment-unavailable",
  "feeling-sick",
  "excessive-fatigue",
  "schedule-conflict",
  "forgot",
  "other",
];

interface ReasonPickerProps {
  value: SkipReason | null;
  onChange: (reason: SkipReason) => void;
  name: string;
  /** Correction pass — the reason vocabulary shown, in order. Defaults to
   * the full workout/cardio set (REASON_ORDER) so every existing caller
   * (every workout skip flow via SkipReasonSheet, and cardio-task.tsx)
   * keeps its exact prior behavior with no change on their part. A caller
   * whose skip context needs a narrower, more specific vocabulary (meals —
   * see MEAL_SKIP_REASONS in components/meals/meal-selection-sheet.tsx)
   * passes its own list instead. */
  reasons?: SkipReason[];
}

export function ReasonPicker({ value, onChange, name, reasons = REASON_ORDER }: ReasonPickerProps) {
  return (
    <div role="radiogroup" aria-label="Reason" className="grid grid-cols-2 gap-2">
      {reasons.map((reason) => {
        const selected = value === reason;
        return (
          <button
            key={reason}
            type="button"
            role="radio"
            aria-checked={selected}
            name={name}
            onClick={() => onChange(reason)}
            className={cn(
              "min-h-[48px] rounded-[var(--radius-sm)] border px-3 py-2.5 text-left text-sm font-medium transition-colors",
              selected
                ? "border-accent bg-accent-soft text-accent-fg"
                : "border-border-strong text-off-white hover:border-accent/40"
            )}
          >
            {SKIP_REASON_LABELS[reason]}
          </button>
        );
      })}
    </div>
  );
}
