"use client";

import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "@/lib/cn";

export interface DiscretePosition {
  value: string;
  label: string;
}

/**
 * Coach-onboarding refinement pass — a real pointer-driven four-stop rail.
 *
 * Earlier this phase this was rebuilt on a native `<input type="range"
 * step={1}>` to get free browser drag/keyboard/touch behavior — real
 * dragging, but a stepped native range has no concept of an "in-between"
 * position, so the browser's own rendered thumb necessarily jumped between
 * the 4 valid stops mid-drag rather than following the pointer, which is
 * exactly the "clunky" interaction manual review called out. Following the
 * pointer continuously while dragging and snapping ONLY on release requires
 * tracking the raw pointer position independently of the committed
 * discrete value — not something a stepped native range can express — so
 * this is a small, deliberate custom `div[role="slider"]` instead.
 *
 * The split that makes this safe:
 *  - While dragging, `dragPercent` (raw, continuous, 0–100) drives the
 *    thumb/fill position directly with NO css transition — it tracks the
 *    pointer 1:1. `previewIndex` (the nearest valid stop to that raw
 *    position) drives the label row's live highlight and this component's
 *    aria-valuetext, satisfying "label... can preview the pending
 *    selection" — nothing is persisted yet.
 *  - On release (or a keyboard step, or a plain click with no drag —
 *    pointerdown+pointerup is the same code path as a drag that never
 *    moved), the nearest index is computed once, the thumb animates to
 *    that stop's exact position with a short 160ms ease-out (no bounce),
 *    and `onChange` — the caller's real persistence write — fires exactly
 *    once. It is structurally impossible to commit anything but one of the
 *    real discrete `positions` values.
 *
 * `onPreviewChange`, if given, fires continuously with the pending
 * (not-yet-committed) value during a drag/keyboard step, so a caller can
 * live-update its own explanatory copy alongside this component's own
 * label row — see components/coach/ai-authority-panel.tsx.
 *
 * Used for every AI Coaching Authority control (Playbook global, Playbook
 * per-domain overrides, per-client override card) — one shared
 * implementation, not several inconsistent ones.
 */
export function DiscreteSlider({
  positions,
  value,
  onChange,
  onPreviewChange,
  ariaLabel,
}: {
  positions: DiscretePosition[];
  value: string;
  onChange: (value: string) => void;
  onPreviewChange?: (value: string) => void;
  ariaLabel: string;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const lastIndex = positions.length - 1;
  const committedIndex = Math.max(
    0,
    positions.findIndex((p) => p.value === value)
  );

  const [isDragging, setIsDragging] = useState(false);
  const [dragPercent, setDragPercent] = useState(0);

  const percentForIndex = (i: number) => (lastIndex === 0 ? 0 : (i / lastIndex) * 100);
  const indexForPercent = (p: number) => Math.min(lastIndex, Math.max(0, Math.round((p / 100) * lastIndex)));

  const displayPercent = isDragging ? dragPercent : percentForIndex(committedIndex);
  const previewIndex = isDragging ? indexForPercent(dragPercent) : committedIndex;

  function percentFromClientX(clientX: number): number {
    const rect = railRef.current!.getBoundingClientRect();
    if (rect.width === 0) return 0;
    return Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100));
  }

  function commit(nextIndex: number) {
    const clamped = Math.min(lastIndex, Math.max(0, nextIndex));
    onChange(positions[clamped].value);
  }

  function handlePointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault(); // no text selection, no native drag-image
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus();
    const percent = percentFromClientX(e.clientX);
    setIsDragging(true);
    setDragPercent(percent);
    onPreviewChange?.(positions[indexForPercent(percent)].value);
  }

  function handlePointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!isDragging) return;
    const percent = percentFromClientX(e.clientX);
    setDragPercent(percent);
    onPreviewChange?.(positions[indexForPercent(percent)].value);
  }

  function endDrag(e: PointerEvent<HTMLDivElement>) {
    if (!isDragging) return;
    const percent = percentFromClientX(e.clientX);
    setIsDragging(false);
    commit(indexForPercent(percent));
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    switch (e.key) {
      case "ArrowRight":
      case "ArrowUp":
        e.preventDefault();
        commit(committedIndex + 1);
        break;
      case "ArrowLeft":
      case "ArrowDown":
        e.preventDefault();
        commit(committedIndex - 1);
        break;
      case "Home":
        e.preventDefault();
        commit(0);
        break;
      case "End":
        e.preventDefault();
        commit(lastIndex);
        break;
    }
  }

  const snapStyle: CSSProperties = { "--pc-rail-percent": `${displayPercent}%` } as CSSProperties;

  return (
    <div className="w-full">
      <div
        ref={railRef}
        role="slider"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={lastIndex}
        aria-valuenow={previewIndex}
        aria-valuetext={positions[previewIndex]?.label}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDragStart={(e) => e.preventDefault()}
        className={cn("pc-authority-rail", isDragging && "pc-dragging")}
      >
        <div className="pc-authority-track" style={snapStyle} />
        <div className={cn("pc-authority-fill", !isDragging && "pc-snap")} style={snapStyle} />
        {positions.map((p, i) => (
          <span key={p.value} className={cn("pc-authority-tick", i <= previewIndex && "pc-active")} style={{ left: `${percentForIndex(i)}%` }} />
        ))}
        <div className={cn("pc-authority-thumb", !isDragging && "pc-snap")} style={snapStyle} />
      </div>

      <div className="relative mt-2 h-4 text-meta text-neutral">
        {positions.map((p, i) => (
          <button
            key={p.value}
            type="button"
            onClick={() => commit(i)}
            aria-pressed={i === previewIndex}
            className={cn(
              "absolute top-0 -translate-x-1/2 truncate font-medium transition-colors first:left-0 first:translate-x-0 last:left-auto last:right-0 last:translate-x-0",
              i === previewIndex ? "text-accent-strong" : "hover:text-off-white"
            )}
            style={i === 0 || i === lastIndex ? undefined : { left: `${percentForIndex(i)}%` }}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
