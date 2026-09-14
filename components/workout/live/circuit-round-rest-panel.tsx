"use client";

import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { IntervalTimer } from "@/components/workout/live/interval-timer";
import { ActivePainBanner } from "@/components/workout/live/active-pain-banner";
import { isTimedCircuit, totalCircuitRounds } from "@/lib/workout/circuit";
import type { Block } from "@/lib/training/types";

/**
 * Phase 11B — shown between rounds only, never between items within a
 * round (spec section 18's explicit distinction): "ROUND COMPLETE, Rest
 * 01:30" with a guidance-only countdown reused from Phase 11A's
 * IntervalTimer when block.restBetweenRoundsSeconds is set, otherwise a
 * plain "Round complete" with an immediate continue — never a forced
 * gate either way (the Continue button is always tappable).
 */
export function CircuitRoundRestPanel({
  block,
  round,
  restStartedAtIso,
  blockStartedAtIso,
  painReportActive = false,
}: {
  block: Block;
  round: number;
  restStartedAtIso?: string;
  /** Phase 11D — only meaningful (and only rendered) for a real
   * time-capped circuit (terminationMode "rounds_or_time_cap") — a pure
   * AMRAP never enters round-rest in the first place (see
   * lib/workout/circuit.ts's own nextCircuitPosition doc). */
  blockStartedAtIso?: string;
  painReportActive?: boolean;
}) {
  const { dispatch } = usePrototypeState();
  const rounds = totalCircuitRounds(block);
  const timed = isTimedCircuit(block);

  return (
    <div className="pc-panel-in rounded-[var(--radius-lg)] bg-charcoal p-5 text-center shadow-[var(--shadow-subtle)]">
      <ActivePainBanner active={painReportActive} />
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success-soft text-success">
        <CheckCircle2 size={22} />
      </span>
      <p className="mt-3 text-heading text-off-white">Round {round} complete</p>
      <p className="mt-1 text-meta text-neutral">
        Next: Round {round + 1} of {rounds}
      </p>

      {block.restBetweenRoundsSeconds !== undefined && restStartedAtIso ? (
        <div className="mt-4">
          <IntervalTimer phaseStartedAtIso={restStartedAtIso} durationSeconds={block.restBetweenRoundsSeconds} />
        </div>
      ) : null}

      <Button className="mt-4 w-full" size="lg" onClick={() => dispatch({ type: "ADVANCE_CIRCUIT_PHASE", blockId: block.id })}>
        Continue to Round {round + 1}
      </Button>

      {timed && blockStartedAtIso && block.timeCapSeconds !== undefined ? (
        <>
          <div className="mt-4">
            <IntervalTimer phaseStartedAtIso={blockStartedAtIso} durationSeconds={block.timeCapSeconds} />
          </div>
          <button
            type="button"
            onClick={() => dispatch({ type: "EXPIRE_TIMED_CIRCUIT", blockId: block.id })}
            className="mt-2 w-full text-center text-action text-neutral hover:text-off-white"
          >
            Time&apos;s up — finish circuit
          </button>
        </>
      ) : null}
    </div>
  );
}
