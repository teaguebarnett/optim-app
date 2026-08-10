"use client";

import { useState } from "react";
import { Plus, AlertTriangle, Wrench, HelpCircle, CheckCircle2 } from "lucide-react";
import { SetRow } from "@/components/workout/set-row";
import { Button } from "@/components/ui/button";
import { canCompleteExercise } from "@/lib/workout-analysis";
import type { Exercise, ExerciseLog, LoggedSet, RpeValue } from "@/lib/types";

interface Slot {
  absoluteSetNumber: number;
  displayNumber: number;
  targetRepsLow: number;
  targetRepsHigh: number;
  targetRpe: RpeValue;
  loggedSet?: LoggedSet;
}

function buildSlots(exercise: Exercise, log: ExerciseLog, extraCount: number): { warmup: Slot[]; working: Slot[] } {
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

  const warmup: Slot[] = warmupPrescribed.map((s, i) => ({
    absoluteSetNumber: s.setNumber,
    displayNumber: i + 1,
    targetRepsLow: s.targetRepsLow,
    targetRepsHigh: s.targetRepsHigh,
    targetRpe: s.targetRpe,
    loggedSet: loggedByNumber.get(s.setNumber),
  }));

  const working: Slot[] = workingPrescribed.map((s, i) => ({
    absoluteSetNumber: s.setNumber,
    displayNumber: i + 1,
    targetRepsLow: s.targetRepsLow,
    targetRepsHigh: s.targetRepsHigh,
    targetRpe: s.targetRpe,
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
          Tempo {exercise.tempo} · Rest {exercise.restSeconds}s
        </p>
      </div>

      {exercise.previousPerformance.length > 0 && (
        <div className="rounded-[var(--radius-sm)] bg-white/[0.04] px-3 py-2.5">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral">Previous performance</p>
          <p className="mt-0.5 text-sm text-off-white">
            {exercise.previousPerformance.map((p) => `${p.weightLb} lb × ${p.reps}`).join(", ")} at RPE{" "}
            {Math.min(...exercise.previousPerformance.map((p) => p.rpe))}–
            {Math.max(...exercise.previousPerformance.map((p) => p.rpe))}
          </p>
        </div>
      )}

      {isExerciseSkipped ? (
        <div className="rounded-[var(--radius-md)] border border-border-strong bg-white/[0.03] p-4 text-sm text-neutral">
          This exercise was skipped for today.
        </div>
      ) : (
        <>
          {warmup.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral">Warm-up</p>
              {warmup.map((slot) => (
                <SetRow
                  key={`w-${slot.absoluteSetNumber}`}
                  setNumber={slot.displayNumber}
                  isWarmup
                  targetRepsLow={slot.targetRepsLow}
                  targetRepsHigh={slot.targetRepsHigh}
                  targetRpe={slot.targetRpe}
                  loggedSet={slot.loggedSet}
                  onComplete={(w, r, rpe, note) => onLogSet(slot.absoluteSetNumber, true, w, r, rpe, note)}
                  onSkipRequested={() => onSkipSetRequested(slot.absoluteSetNumber, true)}
                />
              ))}
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-neutral">Working sets</p>
            {working.map((slot) => (
              <SetRow
                key={`s-${slot.absoluteSetNumber}`}
                setNumber={slot.displayNumber}
                isWarmup={false}
                targetRepsLow={slot.targetRepsLow}
                targetRepsHigh={slot.targetRepsHigh}
                targetRpe={slot.targetRpe}
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
