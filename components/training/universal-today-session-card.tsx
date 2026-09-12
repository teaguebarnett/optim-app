"use client";

import { useRouter } from "next/navigation";
import { Dumbbell, BedDouble, CheckCircle2, PauseCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SurfaceShell } from "@/components/training/surface-shell";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { resolveScheduledSessionForStart } from "@/lib/workout/resolve-scheduled-session";
import type { DailyTaskState } from "@/lib/types";
import type { UniversalTrainingProgramContent } from "@/lib/training/types";

/**
 * Phase 6A — Training's dominant session surface for a real Supabase client
 * whose active assignment exists ONLY in the universal grammar (resistance,
 * continuous, or mixed content the legacy Workout/Exercise model can't
 * represent — see today-session-card.tsx's own branch into this
 * component). Deliberately a separate, simpler component rather than folded
 * into TodaySessionCard's many legacy-specific branches: it never touches
 * resolveWorkoutAvailabilityForDay (which would otherwise silently fall
 * back to the global demo catalog for a client with no legacy
 * assignedProgram — safe only for the genuinely assignment-less seeded demo
 * client that function's fallback was written for) or the legacy
 * WorkoutDetailsSheet preview, so the existing, thoroughly proven legacy
 * path is completely unaffected by this addition.
 *
 * A detailed pre-start preview sheet and a training-time picker for
 * universal content are reasonable, explicitly deferred follow-ups (see
 * this phase's completion report) — the primary see/open/execute/complete
 * flow this phase's acceptance case requires does not depend on either.
 */
export function UniversalTodaySessionCard({ assignedProgram, coachName }: { assignedProgram: UniversalTrainingProgramContent; coachName: string }) {
  const router = useRouter();
  const { state, dispatch, tasks, dailyTrainingPlan } = usePrototypeState();
  const session = state.workoutSession;
  const clientDeclaredRest = dailyTrainingPlan?.status === "rest_day";
  const workoutPillState: DailyTaskState = tasks.find((t) => t.id === "workout")?.state ?? "upcoming";

  const resolved = resolveScheduledSessionForStart({
    dateIso: state.dateIso,
    programEnrollment: state.programEnrollment,
    assignedProgram,
    clientDeclaredRest,
  });

  function handleStart() {
    if (session.status !== "in-progress") dispatch({ type: "START_WORKOUT" });
    router.push("/training/workout");
  }

  if (session.status === "in-progress") {
    return (
      <SurfaceShell icon={<Dumbbell size={22} />} title={session.resolvedSession?.name ?? "Training"} pillState={workoutPillState} meta={session.resolvedSession?.focus}>
        <p className="text-body text-off-white">Pick up right where you left off.</p>
        <Button className="mt-4 w-full" onClick={() => router.push("/training/workout")}>
          Continue session
        </Button>
      </SurfaceShell>
    );
  }

  if (session.status === "completed" || session.status === "ended-early" || session.status === "skipped") {
    const summary = session.summary;
    const endedEarly = session.status === "ended-early";
    const icon = session.status === "skipped" ? <XCircle size={22} /> : endedEarly ? <PauseCircle size={22} /> : <CheckCircle2 size={22} />;
    return (
      <SurfaceShell icon={icon} title={session.resolvedSession?.name ?? "Training"} pillState={workoutPillState} meta={session.resolvedSession?.focus}>
        {session.status === "skipped" ? (
          <p className="text-body text-off-white">Today&apos;s session was skipped.</p>
        ) : (
          <>
            {endedEarly ? (
              <p className="text-body text-off-white">Ended early — completed work is saved.</p>
            ) : summary ? (
              <p className="text-body text-off-white">{summary.headline}</p>
            ) : null}
            {summary ? <p className="mt-1 text-meta text-neutral">{summary.detail}</p> : null}
          </>
        )}
        {workoutPillState === "awaiting-review" ? (
          <p className="mt-3 text-meta text-warning">
            I&apos;ve organized this for {coachName}&apos;s review. {coachName} will make any programming decisions.
          </p>
        ) : null}
        <Button className="mt-4 w-full" variant="outline" onClick={() => router.push("/training/workout")}>
          Review session
        </Button>
      </SurfaceShell>
    );
  }

  if (resolved.reason === "rest_day") {
    return (
      <SurfaceShell icon={<BedDouble size={22} />} title="Rest day">
        <p className="text-body text-off-white">{clientDeclaredRest ? "Today is set as a rest day." : "Today is a scheduled rest day."}</p>
      </SurfaceShell>
    );
  }

  if (!resolved.session) {
    return (
      <SurfaceShell icon={<Dumbbell size={22} />} title="Training">
        <p className="text-body text-off-white">Nothing scheduled for today yet.</p>
        <p className="mt-1 text-meta text-neutral">Check with {coachName} if you have questions.</p>
      </SurfaceShell>
    );
  }

  const todaySession = resolved.session;
  const itemCount = todaySession.blocks.flatMap((b) => b.items).length;

  return (
    <SurfaceShell icon={<Dumbbell size={22} />} title={todaySession.name} pillState={workoutPillState} meta={todaySession.focus}>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-meta text-neutral">
        <span>{todaySession.estimatedDurationMin} min</span>
        <span aria-hidden="true">·</span>
        <span>
          {itemCount} {itemCount === 1 ? "exercise" : "exercises"}
        </span>
      </div>
      <div className="mt-4 flex gap-2">
        <Button className="flex-1" onClick={handleStart}>
          Start session
        </Button>
      </div>
    </SurfaceShell>
  );
}
