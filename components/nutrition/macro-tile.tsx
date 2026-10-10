"use client";

import { NO_TARGET_LABEL } from "@/lib/nutrition/plan-display";
import { ChevronRight } from "lucide-react";
import { ProgressBar } from "@/components/ui/progress-bar";
import { MACRO_ACCENTS, macroRemainingCaption } from "@/lib/nutrition/view-model";
import { NUTRITION_NOT_ASSIGNED_LABEL } from "@/lib/calculations";
import type { MacroKey } from "@/lib/nutrition/view-model";

interface MacroTileProps {
  macroKey: MacroKey;
  label: string;
  consumed: number;
  /** Null = no nutrition assigned: no target, no progress, no remaining. */
  target: number | null;
  /** U3A — a plan is assigned but this macro isn't prescribed ("No target", not "not assigned"). */
  planAssigned?: boolean;
  onOpen: () => void;
}

/**
 * One of the three dedicated macro tiles (Visual Constitution §6.1 bento
 * composition) — never combined into one shared macro card. Each is its own
 * tappable surface that opens MacroDetailSheet for education + coach-curated
 * sources.
 */
export function MacroTile({ macroKey, label, consumed, target, planAssigned = false, onOpen }: MacroTileProps) {
  const percent = target !== null && target > 0 ? (consumed / target) * 100 : 0;
  const accent = MACRO_ACCENTS[macroKey];

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${label}: ${Math.round(consumed)}${target !== null ? ` of ${target}` : ""} grams logged. View ${label.toLowerCase()} details.`}
      className="flex min-h-[112px] flex-col items-start gap-2 rounded-[var(--radius-md)] bg-surface-raised p-3 text-left shadow-[var(--shadow-subtle)] transition-transform duration-150 active:scale-[0.98]"
    >
      <div className="flex w-full items-center justify-between">
        <span className="text-label text-neutral">{label}</span>
        <ChevronRight size={13} className="shrink-0 text-neutral" aria-hidden="true" />
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-heading text-off-white">{Math.round(consumed)}</span>
        <span className="text-meta text-neutral">{target !== null ? `/${target}g` : "g"}</span>
      </div>
      <ProgressBar percent={percent} color={accent} />
      <span className="text-meta text-neutral">{target !== null ? macroRemainingCaption(consumed, target) : planAssigned ? NO_TARGET_LABEL : NUTRITION_NOT_ASSIGNED_LABEL}</span>
    </button>
  );
}
