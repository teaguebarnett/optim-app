"use client";

// Phase 6.0D-B — extracted verbatim from app/coach/clients/page.tsx (demo
// mode's own implementation, byte-for-byte unchanged behavior) so that
// route can split by mode exactly like app/coach/page.tsx's own
// DemoCoachDashboard / LiveCoachDashboard split already does. See
// components/coach/live-clients-page.tsx for the Supabase-mode sibling.

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/coach/page-header";
import { ClientRosterTable } from "@/components/coach/client-roster-table";
import { ClientRosterMobileList } from "@/components/coach/client-roster-mobile-list";
import { AddClientSheet } from "@/components/coach/add-client-sheet";
import { AddClientEntrySheet } from "@/components/coach/add-client-entry-sheet";
import { LIFECYCLE_LABELS } from "@/lib/coach/labels";
import { useCoachWorkspace } from "@/hooks/use-coach-data";
import { buildRosterRows, type RosterRow } from "@/lib/coach/roster";
import { categorizeRosterStatus, type RosterCategory } from "@/lib/coach/command-center";
import { cn } from "@/lib/cn";

type FilterValue = "all" | RosterCategory | "onboarding" | "ready_to_activate";

const FILTERS: { value: FilterValue; label: string }[] = [
  { value: "all", label: "All" },
  { value: "needs_coach", label: "Needs coach" },
  { value: "watch", label: "Watch" },
  { value: "on_track", label: "On track" },
  { value: "scheduled", label: "Scheduled" },
  { value: "onboarding", label: LIFECYCLE_LABELS.onboarding },
  { value: "ready_to_activate", label: LIFECYCLE_LABELS.ready_to_activate },
];

function isFilterValue(v: string | null): v is FilterValue {
  return !!v && FILTERS.some((f) => f.value === v);
}

/** Gate 4B — the one place a row is matched against a portfolio filter,
 * used both to compute the visible roster and (over the whole, unfiltered
 * roster) each filter chip's own real count — so "how many clients need
 * me" is answered by the exact same rule that filtering already uses,
 * never a second, competing definition. */
function matchesFilter(row: RosterRow, filter: FilterValue): boolean {
  if (filter === "all") return true;
  if (filter === "onboarding" || filter === "ready_to_activate") return row.lifecycle === filter;
  return categorizeRosterStatus(row.attentionCount > 0, row.lifecycle, row.programPhase) === filter;
}

export function DemoClientsPage() {
  const workspace = useCoachWorkspace();
  const searchParams = useSearchParams();
  const [entryOpen, setEntryOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [query, setQuery] = useState("");
  const initialFilter = searchParams.get("filter");
  const [filter, setFilter] = useState<FilterValue>(isFilterValue(initialFilter) ? initialFilter : "all");

  const allRows = buildRosterRows({
    clients: workspace.clients,
    platform: workspace.platform,
    clientAppStates: workspace.clientAppStates,
    attentionQueue: workspace.attentionQueue,
    coachName: workspace.activeContext.coachProfile?.displayName ?? "—",
  });

  // Lightweight, client-side only — filters the same rows already computed
  // above; no new data, no new business logic, never sent anywhere.
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allRows.filter((row) => {
      if (!matchesFilter(row, filter)) return false;
      if (q && !row.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [allRows, query, filter]);

  // Gate 4B — portfolio awareness: each chip's own real count across the
  // WHOLE roster (never the currently-filtered/searched subset), so "Needs
  // coach 2" stays true regardless of what's currently on screen. Same
  // matchesFilter predicate the visible list itself uses.
  const filterCounts = useMemo(() => {
    const counts = new Map<FilterValue, number>();
    for (const f of FILTERS) counts.set(f.value, allRows.filter((row) => matchesFilter(row, f.value)).length);
    return counts;
  }, [allRows]);

  const activeUsedFilters = filter !== "all" || query.trim().length > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clients"
        description="Every client assigned to you in this workspace."
        action={
          <Button onClick={() => setEntryOpen(true)}>
            <UserPlus size={16} /> Add client
          </Button>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:max-w-xs sm:flex-1">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search clients"
            className="h-11 w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface-input pl-10 pr-3.5 text-[15px] text-off-white outline-none placeholder:text-neutral focus-visible:border-accent"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => {
            const count = filterCounts.get(f.value) ?? 0;
            // Gate 4B — a filter with nothing in it right now still needs to
            // exist (the coach may add/onboard into it later), but it never
            // competes visually with one that actually has something to look
            // at — real zero-state, never hidden, never emphasized.
            const isEmpty = f.value !== "all" && count === 0;
            return (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={cn(
                  "rounded-[var(--radius-xs)] border px-3 py-1.5 text-xs font-medium transition-colors",
                  filter === f.value
                    ? "border-accent bg-accent-soft text-accent-fg"
                    : isEmpty
                      ? "border-border-strong text-neutral/60 hover:text-off-white"
                      : "border-border-strong text-neutral hover:text-off-white"
                )}
                style={{ transitionDuration: "var(--motion-fast)" }}
              >
                {f.label}
                {f.value !== "all" ? <span className="ml-1 tabular-nums opacity-70">{count}</span> : null}
              </button>
            );
          })}
        </div>
      </div>

      {rows.length === 0 && activeUsedFilters ? (
        <p className="rounded-[var(--radius-lg)] border border-dashed border-border-strong px-4 py-8 text-center text-sm text-neutral">
          No clients match &ldquo;{query || FILTERS.find((f) => f.value === filter)?.label}&rdquo;.
        </p>
      ) : (
        <>
          <ClientRosterTable rows={rows} />
          <ClientRosterMobileList rows={rows} />
        </>
      )}

      <AddClientEntrySheet open={entryOpen} onClose={() => setEntryOpen(false)} onStartNewClient={() => setAddOpen(true)} />
      <AddClientSheet open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}
