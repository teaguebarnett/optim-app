"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Search, UserRound } from "lucide-react";
import { EmptyState } from "@/components/coach/empty-state";
import { StatusBadge } from "@/components/progress/status-badge";
import { LifecycleChip } from "@/components/admin/lifecycle-chip";
import type { PlatformClientSummary, LifecycleBucket } from "@/lib/production/platform-operations";

const LIFECYCLE_FILTERS: { value: LifecycleBucket | "all"; label: string }[] = [
  { value: "all", label: "All lifecycle stages" },
  { value: "invited", label: "Invited" },
  { value: "onboarding", label: "Onboarding" },
  { value: "coach_setup", label: "Awaiting coach setup" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "completed", label: "Completed" },
  { value: "archived", label: "Archived" },
];

/** Searchable/filterable platform-wide client roster — Phase 6.1A's
 * /admin/clients table. Same client-side filtering discipline as
 * CoachRosterTable (see that file's own doc). */
export function ClientPlatformTable({ rows }: { rows: PlatformClientSummary[] }) {
  const [query, setQuery] = useState("");
  const [lifecycleFilter, setLifecycleFilter] = useState<LifecycleBucket | "all">("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (lifecycleFilter !== "all" && row.lifecycle !== lifecycleFilter) return false;
      if (!q) return true;
      return row.displayName.toLowerCase().includes(q) || row.workspaceName.toLowerCase().includes(q) || row.coachDisplayName.toLowerCase().includes(q);
    });
  }, [rows, query, lifecycleFilter]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search client, workspace, or coach…"
            className="h-10 w-full rounded-[var(--radius-sm)] border border-border bg-surface-input pl-9 pr-3 text-sm text-off-white placeholder:text-neutral focus:border-accent focus:outline-none"
          />
        </div>
        <select
          value={lifecycleFilter}
          onChange={(e) => setLifecycleFilter(e.target.value as LifecycleBucket | "all")}
          className="h-10 rounded-[var(--radius-sm)] border border-border bg-surface-input px-3 text-sm text-off-white focus:border-accent focus:outline-none"
        >
          {LIFECYCLE_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={UserRound} title="No clients match" description="Try a different search or filter." />
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-charcoal">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-label text-neutral">
                  <th className="px-4 py-3 font-semibold">Client</th>
                  <th className="px-4 py-3 font-semibold">Lifecycle</th>
                  <th className="px-4 py-3 font-semibold">Workspace / Coach</th>
                  <th className="px-4 py-3 font-semibold">Program / Nutrition</th>
                  <th className="px-4 py-3 font-semibold">Escalations</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.clientId} className="group border-b border-border last:border-0 transition-colors hover:bg-surface-raised" style={{ transitionDuration: "var(--motion-fast)" }}>
                    <td className="px-4 py-3.5">
                      <Link href={`/admin/clients/${row.clientId}`} className="font-medium text-off-white group-hover:text-accent-fg">
                        {row.displayName}
                      </Link>
                    </td>
                    <td className="px-4 py-3.5">
                      <LifecycleChip lifecycle={row.lifecycle} />
                    </td>
                    <td className="px-4 py-3.5 text-neutral">
                      {row.workspaceName} · {row.coachDisplayName}
                    </td>
                    <td className="px-4 py-3.5 text-neutral">
                      {row.hasActiveProgram ? "Program" : "No program"} / {row.hasActiveNutrition ? "Nutrition" : "No nutrition"}
                    </td>
                    <td className="px-4 py-3.5">
                      {row.openEscalationCount > 0 ? <StatusBadge label={`${row.openEscalationCount} open`} tone="error" /> : <span className="text-neutral">—</span>}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <Link href={`/admin/clients/${row.clientId}`} aria-label={`Open ${row.displayName}`}>
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
