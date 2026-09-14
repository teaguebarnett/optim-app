"use client";

import { useState } from "react";
import { RefreshCw, AlertTriangle, Clock, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { describeCircuitOverview } from "@/lib/workout/circuit";
import { SkipReasonSheet } from "@/components/workout/skip-reason-sheet";
import { PainReportOverlay } from "@/components/workout/live/pain-report-overlay";
import { ActivePainBanner } from "@/components/workout/live/active-pain-banner";
import type { SkipReason } from "@/lib/types";
import type { Block } from "@/lib/training/types";

/**
 * Phase 11B — the circuit counterpart of IntervalReadyPanel: the block
 * overview (round count, each item's own name/target, round-rest
 * duration) before starting — a circuit is a BLOCK behavior, never a fake
 * exercise (spec section 3), so this reads from the whole Block, not one
 * item. "Need help?" offers the same two safety-relevant actions every
 * other ready panel does — reporting pain reuses the block's FIRST item as
 * the reported exercise (the most natural "what were you about to do"
 * answer before any item has actually started), and skipping the whole
 * activity dispatches SKIP_EXERCISE against the block's own id (see
 * lib/state.ts's circuit-aware SKIP_EXERCISE branch).
 */
export function CircuitReadyPanel({
  block,
  painReportActive = false,
}: {
  block: Block;
  painReportActive?: boolean;
}) {
  const { dispatch, activeContext } = usePrototypeState();
  const coachName = activeContext.primaryCoach?.displayName ?? "your coach";
  const [helpOpen, setHelpOpen] = useState(false);
  const [painOpen, setPainOpen] = useState(false);
  const [skipOpen, setSkipOpen] = useState(false);

  const overviewLines = describeCircuitOverview(block);
  const firstItem = block.items[0];

  function handleSkipConfirm(reason: SkipReason, note?: string) {
    dispatch({ type: "SKIP_EXERCISE", exerciseId: block.id, reason, note });
    setSkipOpen(false);
    setHelpOpen(false);
  }

  return (
    <div className="pc-panel-in rounded-[var(--radius-lg)] bg-charcoal p-5 shadow-[var(--shadow-subtle)]">
      <ActivePainBanner active={painReportActive} />
      <div className="flex items-start gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brass-soft text-brass-strong">
          <RefreshCw size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-label text-neutral">Next up</p>
          <p className="text-heading text-off-white">{block.name ?? "Circuit"}</p>
        </div>
      </div>

      {overviewLines.length > 0 ? (
        <div className="mt-3 space-y-1 text-meta text-neutral">
          {overviewLines.map((line, i) => (
            <p key={line} className={i === 0 ? "text-body text-off-white" : undefined}>
              {line}
            </p>
          ))}
        </div>
      ) : null}

      <Button className="mt-4 w-full" onClick={() => dispatch({ type: "BEGIN_CIRCUIT_EXECUTION", blockId: block.id })}>
        Begin Circuit
      </Button>

      <button
        type="button"
        onClick={() => setHelpOpen(true)}
        className="mt-3 flex w-full items-center justify-center gap-1.5 text-action text-neutral hover:text-off-white"
      >
        <HelpCircle size={14} />
        Need help?
      </button>

      <Sheet open={helpOpen} onClose={() => setHelpOpen(false)} title="Need help?" description="For this circuit.">
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setPainOpen(true)}
            className="flex w-full items-center gap-3 rounded-[var(--radius-md)] border border-border-strong px-4 py-3.5 text-left hover:border-accent/40"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-raised text-neutral">
              <AlertTriangle size={17} />
            </span>
            <span className="flex-1 text-subheading text-off-white">Report pain</span>
          </button>
          <button
            type="button"
            onClick={() => setSkipOpen(true)}
            className="flex w-full items-center gap-3 rounded-[var(--radius-md)] border border-border-strong px-4 py-3.5 text-left hover:border-accent/40"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-raised text-neutral">
              <Clock size={17} />
            </span>
            <span className="flex-1 text-subheading text-off-white">Skip this activity</span>
          </button>
        </div>
      </Sheet>

      <SkipReasonSheet
        open={skipOpen}
        onClose={() => setSkipOpen(false)}
        title="Skip this activity"
        description={`This circuit will be marked skipped and flagged for ${coachName}.`}
        onConfirm={handleSkipConfirm}
      />

      {firstItem ? (
        <PainReportOverlay
          open={painOpen}
          onClose={() => {
            setPainOpen(false);
            setHelpOpen(false);
          }}
          exerciseName={firstItem.name}
          coachName={coachName}
          onSubmit={(report) => {
            dispatch({ type: "REPORT_PAIN", exerciseId: firstItem.id, ...report });
            setPainOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
