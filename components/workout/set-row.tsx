"use client";

import { useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { RpeSelector } from "@/components/workout/rpe-selector";
import { Button } from "@/components/ui/button";
import { SKIP_REASON_LABELS } from "@/components/ui/reason-picker";
import { cn } from "@/lib/cn";
import type { LoggedSet, RpeValue } from "@/lib/types";

interface SetRowProps {
  setNumber: number;
  isWarmup: boolean;
  targetRepsLow: number;
  targetRepsHigh: number;
  targetRpe: RpeValue;
  loggedSet?: LoggedSet;
  onComplete: (weightLb: number, reps: number, rpe: RpeValue, note?: string) => void;
  onSkipRequested: () => void;
  onRemoveExtra?: () => void;
}

export function SetRow({
  setNumber,
  isWarmup,
  targetRepsLow,
  targetRepsHigh,
  targetRpe,
  loggedSet,
  onComplete,
  onSkipRequested,
  onRemoveExtra,
}: SetRowProps) {
  const [editing, setEditing] = useState(false);
  const [weight, setWeight] = useState<string>(loggedSet?.weightLb != null ? String(loggedSet.weightLb) : "");
  const [reps, setReps] = useState<string>(loggedSet?.reps != null ? String(loggedSet.reps) : "");
  const [rpe, setRpe] = useState<RpeValue | null>(loggedSet?.rpe ?? null);
  const [note, setNote] = useState(loggedSet?.note ?? "");
  const [showNote, setShowNote] = useState(!!loggedSet?.note);
  const [error, setError] = useState<string | null>(null);

  const label = isWarmup ? "Warm-up" : "Working set";

  if (loggedSet?.status === "skipped" && !editing) {
    return (
      <div className="flex items-center justify-between rounded-[var(--radius-sm)] bg-off-white/[0.03] px-3 py-3">
        <div>
          <p className="text-sm font-medium text-off-white/70">
            {label} {setNumber}
          </p>
          <p className="text-xs text-neutral">Skipped — {SKIP_REASON_LABELS[loggedSet.skipReason ?? "other"]}</p>
        </div>
      </div>
    );
  }

  if (loggedSet?.status === "completed" && !editing) {
    return (
      <div className="flex items-center justify-between rounded-[var(--radius-sm)] border border-border-strong bg-off-white/[0.02] px-3 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-success-soft text-success">
            <Check size={14} />
          </span>
          <div>
            <p className="text-sm font-medium text-off-white">
              {label} {setNumber}
            </p>
            <p className="text-sm text-neutral">
              {loggedSet.weightLb} lb × {loggedSet.reps}
              {loggedSet.rpe ? ` @ RPE ${loggedSet.rpe}` : " · RPE not recorded"}
            </p>
          </div>
        </div>
        <button
          onClick={() => setEditing(true)}
          aria-label={`Edit ${label.toLowerCase()} ${setNumber}`}
          className="flex h-9 w-9 items-center justify-center rounded-full text-neutral hover:bg-off-white/5 hover:text-off-white"
        >
          <Pencil size={15} />
        </button>
      </div>
    );
  }

  function handleComplete() {
    const weightNum = Number(weight);
    const repsNum = Number(reps);
    if (weight === "" || Number.isNaN(weightNum) || weightNum < 0 || weightNum > 1500) {
      setError("Enter a realistic weight.");
      return;
    }
    if (reps === "" || Number.isNaN(repsNum) || repsNum < 0 || repsNum > 100) {
      setError("Enter a realistic rep count.");
      return;
    }
    onComplete(weightNum, repsNum, rpe ?? targetRpe, note.trim() || undefined);
    setEditing(false);
    setError(null);
  }

  return (
    <div className="rounded-[var(--radius-md)] border border-border-strong p-3.5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-off-white">
          {label} {setNumber}
          <span className="ml-2 font-normal text-neutral">
            Target {targetRepsLow}–{targetRepsHigh} reps · RPE {targetRpe}
          </span>
        </p>
        <div className="flex items-center gap-1">
          {editing ? (
            <button
              onClick={() => setEditing(false)}
              aria-label="Cancel edit"
              className="flex h-8 w-8 items-center justify-center rounded-full text-neutral hover:bg-off-white/5"
            >
              <X size={14} />
            </button>
          ) : onRemoveExtra ? (
            <button
              onClick={onRemoveExtra}
              aria-label="Remove this set"
              className="flex h-8 w-8 items-center justify-center rounded-full text-neutral hover:bg-off-white/5"
            >
              <X size={14} />
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <div>
          <label htmlFor={`weight-${setNumber}-${isWarmup}`} className="mb-1 block text-xs text-neutral">
            Weight (lb)
          </label>
          <input
            id={`weight-${setNumber}-${isWarmup}`}
            type="number"
            inputMode="decimal"
            value={weight}
            onChange={(e) => {
              setWeight(e.target.value);
              setError(null);
            }}
            className="h-11 w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3 text-center text-[15px] text-off-white outline-none focus-visible:border-accent"
          />
        </div>
        <div>
          <label htmlFor={`reps-${setNumber}-${isWarmup}`} className="mb-1 block text-xs text-neutral">
            Reps
          </label>
          <input
            id={`reps-${setNumber}-${isWarmup}`}
            type="number"
            inputMode="numeric"
            value={reps}
            onChange={(e) => {
              setReps(e.target.value);
              setError(null);
            }}
            className="h-11 w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3 text-center text-[15px] text-off-white outline-none focus-visible:border-accent"
          />
        </div>
      </div>

      <div className="mt-3">
        <RpeSelector id={`rpe-${setNumber}-${isWarmup}`} value={rpe} onChange={setRpe} />
      </div>

      {showNote ? (
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional note"
          className="mt-3 h-10 w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3 text-sm text-off-white outline-none placeholder:text-neutral/60 focus-visible:border-accent"
        />
      ) : (
        <button
          type="button"
          onClick={() => setShowNote(true)}
          className="mt-2 text-xs font-medium text-accent-strong"
        >
          + Add a note
        </button>
      )}

      {error ? <p className={cn("mt-2 text-xs text-error")}>{error}</p> : null}

      <div className="mt-3 flex gap-2">
        <Button size="sm" className="flex-1" onClick={handleComplete}>
          {loggedSet ? "Save set" : "Complete set"}
        </Button>
        {!loggedSet && (
          <Button size="sm" variant="outline" onClick={onSkipRequested}>
            Skip
          </Button>
        )}
      </div>
    </div>
  );
}
