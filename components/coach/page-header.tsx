import type { ReactNode } from "react";

/**
 * Phase 5.0C — the one page-title treatment every coach route uses, so
 * "what page am I on and what can I do here" reads identically everywhere
 * instead of each route hand-rolling its own heading block. `action` sits
 * to the right on desktop and wraps below the title on narrow screens
 * rather than ever forcing horizontal scroll or a clipped button.
 */
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-display text-off-white">{title}</h1>
        {description ? <p className="mt-1 text-body text-neutral">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
