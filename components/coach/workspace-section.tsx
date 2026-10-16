// One row of the coach's client workspace: a titled, collapsible section whose summary line states its current
// state (read from the same data its contents show). Sections that need the coach are flagged and open by default;
// everything else stays one click away. Plain <details> — no client JS — so server-rendered forms work unchanged.

import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export function WorkspaceSection({ id, title, summary, attention = false, defaultOpen = false, children }: { id: string; title: string; summary: string; attention?: boolean; defaultOpen?: boolean; children: ReactNode }) {
  return (
    <details id={id} open={defaultOpen || undefined} className="group scroll-mt-24 rounded-[var(--radius-lg)] border border-border bg-charcoal open:lg:col-span-2">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 hover:bg-off-white/[0.03]">
        <span className="min-w-0">
          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-subheading text-off-white">{title}</span>
            {attention ? <span className="rounded-full bg-warning-soft px-1.5 py-0.5 text-[11px] font-semibold leading-none text-warning-strong">Needs you</span> : null}
          </span>
          <span className="mt-0.5 block text-meta text-neutral lg:truncate group-open:lg:whitespace-normal">{summary}</span>
        </span>
        <ChevronDown size={16} className="shrink-0 text-neutral transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="space-y-3 px-4 pb-4">{children}</div>
    </details>
  );
}

/** Collapsed sections sit two to a row on wide screens; an opened one takes the full width for its contents. */
export function WorkspaceSections({ children }: { children: ReactNode }) {
  return <div className="grid items-start gap-2 lg:grid-flow-row-dense lg:grid-cols-2">{children}</div>;
}
