import Link from "next/link";
import { ChevronRight, Users } from "lucide-react";
import { StatusBadge } from "@/components/progress/status-badge";
import { LifecycleBadge } from "@/components/coach/lifecycle-badge";
import { EmptyState } from "@/components/coach/empty-state";
import type { RosterRow } from "@/lib/coach/roster";

export type { RosterRow } from "@/lib/coach/roster";

/**
 * The coach's client roster — a dense desktop table (md+) backed by the
 * exact same rows a compact mobile card list renders below md (see
 * ClientRosterMobileList) — one shared data shape, two compositions, never
 * a desktop table squeezed under horizontal scroll on a phone.
 */
export function ClientRosterTable({ rows }: { rows: RosterRow[] }) {
  if (rows.length === 0) {
    return <EmptyState icon={Users} title="No clients yet" description="Add a client to create their invitation link." />;
  }

  return (
    <div className="hidden overflow-hidden rounded-[var(--radius-lg)] border border-border bg-charcoal md:block">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border text-label text-neutral">
            <th className="px-4 py-3 font-semibold">Client</th>
            <th className="px-4 py-3 font-semibold">Status</th>
            <th className="px-4 py-3 font-semibold">Coach</th>
            <th className="px-4 py-3 font-semibold">Program</th>
            <th className="px-4 py-3 font-semibold">Last activity</th>
            <th className="px-4 py-3 font-semibold">Next action</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.clientId} className="group border-b border-border last:border-0 transition-colors hover:bg-surface-raised" style={{ transitionDuration: "var(--motion-fast)" }}>
              <td className="px-4 py-3.5">
                <Link href={`/coach/clients/${row.clientId}`} className="font-medium text-off-white group-hover:text-accent-strong">
                  {row.name}
                </Link>
              </td>
              <td className="px-4 py-3.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <LifecycleBadge lifecycle={row.lifecycle} programPhase={row.programPhase} />
                  {row.attentionCount > 0 ? <StatusBadge label={`${row.attentionCount} flagged`} tone="error" /> : null}
                </div>
              </td>
              <td className="px-4 py-3.5 text-neutral">{row.coachName}</td>
              <td className="px-4 py-3.5 text-neutral">{row.programWeekLabel ?? "—"}</td>
              <td className="px-4 py-3.5 text-neutral">{row.lastActivityLabel}</td>
              <td className="px-4 py-3.5 text-off-white">{row.nextAction}</td>
              <td className="px-4 py-3.5 text-right">
                <Link href={`/coach/clients/${row.clientId}`} aria-label={`Open ${row.name}`}>
                  <ChevronRight size={16} className="text-neutral" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
