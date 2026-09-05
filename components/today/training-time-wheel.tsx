"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";

const ROW_HEIGHT = 44;
const VISIBLE_ROWS = 5;
const PAD_ROWS = Math.floor(VISIBLE_ROWS / 2);
const PAD_HEIGHT = ROW_HEIGHT * PAD_ROWS;

// Continuous depth fade for the wheel — a static mask tied to the column's
// own box (not to scroll offset), so it reads as a physical vignette that
// stays put while rows pass behind it, rather than a value recomputed only
// once scrolling settles. Stops land on each row's vertical center: 50% is
// the selected row (full opacity), 30%/70% are one row away (~65-70%),
// 10%/90% are two rows away (~30%), fading to 0 at the outer edge.
const DEPTH_MASK =
  "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.35) 12%, rgba(0,0,0,0.68) 28%, rgba(0,0,0,1) 50%, rgba(0,0,0,0.68) 72%, rgba(0,0,0,0.35) 88%, transparent 100%)";

interface WheelColumnProps {
  values: string[];
  initialIndex: number;
  ariaLabel: string;
  onChange: (index: number) => void;
}

/**
 * One Apple-style precision scroll wheel — CSS scroll-snap does the actual
 * snapping (native touch/trackpad/mouse-wheel scrolling, no synthetic drag
 * handling), this just reads back which row ended up centered and reports
 * it. Only ever programmatically scrolls in response to a real user
 * action on THIS column (a tap, an arrow key, or the settle after a
 * scroll) — never from an external prop change — so it can never fight an
 * in-progress user gesture. Every open of the training-time Sheet fully
 * unmounts and remounts this column (see ui/sheet.tsx returning null while
 * closed), which is what lets `initialIndex` be read only once on mount.
 */
function WheelColumn({ values, initialIndex, ariaLabel, onChange }: WheelColumnProps) {
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    containerRef.current?.scrollTo({ top: initialIndex * ROW_HEIGHT, behavior: "auto" });
    // Intentionally mount-only — see the component doc comment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
    };
  }, []);

  function commit(index: number, smooth: boolean) {
    const clamped = Math.min(values.length - 1, Math.max(0, index));
    setActiveIndex(clamped);
    onChange(clamped);
    containerRef.current?.scrollTo({ top: clamped * ROW_HEIGHT, behavior: smooth ? "smooth" : "auto" });
  }

  function handleScroll() {
    if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
    // Debounced "scroll end" — reads the settled position once the user
    // stops scrolling rather than on every intermediate scroll event.
    scrollTimeout.current = setTimeout(() => {
      const el = containerRef.current;
      if (!el) return;
      commit(Math.round(el.scrollTop / ROW_HEIGHT), true);
    }, 120);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      commit(activeIndex - 1, true);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      commit(activeIndex + 1, true);
    }
  }

  return (
    <div
      ref={containerRef}
      role="listbox"
      aria-label={ariaLabel}
      tabIndex={0}
      onScroll={handleScroll}
      onKeyDown={handleKeyDown}
      className="relative flex-1 snap-y snap-mandatory overflow-y-scroll overscroll-contain outline-none [&::-webkit-scrollbar]:hidden"
      style={{
        height: ROW_HEIGHT * VISIBLE_ROWS,
        scrollbarWidth: "none",
        maskImage: DEPTH_MASK,
        WebkitMaskImage: DEPTH_MASK,
      }}
    >
      <div style={{ height: PAD_HEIGHT }} aria-hidden="true" />
      {values.map((label, i) => {
        const isSelected = i === activeIndex;
        return (
          <div
            key={label}
            role="option"
            aria-selected={isSelected}
            onClick={() => commit(i, true)}
            className="flex snap-center items-center justify-center"
            style={{ height: ROW_HEIGHT }}
          >
            <span
              className={cn(
                "text-heading tabular-nums transition-colors duration-150",
                isSelected ? "font-semibold text-off-white" : "font-medium text-neutral"
              )}
            >
              {label}
            </span>
          </div>
        );
      })}
      <div style={{ height: PAD_HEIGHT }} aria-hidden="true" />
    </div>
  );
}

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));
const PERIODS = ["AM", "PM"];

/**
 * OPTIM's own precision time picker — three independently scrolling,
 * snapping columns (hour / minute / AM-PM) sharing one selection band,
 * replacing the browser-native <input type="time"> as the visible
 * interaction. Fully controlled: `value`/`onChange` use the exact same
 * 24-hour "HH:MM" string the rest of the app already works with (see
 * training-time-card.tsx's draftTime and lib/planning/training-plan.ts),
 * so nothing about validation, save, or downstream meal-schedule
 * recalculation changes — this only replaces how the value gets picked.
 * Preserves the product's real 1-minute granularity (setTrainingTime never
 * rounds), not an invented 5- or 15-minute step.
 */
export function TrainingTimeWheel({ value, onChange }: { value: string; onChange: (time24: string) => void }) {
  const [hourStr, minuteStr] = value.split(":");
  const hour24 = Number(hourStr);
  const initialMinute = Number(minuteStr);
  const initialPeriodIndex = hour24 >= 12 ? 1 : 0;
  const initialHour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const initialHourIndex = initialHour12 - 1;

  const hourIndex = useRef(initialHourIndex);
  const minuteIndex = useRef(initialMinute);
  const periodIndex = useRef(initialPeriodIndex);

  function commitTime() {
    const hour12 = hourIndex.current + 1;
    const hour24Value = periodIndex.current === 1 ? (hour12 % 12) + 12 : hour12 % 12;
    onChange(`${String(hour24Value).padStart(2, "0")}:${String(minuteIndex.current).padStart(2, "0")}`);
  }

  return (
    <div className="relative rounded-[var(--radius-md)] bg-surface">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-1/2 h-11 -translate-y-1/2 rounded-[var(--radius-md)] bg-surface-raised"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 z-10 h-6 rounded-t-[var(--radius-md)] bg-gradient-to-b from-surface to-transparent"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-6 rounded-b-[var(--radius-md)] bg-gradient-to-t from-surface to-transparent"
      />

      <div className="relative flex items-stretch px-2">
        <WheelColumn
          values={HOURS}
          initialIndex={initialHourIndex}
          ariaLabel="Hour"
          onChange={(i) => {
            hourIndex.current = i;
            commitTime();
          }}
        />
        <WheelColumn
          values={MINUTES}
          initialIndex={initialMinute}
          ariaLabel="Minute"
          onChange={(i) => {
            minuteIndex.current = i;
            commitTime();
          }}
        />
        <WheelColumn
          values={PERIODS}
          initialIndex={initialPeriodIndex}
          ariaLabel="AM or PM"
          onChange={(i) => {
            periodIndex.current = i;
            commitTime();
          }}
        />
      </div>
    </div>
  );
}
