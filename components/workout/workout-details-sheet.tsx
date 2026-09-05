import { Sheet } from "@/components/ui/sheet";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { PUSH_WORKOUT } from "@/lib/mock-data";
import type { Workout } from "@/lib/types";

interface WorkoutDetailsSheetProps {
  open: boolean;
  onClose: () => void;
  /**
   * The real catalog workout to preview — defaults to PUSH_WORKOUT so every
   * pre-existing call site (Today's workout task, the active workout
   * header's overview) keeps its exact prior behavior untouched. Phase
   * 4.4B-1 — Training's day carousel passes the real catalogWorkoutForDay()
   * result for whichever day is selected, explicitly `null` when that day
   * has no real, loggable content, so this sheet degrades to an honest
   * overview instead of ever substituting PUSH_WORKOUT's content under a
   * different day's name.
   */
  workout?: Workout | null;
  /** Shown when `workout` is null — the schedule-only name/focus (see
   * TrainingWeekDay), never fabricated exercise detail. */
  fallbackName?: string;
  fallbackFocus?: string;
}

export function WorkoutDetailsSheet({
  open,
  onClose,
  workout = PUSH_WORKOUT,
  fallbackName,
  fallbackFocus,
}: WorkoutDetailsSheetProps) {
  const { activeContext } = usePrototypeState();
  const coachName = activeContext.primaryCoach?.displayName ?? "your coach";

  if (!workout) {
    return (
      <Sheet open={open} onClose={onClose} title={fallbackName ?? "Workout"} description={fallbackFocus}>
        <p className="text-body text-neutral">
          Full session detail isn&apos;t available yet. Check with {coachName} if you have questions.
        </p>
      </Sheet>
    );
  }

  return (
    <Sheet open={open} onClose={onClose} title={workout.name} description={workout.focus}>
      <div className="mb-4 rounded-[var(--radius-sm)] bg-off-white/[0.04] p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral">Warm-up</p>
        <p className="mt-1 text-sm text-off-white">{workout.warmupOverview}</p>
      </div>

      <div className="space-y-3">
        {workout.exercises.map((exercise, i) => (
          <div key={exercise.id} className="rounded-[var(--radius-md)] border border-border-strong p-3.5">
            <p className="text-sm font-semibold text-off-white">
              {i + 1}. {exercise.name}
            </p>
            <p className="mt-1 text-sm text-neutral">
              {exercise.warmupSets > 0 ? `${exercise.warmupSets} warm-up + ` : ""}
              {exercise.workingSets} working sets · {exercise.targetRepsLow}–{exercise.targetRepsHigh} reps ·
              RPE {exercise.targetRpe}
            </p>
            <p className="mt-1 text-xs text-neutral">
              Rest {exercise.restSeconds}s · Tempo {exercise.tempo}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-[var(--radius-sm)] bg-off-white/[0.04] p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral">Note from {coachName}</p>
        <p className="mt-1 text-sm text-off-white">{workout.coachNote}</p>
      </div>
    </Sheet>
  );
}
