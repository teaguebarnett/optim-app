"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Copy, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TextField } from "@/components/ui/text-field";
import { TextArea } from "@/components/ui/textarea";
import { NumberField } from "@/components/ui/number-field";
import { Combobox } from "@/components/ui/combobox";
import {
  DAYS_OF_WEEK_ORDER,
  createEmptyExercise,
  createEmptyProgramWeek,
  createEmptyWorkout,
  duplicateDayWithinWeek,
  duplicateWeek as duplicateWeekHelper,
  reorderExercises,
} from "@/lib/coach/training";
import { cn } from "@/lib/cn";
import type { DayOfWeek, Exercise, ProgramDay, ProgramWeek, Workout } from "@/lib/types";
import type { WorkspaceId } from "@/lib/tenancy/types";

function inputClass(extra?: string) {
  return cn(
    "h-9 rounded-[var(--radius-sm)] border border-border-strong bg-surface px-2.5 text-sm text-off-white outline-none focus-visible:border-accent",
    extra
  );
}

function ExerciseRow({
  exercise,
  index,
  total,
  onChange,
  onMove,
  onDelete,
}: {
  exercise: Exercise;
  index: number;
  total: number;
  onChange: (exercise: Exercise) => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-[var(--radius-sm)] border border-border-strong bg-surface-raised p-3">
      <div className="flex items-start gap-2">
        <div className="flex flex-col gap-1 pt-1">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            aria-label="Move exercise up"
            className="flex h-6 w-6 items-center justify-center rounded text-neutral hover:text-off-white disabled:opacity-30"
          >
            <ChevronUp size={14} />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            aria-label="Move exercise down"
            className="flex h-6 w-6 items-center justify-center rounded text-neutral hover:text-off-white disabled:opacity-30"
          >
            <ChevronDown size={14} />
          </button>
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <input
            value={exercise.name}
            onChange={(e) => onChange({ ...exercise, name: e.target.value })}
            placeholder="Exercise name"
            className={inputClass("w-full font-medium")}
          />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <label className="text-xs text-neutral">
              Working sets
              <input
                type="number"
                min={0}
                value={exercise.workingSets}
                onChange={(e) => onChange({ ...exercise, workingSets: Number(e.target.value) || 0 })}
                className={inputClass("mt-1 w-full")}
              />
            </label>
            <label className="text-xs text-neutral">
              Rep range
              <div className="mt-1 flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  value={exercise.targetRepsLow}
                  onChange={(e) => onChange({ ...exercise, targetRepsLow: Number(e.target.value) || 0 })}
                  className={inputClass("w-full")}
                />
                <span className="text-neutral">–</span>
                <input
                  type="number"
                  min={0}
                  value={exercise.targetRepsHigh}
                  onChange={(e) => onChange({ ...exercise, targetRepsHigh: Number(e.target.value) || 0 })}
                  className={inputClass("w-full")}
                />
              </div>
            </label>
            <div className="text-xs text-neutral">
              Target RPE
              <div className="mt-1 grid grid-cols-5 gap-1" role="group" aria-label="Target RPE">
                {([6, 7, 8, 9, 10] as const).map((rpe) => (
                  <button
                    key={rpe}
                    type="button"
                    onClick={() => onChange({ ...exercise, targetRpe: rpe })}
                    aria-pressed={exercise.targetRpe === rpe}
                    className={cn(
                      "h-7 rounded-[var(--radius-xs)] border text-xs font-medium transition-colors",
                      exercise.targetRpe === rpe ? "border-accent bg-selected-bg text-accent-fg" : "border-border-strong text-off-white hover:border-accent/40"
                    )}
                  >
                    {rpe}
                  </button>
                ))}
              </div>
            </div>
            <label className="text-xs text-neutral">
              Rest (sec)
              <input
                type="number"
                min={0}
                value={exercise.restSeconds}
                onChange={(e) => onChange({ ...exercise, restSeconds: Number(e.target.value) || 0 })}
                className={inputClass("mt-1 w-full")}
              />
            </label>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="text-xs text-neutral">
              Tempo (optional)
              <input
                value={exercise.tempo}
                onChange={(e) => onChange({ ...exercise, tempo: e.target.value })}
                placeholder="e.g. 3-1-1"
                className={inputClass("mt-1 w-full")}
              />
            </label>
            <label className="text-xs text-neutral">
              Coaching cue (optional)
              <input
                value={exercise.cue}
                onChange={(e) => onChange({ ...exercise, cue: e.target.value })}
                placeholder="What should the client focus on?"
                className={inputClass("mt-1 w-full")}
              />
            </label>
          </div>
        </div>
        <button
          type="button"
          onClick={onDelete}
          aria-label="Remove exercise"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-neutral hover:bg-error-soft hover:text-error"
        >
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
}

function WorkoutEditor({ workout, onChange }: { workout: Workout; onChange: (workout: Workout) => void }) {
  function updateExercise(index: number, exercise: Exercise) {
    onChange({ ...workout, exercises: workout.exercises.map((e, i) => (i === index ? exercise : e)) });
  }
  function moveExercise(index: number, direction: -1 | 1) {
    onChange(reorderExercises(workout, index, index + direction));
  }
  function deleteExercise(index: number) {
    onChange({ ...workout, exercises: workout.exercises.filter((_, i) => i !== index).map((e, i) => ({ ...e, order: i + 1 })) });
  }
  function addExercise() {
    onChange({ ...workout, exercises: [...workout.exercises, createEmptyExercise(workout.exercises.length + 1)] });
  }

  return (
    <div className="space-y-3 border-t border-border pt-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <TextField id={`${workout.id}-name`} label="Session name" value={workout.name} onChange={(e) => onChange({ ...workout, name: e.target.value })} placeholder="e.g. Push Day" />
        <TextField id={`${workout.id}-focus`} label="Focus" value={workout.focus} onChange={(e) => onChange({ ...workout, focus: e.target.value })} placeholder="e.g. Chest, shoulders, triceps" />
      </div>
      <NumberField
        id={`${workout.id}-duration`}
        label="Estimated duration"
        value={workout.estimatedDurationMin}
        onChange={(v) => onChange({ ...workout, estimatedDurationMin: v === "" ? 0 : v })}
        min={0}
        step={5}
        suffix="min"
      />
      <TextArea
        id={`${workout.id}-warmup`}
        label="Warm-up instructions"
        value={workout.warmupOverview}
        onChange={(e) => onChange({ ...workout, warmupOverview: e.target.value })}
        placeholder="What should the client do before the first working set?"
        rows={2}
      />
      <TextArea
        id={`${workout.id}-note`}
        label="Coach notes (optional)"
        value={workout.coachNote}
        onChange={(e) => onChange({ ...workout, coachNote: e.target.value })}
        placeholder="Anything the client should keep in mind for this session"
        rows={2}
      />

      <div>
        <p className="mb-2 text-sm font-medium text-off-white">Exercises</p>
        <div className="space-y-2">
          {workout.exercises.map((exercise, i) => (
            <ExerciseRow
              key={exercise.id}
              exercise={exercise}
              index={i}
              total={workout.exercises.length}
              onChange={(e) => updateExercise(i, e)}
              onMove={(d) => moveExercise(i, d)}
              onDelete={() => deleteExercise(i)}
            />
          ))}
        </div>
        <Button variant="secondary" size="sm" className="mt-2" onClick={addExercise}>
          <Plus size={14} /> Add exercise
        </Button>
      </div>
    </div>
  );
}

function DayEditor({
  day,
  workspaceId,
  expanded,
  onToggleExpand,
  onChange,
  onDuplicateFrom,
}: {
  day: ProgramDay;
  workspaceId: WorkspaceId;
  expanded: boolean;
  onToggleExpand: () => void;
  onChange: (day: ProgramDay) => void;
  onDuplicateFrom: (fromDay: DayOfWeek) => void;
}) {
  function setType(type: "training" | "rest") {
    if (type === "training" && !day.workout) {
      onChange({ ...day, type, workout: createEmptyWorkout(workspaceId, day.dayOfWeek) });
    } else {
      onChange({ ...day, type });
    }
  }

  return (
    <Card className="p-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <p className="w-24 text-sm font-semibold text-off-white">{day.dayOfWeek}</p>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setType("training")}
              aria-pressed={day.type === "training"}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                day.type === "training" ? "border-accent bg-selected-bg text-accent-fg" : "border-border-strong text-neutral"
              )}
            >
              Training
            </button>
            <button
              type="button"
              onClick={() => setType("rest")}
              aria-pressed={day.type === "rest"}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                day.type === "rest" ? "border-accent bg-selected-bg text-accent-fg" : "border-border-strong text-neutral"
              )}
            >
              Rest
            </button>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-32">
            <Combobox
              ariaLabel={`Copy another day's session onto ${day.dayOfWeek}`}
              placeholder="Copy from…"
              value={null}
              onChange={(v) => onDuplicateFrom(v as DayOfWeek)}
              options={DAYS_OF_WEEK_ORDER.filter((d) => d !== day.dayOfWeek).map((d) => ({ value: d, label: d }))}
            />
          </div>
          {day.type === "training" ? (
            <button type="button" onClick={onToggleExpand} className="flex h-8 w-8 items-center justify-center rounded-full text-neutral hover:bg-off-white/5 hover:text-off-white">
              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          ) : null}
        </div>
      </div>
      {day.type === "training" && day.workout && !expanded ? (
        <p className="mt-2 text-sm text-neutral">
          {day.workout.name || "Untitled session"} · {day.workout.exercises.length} exercise{day.workout.exercises.length === 1 ? "" : "s"}
        </p>
      ) : null}
      {day.type === "training" && day.workout && expanded ? (
        <WorkoutEditor workout={day.workout} onChange={(workout) => onChange({ ...day, workout })} />
      ) : null}
    </Card>
  );
}

