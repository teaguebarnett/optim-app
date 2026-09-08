"use client";

import { useState } from "react";
import { HeartPulse, CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TextArea } from "@/components/ui/textarea";
import { cn } from "@/lib/cn";
import { HEALTH_REVIEW_STATUS_LABELS, PENDING_HEALTH_REVIEW_STATUSES, RESOLVED_HEALTH_REVIEW_STATUS_ORDER } from "@/lib/coach/labels";
import { RESOLVED_HEALTH_REVIEW_STATUSES } from "@/lib/coach/types";
import type { HealthReviewRecord, HealthReviewStatus } from "@/lib/coach/types";

/**
 * Phase 5.6A.1 — the ONE health-review decision surface (replaces the
 * generic status Combobox that mixed pending actions and resolved outcomes
 * in one flat dropdown — see components/coach/health-review-card.tsx and
 * blocker-list.tsx's old inline control, both now superseded on the pages
 * that used them). Shows exactly what the client reported, why it matters
 * for programming, and two visually distinct groups of real actions:
 * pending (still blocked) and resolved (eligible to proceed). Never
 * diagnoses, never implies medical clearance, never silently converts a
 * pending action into a resolution — "Proceed with documented limitations"
 * requires the coach to actually type the limitation before it's accepted.
 */
export function HealthReviewDecisionCard({
  clientFirstName,
  healthReview,
  clientReportedDetail,
  onResolve,
}: {
  clientFirstName: string;
  healthReview: HealthReviewRecord;
  /** The client's own free-text restriction detail (health_finish's
   * injuryRestrictions), when they reported one — shown verbatim, never
   * summarized into something they didn't say. */
  clientReportedDetail?: string | null;
  onResolve: (status: HealthReviewStatus, documentedLimitations?: string) => void;
}) {
  const resolved = RESOLVED_HEALTH_REVIEW_STATUSES.has(healthReview.status);
  const [limitationDraft, setLimitationDraft] = useState(healthReview.documentedLimitations ?? "");
  const [showLimitationInput, setShowLimitationInput] = useState(healthReview.status === "proceed_with_limitations");

  function choosePending(status: HealthReviewStatus) {
    setShowLimitationInput(false);
    onResolve(status);
  }

  function chooseResolved(status: HealthReviewStatus) {
    if (status === "proceed_with_limitations") {
      setShowLimitationInput(true);
      return;
    }
    setShowLimitationInput(false);
    onResolve(status);
  }

  function confirmLimitations() {
    if (!limitationDraft.trim()) return;
    onResolve("proceed_with_limitations", limitationDraft.trim());
  }

  return (
    <Card className={cn("border-l-2", resolved ? "border-l-success" : "border-l-warning")}>
      <div className="flex items-start gap-3">
        <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", resolved ? "bg-success-soft text-success" : "bg-warning-soft text-warning-strong")}>
          <HeartPulse size={16} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-subheading text-off-white">Health review</p>
          <p className="mt-0.5 text-meta text-neutral">Not a diagnosis — a real decision only you can make before OPTIM programs around it.</p>
        </div>
      </div>

      <div className="mt-3.5 space-y-1.5 rounded-[var(--radius-sm)] bg-surface-raised px-3.5 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral">What {clientFirstName} reported</p>
        <ul className="space-y-0.5 text-sm text-off-white">
          {healthReview.reasons.map((reason, i) => (
            <li key={i}>&bull; {reason}</li>
          ))}
        </ul>
        {clientReportedDetail ? <p className="mt-1.5 text-sm text-neutral">&ldquo;{clientReportedDetail}&rdquo;</p> : null}
      </div>

      {resolved ? (
        <div className="mt-3.5 flex items-start gap-2 rounded-[var(--radius-sm)] bg-success-soft/50 px-3.5 py-3">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-off-white">{HEALTH_REVIEW_STATUS_LABELS[healthReview.status]}</p>
            {healthReview.status === "proceed_with_limitations" && healthReview.documentedLimitations ? (
              <p className="mt-0.5 text-sm text-neutral">Documented limitation: {healthReview.documentedLimitations}</p>
            ) : null}
            <p className="mt-0.5 text-meta text-neutral">Eligible to proceed — OPTIM can generate around this.</p>
          </div>
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral">Pending — still blocked</p>
          <div className="flex flex-col gap-1.5">
            {PENDING_HEALTH_REVIEW_STATUSES.map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => choosePending(status)}
                className={cn(
                  "rounded-[var(--radius-sm)] border px-3 py-2 text-left text-sm font-medium transition-colors",
                  healthReview.status === status ? "border-warning bg-warning-soft text-warning-strong" : "border-border-strong bg-transparent text-off-white hover:bg-surface-raised"
                )}
              >
                {HEALTH_REVIEW_STATUS_LABELS[status]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral">Resolved — eligible to proceed</p>
          <div className="flex flex-col gap-1.5">
            {RESOLVED_HEALTH_REVIEW_STATUS_ORDER.map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => chooseResolved(status)}
                className={cn(
                  "rounded-[var(--radius-sm)] border px-3 py-2 text-left text-sm font-medium transition-colors",
                  healthReview.status === status ? "border-success bg-success-soft text-success" : "border-border-strong bg-transparent text-off-white hover:bg-surface-raised"
                )}
              >
                {HEALTH_REVIEW_STATUS_LABELS[status]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {showLimitationInput ? (
        <div className="mt-4 border-t border-border pt-3.5">
          <TextArea
            id="documented-limitations"
            label="Documented limitation — what should OPTIM program around?"
            placeholder="e.g. No overhead pressing; cap load on unilateral knee work."
            value={limitationDraft}
            onChange={(e) => setLimitationDraft(e.target.value)}
            rows={2}
          />
          <Button size="sm" className="mt-2" onClick={confirmLimitations} disabled={!limitationDraft.trim()}>
            Confirm and proceed
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
