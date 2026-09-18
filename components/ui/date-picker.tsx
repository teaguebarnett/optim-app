"use client";

import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import {
  addDaysToLocalDate,
  formatLongDateLabel,
  isLocalDateBefore,
  localDateDayOfWeek,
  resolveBrowserTimeZone,
  resolveClientLocalDateIso,
} from "@/lib/shared/local-date";

/**
 * Replaces the browser's native `<input type="date">` — Phase 5.2's own
 * words for it were "clunky and visually inconsistent". Always stores and
 * emits a local date-only YYYY-MM-DD string (see lib/shared/local-date.ts):
 * never a real instant, so there's no UTC-conversion day-shift risk.
 *
 * Desktop opens a small anchored popover; mobile opens the shared bottom
 * Sheet — chosen once, at the moment the "Choose date" trigger is pressed,
 * rather than tracked live across resize (this is a coach setup form, not a
 * page that gets resized mid-interaction).
 */

function todayIso(): string {
  return resolveClientLocalDateIso(new Date(), resolveBrowserTimeZone());
}

function nextMondayIso(fromIso: string): string {
  let candidate = addDaysToLocalDate(fromIso, 1);
  while (localDateDayOfWeek(candidate) !== "Monday") {
    candidate = addDaysToLocalDate(candidate, 1);
  }
  return candidate;
}

function isoOf(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function firstWeekdayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
}

function monthLabel(year: number, month: number): string {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  });
}

