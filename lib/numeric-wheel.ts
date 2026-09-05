// Correction pass — pure numeric-wheel math backing components/ui/
// number-wheel.tsx and the morning-weight two-column composite (see
// components/today/tasks/morning-weight-task.tsx). Deliberately
// dependency-free (no React, no "@/" self-imports) so it can be unit-tested
// directly with `node --experimental-strip-types`, the same convention as
// every other lib/* verify script — the .tsx component files themselves
// can't be, since they resolve the "@/" path alias only Next's bundler
// understands. Both callers derive their selectable rows and snap-to-value
// index through here so the range/step math can never drift apart between
// the two.

/** The ascending list of selectable values for a min/max/step wheel column.
 * Scales to integers for the loop so a fractional step like 0.2 can't
 * accumulate floating-point drift (0.1 + 0.2 !== 0.3) into an off-by-one or
 * missing last row. Returns an empty array for a degenerate range (step <=
 * 0, or max < min) rather than throwing — callers treat that as "nothing to
 * render," never fabricate a row. */
export function buildStepRange(min: number, max: number, step: number): number[] {
  if (step <= 0 || max < min) return [];
  const decimals = Math.max(0, (String(step).split(".")[1] ?? "").length);
  const scale = 10 ** decimals;
  const minScaled = Math.round(min * scale);
  const maxScaled = Math.round(max * scale);
  const stepScaled = Math.round(step * scale);
  const out: number[] = [];
  for (let v = minScaled; v <= maxScaled; v += stepScaled) out.push(v / scale);
  return out;
}

/** The index of whichever entry in `values` is closest to `target` — used
 * to re-center a wheel on a value that might not fall exactly on a step
 * (e.g. a persisted value from before this correction, or a caller-supplied
 * default). Returns 0 for an empty array rather than throwing; callers with
 * a genuinely empty range are expected not to render a wheel at all. */
export function nearestValueIndex(values: number[], target: number): number {
  if (values.length === 0) return 0;
  return values.reduce(
    (best, candidate, i) => (Math.abs(candidate - target) < Math.abs(values[best] - target) ? i : best),
    0
  );
}
