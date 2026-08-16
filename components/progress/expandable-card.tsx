"use client";

import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";

interface ExpandableCardProps {
  title: string;
  subtitle?: string;
  /** Collapsed-state summary content. */
  children: ReactNode;
  /** Expanded read-only detail. Omit entirely to render a plain,
   * non-interactive card — a card is only ever a <button> when it actually
   * has somewhere to expand to. */
  detail?: ReactNode;
  detailTitle?: string;
  detailDescription?: string;
  accessibleName?: string;
  className?: string;
}

/**
 * The one reusable expandable-card pattern every Progress bento card uses —
 * a plain semantic <button> (free keyboard activation + focus handling)
 * that opens the existing Sheet primitive (components/ui/sheet.tsx), which
 * already implements Escape-to-close, backdrop-to-close, focus management,
 * a labeled close control, and background-scroll containment. No separate
 * modal implementation per card.
 */
export function ExpandableCard({
  title,
  subtitle,
  children,
  detail,
  detailTitle,
  detailDescription,
  accessibleName,
  className,
}: ExpandableCardProps) {
  const [open, setOpen] = useState(false);
  const expandable = detail !== undefined;

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-off-white">{title}</p>
          {subtitle ? <p className="mt-0.5 text-xs text-neutral">{subtitle}</p> : null}
        </div>
        {expandable ? <ChevronRight size={16} className="mt-0.5 shrink-0 text-neutral" aria-hidden="true" /> : null}
      </div>
      <div className="mt-2.5">{children}</div>
    </>
  );

  return (
    <>
      {expandable ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-label={accessibleName ?? `${title} — view details`}
          className={cn(
            "w-full rounded-[var(--radius-lg)] border border-border bg-charcoal p-4 text-left shadow-[var(--shadow-subtle)] transition-colors hover:border-accent/30",
            className
          )}
        >
          {body}
        </button>
      ) : (
        <div
          className={cn(
            "w-full rounded-[var(--radius-lg)] border border-border bg-charcoal p-4 shadow-[var(--shadow-subtle)]",
            className
          )}
        >
          {body}
        </div>
      )}

      {expandable ? (
        <Sheet open={open} onClose={() => setOpen(false)} title={detailTitle ?? title} description={detailDescription}>
          {detail}
        </Sheet>
      ) : null}
    </>
  );
}
