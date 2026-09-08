"use client";

import { CheckCircle2, XCircle, Sparkles, Hourglass, RotateCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { AdaptiveCheckState } from "@/lib/coach/plan-presentation";
import type { ProgramAdaptationProposal } from "@/lib/coach/program-adaptation";
import type { ReviewRequest } from "@/lib/types";

export type { AdaptiveCheckState };

/**
 * Phase 5.6A.2 — OPTIM appears to monitor the client automatically (spec
 * Part 1), replacing the old manual "Check for proposals" button as the
 * ONLY way a coach ever learned a proposal existed. The caller runs the
 * existing detection logic once automatically (on mount / when the program
 * or its signals change — see ActiveClientComposer's effect); this
 * component only presents whatever that already-computed state is.
 * "Refresh analysis" stays as a secondary, explicit re-check — never
 * polling, never a second calculation path.
 */
export function AdaptiveStatusArea({
  state,
  clientName,
  activeProposalReviews,
  existingProposals,
  onApply,
  onDismiss,
  onRefresh,
}: {
  state: AdaptiveCheckState;
  clientName: string;
  activeProposalReviews: ReviewRequest[];
  existingProposals: ProgramAdaptationProposal[];
  onApply: (proposal: ProgramAdaptationProposal, review: ReviewRequest) => void;
  onDismiss: (review: ReviewRequest) => void;
  onRefresh: () => void;
}) {
  if (state === "proposal_available") {
    return (
      <Card className="border-l-2 border-l-brass">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brass-soft text-brass-strong">
            <Sparkles size={16} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-subheading text-off-white">OPTIM has a proposed adjustment</p>
            <p className="mt-0.5 text-meta text-neutral">Real signals from {clientName}&apos;s logged training — checked against your Coach Operating Model.</p>
          </div>
        </div>
        <div className="mt-3 space-y-2">
          {activeProposalReviews.map((review) => {
            const proposal = existingProposals.find((p) => p.id === review.sourceEventId);
            if (!proposal) return null;
            return (
              <div key={review.id} className="rounded-[var(--radius-sm)] border border-border-strong bg-surface-raised p-3.5">
                <p className="text-sm font-medium text-off-white">{proposal.proposedChangeSummary}</p>
                <p className="mt-1 text-meta text-neutral">{proposal.reasoning}</p>
                <p className="mt-1 text-meta text-neutral">
                  Targets week{proposal.affectedWeeks.length > 1 ? "s" : ""} {proposal.affectedWeeks.join(", ")} &middot; confidence {Math.round(proposal.confidence * 100)}%
                  {proposal.status === "auto_applied" ? " · already applied" : ""}
                </p>
                <div className="mt-2.5 flex gap-2">
                  {proposal.status !== "auto_applied" ? (
                    <Button size="sm" onClick={() => onApply(proposal, review)}>
                      <CheckCircle2 size={14} aria-hidden="true" /> Apply
                    </Button>
                  ) : null}
                  <Button size="sm" variant="secondary" onClick={() => onDismiss(review)}>
                    <XCircle size={14} aria-hidden="true" /> Dismiss
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    );
  }

  const copy =
    state === "insufficient_data"
      ? { label: "Gathering data", detail: `OPTIM needs at least one full completed week of ${clientName}'s logged training before it can detect a real pattern.` }
      : state === "checking"
        ? { label: "Checking for adjustments…", detail: "Comparing recent training signals against your Coach Operating Model." }
        : { label: "No adjustment recommended", detail: `${clientName}'s recent training doesn't show a pattern OPTIM would act on right now.` };

  return (
    <div className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border bg-surface-raised px-3.5 py-2.5">
      <div className="flex items-center gap-2.5">
        {state === "checking" ? <Hourglass size={15} className="shrink-0 text-neutral" aria-hidden="true" /> : <CheckCircle2 size={15} className="shrink-0 text-success" aria-hidden="true" />}
        <div>
          <p className="text-sm font-medium text-off-white">{copy.label}</p>
          <p className="text-meta text-neutral">{copy.detail}</p>
        </div>
      </div>
      <Button variant="ghost" size="sm" onClick={onRefresh}>
        <RotateCw size={13} aria-hidden="true" /> Refresh analysis
      </Button>
    </div>
  );
}
