"use client";

import type { ReactNode } from "react";
import { Sheet } from "@/components/ui/sheet";
import { SKIP_REASON_LABELS } from "@/components/ui/reason-picker";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { cardioPrescriptionForClient } from "@/lib/mock-data";
import { MEAL_OPTIONS, MEAL_PERIOD_LABELS, PUSH_WORKOUT } from "@/lib/mock-data";
import type { MealPeriod, MealSelection } from "@/lib/types";

const MEAL_ORDER: MealPeriod[] = ["breakfast", "postWorkout", "lunch", "dinner", "snack"];

function mealDescription(period: MealPeriod, selection: MealSelection | undefined): string {
  if (!selection) return "Not logged yet";
  if (selection.source === "skipped") return `Skipped — ${SKIP_REASON_LABELS[selection.skipReason ?? "other"]}`;
  if (selection.source === "planned-later") return "Planned for later";
  if (selection.source === "manual") return selection.manualName ?? "Logged manually";
  if (selection.source === "photo-estimate") return `${selection.manualName ?? "Logged"} (photo estimate)`;
  const option = MEAL_OPTIONS[period].find((o) => o.id === selection.optionId);
  return option?.name ?? "Logged";
}

/**
 * The daily-summary view behind "Review today" — reusable by the redesigned
 * Progress history in a later phase. Reads directly from live state and the
 * same computed meal schedule Today/Nutrition use; nothing here is invented
 * — sections are simply omitted or shown as "not logged" when data is
 * missing. See Phase 3.1 §7.
 */
export function ReviewTodaySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, nutritionTotals, dailyPlan } = usePrototypeState();
  const session = state.workoutSession;
  const summary = session.summary;

  const prescription = cardioPrescriptionForClient(state.clientId);
  const selectedCardioOption =
    prescription.options.find((o) => o.id === state.cardio.selectedOptionId) ??
    prescription.options.find((o) => o.isDefault) ??
    prescription.options[0];

  const exceptions: string[] = [];
  for (const exercise of PUSH_WORKOUT.exercises) {
    const log = session.exerciseLogs[exercise.id];
    if (!log) continue;
    for (const set of log.loggedSets) {
      if (set.status === "skipped") {
        const reason = set.skipReason ? SKIP_REASON_LABELS[set.skipReason] : "Skipped";
        exceptions.push(`${exercise.name}, set ${set.setNumber}: ${reason}${set.note ? ` — ${set.note}` : ""}`);
      }
    }
    if (log.skipReason) {
      exceptions.push(`${exercise.name} skipped: ${SKIP_REASON_LABELS[log.skipReason]}${log.skipNote ? ` — ${log.skipNote}` : ""}`);
    }
  }
  if (session.skipReason) {
    exceptions.push(`Workout: ${SKIP_REASON_LABELS[session.skipReason]}${session.skipNote ? ` — ${session.skipNote}` : ""}`);
  }
  if (state.cardio.skipReason) {
    exceptions.push(`Cardio: ${SKIP_REASON_LABELS[state.cardio.skipReason]}${state.cardio.note ? ` — ${state.cardio.note}` : ""}`);
  }

  const workoutStatusLabel: Record<typeof session.status, string> = {
    "not-started": "Not started",
    "in-progress": "In progress",
    completed: "Completed",
    "ended-early": "Ended early",
    skipped: "Skipped",
  };

  return (
    <Sheet open={open} onClose={onClose} title="Today's review" description="Everything logged so far today, in one place.">
      <div className="space-y-5">
        <Section title="Nutrition">
          <Row label="Calories" value={`${nutritionTotals.calories} / ${state.nutritionTargets.calories}`} />
          <Row label="Protein" value={`${nutritionTotals.proteinG}g / ${state.nutritionTargets.proteinG}g`} />
          <Row label="Carbs" value={`${nutritionTotals.carbsG}g / ${state.nutritionTargets.carbsG}g`} />
          <Row label="Fat" value={`${nutritionTotals.fatG}g / ${state.nutritionTargets.fatG}g`} />
        </Section>

        <Section title="Meals">
          {MEAL_ORDER.map((period) => {
            const selection = state.meals[period];
            const entry = dailyPlan.mealSchedule.entries[period];
            if (!selection && !entry) return null;
            return (
              <Row
                key={period}
                label={MEAL_PERIOD_LABELS[period]}
                value={mealDescription(period, selection)}
                sub={entry?.timeLabel ?? undefined}
              />
            );
          })}
        </Section>

        <Section title="Bodyweight">
          <Row
            label="Morning weight"
            value={
              state.morningWeight.weightLb !== null
                ? `${state.morningWeight.weightLb} lb`
                : state.morningWeight.skipped
                  ? "Skipped"
                  : "Not logged yet"
            }
          />
        </Section>

        <Section title="Workout">
          <Row label="Status" value={workoutStatusLabel[session.status]} />
          {summary ? (
            <>
              <Row label="Working sets completed" value={String(summary.workingSetsCompleted)} />
              <Row label="Average RPE" value={summary.averageRpe !== null ? String(summary.averageRpe) : "Not calculable yet"} />
              <Row label="Duration" value={`${summary.durationMin} min`} />
              {summary.skippedSetsCount > 0 ? <Row label="Skipped sets" value={String(summary.skippedSetsCount)} /> : null}
              {summary.painReportCount > 0 ? <Row label="Pain reports" value={String(summary.painReportCount)} /> : null}
            </>
          ) : (
            <p className="text-meta text-neutral">No working sets logged yet today.</p>
          )}
        </Section>

        <Section title="Cardio">
          <Row label="Option" value={selectedCardioOption?.displayName ?? "Not selected"} />
          <Row
            label="Target"
            value={selectedCardioOption ? `${selectedCardioOption.targetDurationMin} min` : "—"}
          />
          <Row label="Completed" value={`${state.cardio.durationMin} min`} />
          <Row label="Status" value={state.cardio.status === "not-started" ? "Not started" : state.cardio.status} />
        </Section>

        {session.painReports.length > 0 || exceptions.length > 0 ? (
          <Section title="Notes & exceptions">
            {session.painReports.map((report) => (
              <p key={report.id} className="text-meta text-neutral">
                Pain — {report.location} ({report.ratingZeroToTen}/10){report.note ? `: ${report.note}` : ""}
              </p>
            ))}
            {exceptions.map((line, i) => (
              <p key={i} className="text-meta text-neutral">
                {line}
              </p>
            ))}
          </Section>
        ) : null}
      </div>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-label text-neutral">{title}</p>
      <div className="mt-2 space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 text-meta">
      <span className="text-neutral">{label}</span>
      <span className="text-right text-off-white">
        {value}
        {sub ? <span className="block text-meta text-neutral">{sub}</span> : null}
      </span>
    </div>
  );
}
