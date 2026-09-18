"use client";

import { useState } from "react";
import { AlertTriangle, Clock, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { ActivePainBanner } from "@/components/workout/live/active-pain-banner";
import { describePowerSetTarget, powerCaptureFields, totalPowerSets } from "@/lib/workout/power";
import { formatIntervalSeconds } from "@/lib/workout/interval";
import { SkipReasonSheet } from "@/components/workout/skip-reason-sheet";
import { PainReportOverlay } from "@/components/workout/live/pain-report-overlay";
import type { SkipReason } from "@/lib/types";
import type { Prescription, TrainingItemInstance } from "@/lib/training/types";

/**
 * Phase 11C — the live "Set N of M" screen for a power/plyometric item
 * (spec section 8's own worked example). A one-tap "Completed as
 * prescribed" fast path, or "Performed differently" revealing ONLY the
 * fields the item's own prescription actually specifies (reps, contacts,
 * or distance — never converted between them, spec section 6). Between-set
 * rest is a brief advisory caption only — no dedicated screen/timer,
 * matching this codebase's own established between-set rest philosophy
 * (see lib/workout/rest-policy.ts / lib/workout/circuit.ts's own doc).
 * "Skip this set" preserves the rest of the item (spec section 9); "Skip
 * this activity" (in Need help?) reuses the structured whole-item skip.
 */
export function PowerSetPanel({
  item,
  currentSet,
  painReportActive = false,
}: {
  item: TrainingItemInstance;
  currentSet: number;
  painReportActive?: boolean;
}) {
  const { dispatch, activeContext } = usePrototypeState();
  const coachName = activeContext.primaryCoach?.displayName ?? "your coach";
  const [helpOpen, setHelpOpen] = useState(false);
  const [painOpen, setPainOpen] = useState(false);
  const [skipActivityOpen, setSkipActivityOpen] = useState(false);
  const [skipSetOpen, setSkipSetOpen] = useState(false);
  const [deviated, setDeviated] = useState(false);
  const [repsActual, setRepsActual] = useState<number | undefined>(undefined);
  const [contactsActual, setContactsActual] = useState<number | undefined>(undefined);
  const [distanceActual, setDistanceActual] = useState<number | undefined>(undefined);

  const totalSets = totalPowerSets(item.prescription);
  const capture = powerCaptureFields(item.prescription);
  const target = describePowerSetTarget(item.prescription);

  function buildActual(): Partial<Prescription> | undefined {
    if (!deviated) return undefined;
    const actual: Partial<Prescription> = {};
    if (capture.reps) actual.reps = { low: repsActual ?? item.prescription.reps!.low, high: repsActual ?? item.prescription.reps!.high };
    if (capture.contacts) actual.contacts = contactsActual ?? item.prescription.contacts;
    if (capture.distance && item.prescription.distance) actual.distance = { value: distanceActual ?? item.prescription.distance.value, unit: item.prescription.distance.unit };
    return actual;
  }

  function resetCaptureState() {
    setDeviated(false);
    setRepsActual(undefined);
    setContactsActual(undefined);
    setDistanceActual(undefined);
  }

  function handleComplete() {
    dispatch({ type: "ADVANCE_POWER_SET", exerciseId: item.id, actual: buildActual() });
    resetCaptureState();
  }

  function handleSkipSet(reason: SkipReason) {
    dispatch({ type: "ADVANCE_POWER_SET", exerciseId: item.id, skipped: true, skipReason: reason });
    resetCaptureState();
    setSkipSetOpen(false);
  }

  function handleSkipActivity(reason: SkipReason, note?: string) {
    dispatch({ type: "SKIP_EXERCISE", exerciseId: item.id, reason, note });
    setSkipActivityOpen(false);
    setHelpOpen(false);
  }

  return (
    <div className="pc-panel-in rounded-[var(--radius-lg)] bg-charcoal p-5 shadow-[var(--shadow-subtle)]">
      <ActivePainBanner active={painReportActive} />
      <div className="flex items-center justify-between">
        <p className="text-label text-neutral">
          Set {currentSet} of {totalSets}
        </p>
      </div>

      <p className="mt-2 text-heading text-off-white">{item.name}</p>
      {item.coachCue ? <p className="mt-1 text-body text-off-white">{item.coachCue}</p> : null}
      <p className="mt-1 text-meta text-neutral">{target}</p>

      <div className="mt-4 rounded-[var(--radius-md)] bg-off-white/[0.04] p-4">
        {!deviated ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-meta text-neutral">Completed as prescribed</p>
              <p className="mt-0.5 text-subheading text-off-white">{target}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setDeviated(true)}>
              Performed differently
            </Button>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between">
              <p className="text-meta text-neutral">What you actually did</p>
              <button type="button" onClick={() => setDeviated(false)} className="text-action text-accent-fg hover:underline">
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
              {capture.contacts ? (
                <label className="block">
                  <span className="mb-1 block text-label text-neutral">Contacts</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    className="w-full rounded-[var(--radius-sm)] border border-border-strong bg-transparent px-3 py-2.5 text-body text-off-white"
                    value={contactsActual ?? item.prescription.contacts ?? ""}
                    onChange={(e) => setContactsActual(e.target.value ? Number(e.target.value) : undefined)}
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

      <Button className="mt-4 w-full" size="lg" onClick={handleComplete}>
        Complete
      </Button>

      <button type="button" onClick={() => setSkipSetOpen(true)} className="mt-2 w-full text-center text-action text-neutral hover:text-off-white">
        Skip this set
      </button>

      <SkipReasonSheet
        open={skipSetOpen}
        onClose={() => setSkipSetOpen(false)}
        title="Skip this set"
        description={`Set ${currentSet} of ${item.name} will be marked skipped — the rest of the item continues.`}
        onConfirm={handleSkipSet}
      />

      {item.prescription.restSeconds !== undefined ? (
        <p className="mt-3 text-center text-meta text-neutral">{formatIntervalSeconds(item.prescription.restSeconds)} rest</p>
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
        description={`${item.name} will be marked skipped and flagged for ${coachName}. Sets already completed will still be recorded.`}
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
