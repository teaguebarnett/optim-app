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
}

export function ReasonPicker({ value, onChange, name }: ReasonPickerProps) {
  return (
    <div role="radiogroup" aria-label="Reason" className="grid grid-cols-2 gap-2">
      {REASON_ORDER.map((reason) => {
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
