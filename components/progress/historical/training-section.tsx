import { Dumbbell } from "lucide-react";
import { SectionCard } from "./section-card";
import { Disclosure } from "./disclosure";
import { OutcomeBadge } from "./outcome-badge";
import { SKIP_REASON_LABELS } from "@/components/ui/reason-picker";
import type { HistoricalExerciseModel, HistoricalTrainingModel } from "@/lib/progress/types";

function exerciseStatusLabel(exercise: HistoricalExerciseModel): string {
  if (exercise.status === "completed") return "Completed";
  if (exercise.status === "skipped") return "Skipped";
  if (exercise.status === "in-progress") return "In progress";
  return "Not started";
}

function ExerciseRow({ exercise }: { exercise: HistoricalExerciseModel }) {
  return (
    <div className="rounded-[var(--radius-sm)] bg-off-white/[0.03] px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-off-white">{exercise.name}</p>
        <span className="shrink-0 text-xs text-neutral">{exerciseStatusLabel(exercise)}</span>
      </div>
      {exercise.skipReason ? (
        <p className="mt-0.5 text-xs text-neutral">Reason: {SKIP_REASON_LABELS[exercise.skipReason]}</p>
      ) : null}
      {exercise.hasSetDetail ? (
        <ul className="mt-1.5 space-y-0.5">
          {exercise.sets.map((set) => (
            <li key={set.setNumber} className="text-xs text-neutral">
              {set.isWarmup ? "Warm-up" : "Set"} {set.setNumber}
              {set.status === "skipped"
                ? " — skipped"
                : ` — ${set.weightLb ?? "—"} lb × ${set.reps ?? "—"}${set.rpe !== null ? ` @ RPE ${set.rpe}` : ""}`}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function TrainingSection({ training }: { training: HistoricalTrainingModel }) {
  if (training.trainingDayType === "scheduled_rest") {
    return (
      <SectionCard title="Training" icon={<Dumbbell size={16} aria-hidden="true" />} headerRight={<OutcomeBadge outcome="not_applicable" restLabel="Rest day" />}>
        <p className="text-sm text-neutral">Scheduled rest day.</p>
      </SectionCard>
    );
  }

  if (training.trainingDayType === "no_session_scheduled") {
    return (
      <SectionCard title="Training" icon={<Dumbbell size={16} aria-hidden="true" />} headerRight={<OutcomeBadge outcome={training.outcome} restLabel="No session" />}>
        <p className="text-sm text-neutral">
          {training.outcome === "no_record" ? "Nothing recorded for this day." : "No workout was scheduled."}
        </p>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Training" icon={<Dumbbell size={16} aria-hidden="true" />} headerRight={<OutcomeBadge outcome={training.outcome} />}>
      <p className="text-sm font-medium text-off-white">{training.workoutName ?? "Workout"}</p>
      {training.focus ? <p className="text-xs text-neutral">{training.focus}</p> : null}

      <p className="mt-2 text-sm text-off-white">
        {training.workingSetsCompleted} of {training.workingSetsPrescribed} working sets completed
      </p>

      {training.sessionStatus === "ended-early" ? <p className="mt-1 text-xs text-warning">Ended early</p> : null}
      {training.skipReason ? (
        <p className="mt-1 text-xs text-neutral">Reason: {SKIP_REASON_LABELS[training.skipReason]}</p>
      ) : null}
      {training.startedTimeLabel || training.completedTimeLabel ? (
        <p className="mt-1 text-xs text-neutral">
          {training.startedTimeLabel ? `Started ${training.startedTimeLabel}` : null}
          {training.startedTimeLabel && training.completedTimeLabel ? " · " : null}
          {training.completedTimeLabel ? `Ended ${training.completedTimeLabel}` : null}
        </p>
      ) : null}

      {!training.hasAnySetDetail && training.workingSetsPrescribed > 0 ? (
        <p className="mt-2 text-xs text-neutral">Set-by-set detail wasn&apos;t recorded for this day.</p>
      ) : null}

      {training.hasWorkoutDetail && training.exercises.length > 0 ? (
        <Disclosure label="Exercise detail" className="mt-3">
          <div className="space-y-2">
            {training.exercises.map((exercise) => (
              <ExerciseRow key={exercise.exerciseId} exercise={exercise} />
            ))}
          </div>
        </Disclosure>
      ) : null}

      {training.painReports.length > 0 ? (
        <Disclosure label={`Pain reported (${training.painReports.length})`} className="mt-3">
          <div className="space-y-2">
            {training.painReports.map((report, i) => (
              <div key={i} className="rounded-[var(--radius-sm)] bg-warning-soft px-3 py-2.5 text-xs text-off-white">
                <p className="font-medium">
                  {report.location}
                  {report.exerciseName ? ` — ${report.exerciseName}` : ""} · {report.ratingZeroToTen}/10
                </p>
                <p className="mt-0.5 text-neutral">{report.onset}</p>
                {report.note ? <p className="mt-0.5 text-neutral">{report.note}</p> : null}
              </div>
            ))}
          </div>
        </Disclosure>
      ) : null}
    </SectionCard>
  );
}
