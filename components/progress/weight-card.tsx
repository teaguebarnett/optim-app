"use client";

import { useState } from "react";
import { WeightChart } from "./weight-chart";
import { ExpandableCard } from "./expandable-card";
import { cn } from "@/lib/cn";
import type { WeightCardModel, WeightRangeKey } from "@/lib/progress/types";

function formatChange(weight: WeightCardModel): string {
  if (weight.changeStatus !== "ok" || weight.changeSinceProgramStartLb === null) {
    return "Not enough weigh-ins yet for a program-start comparison";
  }
  const value = weight.changeSinceProgramStartLb;
  const sign = value > 0 ? "+" : "";
  return `${sign}${value} lb since program start`;
}

/** The most visually prominent, full-width, persistent card. */
export function WeightCard({ weight }: { weight: WeightCardModel }) {
  const [range, setRange] = useState<WeightRangeKey>("fourWeeks");
  const changeText = formatChange(weight);

  return (
    <div className="px-4">
      <ExpandableCard
        title="Body weight"
        detailTitle="Body weight"
        className="p-5"
        detail={
          <div className="space-y-4">
            <div className="flex gap-2" role="group" aria-label="Chart range">
              {(
                [
                  { key: "fourWeeks", label: "4 Weeks" },
                  { key: "fullProgram", label: "Full Program" },
                ] as const
              ).map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setRange(option.key)}
                  aria-pressed={range === option.key}
                  className={cn(
                    "flex-1 rounded-[var(--radius-sm)] border px-3 py-2 text-sm font-medium transition-colors",
                    range === option.key
                      ? "border-accent bg-accent-soft text-accent-fg"
                      : "border-border-strong text-off-white hover:border-accent/40"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <WeightChart range={weight.ranges[range]} />
            <div className="space-y-1 text-sm">
              <p className="text-off-white">
                Latest: <span className="font-medium">{weight.latestWeightLb !== null ? `${weight.latestWeightLb} lb` : "Not logged yet"}</span>
              </p>
              <p className="text-neutral">{changeText}</p>
            </div>
          </div>
        }
      >
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-3xl font-semibold text-off-white">
              {weight.latestWeightLb !== null ? weight.latestWeightLb : "—"}
              {weight.latestWeightLb !== null ? <span className="ml-1 text-base font-normal text-neutral">lb</span> : null}
            </p>
            <p className="mt-1 text-xs text-neutral">{changeText}</p>
          </div>
          <div className="w-28 shrink-0">
            <WeightChart range={weight.ranges.fourWeeks} compact />
          </div>
        </div>
      </ExpandableCard>
    </div>
  );
}
