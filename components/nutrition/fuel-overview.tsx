"use client";

import { NO_TARGET_LABEL } from "@/lib/nutrition/plan-display";
import { ProgressRing } from "@/components/ui/progress-ring";
import { MacroTile } from "@/components/nutrition/macro-tile";
import { remainingCalorieCaption } from "@/lib/nutrition/view-model";
import { NUTRITION_NOT_ASSIGNED_LABEL } from "@/lib/calculations";
import type { MacroKey } from "@/lib/nutrition/view-model";
import type { MacroValues } from "@/lib/types";

interface FuelOverviewProps {
  totals: MacroValues;
  /** Null = no nutrition assigned: consumed values still show, but no
   * target, progress, or remaining is ever computed. */
  /** U3A — per-field targets: a number when prescribed, null when not (planAssigned tells "No target" from "not assigned"). */
  targets: { calories: number | null; proteinG: number | null; carbsG: number | null; fatG: number | null; planAssigned?: boolean } | null;
  onOpenMacro: (macro: MacroKey) => void;
  /** The intelligent daily status line (see lib/nutrition/status.ts) — shown
   * as a quiet, intentionally designed footer inside this card, separated
   * from the macro tiles by the same divide-y hairline the ring/tiles zones
   * already share, rather than floating as a loose sentence between cards. */
  statusLine: string;
}

/**
 * Zone 1 — Daily fuel overview. One coordinated instrument panel (ring +
 * calorie readout, the three dedicated macro tiles, then the status footer)
 * rather than competing summary widgets, following the same divide-y
 * multi-zone card pattern already established by Today's Fuel/Training panel
 * (see components/today/fuel-section.tsx).
 */
export function FuelOverview({ totals, targets, onOpenMacro, statusLine }: FuelOverviewProps) {
  const cal = targets?.calories ?? null;
  const assigned = !!targets?.planAssigned || (!!targets && cal !== null);
  const caloriePercent = cal !== null && cal > 0 ? (totals.calories / cal) * 100 : 0;

  return (
    <div className="mx-4 mt-4 divide-y divide-border/70 overflow-hidden rounded-[var(--radius-lg)] bg-charcoal shadow-[var(--shadow-subtle)]">
      <div className="p-4">
        <p className="text-label text-neutral">Daily fuel</p>
        <div className="mt-3 flex items-center gap-5">
          <ProgressRing
            percent={caloriePercent}
            size={112}
            strokeWidth={10}
            color="var(--pc-brass)"
            label={String(Math.round(totals.calories))}
            sublabel={cal !== null ? `of ${cal} cal` : "cal"}
          />
          <div className="min-w-0 flex-1 space-y-2">
            <FuelRow label="Consumed" value={`${Math.round(totals.calories)} cal`} />
            {cal !== null ? (
              <>
                <FuelRow label="Target" value={`${cal} cal`} />
                <FuelRow label="Remaining" value={remainingCalorieCaption(totals.calories, cal)} />
              </>
            ) : (
              <FuelRow label="Target" value={assigned ? NO_TARGET_LABEL : NUTRITION_NOT_ASSIGNED_LABEL} />
            )}
          </div>
        </div>
      </div>

      <div className="p-4">
        <div className="grid grid-cols-3 gap-3">
          <MacroTile
            macroKey="protein"
            label="Protein"
            consumed={totals.proteinG}
            target={targets?.proteinG ?? null}
            planAssigned={assigned}
            onOpen={() => onOpenMacro("protein")}
          />
          <MacroTile
            macroKey="carbs"
            label="Carbs"
            consumed={totals.carbsG}
            target={targets?.carbsG ?? null}
            planAssigned={assigned}
            onOpen={() => onOpenMacro("carbs")}
          />
          <MacroTile macroKey="fat" label="Fat" consumed={totals.fatG} target={targets?.fatG ?? null} planAssigned={assigned} onOpen={() => onOpenMacro("fat")} />
        </div>
      </div>

      <div className="px-4 py-3">
        <p className="text-meta text-neutral">{statusLine}</p>
      </div>
    </div>
  );
}

function FuelRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-meta">
      <span className="text-neutral">{label}</span>
      <span className="text-off-white">{value}</span>
    </div>
  );
}