export interface ProgramEditorProps {
  workspaceId: WorkspaceId;
  name: string;
  durationWeeks: number;
  weeks: ProgramWeek[];
  onChangeName: (name: string) => void;
  onChangeDurationWeeks: (weeks: number) => void;
  onChangeWeeks: (weeks: ProgramWeek[]) => void;
}

/**
 * The shared week-by-week training-protocol editor — used both for a
 * coach's reusable template (see app/coach/programs/[templateId]/page.tsx)
 * and a specific client's own assigned copy (see the client setup page's
 * Training section). Purely controlled: every change flows back through
 * the three onChange props, and persistence is entirely the caller's
 * concern (SAVE_PROGRAM_TEMPLATE vs. lib/coach/program-assignment.ts).
 */
export function ProgramEditor({ workspaceId, name, durationWeeks, weeks, onChangeName, onChangeDurationWeeks, onChangeWeeks }: ProgramEditorProps) {
  const [selectedWeekNumber, setSelectedWeekNumber] = useState(1);
  const [expandedDay, setExpandedDay] = useState<DayOfWeek | null>(null);

  const selectedWeek = weeks.find((w) => w.weekNumber === selectedWeekNumber) ?? createEmptyProgramWeek(selectedWeekNumber);

  function updateWeek(next: ProgramWeek) {
    const exists = weeks.some((w) => w.weekNumber === next.weekNumber);
    onChangeWeeks(exists ? weeks.map((w) => (w.weekNumber === next.weekNumber ? next : w)) : [...weeks, next].sort((a, b) => a.weekNumber - b.weekNumber));
  }

  function updateDay(dayOfWeek: DayOfWeek, next: ProgramDay) {
    updateWeek({ ...selectedWeek, days: selectedWeek.days.map((d) => (d.dayOfWeek === dayOfWeek ? next : d)) });
  }

  function duplicateCurrentWeekTo(targetWeekNumber: number) {
    const result = duplicateWeekHelper({ weeks, durationWeeks }, selectedWeekNumber, targetWeekNumber);
    onChangeWeeks(result.weeks);
  }

  const authoredWeekNumbers = new Set(weeks.map((w) => w.weekNumber));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TextField id="program-name" label="Program name" value={name} onChange={(e) => onChangeName(e.target.value)} placeholder="e.g. 12-Week Strength Foundation" />
        <NumberField id="program-duration" label="Duration" value={durationWeeks} onChange={(v) => onChangeDurationWeeks(v === "" ? 1 : Math.max(1, v))} min={1} max={52} suffix="weeks" />
      </div>

      <div>
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {Array.from({ length: durationWeeks }, (_, i) => i + 1).map((weekNumber) => (
            <button
              key={weekNumber}
              type="button"
              onClick={() => setSelectedWeekNumber(weekNumber)}
              className={cn(
                "flex h-9 min-w-9 items-center justify-center rounded-[var(--radius-sm)] border px-2.5 text-sm font-medium transition-colors",
                selectedWeekNumber === weekNumber ? "border-accent bg-selected-bg text-accent-fg" : "border-border-strong text-neutral",
                !authoredWeekNumbers.has(weekNumber) && selectedWeekNumber !== weekNumber && "opacity-50"
              )}
            >
              {weekNumber}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral">Duplicate Week {selectedWeekNumber} to</span>
          <div className="w-36">
            <Combobox
              ariaLabel="Duplicate this week to"
              placeholder="Choose week…"
              value={null}
              onChange={(v) => duplicateCurrentWeekTo(Number(v))}
              options={Array.from({ length: durationWeeks }, (_, i) => i + 1)
                .filter((w) => w !== selectedWeekNumber)
                .map((w) => ({ value: String(w), label: `Week ${w}` }))}
            />
          </div>
          <Copy size={13} className="text-neutral" aria-hidden="true" />
        </div>
      </div>

      <div className="space-y-2">
        {selectedWeek.days.map((day) => (
          <DayEditor
            key={day.dayOfWeek}
            day={day}
            workspaceId={workspaceId}
            expanded={expandedDay === day.dayOfWeek}
            onToggleExpand={() => setExpandedDay(expandedDay === day.dayOfWeek ? null : day.dayOfWeek)}
            onChange={(next) => updateDay(day.dayOfWeek, next)}
            onDuplicateFrom={(fromDay) => updateWeek(duplicateDayWithinWeek(selectedWeek, fromDay, day.dayOfWeek))}
          />
        ))}
      </div>
    </div>
  );
}
