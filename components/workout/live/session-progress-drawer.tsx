"use client";

import { useState } from "react";
import { AlertTriangle, Check, Clock3, Pencil, X } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { RpeWheel } from "@/components/workout/live/rpe-wheel";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { cn } from "@/lib/cn";
import type { Exercise, LoggedSet, RpeValue, WorkoutSession } from "@/lib/types";

/**
 * Phase 4.4B-2 §B — compact access to the full exercise sequence instead of
 * a permanent long list on screen. Also where the client can safely inspect
 * and correct an already-logged set (§E) — edits go through the exact same
 * LOG_SET upsert-by-set-number path the live logging flow itself uses, so
 * there's no parallel "edited" data model.
 */
export function SessionProgressDrawer({ open, onClose, session }: { open: boolean; onClose: () => void; session: WorkoutSession }) {
  const [editingKey, setEditingKey] = useState<string | null>(null);

  return (
    <Sheet open={open} onClose={onClose} title="This session" description={session.resolvedWorkout?.name ?? "Workout"}>
      <div className="space-y-3">
        {(session.resolvedWorkout?.exercises ?? []).map((exercise) => {
          const log = session.exerciseLogs[exercise.id];
          const isCurrent = session.currentExerciseId === exercise.id;
          const isDeferred = session.deferredExerciseIds.includes(exercise.id);
          const status =
            log?.status === "completed"
              ? "completed"
              : log?.status === "skipped"
                ? "skipped"
                : isCurrent
                  ? "current"
                  : isDeferred
                    ? "deferred"
                    : "pending";
          const hasPainReport = session.painReports.some((r) => r.exerciseId === exercise.id);
          return (
            <ExerciseRow
              key={exercise.id}
              exercise={exercise}
              status={status}
              loggedSets={log?.loggedSets ?? []}
              hasPainReport={hasPainReport}
              editingKey={editingKey}
              onEditKeyChange={setEditingKey}
            />
          );
        })}
      </div>
    </Sheet>
  );
}

function statusBadge(status: string) {
  switch (status) {
    case "completed":
      return { className: "bg-success-soft text-success", label: "Completed", icon: <Check size={13} /> };
    case "skipped":
      return { className: "bg-off-white/[0.06] text-neutral", label: "Skipped", icon: null };
    case "deferred":
      return { className: "bg-warning-soft text-warning", label: "Deferred", icon: <Clock3 size={13} /> };
    case "current":
      return { className: "bg-accent-soft text-accent-strong", label: "In progress", icon: null };
    default:
      return { className: "bg-off-white/[0.04] text-neutral", label: "Not started", icon: null };
  }
}

function ExerciseRow({
  exercise,
  status,
  loggedSets,
  hasPainReport,
  editingKey,
  onEditKeyChange,
}: {
  exercise: Exercise;
  status: string;
  loggedSets: LoggedSet[];
  hasPainReport: boolean;
  editingKey: string | null;
  onEditKeyChange: (key: string | null) => void;
}) {
  const badge = statusBadge(status);
  const workingSets = loggedSets.filter((s) => !s.isWarmup).sort((a, b) => a.setNumber - b.setNumber);

  return (
    <div className="rounded-[var(--radius-md)] border border-border-strong p-3.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="truncate text-subheading text-off-white">{exercise.name}</p>
          {hasPainReport ? (
            <span
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-error-soft text-error"
              title="Pain reported for this exercise this session"
              aria-label="Pain reported for this exercise this session"
            >
              <AlertTriangle size={11} />
            </span>
          ) : null}
        </div>
        <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium", badge.className)}>
          {badge.icon}
          {badge.label}
        </span>
      </div>
      {workingSets.length > 0 ? (
        <div className="mt-2 space-y-1.5">
          {workingSets.map((set) => (
            <LoggedSetRow
              key={set.id}
              exercise={exercise}
              set={set}
              editing={editingKey === set.id}
              onEdit={() => onEditKeyChange(set.id)}
              onDoneEditing={() => onEditKeyChange(null)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function LoggedSetRow({
  exercise,
  set,
  editing,
  onEdit,
  onDoneEditing,
}: {
  exercise: Exercise;
  set: LoggedSet;
  editing: boolean;
  onEdit: () => void;
  onDoneEditing: () => void;
}) {
  const { dispatch } = usePrototypeState();
  const [weight, setWeight] = useState(String(set.weightLb ?? ""));
  const [reps, setReps] = useState(String(set.reps ?? ""));
  const [rpe, setRpe] = useState<RpeValue | null>(set.rpe);

  if (set.status === "skipped") {
    return <p className="text-meta text-neutral">Set {set.setNumber} — skipped</p>;
  }

  if (!editing) {
    return (
      <div className="flex items-center justify-between">
        <p className="text-meta text-off-white">
          Set {set.setNumber}: {set.weightLb} lb × {set.reps} @ RPE {set.rpe ?? "—"}
        </p>
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit set ${set.setNumber} for ${exercise.name}`}
          className="flex h-7 w-7 items-center justify-center rounded-full text-neutral hover:bg-off-white/5"
        >
          <Pencil size={13} />
        </button>
      </div>
    );
  }

  function handleSave() {
    const weightNum = Number(weight);
    const repsNum = Number(reps);
    if (Number.isNaN(weightNum) || Number.isNaN(repsNum) || rpe === null) return;
    dispatch({
      type: "LOG_SET",
      exerciseId: exercise.id,
      setNumber: set.setNumber,
      isWarmup: false,
      weightLb: weightNum,
      reps: repsNum,
      rpe,
      performedAsPrescribed: set.performedAsPrescribed,
    });
    onDoneEditing();
  }

  return (
    <div className="rounded-[var(--radius-sm)] bg-off-white/[0.04] p-2.5">
      <div className="flex items-center justify-between">
        <p className="text-meta text-off-white">Editing set {set.setNumber}</p>
        <button type="button" onClick={onDoneEditing} aria-label="Cancel edit" className="text-neutral">
          <X size={14} />
        </button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <input
          type="number"
          inputMode="decimal"
          aria-label="Weight (lb)"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          className="h-10 rounded-[var(--radius-sm)] border border-border-strong bg-surface px-2 text-center text-sm text-off-white outline-none focus-visible:border-accent"
        />
        <input
          type="number"
          inputMode="numeric"
          aria-label="Reps"
          value={reps}
          onChange={(e) => setReps(e.target.value)}
          className="h-10 rounded-[var(--radius-sm)] border border-border-strong bg-surface px-2 text-center text-sm text-off-white outline-none focus-visible:border-accent"
        />
      </div>
      <div className="mt-2">
        <RpeWheel id={`edit-rpe-${set.id}`} onChange={setRpe} />
      </div>
      <Button size="sm" className="mt-2 w-full" onClick={handleSave}>
        Save
      </Button>
    </div>
  );
}
