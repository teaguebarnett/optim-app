"use client";

import { Play, Pause, X, ChevronUp, ChevronDown, Plus } from "lucide-react";
import type { RestTimerState } from "@/hooks/use-rest-timer";
import { cn } from "@/lib/cn";

function formatSeconds(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function RestTimerBar({ timer }: { timer: RestTimerState }) {
  if (!timer.isActive) return null;

  const progressPercent = timer.totalSeconds > 0 ? ((timer.totalSeconds - timer.remainingSeconds) / timer.totalSeconds) * 100 : 0;

  if (timer.isMinimized) {
    return (
      <button
        onClick={timer.restore}
        className={cn(
          "fixed bottom-24 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border px-4 py-2.5 shadow-[var(--shadow-subtle)] backdrop-blur-md",
          timer.isFinished ? "border-success/40 bg-success-soft" : "border-accent/40 bg-charcoal/95"
        )}
      >
        <span className={cn("text-sm font-semibold tabular-nums", timer.isFinished ? "text-success" : "text-accent-strong")}>
          {timer.isFinished ? "Rest complete" : formatSeconds(timer.remainingSeconds)}
        </span>
        <ChevronUp size={14} className="text-neutral" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-24 left-1/2 z-40 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-[var(--radius-lg)] border border-accent/30 bg-charcoal/95 p-4 shadow-[var(--shadow-subtle)] backdrop-blur-md pc-animate-in">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-neutral">{timer.isFinished ? "Rest complete" : "Resting"}</p>
        <div className="flex items-center gap-1">
          <button onClick={timer.minimize} aria-label="Minimize rest timer" className="flex h-8 w-8 items-center justify-center rounded-full text-neutral hover:bg-white/5">
            <ChevronDown size={16} />
          </button>
          <button onClick={timer.dismiss} aria-label="Close rest timer" className="flex h-8 w-8 items-center justify-center rounded-full text-neutral hover:bg-white/5">
            <X size={16} />
          </button>
        </div>
      </div>

      <p
        className={cn(
          "mt-1 text-4xl font-semibold tabular-nums",
          timer.isFinished ? "text-success" : "text-off-white"
        )}
      >
        {formatSeconds(timer.remainingSeconds)}
      </p>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-1000 ease-linear"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <div className="mt-3 flex gap-2">
        {!timer.isFinished && (
          <button
            onClick={timer.isPaused ? timer.resume : timer.pause}
            className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border border-border-strong text-sm font-medium text-off-white"
          >
            {timer.isPaused ? <Play size={14} /> : <Pause size={14} />}
            {timer.isPaused ? "Resume" : "Pause"}
          </button>
        )}
        <button
          onClick={timer.addThirtySeconds}
          className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border border-border-strong text-sm font-medium text-off-white"
        >
          <Plus size={14} />
          30s
        </button>
        <button
          onClick={timer.skip}
          className="flex h-10 flex-1 items-center justify-center rounded-[var(--radius-sm)] border border-border-strong text-sm font-medium text-off-white"
        >
          Skip
        </button>
      </div>
    </div>
  );
}
