"use client";

import { useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/cn";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { useHistoryDayPicker } from "@/hooks/use-historical-day-review";
import { trainingWeekEntryForDay } from "@/lib/mock-data";
import { addDaysToLocalDate, compareLocalDates, localDateDayOfWeek, startOfLocalWeek } from "@/lib/shared/local-date";

const ITEM_WIDTH = 52;
const GAP = 10;

type DotVariant = "rest" | "completed" | "attention" | "neutral";

interface CarouselDay {
  dateIso: string;
  label: string;
  dayNumber: string;
  isToday: boolean;
  isSelected: boolean;
  dot: DotVariant;
}

/**
 * Training's centered day carousel — Phase 4.4B-1. Always exactly the seven
 * real calendar dates of the client's current local week (never fabricated,
 * never an infinite loop — see startOfLocalWeek/addDaysToLocalDate). Native
 * CSS scroll-snap plus a debounced settle-read (mirrors the identical
 * pattern in components/today/training-time-wheel.tsx's WheelColumn)
 * provides the physical swipe/scroll-driven selection; clicking a day or
 * calling back-to-today drives centering programmatically via
 * scrollIntoView. Selecting a day here only ever updates local page state —
 * it never touches dateIso, dailyTrainingPlan, workoutSession, or history.
 */
export function DayCarousel({
  selectedDateIso,
  onSelect,
}: {
  selectedDateIso: string;
  onSelect: (dateIso: string) => void;
}) {
  const { state, tasks } = usePrototypeState();
  const { entries: historyEntries } = useHistoryDayPicker(7);
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const scrollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressScrollRead = useRef(false);

  const weekStartIso = startOfLocalWeek(state.dateIso, state.programEnrollment.weekStartsOn);
  const workoutTaskState = tasks.find((t) => t.id === "workout")?.state;
  const todaysTrainingPlanIsRest = state.dailyTrainingPlan?.status === "rest_day";
  const todaysTrainingPlanIsResponded = !!state.dailyTrainingPlan && state.dailyTrainingPlan.status !== "rest_day";

  const days: CarouselDay[] = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const dateIso = addDaysToLocalDate(weekStartIso, i);
      const dayOfWeek = localDateDayOfWeek(dateIso);
      const entry = trainingWeekEntryForDay(dayOfWeek);
      const comparison = compareLocalDates(dateIso, state.dateIso);
      const isToday = comparison === 0;

      let dot: DotVariant = "neutral";
      if (entry?.type === "rest" && !(isToday && todaysTrainingPlanIsResponded)) {
        dot = "rest";
      } else if (isToday && todaysTrainingPlanIsRest) {
        dot = "rest";
      } else if (isToday) {
        if (workoutTaskState === "completed") dot = "completed";
        else if (workoutTaskState === "partially-completed" || workoutTaskState === "awaiting-review") dot = "attention";
      } else if (comparison < 0) {
        const historyStatus = historyEntries.find((h) => h.dateIso === dateIso)?.status;
        if (historyStatus === "complete") dot = "completed";
        else if (historyStatus === "partial" || historyStatus === "missed") dot = "attention";
      }

      return {
        dateIso,
        label: entry?.label ?? dayOfWeek.slice(0, 3),
        dayNumber: String(Number(dateIso.split("-")[2])),
        isToday,
        isSelected: dateIso === selectedDateIso,
        dot,
      };
    });
  }, [weekStartIso, state.dateIso, selectedDateIso, workoutTaskState, todaysTrainingPlanIsRest, todaysTrainingPlanIsResponded, historyEntries]);

  useEffect(() => {
    const el = itemRefs.current[selectedDateIso];
    if (!el) return;
    suppressScrollRead.current = true;
    el.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    const timeout = setTimeout(() => {
      suppressScrollRead.current = false;
    }, 450);
    return () => clearTimeout(timeout);
  }, [selectedDateIso]);

  function handleScroll() {
    if (suppressScrollRead.current) return;
    if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
    scrollTimeout.current = setTimeout(() => {
      const container = containerRef.current;
      if (!container) return;
      const containerCenter = container.scrollLeft + container.clientWidth / 2;
      let closest: string | null = null;
      let closestDistance = Infinity;
      for (const day of days) {
        const el = itemRefs.current[day.dateIso];
        if (!el) continue;
        const elCenter = el.offsetLeft + el.offsetWidth / 2;
        const distance = Math.abs(elCenter - containerCenter);
        if (distance < closestDistance) {
          closestDistance = distance;
          closest = day.dateIso;
        }
      }
      if (closest && closest !== selectedDateIso) onSelect(closest);
    }, 120);
  }

  useEffect(() => {
    return () => {
      if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain scroll-smooth [&::-webkit-scrollbar]:hidden"
      style={{ scrollbarWidth: "none", paddingInline: `calc(50% - ${ITEM_WIDTH / 2}px)`, gap: GAP }}
    >
      {days.map((day) => (
        <button
          key={day.dateIso}
          ref={(el) => {
            itemRefs.current[day.dateIso] = el;
          }}
          type="button"
          onClick={() => onSelect(day.dateIso)}
          aria-current={day.isSelected ? "date" : undefined}
          aria-label={`${day.label}, ${day.dayNumber}${day.isToday ? " · today" : ""}`}
          className={cn(
            "flex shrink-0 snap-center flex-col items-center justify-center gap-1.5 rounded-[var(--radius-md)] py-2.5 transition-all duration-200",
            day.isSelected ? "bg-accent shadow-[var(--shadow-subtle)]" : "hover:bg-off-white/[0.04]"
          )}
          style={{ width: ITEM_WIDTH }}
        >
          <span
            className={cn(
              "text-label",
              day.isSelected ? "text-on-accent/75" : day.isToday ? "text-brass-strong" : "text-neutral"
            )}
          >
            {day.label}
          </span>
          <span className={cn("text-heading", day.isSelected ? "text-on-accent" : "text-off-white")}>{day.dayNumber}</span>
          <DayDot variant={day.dot} selected={day.isSelected} />
        </button>
      ))}
    </div>
  );
}

function DayDot({ variant, selected }: { variant: DotVariant; selected: boolean }) {
  const color = selected
    ? "bg-on-accent/70"
    : variant === "completed"
      ? "bg-success"
      : variant === "attention"
        ? "bg-warning"
        : variant === "rest"
          ? "bg-off-white/25"
          : "bg-off-white/15";
  return <span className={cn("h-1.5 w-1.5 rounded-full", color)} aria-hidden="true" />;
}
