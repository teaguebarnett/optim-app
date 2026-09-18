"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { RpeWheel } from "@/components/workout/live/rpe-wheel";
import { ActivePainBanner } from "@/components/workout/live/active-pain-banner";
import { continuousCaptureFields, describeContinuousTarget } from "@/lib/workout/continuous";
import type { RpeValue } from "@/lib/types";
import type { Prescription, TrainingItemInstance } from "@/lib/training/types";

/**
 * Phase 4 — the continuous-work counterpart of SetLoggingPanel: a single
 * "Completed as prescribed" fast path (default, matching the resistance
 * flow's own low-friction convention), or "Performed differently" revealing
 * ONLY the fields the prescription actually specifies (spec section 8 —
 * never a fixed post-workout survey). One submission resolves the whole
 * item; there is no per-set iteration for continuous work.
 */
export function ContinuousLoggingPanel({
  item,
  painReportActive = false,
}: {
  item: TrainingItemInstance;
  painReportActive?: boolean;
}) {
  const { dispatch } = usePrototypeState();
  const [deviated, setDeviated] = useState(false);
  const [note, setNote] = useState("");
  const [rpe, setRpe] = useState<RpeValue | null>(null);

  const prescription = item.prescription;
  const capture = continuousCaptureFields(prescription);
  const targetLines = describeContinuousTarget(prescription);

  const prescribedDurationMin = prescription.duration ? Math.round(prescription.duration.seconds / 60) : undefined;
  const prescribedDistanceValue = prescription.distance?.value;

  const [actualDurationMin, setActualDurationMin] = useState(prescribedDurationMin ?? 0);
  const [actualDistanceValue, setActualDistanceValue] = useState(prescribedDistanceValue ?? 0);
  const [actualHeartRateAvg, setActualHeartRateAvg] = useState<number | undefined>(undefined);

  // RPE is the one field that, when the prescription specifies it, is
  // required either way (mirrors SetLoggingPanel requiring an RPE
  // selection) — everything else defaults honestly to the prescribed target
  // on the fast path.
  const rpeSatisfied = !capture.rpe || rpe !== null;

  function buildActual(): Partial<Prescription> {
    const actual: Partial<Prescription> = { family: prescription.family };
    if (capture.duration) actual.duration = { seconds: (deviated ? actualDurationMin : prescribedDurationMin ?? actualDurationMin) * 60 };
    if (capture.distance && prescription.distance) {
      actual.distance = { value: deviated ? actualDistanceValue : prescribedDistanceValue ?? actualDistanceValue, unit: prescription.distance.unit };
    }
    if (capture.heartRate && (deviated ? actualHeartRateAvg !== undefined : true) && prescription.heartRate) {
      const low = deviated && actualHeartRateAvg !== undefined ? actualHeartRateAvg : prescription.heartRate.low;
      const high = deviated && actualHeartRateAvg !== undefined ? actualHeartRateAvg : prescription.heartRate.high;
      actual.heartRate = { low, high };
    }
    if (capture.rpe && rpe !== null) actual.rpe = rpe;
    return actual;
  }

  function handleSubmit() {
    if (!rpeSatisfied) return;
    dispatch({
      type: "LOG_CONTINUOUS_EXECUTION",
      exerciseId: item.id,
      actual: buildActual(),
      note: deviated && note.trim() ? note.trim() : undefined,
      deviationReason: undefined,
    });
  }

  return (
    <div className="pc-panel-in rounded-[var(--radius-lg)] bg-charcoal p-5 shadow-[var(--shadow-subtle)]">
      <ActivePainBanner active={painReportActive} />
      <p className="text-label text-neutral">{item.name}</p>
      <p className="text-heading text-off-white">Log this session</p>
      {targetLines.length > 0 ? <p className="mt-1 text-meta text-neutral">Target: {targetLines.join(" · ")}</p> : null}

      <div className="mt-4 rounded-[var(--radius-md)] bg-off-white/[0.04] p-4">
        {!deviated ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-meta text-neutral">Completed as prescribed</p>
              <p className="mt-0.5 text-subheading text-off-white">{targetLines.join(" · ") || "Done"}</p>
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
              {capture.duration ? (
                <label className="block">
                  <span className="mb-1 block text-label text-neutral">Duration (minutes)</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    className="w-full rounded-[var(--radius-sm)] border border-border-strong bg-transparent px-3 py-2.5 text-body text-off-white"
                    value={actualDurationMin}
                    onChange={(e) => setActualDurationMin(Math.max(0, Number(e.target.value)))}
                  />
                </label>
              ) : null}
              {capture.distance && prescription.distance ? (
                <label className="block">
                  <span className="mb-1 block text-label text-neutral">Distance ({prescription.distance.unit})</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    min={0}
                    className="w-full rounded-[var(--radius-sm)] border border-border-strong bg-transparent px-3 py-2.5 text-body text-off-white"
                    value={actualDistanceValue}
                    onChange={(e) => setActualDistanceValue(Math.max(0, Number(e.target.value)))}
                  />
                </label>
              ) : null}
              {capture.heartRate ? (
                <label className="block">
                  <span className="mb-1 block text-label text-neutral">Average heart rate (BPM, optional)</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    className="w-full rounded-[var(--radius-sm)] border border-border-strong bg-transparent px-3 py-2.5 text-body text-off-white"
                    value={actualHeartRateAvg ?? ""}
                    onChange={(e) => setActualHeartRateAvg(e.target.value ? Number(e.target.value) : undefined)}
                  />
                </label>
              ) : null}
              <label className="block">
                <span className="mb-1 block text-label text-neutral">What was different? (optional)</span>
                <textarea
                  className="w-full rounded-[var(--radius-sm)] border border-border-strong bg-transparent px-3 py-2.5 text-body text-off-white"
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Felt harder than expected, ran out of time, schedule..."
                />
              </label>
            </div>
          </div>
        )}
      </div>

      {capture.rpe ? (
        <div className="mt-4">
          <RpeWheel key={item.id} id={`continuous-rpe-${item.id}`} onChange={setRpe} />
        </div>
      ) : null}

      <Button className="mt-4 w-full" size="lg" disabled={!rpeSatisfied} onClick={handleSubmit}>
        Complete
      </Button>
    </div>
  );
}
