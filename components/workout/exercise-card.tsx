"use client";

import { useState } from "react";
import { Plus, AlertTriangle, Wrench, HelpCircle, CheckCircle2 } from "lucide-react";
import { SetRow } from "@/components/workout/set-row";
import { Button } from "@/components/ui/button";
import { canCompleteExercise } from "@/lib/workout-analysis";
import type { Exercise, ExerciseLog, LoggedSet, RpeValue } from "@/lib/types";

// Phase 3.1.1 §3 — replaces the old interruptive countdown popup with a
// simple, non-disruptive line pulled from this exercise's own prescribed
// rest interval. Never the same fixed value for every exercise — see
// exercise.restSeconds in lib/mock-data.ts. Falls back to a calm default
// only when no prescription exists at all.
function formatRestRecommendation(restSeconds?: number): string {
  if (!restSeconds || restSeconds <= 0) return "Rest as needed.";
  const totalMinutes = restSeconds / 60;
  const lowMin = Math.max(1, Math.floor(totalMinutes));
  const highMin = Math.max(lowMin, Math.ceil(totalMinutes));
  if (lowMin === highMin) return `Recommended rest: ${lowMin} minute${lowMin === 1 ? "" : "s"}.`;
  return `Recommended rest: ${lowMin}–${highMin} minutes.`;
}

interface Slot {
  absoluteSetNumber: number;
  displayNumber: number;
  targetRepsLow: number;
  targetRepsHigh: number;
  targetRpe: RpeValue;
  /** Present only for prescribed working sets — extra sets the client adds
   * themselves have no prescription, so SetRow falls back to full manual
   * entry for those. See Phase 3.1 §3. */
  prescribedWeightLb?: number;
  prescribedReps?: number;
  loggedSet?: LoggedSet;
}

interface WarmupGuidance {
  displayNumber: number;
  targetRepsLow: number;
  targetRepsHigh: number;
  prescribedWeightLb?: number;
}

function buildSlots(
  exercise: Exercise,
  log: ExerciseLog,
  extraCount: number
): { warmup: WarmupGuidance[]; working: Slot[] } {
  const loggedByNumber = new Map<number, LoggedSet>();
  for (const set of log.loggedSets) {
    loggedByNumber.set(set.setNumber, set);
  }

  const warmupPrescribed = exercise.prescribedSets.filter((s) => s.isWarmup);
  const workingPrescribed = exercise.prescribedSets.filter((s) => !s.isWarmup);
  const maxPrescribedNumber = Math.max(0, ...exercise.prescribedSets.map((s) => s.setNumber));

  const extraLogged = log.loggedSets
    .filter((s) => !s.isWarmup && s.setNumber > maxPrescribedNumber)
    .sort((a, b) => a.setNumber - b.setNumber);

  const warmup: WarmupGuidance[] = warmupPrescribed.map((s, i) => ({
    displayNumber: i + 1,
    targetRepsLow: s.targetRepsLow,
    targetRepsHigh: s.targetRepsHigh,
    prescribedWeightLb: s.prescribedWeightLb,
  }));

  const working: Slot[] = workingPrescribed.map((s, i) => ({
    absoluteSetNumber: s.setNumber,
    displayNumber: i + 1,
    targetRepsLow: s.targetRepsLow,
    targetRepsHigh: s.targetRepsHigh,
    targetRpe: s.targetRpe,
    prescribedWeightLb: s.prescribedWeightLb,
    prescribedReps: s.prescribedReps,
    loggedSet: loggedByNumber.get(s.setNumber),
  }));

  extraLogged.forEach((set, i) => {
    working.push({
      absoluteSetNumber: set.setNumber,
      displayNumber: workingPrescribed.length + i + 1,
      targetRepsLow: exercise.targetRepsLow,
      targetRepsHigh: exercise.targetRepsHigh,
      targetRpe: exercise.targetRpe,
      loggedSet: set,
    });
  });

  const nextAbsolute = Math.max(maxPrescribedNumber, ...extraLogged.map((s) => s.setNumber), 0) + 1;
  for (let i = 0; i < extraCount; i++) {
    working.push({
      absoluteSetNumber: nextAbsolute + i,
      displayNumber: working.length + 1,
      targetRepsLow: exercise.targetRepsLow,
      targetRepsHigh: exercise.targetRepsHigh,
      targetRpe: exercise.targetRpe,
    });
  }

  return { warmup, working };
}

interface ExerciseCardProps {
  exercise: Exercise;
  log: ExerciseLog;
  onLogSet: (setNumber: number, isWarmup: boolean, weightLb: number, reps: number, rpe: RpeValue, note?: string) => void;
  onSkipSetRequested: (setNumber: number, isWarmup: boolean) => void;
  onCompleteExercise: () => void;
  onSkipExerciseRequested: () => void;
  onReportPain: () => void;
  onReportEquipment: () => void;
  onAskTechnique: () => void;
}

