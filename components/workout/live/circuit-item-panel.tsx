"use client";

import { useState } from "react";
import { AlertTriangle, Clock, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { RpeWheel } from "@/components/workout/live/rpe-wheel";
import { ActivePainBanner } from "@/components/workout/live/active-pain-banner";
import { circuitCaptureFields, describeCircuitItemTarget, hasRichCircuitCapture, totalCircuitRounds } from "@/lib/workout/circuit";
import { formatIntervalSeconds } from "@/lib/workout/interval";
import { SkipReasonSheet } from "@/components/workout/skip-reason-sheet";
import { PainReportOverlay } from "@/components/workout/live/pain-report-overlay";
import type { RpeValue, SkipReason } from "@/lib/types";
import type { Block, Prescription } from "@/lib/training/types";

/**
 * Phase 11B — the live "round X of Y, item N of M" screen (spec section 6's
 * own worked example). A one-tap "Completed as prescribed" fast path
 * (default, matching ContinuousLoggingPanel's own low-friction convention),
 * or "Performed differently" revealing ONLY the fields the item's own
 * prescription actually specifies — never a fixed form, and never the full
 * multi-set resistance flow (spec section 10). Shows the between-ITEM rest
 * as a brief advisory caption only — no dedicated screen/timer (see
 * lib/workout/circuit.ts's own module doc for why).
 */
export function CircuitItemPanel({
  block,
  round,
  itemIndex,
  painReportActive = false,
}: {
  block: Block;
  round: number;
  itemIndex: number;
  painReportActive?: boolean;
}) {
  const { dispatch, activeContext } = usePrototypeState();
  const coachName = activeContext.primaryCoach?.displayName ?? "your coach";
  const [helpOpen, setHelpOpen] = useState(false);
  const [painOpen, setPainOpen] = useState(false);
  const [skipActivityOpen, setSkipActivityOpen] = useState(false);
  const [skipItemOpen, setSkipItemOpen] = useState(false);
  const [deviated, setDeviated] = useState(false);
  const [rpe, setRpe] = useState<RpeValue | null>(null);
  const [repsActual, setRepsActual] = useState<number | undefined>(undefined);
  const [loadActual, setLoadActual] = useState<number | undefined>(undefined);
  const [durationActual, setDurationActual] = useState<number | undefined>(undefined);
  const [distanceActual, setDistanceActual] = useState<number | undefined>(undefined);

  const item = block.items[itemIndex];
  const nextItem = block.items[itemIndex + 1];
  const rounds = totalCircuitRounds(block);
  const rich = hasRichCircuitCapture(item.prescription);
  const capture = circuitCaptureFields(item.prescription);
  const rpeSatisfied = !capture.rpe || rpe !== null || !rich;

  function buildActual(): Partial<Prescription> | undefined {
    if (!rich) return undefined;
    const actual: Partial<Prescription> = {};
    if (capture.reps) actual.reps = { low: deviated && repsActual !== undefined ? repsActual : item.prescription.reps!.low, high: deviated && repsActual !== undefined ? repsActual : item.prescription.reps!.high };
    if (capture.load && item.prescription.load) actual.load = { value: deviated && loadActual !== undefined ? loadActual : item.prescription.load.value, unit: item.prescription.load.unit };
    if (capture.duration && item.prescription.duration) actual.duration = { seconds: deviated && durationActual !== undefined ? durationActual : item.prescription.duration.seconds };
    if (capture.distance && item.prescription.distance) actual.distance = { value: deviated && distanceActual !== undefined ? distanceActual : item.prescription.distance.value, unit: item.prescription.distance.unit };
    if (capture.rpe && rpe !== null) actual.rpe = rpe;
    return actual;
  }

  function resetCaptureState() {
    setDeviated(false);
    setRpe(null);
    setRepsActual(undefined);
    setLoadActual(undefined);
    setDurationActual(undefined);
    setDistanceActual(undefined);
  }

  function handleComplete() {
    if (!rpeSatisfied) return;
    dispatch({ type: "ADVANCE_CIRCUIT_PHASE", blockId: block.id, actual: buildActual() });
    resetCaptureState();
  }

  function handleSkipItem(reason: SkipReason) {
    // Note is deliberately not persisted on a per-item skip — ExecutionRecord's
    // own top-level `note` field describes the whole item's outcome, not one
    // round's, and CircuitRoundActual has no note field of its own (spec
    // section 38's minimal-logging-burden discipline).
    dispatch({ type: "ADVANCE_CIRCUIT_PHASE", blockId: block.id, skipped: true, skipReason: reason });
    resetCaptureState();
    setSkipItemOpen(false);
  }

  function handleSkipActivity(reason: SkipReason, note?: string) {
    dispatch({ type: "SKIP_EXERCISE", exerciseId: block.id, reason, note });
    setSkipActivityOpen(false);
    setHelpOpen(false);
  }

  return (
    <div className="pc-panel-in rounded-[var(--radius-lg)] bg-charcoal p-5 shadow-[var(--shadow-subtle)]">
      <ActivePainBanner active={painReportActive} />
      <div className="flex items-center justify-between">
        <p className="text-label text-neutral">{block.name ?? "Circuit"}</p>
        <p className="text-label text-neutral">
          Round {round} of {rounds} · Exercise {itemIndex + 1} of {block.items.length}
        </p>
      </div>

      <p className="mt-2 text-heading text-off-white">{item.name}</p>
      {item.coachCue ? <p className="mt-1 text-body text-off-white">{item.coachCue}</p> : null}
      <p className="mt-1 text-meta text-neutral">{describeCircuitItemTarget(item)}</p>

      {rich ? (
        <div className="mt-4 rounded-[var(--radius-md)] bg-off-white/[0.04] p-4">
          {!deviated ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-meta text-neutral">Completed as prescribed</p>
                <p className="mt-0.5 text-subheading text-off-white">{describeCircuitItemTarget(item)}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setDeviated(true)}>
                Performed differently
              </Button>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between">
                <p className="text-meta text-neutral">What you actually did</p>
                <button type="button" onClick={() => setDeviated(false)} className="text-action text-accent-strong hover:underline">
                  Use prescribed
                </button>
              </div>
              <div className="mt-3 space-y-3">
                {capture.reps ? (
                  <label className="block">
                    <span className="mb-1 block text-label text-neutral">Reps</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      className="w-full rounded-[var(--radius-sm)] border border-border-strong bg-transparent px-3 py-2.5 text-body text-off-white"
                      value={repsActual ?? item.prescription.reps?.low ?? ""}
                      onChange={(e) => setRepsActual(e.target.value ? Number(e.target.value) : undefined)}
                    />
                  </label>
                ) : null}
                {capture.load ? (
                  <label className="block">
                    <span className="mb-1 block text-label text-neutral">Load ({item.prescription.load?.unit})</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      className="w-full rounded-[var(--radius-sm)] border border-border-strong bg-transparent px-3 py-2.5 text-body text-off-white"
                      value={loadActual ?? item.prescription.load?.value ?? ""}
                      onChange={(e) => setLoadActual(e.target.value ? Number(e.target.value) : undefined)}
                    />
                  </label>
                ) : null}
                {capture.duration ? (
                  <label className="block">
                    <span className="mb-1 block text-label text-neutral">Duration (seconds)</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      className="w-full rounded-[var(--radius-sm)] border border-border-strong bg-transparent px-3 py-2.5 text-body text-off-white"
                      value={durationActual ?? item.prescription.duration?.seconds ?? ""}
                      onChange={(e) => setDurationActual(e.target.value ? Number(e.target.value) : undefined)}
                    />
                  </label>
                ) : null}
                {capture.distance ? (
                  <label className="block">
                    <span className="mb-1 block text-label text-neutral">Distance ({item.prescription.distance?.unit})</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      className="w-full rounded-[var(--radius-sm)] border border-border-strong bg-transparent px-3 py-2.5 text-body text-off-white"
                      value={distanceActual ?? item.prescription.distance?.value ?? ""}
                      onChange={(e) => setDistanceActual(e.target.value ? Number(e.target.value) : undefined)}
                    />
                  </label>
                ) : null}
              </div>
            </div>
          )}
        </div>
      ) : null}

      {rich && capture.rpe ? (
        <div className="mt-4">
          <RpeWheel key={`${item.id}-${round}`} id={`circuit-rpe-${item.id}-${round}`} onChange={setRpe} />
        </div>
      ) : null}

      <Button className="mt-4 w-full" size="lg" disabled={!rpeSatisfied} onClick={handleComplete}>
        Complete
      </Button>

      <button type="button" onClick={() => setSkipItemOpen(true)} className="mt-2 w-full text-center text-action text-neutral hover:text-off-white">
        Skip this exercise
      </button>

      <SkipReasonSheet
        open={skipItemOpen}
        onClose={() => setSkipItemOpen(false)}
        title="Skip this exercise"
        description={`${item.name} (round ${round}) will be marked skipped — the rest of the circuit continues.`}
        onConfirm={(reason) => handleSkipItem(reason)}
      />

      {nextItem ? (
        <p className="mt-3 text-center text-meta text-neutral">
          Then: {nextItem.name}
          {block.restBetweenItemsSeconds !== undefined ? ` (${formatIntervalSeconds(block.restBetweenItemsSeconds)} rest)` : ""}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => setHelpOpen(true)}
        className="mt-3 flex w-full items-center justify-center gap-1.5 text-action text-neutral hover:text-off-white"
      >
        <HelpCircle size={14} />
        Need help?
      </button>

      <Sheet open={helpOpen} onClose={() => setHelpOpen(false)} title="Need help?" description={`For ${item.name}.`}>
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
            onClick={() => setSkipActivityOpen(true)}
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
        open={skipActivityOpen}
        onClose={() => setSkipActivityOpen(false)}
        title="Skip this activity"
        description={`This circuit will be marked skipped and flagged for ${coachName}. Rounds already completed will still be recorded.`}
        onConfirm={handleSkipActivity}
      />

      <PainReportOverlay
        open={painOpen}
        onClose={() => {
          setPainOpen(false);
          setHelpOpen(false);
        }}
        exerciseName={item.name}
        coachName={coachName}
        onSubmit={(report) => {
          dispatch({ type: "REPORT_PAIN", exerciseId: item.id, ...report });
          setPainOpen(false);
        }}
      />
    </div>
  );
}
