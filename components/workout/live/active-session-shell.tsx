"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X, ListChecks } from "lucide-react";
import { ProgressBar } from "@/components/ui/progress-bar";
import { SessionProgressDrawer } from "@/components/workout/live/session-progress-drawer";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import type { WorkoutSession } from "@/lib/types";

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Phase 4.4B-2 §B — the active workout shell: one safe exit control, the
 * session name, real elapsed time, and compact overall progress with access
 * to the full sequence through a drawer rather than a permanent list.
 * Route-entered/left telemetry is dispatched here since this is the one
 * component mounted for exactly as long as the client is actually on the
 * live route.
 */
export function ActiveSessionShell({ session, children }: { session: WorkoutSession; children: React.ReactNode }) {
  const router = useRouter();
  const { dispatch } = usePrototypeState();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    dispatch({ type: "WORKOUT_ROUTE_ENTERED" });
    return () => {
      dispatch({ type: "WORKOUT_ROUTE_LEFT" });
    };
    // Dispatch is stable across the reducer's lifetime; intentionally
    // mount/unmount-only so this never fires mid-session on unrelated
    // re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const immediate = setTimeout(() => setNow(Date.now()), 0);
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearTimeout(immediate);
      clearInterval(interval);
    };
  }, []);

  const elapsedMs = session.startedAtIso && now ? now - new Date(session.startedAtIso).getTime() : 0;
  const totalExercises = session.resolvedWorkout?.exercises.length ?? 0;
  const resolvedCount = totalExercises - session.exerciseQueue.length;

  return (
    <div className="pb-8">
      <div className="sticky top-0 z-30 border-b border-border bg-near-black/95 px-4 py-3 pc-safe-top backdrop-blur-md">
        <div className="flex items-center justify-between">
          <button
            onClick={() => router.push("/today")}
            aria-label="Exit workout"
            className="flex h-9 w-9 items-center justify-center rounded-full text-neutral hover:bg-off-white/5 hover:text-off-white"
          >
            <X size={18} />
          </button>
          <div className="text-center">
            <p className="text-sm font-semibold text-off-white">{session.resolvedWorkout?.name ?? "Workout"}</p>
            <p className="text-xs tabular-nums text-neutral">{formatElapsed(elapsedMs)}</p>
          </div>
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="View session progress"
            className="flex h-9 w-9 items-center justify-center rounded-full text-neutral hover:bg-off-white/5 hover:text-off-white"
          >
            <ListChecks size={18} />
          </button>
        </div>
        <div className="mt-2.5">
          <ProgressBar percent={totalExercises > 0 ? (resolvedCount / totalExercises) * 100 : 0} />
          <p className="mt-1 text-xs text-neutral">
            Exercise {Math.min(resolvedCount + 1, totalExercises)} of {totalExercises}
          </p>
        </div>
      </div>

      <div className="px-4 py-4">{children}</div>

      <SessionProgressDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} session={session} />
    </div>
  );
}
