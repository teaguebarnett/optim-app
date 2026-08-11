import { cn } from "@/lib/cn";
import type { RpeValue } from "@/lib/types";

const RPE_VALUES: RpeValue[] = [6, 7, 8, 9, 10];

interface RpeSelectorProps {
  value: RpeValue | null;
  onChange: (value: RpeValue) => void;
  id: string;
}

export function RpeSelector({ value, onChange, id }: RpeSelectorProps) {
  return (
    <div>
      <span id={`${id}-label`} className="mb-1.5 block text-sm font-medium text-off-white">
        Actual RPE
      </span>
      <div role="radiogroup" aria-labelledby={`${id}-label`} className="flex gap-1.5">
        {RPE_VALUES.map((rpe) => {
          const selected = value === rpe;
          return (
            <button
              key={rpe}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`RPE ${rpe}`}
              onClick={() => onChange(rpe)}
              className={cn(
                "flex h-11 flex-1 items-center justify-center rounded-[var(--radius-sm)] border text-[15px] font-semibold transition-colors",
                selected
                  ? "border-accent bg-accent text-on-accent"
                  : "border-border-strong text-off-white hover:border-accent/40"
              )}
            >
              {rpe}
            </button>
          );
        })}
      </div>
    </div>
  );
}
