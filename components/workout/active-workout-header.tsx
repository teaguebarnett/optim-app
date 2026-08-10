"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Info } from "lucide-react";
import { ProgressBar } from "@/components/ui/progress-bar";
import { PUSH_WORKOUT } from "@/lib/mock-data";

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

interface ActiveWorkoutHeaderProps {
  startedAtIso?: string;
  currentExerciseIndex: number;
  totalExercises: number;
  completedCount: number;
  onOpenOverview: () => void;
}

export function ActiveWorkoutHeader({
  startedAtIso,
  currentExerciseIndex,
  totalExercises,
  completedCount,
  onOpenOverview,
}: ActiveWorkoutHeaderProps) {
  const router = useRouter();
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const immediate = setTimeout(() => setNow(Date.now()), 0);
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearTimeout(immediate);
      clearInterval(interval);
    };
  }, []);

  const elapsedMs = startedAtIso && now ? now - new Date(startedAtIso).getTime() : 0;

  return (
    <div className="sticky top-0 z-30 border-b border-border bg-near-black/95 px-4 py-3 pc-safe-top backdrop-blur-md">
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push("/today")}
          aria-label="Exit workout"
          className="flex h-9 w-9 items-center justify-center rounded-full text-neutral hover:bg-white/5 hover:text-off-white"
        >
          <X size={18} />
        </button>
        <div className="text-center">
          <p className="text-sm font-semibold text-off-white">{PUSH_WORKOUT.name}</p>
          <p className="text-xs tabular-nums text-neutral">{formatElapsed(elapsedMs)}</p>
        </div>
        <button
          onClick={onOpenOverview}
          aria-label="View workout overview"
          className="flex h-9 w-9 items-center justify-center rounded-full text-neutral hover:bg-white/5 hover:text-off-white"
        >
          <Info size={18} />
        </button>
      </div>
      <div className="mt-2.5">
        <ProgressBar percent={(completedCount / totalExercises) * 100} />
        <p className="mt-1 text-xs text-neutral">
          Exercise {currentExerciseIndex + 1} of {totalExercises}
        </p>
      </div>
    </div>
  );
}
