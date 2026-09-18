"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Search, Users } from "lucide-react";
import { EmptyState } from "@/components/coach/empty-state";
import { StatusBadge } from "@/components/progress/status-badge";
import type { PlatformCoachSummary } from "@/lib/production/platform-operations";

/** Searchable/filterable coach-workspace roster — Phase 6.1A's /admin/coaches
 * table. Filtering happens entirely client-side over the already-fetched
 * platform-wide roster (small-to-moderate dataset for a single-platform
 * Command Center), never a second server round trip per keystroke. */
export function CoachRosterTable({ rows }: { rows: PlatformCoachSummary[] }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "suspended" | "trial">("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter !== "all" && row.workspaceStatus !== statusFilter) return false;
      if (!q) return true;
      return row.displayName.toLowerCase().includes(q) || row.workspaceName.toLowerCase().includes(q);
    });
  }, [rows, query, statusFilter]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search coach or workspace name…"
            className="h-10 w-full rounded-[var(--radius-sm)] border border-border bg-surface-input pl-9 pr-3 text-sm text-off-white placeholder:text-neutral focus:border-accent focus:outline-none"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="h-10 rounded-[var(--radius-sm)] border border-border bg-surface-input px-3 text-sm text-off-white focus:border-accent focus:outline-none"
        >
          <option value="all">All workspace statuses</option>
          <option value="active">Active</option>
          <option value="trial">Trial</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Users} title="No coaches match" description="Try a different search or filter." />
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-charcoal">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-label text-neutral">
                  <th className="px-4 py-3 font-semibold">Coach / Workspace</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Created</th>
                  <th className="px-4 py-3 font-semibold">Clients</th>
                  <th className="px-4 py-3 font-semibold">Escalations</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.membershipId} className="group border-b border-border last:border-0 transition-colors hover:bg-surface-raised" style={{ transitionDuration: "var(--motion-fast)" }}>
                    <td className="px-4 py-3.5">
                      <Link href={`/admin/coaches/${row.membershipId}`} className="font-medium text-off-white group-hover:text-accent-fg">
                        {row.displayName}
                      </Link>
                      <p className="text-meta text-neutral">{row.workspaceName}</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge
                        label={row.workspaceStatus}
                        tone={row.workspaceStatus === "active" ? "success" : row.workspaceStatus === "suspended" ? "error" : "neutral"}
                      />
                    </td>
                    <td className="px-4 py-3.5 text-neutral">{new Date(row.workspaceCreatedAtIso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
                    <td className="px-4 py-3.5 text-off-white">{row.assignedClientCount}</td>
                    <td className="px-4 py-3.5">
                      {row.openEscalationCount > 0 ? <StatusBadge label={`${row.openEscalationCount} open`} tone="error" /> : <span className="text-neutral">—</span>}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <Link href={`/admin/coaches/${row.membershipId}`} aria-label={`Open ${row.displayName}`}>
                        <ChevronRight size={16} className="text-neutral" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
