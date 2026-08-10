import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { MealOption } from "@/lib/types";

interface MealOptionCardProps {
  option: MealOption;
  isSelected: boolean;
  onSelect: () => void;
}

export function MealOptionCard({ option, isSelected, onSelect }: MealOptionCardProps) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-md)] border p-4",
        isSelected ? "border-accent/50 bg-accent-soft/40" : "border-border-strong"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-off-white">{option.name}</p>
          <p className="mt-1 text-sm text-neutral">{option.description}</p>
        </div>
        {isSelected ? (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-off-white">
            <Check size={14} />
          </span>
        ) : null}
      </div>

      <p className="mt-2 text-xs text-neutral">{option.mainIngredients.join(", ")}</p>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral">
        <span>
          <span className="font-semibold text-off-white">{option.macros.calories}</span> cal
        </span>
        <span>
          <span className="font-semibold text-off-white">{option.macros.proteinG}g</span> protein
        </span>
        <span>
          <span className="font-semibold text-off-white">{option.macros.carbsG}g</span> carbs
        </span>
        <span>
          <span className="font-semibold text-off-white">{option.macros.fatG}g</span> fat
        </span>
      </div>

      <Button
        variant={isSelected ? "secondary" : "primary"}
        size="sm"
        className="mt-3 w-full"
        onClick={onSelect}
      >
        {isSelected ? "Selected" : "Select"}
      </Button>
    </div>
  );
}
