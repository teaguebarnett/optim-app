"use client";

// Correction pass — replaces rigid numeric selectors (a +/- stepper with a
// raw text field, or a small grid of numbered tiles) with the same smooth,
// fading, scroll-snap wheel interaction OPTIM's approved training-time
// picker already established. Reuses that picker's exact generalized
// primitives (WheelColumn/WheelFrame, see components/workout/live/
// wheel-column.tsx — already extracted once before for the RPE wheel and
// the live workout's weight/reps "performed differently" adjusters) rather
// than a fourth re-implementation. This is the higher-level, min/max/step
// (or explicit values) numeric API those callers didn't need but a plain
// bounded-value field (pain rating, cardio duration, body weight) does.
import { WheelColumn, WheelFrame } from "@/components/workout/live/wheel-column";
import { buildStepRange, nearestValueIndex } from "@/lib/numeric-wheel";

export interface NumberWheelProps {
  id: string;
  /** Accessible field label — used as the scrollable column's aria-label. */
  fieldLabel: string;
  value: number;
  onChange: (value: number) => void;
  /** Either an explicit ascending list of selectable values, or a
   * min/max/step range to derive them from — never both. */
  values?: number[];
  min?: number;
  max?: number;
  step?: number;
  /** A short unit/context tag shown once beside the selection band (e.g.
   * "lb", "min") — never repeated per row, which would be visual noise
   * across a long wheel. */
  unit?: string;
  disabled?: boolean;
  /** Per-row display text; defaults to the plain number. */
  formatValue?: (value: number) => string;
}

/**
 * A vertical, magnetically-snapping numeric wheel — the one reusable control
 * for every bounded numeric client selection in OPTIM (pain rating, cardio
 * duration, body weight). Fully controlled: reports a value only once
 * scrolling settles onto a valid row (WheelColumn's own debounced
 * scroll-snap read-back — see that file), so a client scrolling past
 * several values in transit never commits an intermediate one, and dragging
 * through the wheel is never itself a submission — callers keep using
 * whatever confirm action they already had (Save, Complete, Submit).
 * Reopening a picker that remounts this component (e.g. a Sheet/overlay)
 * naturally re-centers on `value` since WheelColumn reads its starting
 * index once on mount, matching the training-time picker's own contract.
 */
export function NumberWheel({
  id,
  fieldLabel,
  value,
  onChange,
  values: explicitValues,
  min,
  max,
  step = 1,
  unit,
  disabled = false,
  formatValue,
}: NumberWheelProps) {
  const values = explicitValues ?? (min !== undefined && max !== undefined ? buildStepRange(min, max, step) : []);
  if (values.length === 0) return null;

  const lo = values[0];
  const hi = values[values.length - 1];
  const clampedValue = Math.min(hi, Math.max(lo, value));
  const nearestIndex = nearestValueIndex(values, clampedValue);

  if (disabled) {
    return (
      <div
        role="group"
        aria-label={fieldLabel}
        className="flex h-11 items-center justify-center rounded-[var(--radius-md)] bg-surface px-4 opacity-50"
      >
        <span className="text-heading tabular-nums text-neutral">
          {formatValue ? formatValue(clampedValue) : clampedValue}
        </span>
        {unit ? <span className="ml-1.5 text-meta text-neutral">{unit}</span> : null}
      </div>
    );
  }

  return (
    <div className="relative">
      <WheelFrame>
        <WheelColumn
          id={id}
          ariaLabel={fieldLabel}
          values={values.map((v) => (formatValue ? formatValue(v) : String(v)))}
          index={nearestIndex}
          onChange={(i) => onChange(values[i])}
        />
      </WheelFrame>
      {unit ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-meta text-neutral"
        >
          {unit}
        </span>
      ) : null}
    </div>
  );
}
