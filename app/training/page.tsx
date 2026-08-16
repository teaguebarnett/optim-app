"use client";

import { useRouter } from "next/navigation";
import { Dumbbell, ChevronRight, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatePill } from "@/components/ui/state-pill";
import { CoachCard } from "@/components/coach/coach-card";
import { ScreenSkeleton } from "@/components/ui/skeleton";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import {
  LAST_WEEK_SUMMARY,
  PUSH_WORKOUT,
  TRAINING_WEEK,
  TRAINING_WEEKLY_NOTE,
  catalogWorkoutForDay,
  trainingWeekEntryForDay,
} from "@/lib/mock-data";
import { localDateDayOfWeek } from "@/lib/shared/local-date";
import { deriveProgramWeek } from "@/lib/scheduling/enrollment";
import { cn } from "@/lib/cn";

export default function TrainingPage() {
  const { isHydrated, state, tasks, activeContext } = usePrototypeState();
  const router = useRouter();
  const coachName = activeContext.primaryCoach?.displayName ?? "your coach";

  if (!isHydrated) return <ScreenSkeleton />;

  const workoutTaskState = tasks.find((t) => t.id === "workout")?.state ?? "locked";

  // Phase 4.1 corrective — every day-relative label on this route resolves
  // from the same client-local effective date the Today screen already
  // uses (state.dateIso), never a hardcoded Monday. See
  // components/today/day-header.tsx and lib/planning/planner.ts for the
  // identical resolution chain.
  const todayDayOfWeek = localDateDayOfWeek(state.dateIso);
  const programWeek = deriveProgramWeek(state.programEnrollment, state.dateIso);
  const todaysScheduleEntry = trainingWeekEntryForDay(todayDayOfWeek);
  const catalogWorkoutToday = catalogWorkoutForDay(todayDayOfWeek);
  const scheduledWithoutDetail = !catalogWorkoutToday && todaysScheduleEntry?.type === "training";
  const cardWorkoutName = catalogWorkoutToday?.name ?? todaysScheduleEntry?.workoutName ?? PUSH_WORKOUT.name;
  const cardSubtitle = catalogWorkoutToday
    ? `${catalogWorkoutToday.focus} · ${catalogWorkoutToday.estimatedDurationMin} min`
    : scheduledWithoutDetail
      ? (todaysScheduleEntry?.focus ?? "")
      : `${PUSH_WORKOUT.focus} · ${PUSH_WORKOUT.estimatedDurationMin} min`;

  // A fully-skipped workout never shows as "completed" here — only real,
  // submitted work does. Only claims "completed" when today's schedule
  // actually has real content to have completed (see catalogWorkoutToday) —
  // otherwise this reduces to "today", never fabricating a completion
  // against a session that isn't really today's own prescribed workout.
  const todaysLiveStatus =
    catalogWorkoutToday && state.workoutSession.status === "completed" ? "completed" : "today";

  const unresolvedReviews = state.reviewRequests.filter((r) => !r.resolved);

  return (
    <div className="px-4 pb-6 pt-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-off-white">Training</h1>
        <span className="text-sm text-neutral">
          {programWeek !== null ? `Week ${programWeek} of ${state.programEnrollment.durationWeeks}` : ""}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-7 gap-1.5">
        {TRAINING_WEEK.map((day) => {
          const isRealToday = day.dayOfWeek === todayDayOfWeek;
          const status = isRealToday ? todaysLiveStatus : day.type === "rest" ? "rest" : "upcoming";
          return (
            <div
              key={day.dayOfWeek}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-[var(--radius-sm)] border py-2.5",
                status === "today"
                  ? "border-accent/50 bg-accent-soft"
                  : status === "completed"
                    ? "border-border bg-off-white/[0.03]"
                    : "border-border"
              )}
            >
              <span className="text-[11px] font-medium text-neutral">{day.label}</span>
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  status === "completed"
                    ? "bg-success"
                    : status === "today"
                      ? "bg-accent"
                      : day.type === "rest"
                        ? "bg-off-white/20"
                        : "bg-off-white/10"
                )}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-5">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral">Today · {todayDayOfWeek}</p>
        <div className="rounded-[var(--radius-lg)] border border-accent/40 bg-charcoal p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-strong">
              <Dumbbell size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[15px] font-semibold text-off-white">{cardWorkoutName}</p>
                <StatePill state={workoutTaskState} />
              </div>
              {cardSubtitle ? <p className="mt-0.5 text-xs text-neutral">{cardSubtitle}</p> : null}
              {scheduledWithoutDetail ? (
                <p className="mt-1 text-xs text-neutral">Full session detail isn&apos;t available yet.</p>
              ) : null}
            </div>
          </div>
          <Button className="mt-3 w-full" onClick={() => router.push("/today")}>
            Go to today&apos;s plan
            <ChevronRight size={16} />
          </Button>
        </div>
      </div>

      {unresolvedReviews.length > 0 ? (
        <div className="mt-4 rounded-[var(--radius-lg)] border border-warning/30 bg-warning-soft p-4">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-warning" />
            <p className="text-sm font-medium text-off-white">Awaiting {coachName}&apos;s review</p>
          </div>
          <ul className="mt-2 space-y-1 text-sm text-neutral">
            {unresolvedReviews.map((r) => (
              <li key={r.id}>{r.summary}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-5">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral">This week</p>
        <div className="space-y-2">
          {TRAINING_WEEK.filter((d) => d.dayOfWeek !== todayDayOfWeek).map((day) => (
            <div
              key={day.dayOfWeek}
              className="flex items-center justify-between rounded-[var(--radius-md)] border border-border bg-charcoal px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium text-off-white">{day.dayOfWeek}</p>
                <p className="text-xs text-neutral">
                  {day.type === "rest" ? "Rest day" : `${day.workoutName} — ${day.focus}`}
                </p>
              </div>
              <span className="text-xs text-neutral">{day.type === "rest" ? "Recovery" : "Preview"}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral">Last week</p>
        <div className="rounded-[var(--radius-md)] border border-border bg-charcoal px-4 py-3.5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-off-white">{LAST_WEEK_SUMMARY.weekLabel}</p>
            <span className="text-sm text-success">{LAST_WEEK_SUMMARY.completionPercent}% complete</span>
          </div>
          <p className="mt-1 text-sm text-neutral">{LAST_WEEK_SUMMARY.note}</p>
        </div>
      </div>

      <div className="mt-5">
        <CoachCard note={TRAINING_WEEKLY_NOTE} noteLabel={`${coachName}'s focus for this week`} />
      </div>
    </div>
  );
}
