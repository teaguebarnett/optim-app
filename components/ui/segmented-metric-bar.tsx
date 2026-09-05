"use client";

import { useId } from "react";
import { cn } from "@/lib/cn";

export interface MetricSegment {
  id: string;
  label: string;
  value: number;
  colorClassName: string;
  /** Optional — makes the segment itself a filter/drill-down control. */
  onClick?: () => void;
}

/**
 * A real, proportionally-sized horizontal distribution bar — replaces a
 * bullet list of counts with an actual visual composition. Segment widths
 * animate (see .pc-segment in globals.css) whenever `value` changes, so a
 * roster shift is felt, not just re-read. Renders honestly at zero total
 * (an even, textless empty track) rather than fabricating a distribution.
 * Exposes the same data as an accessible text list for screen readers —
 * the bar itself is presentational (aria-hidden), the list beneath it is
 * the real semantic content.
 */
export function SegmentedMetricBar({ segments, total, label }: { segments: MetricSegment[]; total: number; label: string }) {
  const headingId = useId();

  return (
    <div role="group" aria-labelledby={headingId}>
      <p id={headingId} className="sr-only">
        {label}
      </p>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-track-empty" aria-hidden="true">
        {total > 0
          ? segments.map((segment) => {
              const pct = (segment.value / total) * 100;
              if (pct <= 0) return null;
              const Tag = segment.onClick ? "button" : "div";
              return (
                <Tag
                  key={segment.id}
                  type={segment.onClick ? "button" : undefined}
                  onClick={segment.onClick}
                  className={cn("pc-segment h-full first:rounded-l-full last:rounded-r-full", segment.colorClassName, segment.onClick && "cursor-pointer hover:brightness-110")}
                  style={{ width: `${pct}%` }}
                  title={`${segment.label}: ${segment.value}`}
                />
              );
            })
          : null}
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
        {segments.map((segment) => (
          <li key={segment.id}>
            {segment.onClick ? (
              <button type="button" onClick={segment.onClick} className="flex items-center gap-2 text-sm hover:underline">
                <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", segment.colorClassName)} aria-hidden="true" />
                <span className="font-semibold text-off-white">{segment.value}</span>
                <span className="text-neutral">{segment.label}</span>
              </button>
            ) : (
              <span className="flex items-center gap-2 text-sm">
                <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", segment.colorClassName)} aria-hidden="true" />
                <span className="font-semibold text-off-white">{segment.value}</span>
                <span className="text-neutral">{segment.label}</span>
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
