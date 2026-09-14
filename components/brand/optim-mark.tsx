// Phase 13A — the canonical OPTIM brand mark: a circular ring with exactly
// two diagonal interruptions (upper-right, lower-left), per
// docs/design/OPTIM_VISUAL_CONSTITUTION.md §23. One isolated implementation,
// reused everywhere the mark appears (currently components/coach/coach-shell.tsx)
// instead of hand-built approximations per call site.
//
// The two gaps are drawn as a single circle's stroke-dasharray (two equal
// dash arcs + two equal gap arcs), rotated so the gap centers land exactly
// at the 1:30 and 7:30 clock positions — geometrically opposite, so the
// mark stays perfectly symmetric while still reading as two distinct
// diagonal cuts. Color always comes from `currentColor` (set via a text-*
// className on this element or an ancestor), never a hardcoded fill, so the
// mark works identically against any surface/theme.
export function OptimMark({ size = 28, strokeWidth = 3, className }: { size?: number; strokeWidth?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      <circle
        cx="16"
        cy="16"
        r="12"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="butt"
        strokeDasharray="31.416 6.283 31.416 6.283"
        transform="rotate(150 16 16)"
      />
    </svg>
  );
}
