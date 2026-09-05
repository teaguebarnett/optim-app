import { AlertTriangle } from "lucide-react";

/**
 * Phase 4.4B-2.2 — the compact, persistent caution shown on every normal
 * panel (exercise intro/warm-up/set-ready/set-logging/set-feedback) for as
 * long as an unresolved pain report remains active this session, including
 * on an exercise the client already confirmed "feels unaffected." Never
 * claims the exercise is safe — only that a report is still open. See
 * lib/state.ts's activePainInterruption and the exercise-pain-check gate
 * that runs before this banner's exercise was ever reached.
 */
export function ActivePainBanner({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div className="mb-3 flex items-center gap-2 rounded-[var(--radius-sm)] border border-warning/30 bg-warning-soft px-3 py-2">
      <AlertTriangle size={14} className="shrink-0 text-warning" aria-hidden="true" />
      <p className="text-meta text-warning">Pain report active — stop if symptoms increase.</p>
    </div>
  );
}
