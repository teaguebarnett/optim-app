"use client";

import { useState } from "react";
import { Dumbbell, BedDouble } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SurfaceShell } from "@/components/training/surface-shell";
import { WorkoutDetailsSheet } from "@/components/workout/workout-details-sheet";
import { catalogWorkoutForDay, trainingWeekEntryForDay } from "@/lib/mock-data";
import { formatLongDateLabel, localDateDayOfWeek } from "@/lib/shared/local-date";

/**
 * Read-only preview for a day later in the current week — Phase 4.4B-1.
 * Never starts a session (no primary "do this now" action exists here at
 * all; "Never allow a future or non-current workout to start accidentally"
 * per this phase's spec). Every day besides Monday currently has no real,
 * loggable catalog content (see lib/mock-data.ts's WORKOUTS_BY_ID module
 * doc) — and since the carousel only ever shows the current Monday-start
 * week, a future day can never itself BE Monday, so in practice this
 * always renders the honest "detail not available yet" branch for a
 * training day. That's a real, pre-existing data limitation, not something
 * this component fabricates around.
 */
export function FutureSessionCard({ dateIso }: { dateIso: string }) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const dayOfWeek = localDateDayOfWeek(dateIso);
  const entry = trainingWeekEntryForDay(dayOfWeek);
  const catalogWorkout = catalogWorkoutForDay(dayOfWeek);
  const dateLabel = formatLongDateLabel(dateIso);

  if (!entry || entry.type === "rest") {
    return (
      <SurfaceShell icon={<BedDouble size={22} />} title="Recovery day" meta={dateLabel}>
        <p className="text-body text-off-white">A scheduled rest day — nothing to prepare for.</p>
      </SurfaceShell>
    );
  }

  const workoutDisplayName = catalogWorkout?.name ?? entry.workoutName ?? "Workout";
  const workoutFocus = catalogWorkout?.focus ?? entry.focus;

  return (
    <>
      <SurfaceShell
        icon={<Dumbbell size={22} />}
        title={workoutDisplayName}
        meta={`${dateLabel}${workoutFocus ? ` · ${workoutFocus}` : ""}`}
      >
        {catalogWorkout ? (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-meta text-neutral">
            <span>{catalogWorkout.estimatedDurationMin} min</span>
            <span aria-hidden="true">·</span>
            <span>{catalogWorkout.exercises.length} exercises</span>
          </div>
        ) : (
          <p className="text-body text-neutral">Full session detail isn&apos;t available yet.</p>
        )}
        <Button className="mt-4 w-full" variant="outline" onClick={() => setPreviewOpen(true)}>
          Preview workout
        </Button>
      </SurfaceShell>
      <WorkoutDetailsSheet
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        workout={catalogWorkout ?? null}
        fallbackName={workoutDisplayName}
        fallbackFocus={workoutFocus}
      />
    </>
  );
}
