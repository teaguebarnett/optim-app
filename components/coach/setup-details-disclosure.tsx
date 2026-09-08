"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { BlockerList } from "@/components/coach/blocker-list";
import { ActivationChecklist } from "@/components/coach/activation-checklist";
import type { ActivationReadiness } from "@/lib/coach/types";

/**
 * Phase 5.6A.1 — "Setup details" (spec Part 1): the internal readiness
 * machinery (independent blockers + the full activation checklist) folded
 * behind one calm, collapsed-by-default disclosure, never stacked in the
 * primary experience as competing status cards. Genuinely independent,
 * coach-actionable blockers (assigned coach, start date) still show real
 * "Blocking" framing inside BlockerList — they're the one case a coach can
 * and must act on directly; everything else here reads as pending/complete,
 * never alarming.
 */
export function SetupDetailsDisclosure({
  readiness,
  requirementActions,
  onActivateManually,
  checkInAssigned,
}: {
  readiness: ActivationReadiness;
  requirementActions: Partial<Record<string, { href: string; label: string }>>;
  onActivateManually: () => void;
  checkInAssigned?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const independentBlockers = readiness.requirements.filter((r) => !r.met && (r.id === "assigned_coach_exists" || r.id === "start_date_exists"));

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-[var(--radius-md)] border border-border bg-surface-raised px-3.5 py-2.5 text-sm font-medium text-off-white hover:bg-surface-input"
      >
        Setup details
        {open ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
      </button>
      {open ? (
        <div className="mt-3 space-y-3">
          {independentBlockers.length > 0 ? <BlockerList readiness={{ ready: false, requirements: independentBlockers }} requirementActions={requirementActions} /> : null}
          <ActivationChecklist readiness={readiness} alreadyActive={false} onActivate={onActivateManually} checkInAssigned={checkInAssigned} compact />
        </div>
      ) : null}
    </div>
  );
}
