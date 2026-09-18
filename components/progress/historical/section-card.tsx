import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface SectionCardProps {
  title: string;
  icon?: ReactNode;
  /** Small right-aligned status element, e.g. an outcome badge. */
  headerRight?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * Phase 4.3 — the one reusable "modular summary surface" primitive the new
 * OPTIM visual standard is built from: a clearly bounded white card with a
 * consistent title row, radius, border, and shadow. Intentionally simpler
 * than ExpandableCard (no built-in expand/collapse — see Disclosure for
 * progressive disclosure within a section) so Phase 4.4 can reuse it for a
 * plain, always-visible section anywhere in the app.
 */
export function SectionCard({ title, icon, headerRight, children, className }: SectionCardProps) {
  return (
    <section className={cn("rounded-[var(--radius-lg)] border border-border bg-charcoal p-4 shadow-[var(--shadow-subtle)]", className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-off-white">
          {icon ? <span className="text-accent-fg">{icon}</span> : null}
          {title}
        </h2>
        {headerRight}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}
