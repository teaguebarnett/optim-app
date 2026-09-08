"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { ProgramRevisionRecord } from "@/lib/coach/program-revision";
import type { NutritionRevisionRecord } from "@/lib/coach/nutrition-directions";

/**
 * Phase 5.6A.2 — "View change history" (spec Part 1's adjustment controls):
 * only rendered by the caller when real revision history actually exists,
 * reading the SAME append-only revisions/nutritionRevisions lists every
 * revision confirmation already writes to (see activation-lifecycle.ts) —
 * never a second, parallel history log.
 */
export function PlanChangeHistory({ trainingRevisions, nutritionRevisions }: { trainingRevisions: ProgramRevisionRecord[]; nutritionRevisions: NutritionRevisionRecord[] }) {
  const [open, setOpen] = useState(false);
  const entries = [
    ...trainingRevisions.map((r) => ({ kind: "Training" as const, instruction: r.instruction, summary: r.plan.summary, atIso: r.confirmedAtIso ?? r.createdAtIso })),
    ...nutritionRevisions.map((r) => ({ kind: "Nutrition" as const, instruction: r.instruction, summary: r.plan.summary, atIso: r.confirmedAtIso ?? r.createdAtIso })),
  ].sort((a, b) => (a.atIso < b.atIso ? 1 : -1));

  if (entries.length === 0) return null;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-[var(--radius-md)] border border-border bg-surface-raised px-3.5 py-2.5 text-sm font-medium text-off-white hover:bg-surface-input"
      >
        View change history — {entries.length} change{entries.length === 1 ? "" : "s"}
        {open ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
      </button>
      {open ? (
        <div className="mt-3 space-y-2">
          {entries.map((entry, i) => (
            <div key={i} className="rounded-[var(--radius-sm)] border border-border-strong bg-surface-raised px-3.5 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-brass-strong">{entry.kind}</span>
                <span className="text-meta text-neutral">{new Date(entry.atIso).toLocaleString()}</span>
              </div>
              <p className="mt-1 text-sm text-off-white">{entry.summary}</p>
              <p className="mt-0.5 text-meta text-neutral">&ldquo;{entry.instruction}&rdquo;</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
