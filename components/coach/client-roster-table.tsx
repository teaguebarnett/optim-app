import { Users } from "lucide-react";
import { EmptyState } from "@/components/coach/empty-state";
import { RosterCard } from "@/components/coach/client-roster-mobile-list";
import type { RosterRow } from "@/lib/coach/roster";

export type { RosterRow } from "@/lib/coach/roster";

/**
 * Gate 4B — the coach's client roster at md+ widths: the same
 * status/context-forward RosterCard the mobile list renders below md (see
 * client-roster-mobile-list.tsx), laid out as a responsive grid rather than
 * a six-column table. A portfolio of any size stays scannable as cards, not
 * a spreadsheet wall — one shared data shape and one shared card, two
 * column counts.
 */
export function ClientRosterTable({ rows }: { rows: RosterRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="hidden md:block">
        <EmptyState icon={Users} title="No clients yet" description="Add a client to create their invitation link." />
      </div>
    );
  }

  return (
    <div className="hidden grid-cols-2 gap-3 md:grid xl:grid-cols-3">
      {rows.map((row) => (
        <RosterCard key={row.clientId} row={row} />
      ))}
    </div>
  );
}
