import { Sheet } from "@/components/ui/sheet";
import { PUSH_WORKOUT } from "@/lib/mock-data";

export function WorkoutDetailsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title={PUSH_WORKOUT.name} description={PUSH_WORKOUT.focus}>
      <div className="mb-4 rounded-[var(--radius-sm)] bg-white/[0.04] p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral">Warm-up</p>
        <p className="mt-1 text-sm text-off-white">{PUSH_WORKOUT.warmupOverview}</p>
      </div>

      <div className="space-y-3">
        {PUSH_WORKOUT.exercises.map((exercise, i) => (
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

      <div className="mt-4 rounded-[var(--radius-sm)] bg-white/[0.04] p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral">Note from Teague</p>
        <p className="mt-1 text-sm text-off-white">{PUSH_WORKOUT.coachNote}</p>
      </div>
    </Sheet>
  );
}
