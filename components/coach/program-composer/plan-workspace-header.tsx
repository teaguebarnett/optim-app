"use client";

import { ArrowLeft, Wand2, PenLine, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/progress/status-badge";

/**
 * Phase 5.6A.1 — the plan review workspace's header (spec Part 2): honest
 * framing ("Awaiting your approval", "Nothing goes live until you
 * approve it") replacing the old goal/authority-level subtitle and the
 * unfinished "· Copilot authority" fragment.
 */
export function PlanWorkspaceHeader({ clientName, startDateLabel, onBack }: { clientName: string; startDateLabel: string; onBack: () => void }) {
  return (
    <div className="space-y-3">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-neutral hover:text-off-white">
        <ArrowLeft size={16} aria-hidden="true" /> Back to {clientName}
      </button>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-display text-off-white">OPTIM Draft for {clientName}</h1>
          <p className="mt-1 text-meta text-neutral">Start {startDateLabel} · Nothing goes live until you approve it.</p>
        </div>
        <StatusBadge label="Awaiting your approval" tone="accent" />
      </div>
    </div>
  );
}

/**
 * The persistent, sticky coach decision bar — always available while the
 * coach reviews, never buried at the bottom of a long scroll.
 */
export function PlanActionBar({
  onApprove,
  onRevise,
  onFineTune,
  approveDisabled,
  approveDisabledReason,
}: {
  onApprove: () => void;
  onRevise: () => void;
  onFineTune: () => void;
  approveDisabled?: boolean;
  approveDisabledReason?: string;
}) {
  return (
    <div className="sticky bottom-4 z-20 mt-2">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-border-strong bg-charcoal p-3.5 shadow-[var(--shadow-elevated,0_8px_30px_rgba(0,0,0,0.35))]">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="lg" onClick={onApprove} disabled={approveDisabled}>
            Approve &amp; assign
          </Button>
          <Button variant="secondary" onClick={onRevise}>
            <Wand2 size={15} aria-hidden="true" /> Revise with OPTIM
          </Button>
          <Button variant="outline" onClick={onFineTune}>
            <Layers size={15} aria-hidden="true" /> Fine-tune manually
          </Button>
        </div>
        {approveDisabled && approveDisabledReason ? (
          <p className="flex items-center gap-1.5 text-meta text-warning-strong">
            <PenLine size={13} aria-hidden="true" /> {approveDisabledReason}
          </p>
        ) : null}
      </div>
    </div>
  );
}
