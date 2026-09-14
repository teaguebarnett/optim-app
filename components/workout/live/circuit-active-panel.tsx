"use client";

import { CircuitItemPanel } from "@/components/workout/live/circuit-item-panel";
import { CircuitRoundRestPanel } from "@/components/workout/live/circuit-round-rest-panel";
import type { Block, TrainingItemInstance } from "@/lib/training/types";
import type { CircuitExecutionProgress } from "@/lib/types";

/**
 * Phase 11B — the one dispatcher between circuit-active's two real
 * sub-states (an item's own screen, or between-round rest) — mirrors how
 * "interval-active" alone covers both work and recovery. See
 * lib/types.ts's own "circuit-active" doc for why this is a single
 * top-level session phase rather than two.
 */
export function CircuitActivePanel({
  block,
  progress,
  painReportActive = false,
}: {
  block: Block;
  progress: CircuitExecutionProgress;
  painReportActive?: boolean;
}) {
  if (progress.phase === "round-rest") {
    return (
      <CircuitRoundRestPanel block={block} round={progress.round} restStartedAtIso={progress.restStartedAtIso} blockStartedAtIso={progress.blockStartedAtIso} painReportActive={painReportActive} />
    );
  }
  const currentItem: TrainingItemInstance | undefined = block.items[progress.itemIndex];
  if (!currentItem) return null;
  return (
    <CircuitItemPanel
      block={block}
      round={progress.round}
      itemIndex={progress.itemIndex}
      blockStartedAtIso={progress.blockStartedAtIso}
      painReportActive={painReportActive}
      currentSide={progress.currentSide}
    />
  );
}
