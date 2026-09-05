"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { RpeWheel } from "@/components/workout/live/rpe-wheel";
import { WheelColumn, WheelFrame } from "@/components/workout/live/wheel-column";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { prescribedWorkingSet, workingSetDisplayIndex } from "@/components/workout/live/helpers";
import { ActivePainBanner } from "@/components/workout/live/active-pain-banner";
import type { Exercise, RpeValue } from "@/lib/types";

const WEIGHT_STEP_LB = 2.5;
const WEIGHT_SPAN_LB = 50;
const REPS_SPAN = 10;

function buildWeightValues(centerLb: number): number[] {
  const start = Math.max(0, Math.round((centerLb - WEIGHT_SPAN_LB) / WEIGHT_STEP_LB) * WEIGHT_STEP_LB);
  const end = centerLb + WEIGHT_SPAN_LB;
  const values: number[] = [];
  for (let v = start; v <= end; v += WEIGHT_STEP_LB) values.push(v);
  return values;
}

function buildRepsValues(centerReps: number): number[] {
  const start = Math.max(1, centerReps - REPS_SPAN);
  const end = centerReps + REPS_SPAN;
  const values: number[] = [];
  for (let v = start; v <= end; v += 1) values.push(v);
  return values;
}

/**
 * Phase 4.4B-2 §F — after "Complete set," this is the set-logging state:
 * default to performed-as-prescribed (no blank weight/reps fields), an
 * explicit "Performed differently" exception path using wheel-style
 * adjusters (same family as the training-time picker), and the required
 * RPE wheel. Submitting writes the exact same LOG_SET action — and
 * therefore the exact same canonical performance/RPE state — persistence,
 * history, review, and completion already read.
 */
export function SetLoggingPanel({
  exercise,
  setNumber,
  painReportActive = false,
}: {
  exercise: Exercise;
  setNumber: number;
  painReportActive?: boolean;
}) {
  const { dispatch } = usePrototypeState();
  const [deviated, setDeviated] = useState(false);
  const [rpe, setRpe] = useState<RpeValue | null>(null);

  const prescribed = prescribedWorkingSet(exercise, setNumber);
  const displayIndex = workingSetDisplayIndex(exercise, setNumber);
  const fallbackWeight = prescribed?.prescribedWeightLb ?? 0;
  const fallbackReps = prescribed?.prescribedReps ?? exercise.targetRepsLow;

  const weightValues = useMemo(() => buildWeightValues(fallbackWeight), [fallbackWeight]);
  const repsValues = useMemo(() => buildRepsValues(fallbackReps), [fallbackReps]);
  const [actualWeight, setActualWeight] = useState(fallbackWeight);
  const [actualReps, setActualReps] = useState(fallbackReps);

  function handleSubmit() {
    if (rpe === null) return;
    dispatch({
      type: "LOG_SET",
      exerciseId: exercise.id,
      setNumber,
      isWarmup: false,
      weightLb: deviated ? actualWeight : fallbackWeight,
      reps: deviated ? actualReps : fallbackReps,
      rpe,
      performedAsPrescribed: !deviated,
    });
  }

  return (
    <div className="pc-panel-in rounded-[var(--radius-lg)] bg-charcoal p-5 shadow-[var(--shadow-subtle)]">
      <ActivePainBanner active={painReportActive} />
      <p className="text-label text-neutral">{exercise.name}</p>
      <p className="text-heading text-off-white">Set {displayIndex + 1}</p>

      <div className="mt-4 rounded-[var(--radius-md)] bg-off-white/[0.04] p-4">
        {!deviated ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-meta text-neutral">Performed as prescribed</p>
              <p className="mt-0.5 text-subheading text-off-white">
                {fallbackWeight} lb × {fallbackReps}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setDeviated(true)}>
              Performed differently
            </Button>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between">
              <p className="text-meta text-neutral">Actual weight &amp; reps</p>
              <button
                type="button"
                onClick={() => {
                  setDeviated(false);
                  setActualWeight(fallbackWeight);
                  setActualReps(fallbackReps);
                }}
                className="text-action text-accent-strong hover:underline"
              >
                Use prescribed
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <span className="mb-1.5 block text-label text-neutral">Weight (lb)</span>
                <WheelFrame>
                  <WheelColumn
                    ariaLabel="Actual weight in pounds"
                    values={weightValues.map(String)}
                    index={Math.max(0, weightValues.indexOf(actualWeight))}
                    onChange={(i) => setActualWeight(weightValues[i])}
                  />
                </WheelFrame>
              </div>
              <div>
                <span className="mb-1.5 block text-label text-neutral">Reps</span>
                <WheelFrame>
                  <WheelColumn
                    ariaLabel="Actual reps"
                    values={repsValues.map(String)}
                    index={Math.max(0, repsValues.indexOf(actualReps))}
                    onChange={(i) => setActualReps(repsValues[i])}
                  />
                </WheelFrame>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4">
        <RpeWheel key={`${exercise.id}-${setNumber}`} id={`rpe-${exercise.id}-${setNumber}`} onChange={setRpe} />
      </div>

      <Button className="mt-4 w-full" size="lg" disabled={rpe === null} onClick={handleSubmit}>
        Log set
      </Button>
    </div>
  );
}
