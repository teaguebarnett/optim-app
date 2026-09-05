"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";

const ROW_HEIGHT = 44;
const VISIBLE_ROWS = 5;
const PAD_ROWS = Math.floor(VISIBLE_ROWS / 2);
const PAD_HEIGHT = ROW_HEIGHT * PAD_ROWS;

// Same continuous depth fade used by the approved training-time picker (see
// components/today/training-time-wheel.tsx) — a static mask tied to the
// column's own box, not to scroll offset, so it reads as a physical
// vignette rather than something recomputed only once scrolling settles.
const DEPTH_MASK =
  "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.35) 12%, rgba(0,0,0,0.68) 28%, rgba(0,0,0,1) 50%, rgba(0,0,0,0.68) 72%, rgba(0,0,0,0.35) 88%, transparent 100%)";

interface WheelColumnProps {
  values: string[];
  index: number;
  onChange: (index: number) => void;
  ariaLabel: string;
  id?: string;
}

/**
 * One Apple-style precision scroll wheel, generalized from
 * components/today/training-time-wheel.tsx's WheelColumn (Phase 4.4B-2)
 * so the live workout's RPE selector and "performed differently" numeric
 * adjusters share the exact same smooth, fading, scroll-snap interaction
 * instead of three independent re-implementations. Fully controlled —
 * `index`/`onChange` — so the caller (RpeWheel, NumericWheel) owns the
 * actual value mapping; this component only ever knows about row
 * positions. CSS scroll-snap does the real snapping; this just reads back
 * which row ended up centered and reports it, and only ever
 * programmatically scrolls in response to a real user action on THIS
 * column or an external `index` change from the caller (e.g. resetting for
 * a new set — see RpeWheel's key-remount pattern instead, which is
 * preferred over relying on this prop-driven scroll for a hard reset).
 */
export function WheelColumn({ values, index, onChange, ariaLabel, id }: WheelColumnProps) {
  const [activeIndex, setActiveIndex] = useState(index);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    containerRef.current?.scrollTo({ top: index * ROW_HEIGHT, behavior: "auto" });
    // Intentionally mount-only — see the component doc comment. Callers
    // that need to reset the value should remount via `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
    };
  }, []);

  function commit(nextIndex: number, smooth: boolean) {
    const clamped = Math.min(values.length - 1, Math.max(0, nextIndex));
    setActiveIndex(clamped);
    onChange(clamped);
    containerRef.current?.scrollTo({ top: clamped * ROW_HEIGHT, behavior: smooth ? "smooth" : "auto" });
  }

  function handleScroll() {
    if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
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
      id={id}
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

/** The shared visual frame (selection band + top/bottom fade) one or more
 * WheelColumns sit inside — matches training-time-wheel.tsx's frame
 * exactly, so the RPE/weight/reps wheels read as the same control family. */
export function WheelFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative rounded-[var(--radius-md)] bg-surface">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-1/2 h-11 -translate-y-1/2 rounded-[var(--radius-md)] border border-accent/25 bg-surface-raised"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 z-10 h-6 rounded-t-[var(--radius-md)] bg-gradient-to-b from-surface to-transparent"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-6 rounded-b-[var(--radius-md)] bg-gradient-to-t from-surface to-transparent"
      />
      <div className="relative flex items-stretch px-2">{children}</div>
    </div>
  );
}