export function ExerciseCard({
  exercise,
  log,
  onLogSet,
  onSkipSetRequested,
  onCompleteExercise,
  onSkipExerciseRequested,
  onReportPain,
  onReportEquipment,
  onAskTechnique,
}: ExerciseCardProps) {
  const [extraCount, setExtraCount] = useState(0);
  const { warmup, working } = buildSlots(exercise, log, extraCount);

  const isExerciseComplete = log.status === "completed";
  const isExerciseSkipped = log.status === "skipped";
  const canComplete = canCompleteExercise(exercise, log);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-off-white">{exercise.name}</h2>
        <p className="mt-1 text-sm text-neutral">{exercise.cue}</p>
        <p className="mt-1 text-xs text-neutral">
          Tempo {exercise.tempo} · {formatRestRecommendation(exercise.restSeconds)}
        </p>
      </div>

      {exercise.previousPerformance.length > 0 && (
        <div className="rounded-[var(--radius-sm)] bg-off-white/[0.04] px-3 py-2.5">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral">Previous performance</p>
          <p className="mt-0.5 text-sm text-off-white">
            {exercise.previousPerformance.map((p) => `${p.weightLb} lb × ${p.reps}`).join(", ")} at RPE{" "}
            {Math.min(...exercise.previousPerformance.map((p) => p.rpe))}–
            {Math.max(...exercise.previousPerformance.map((p) => p.rpe))}
          </p>
        </div>
      )}

      {isExerciseSkipped ? (
        <div className="rounded-[var(--radius-md)] border border-border-strong bg-off-white/[0.03] p-4 text-sm text-neutral">
          This exercise was skipped for today.
        </div>
      ) : (
        <>
          {warmup.length > 0 && (
            <div className="rounded-[var(--radius-md)] border border-border-strong bg-off-white/[0.02] p-3.5">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral">Warm-up · guidance only</p>
              <div className="mt-1.5 space-y-1">
                {warmup.map((slot) => (
                  <p key={`w-${slot.displayNumber}`} className="text-sm text-neutral">
                    Set {slot.displayNumber} — {slot.targetRepsLow}–{slot.targetRepsHigh} reps
                    {slot.prescribedWeightLb ? `, about ${slot.prescribedWeightLb} lb` : ""}
                  </p>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-neutral">Working sets</p>
            {working.map((slot) => (
              // Phase 3.1.1 §4 — the key includes the exercise id so React
              // remounts (and therefore blanks) each SetRow's local RPE/
              // weight/reps state when advancing to a different exercise,
              // instead of silently reusing a same-numbered set's leftover
              // selection from the exercise just left.
              <SetRow
                key={`${exercise.id}-s-${slot.absoluteSetNumber}`}
                setNumber={slot.displayNumber}
                targetRepsLow={slot.targetRepsLow}
                targetRepsHigh={slot.targetRepsHigh}
                targetRpe={slot.targetRpe}
                prescribedWeightLb={slot.prescribedWeightLb}
                prescribedReps={slot.prescribedReps}
                loggedSet={slot.loggedSet}
                onComplete={(w, r, rpe, note) => onLogSet(slot.absoluteSetNumber, false, w, r, rpe, note)}
                onSkipRequested={() => onSkipSetRequested(slot.absoluteSetNumber, false)}
                onRemoveExtra={
                  !slot.loggedSet && slot.displayNumber > exercise.workingSets
                    ? () => setExtraCount((c) => Math.max(0, c - 1))
                    : undefined
                }
              />
            ))}
            <button
              type="button"
              onClick={() => setExtraCount((c) => c + 1)}
              className="flex w-full items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border border-dashed border-border-strong py-2.5 text-sm font-medium text-neutral hover:border-accent/40 hover:text-off-white"
            >
              <Plus size={15} />
              Add an additional set
            </button>
          </div>
        </>
      )}

      <div className="grid grid-cols-2 gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={onReportPain}>
          <AlertTriangle size={14} />
          Report pain
        </Button>
        <Button variant="outline" size="sm" onClick={onReportEquipment}>
          <Wrench size={14} />
          Equipment unavailable
        </Button>
        <Button variant="outline" size="sm" onClick={onAskTechnique}>
          <HelpCircle size={14} />
          Technique question
        </Button>
        <Button variant="outline" size="sm" onClick={onSkipExerciseRequested} disabled={isExerciseSkipped}>
          Skip exercise
        </Button>
      </div>

      <Button
        className="w-full"
        onClick={onCompleteExercise}
        disabled={isExerciseComplete || isExerciseSkipped || !canComplete}
      >
        <CheckCircle2 size={16} />
        {isExerciseComplete ? "Exercise completed" : "Mark exercise complete"}
      </Button>
      {!isExerciseComplete && !isExerciseSkipped && !canComplete ? (
        <p className="-mt-2 text-center text-xs text-neutral">
          Log a valid RPE for every working set, or skip it, to complete this exercise.
        </p>
      ) : null}
    </div>
  );
}