const WEEKDAY_HEADERS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function CalendarMonth({
  focusedIso,
  selectedIso,
  minIso,
  onFocusChange,
  onSelect,
  onEscape,
}: {
  focusedIso: string;
  selectedIso: string;
  minIso: string;
  onFocusChange: (iso: string) => void;
  onSelect: (iso: string) => void;
  onEscape: () => void;
}) {
  const year = Number(focusedIso.slice(0, 4));
  const month = Number(focusedIso.slice(5, 7));
  const today = useMemo(() => todayIso(), []);
  const cellRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [direction, setDirection] = useState<"forward" | "back">("forward");

  const total = daysInMonth(year, month);
  const startWeekday = firstWeekdayOfMonth(year, month);
  const cells: (string | null)[] = [
    ...Array.from({ length: startWeekday }, () => null),
    ...Array.from({ length: total }, (_, i) => isoOf(year, month, i + 1)),
  ];

  useEffect(() => {
    cellRefs.current.get(focusedIso)?.focus();
  }, [focusedIso]);

  const minMonthFirst = isoOf(Number(minIso.slice(0, 4)), Number(minIso.slice(5, 7)), 1);
  const previousMonthYear = month - 1 <= 0 ? year - 1 : year;
  const previousMonth = month - 1 <= 0 ? 12 : month - 1;
  const canGoToPreviousMonth = !isLocalDateBefore(isoOf(previousMonthYear, previousMonth, 1), minMonthFirst);

  function goToMonth(deltaMonths: number) {
    let y = year;
    let m = month + deltaMonths;
    while (m < 1) {
      m += 12;
      y -= 1;
    }
    while (m > 12) {
      m -= 12;
      y += 1;
    }
    const targetFirst = isoOf(y, m, 1);
    if (isLocalDateBefore(targetFirst, minMonthFirst)) return;
    setDirection(deltaMonths >= 0 ? "forward" : "back");
    onFocusChange(targetFirst);
  }

  function moveFocus(deltaDays: number) {
    const next = addDaysToLocalDate(focusedIso, deltaDays);
    if (isLocalDateBefore(next, minIso)) return;
    onFocusChange(next);
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => goToMonth(-1)}
          disabled={!canGoToPreviousMonth}
          aria-label="Previous month"
          className="flex h-9 w-9 items-center justify-center rounded-full text-neutral transition-all active:scale-90 hover:bg-accent-soft hover:text-accent-fg disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
          style={{ transitionDuration: "var(--motion-fast)" }}
        >
          <ChevronLeft size={18} />
        </button>
        <p className="text-heading text-off-white">{monthLabel(year, month)}</p>
        <button
          type="button"
          onClick={() => goToMonth(1)}
          aria-label="Next month"
          className="flex h-9 w-9 items-center justify-center rounded-full text-neutral transition-all active:scale-90 hover:bg-accent-soft hover:text-accent-fg"
          style={{ transitionDuration: "var(--motion-fast)" }}
        >
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-meta font-semibold text-neutral">
        {WEEKDAY_HEADERS.map((d, i) => (
          <div key={i} className="flex h-7 items-center justify-center">
            {d}
          </div>
        ))}
      </div>
      <div
        key={`${year}-${month}`}
        role="grid"
        aria-label={monthLabel(year, month)}
        className={cn("grid grid-cols-7 gap-1", direction === "forward" ? "pc-enter-forward" : "pc-enter-back")}
        onKeyDown={(e) => {
          switch (e.key) {
            case "ArrowLeft":
              e.preventDefault();
              moveFocus(-1);
              break;
            case "ArrowRight":
              e.preventDefault();
              moveFocus(1);
              break;
            case "ArrowUp":
              e.preventDefault();
              moveFocus(-7);
              break;
            case "ArrowDown":
              e.preventDefault();
              moveFocus(7);
              break;
            case "Enter":
            case " ":
              e.preventDefault();
              if (!isLocalDateBefore(focusedIso, minIso)) onSelect(focusedIso);
              break;
            case "Escape":
              e.preventDefault();
              e.stopPropagation();
              onEscape();
              break;
          }
        }}
      >
        {cells.map((iso, idx) => {
          if (!iso) return <div key={`empty-${idx}`} aria-hidden="true" />;
          const disabled = isLocalDateBefore(iso, minIso);
          const isSelected = iso === selectedIso;
          const isToday = iso === today;
          const isFocusTarget = iso === focusedIso;
          return (
            <button
              key={iso}
              ref={(el) => {
                if (el) cellRefs.current.set(iso, el);
                else cellRefs.current.delete(iso);
              }}
              type="button"
              role="gridcell"
              tabIndex={isFocusTarget ? 0 : -1}
              disabled={disabled}
              aria-current={isToday ? "date" : undefined}
              aria-selected={isSelected}
              onClick={() => !disabled && onSelect(iso)}
              onFocus={() => onFocusChange(iso)}
              className={cn(
                "flex h-11 w-11 items-center justify-center rounded-full text-sm font-medium transition-all active:scale-90",
                disabled && "cursor-not-allowed text-neutral/30",
                !disabled && !isSelected && "text-off-white hover:bg-accent-soft",
                isSelected && "bg-accent font-semibold text-on-accent shadow-[var(--shadow-subtle)]",
                !isSelected && isToday && "border-2 border-accent font-semibold text-accent-fg"
              )}
              style={{ transitionDuration: "var(--motion-fast)" }}
            >
              {Number(iso.slice(-2))}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const PresetOption = forwardRef<HTMLButtonElement, { active: boolean; label: string; onClick: () => void }>(
  function PresetOption({ active, label, onClick }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={cn(
          "flex h-11 w-full items-center justify-center rounded-[var(--radius-sm)] border-2 px-2 text-center text-sm font-semibold transition-all active:scale-[0.97]",
          active ? "border-accent bg-selected-bg text-accent-fg" : "border-border-strong bg-surface-input text-off-white hover:border-accent/40"
        )}
        style={{ transitionDuration: "var(--motion-fast)" }}
      >
        {label}
      </button>
    );
  }
);

interface StartDateFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

export function StartDateField({ label, value, onChange }: StartDateFieldProps) {
  const min = useMemo(() => todayIso(), []);
  const nextMonday = useMemo(() => nextMondayIso(min), [min]);
  const [pickerMode, setPickerMode] = useState<"closed" | "popover" | "sheet">("closed");
  const [focusedIso, setFocusedIso] = useState(value);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const isToday = value === min;
  const isNextMonday = value === nextMonday;
  const isCustom = !isToday && !isNextMonday;

  function closePicker(returnFocus: boolean) {
    setPickerMode("closed");
    if (returnFocus) triggerRef.current?.focus();
  }

  function openPicker() {
    setFocusedIso(isLocalDateBefore(value, min) ? min : value);
    const isDesktop = typeof window !== "undefined" && window.matchMedia("(min-width: 640px)").matches;
    setPickerMode(isDesktop ? "popover" : "sheet");
  }

  function handleSelect(iso: string) {
    onChange(iso);
    closePicker(true);
  }

  useEffect(() => {
    if (pickerMode !== "popover") return;
    function onDocMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      closePicker(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [pickerMode]);

  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-off-white">{label}</p>
      <div className="grid grid-cols-3 gap-2">
        <PresetOption active={isToday} label="Today" onClick={() => onChange(min)} />
        <PresetOption active={isNextMonday} label="Next Monday" onClick={() => onChange(nextMonday)} />
        <div className="relative">
          <PresetOption ref={triggerRef} active={isCustom} label="Choose date" onClick={openPicker} />
          {pickerMode === "popover" ? (
            <div
              ref={popoverRef}
              className="pc-animate-in absolute right-0 top-full z-20 mt-2 w-80 rounded-[var(--radius-lg)] border border-border-strong bg-charcoal p-4 shadow-[var(--shadow-elevated)]"
            >
              <CalendarMonth
                focusedIso={focusedIso}
                selectedIso={value}
                minIso={min}
                onFocusChange={setFocusedIso}
                onSelect={handleSelect}
                onEscape={() => closePicker(true)}
              />
            </div>
          ) : null}
        </div>
      </div>
      <p className="mt-2.5 text-sm font-medium text-off-white">{formatLongDateLabel(value)}</p>

      {pickerMode === "sheet" ? (
        <Sheet open onClose={() => closePicker(true)} title="Choose a date">
          <CalendarMonth
            focusedIso={focusedIso}
            selectedIso={value}
            minIso={min}
            onFocusChange={setFocusedIso}
            onSelect={handleSelect}
            onEscape={() => closePicker(true)}
          />
        </Sheet>
      ) : null}
    </div>
  );
}
