import Link from "next/link";
import { ChevronRight, Users } from "lucide-react";
import { StatusBadge } from "@/components/progress/status-badge";
import { LifecycleBadge } from "@/components/coach/lifecycle-badge";
import { EmptyState } from "@/components/coach/empty-state";
import type { RosterRow } from "@/lib/coach/roster";

/**
 * The roster's mobile composition — a compact, rapidly scannable card per
 * client rather than the desktop table's columns squeezed into a scrolling
 * strip. Same RosterRow data as ClientRosterTable; only below md.
 */
export function ClientRosterMobileList({ rows }: { rows: RosterRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="md:hidden">
        <EmptyState icon={Users} title="No clients yet" description="Add a client to create their invitation link." />
      </div>
    );
  }

  return (
    <div className="space-y-2 md:hidden">
      {rows.map((row) => (
        <Link
          key={row.clientId}
          href={`/coach/clients/${row.clientId}`}
          className="block rounded-[var(--radius-lg)] border border-border bg-charcoal p-4 shadow-[var(--shadow-subtle)] transition-colors active:bg-surface-raised"
          style={{ transitionDuration: "var(--motion-fast)" }}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 truncate text-subheading text-off-white">{row.name}</p>
            <ChevronRight size={16} className="mt-0.5 shrink-0 text-neutral" aria-hidden="true" />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <LifecycleBadge lifecycle={row.lifecycle} programPhase={row.programPhase} />
            {row.attentionCount > 0 ? <StatusBadge label={`${row.attentionCount} flagged`} tone="error" /> : null}
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-y-1.5 text-meta">
            <dt className="text-neutral">Program</dt>
            <dd className="text-right text-off-white">{row.programWeekLabel ?? "Not set"}</dd>
            <dt className="text-neutral">Last activity</dt>
            <dd className="text-right text-off-white">{row.lastActivityLabel}</dd>
          </dl>
          <div className="mt-3 flex items-center gap-1.5 border-t border-border pt-2.5 text-action text-accent-strong">
            {row.nextAction}
          </div>
        </Link>
      ))}
    </div>
  );
}
