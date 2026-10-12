"use client";

// Phase 7B — Persist Coach-Reviewed Training Limitations.
//
// The thin Supabase-mode adapter around the existing, generic
// HealthReviewDecisionCard (unchanged, demo-and-Supabase-agnostic — see
// its own doc): a Server Component (EscalationCard/the escalations pages)
// cannot pass a plain callback across the server/client boundary, but CAN
// pass a bound Server Action, exactly like every other action prop those
// pages already construct (approve/editAndSend/resolveSilently/...). This
// component's only job is adapting HealthReviewDecisionCard's synchronous
// onResolve callback into a call to that action.

import { useState, useTransition } from "react";
import { HealthReviewDecisionCard } from "./health-review-decision-card";
import type { HealthReviewRecord, HealthReviewStatus } from "@/lib/coach/types";

export function SupabaseHealthReviewDecisionCard({
  clientFirstName,
  healthReview,
  clientReportedDetail,
  onResolve,
  variant,
}: {
  clientFirstName: string;
  healthReview: HealthReviewRecord;
  clientReportedDetail?: string | null;
  /** A bound Server Action (see app/actions/coach-communications.ts's
   * recordHealthReviewDecisionAction) — already carries escalationId and
   * workspaceId, so this component only ever supplies the coach's actual
   * decision. */
  onResolve: (status: HealthReviewStatus, documentedLimitations?: string) => Promise<void>;
  variant?: "card" | "inline";
}) {
  const [pending, startTransition] = useTransition();
  // A failed save must never look like a recorded decision: the review stays open and the coach is told.
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <HealthReviewDecisionCard
        clientFirstName={clientFirstName}
        healthReview={healthReview}
        clientReportedDetail={clientReportedDetail}
        variant={variant}
        onResolve={(status, documentedLimitations) => {
          setError(null);
          startTransition(async () => {
            try {
              await onResolve(status, documentedLimitations);
            } catch {
              setError("Your decision wasn't saved — the health review is still open. Try again.");
            }
          });
        }}
      />
      {pending ? <p className="text-meta text-neutral">Saving your decision…</p> : null}
      {error ? (
        <p role="alert" className="text-meta text-warning-strong">
          {error}
        </p>
      ) : null}
    </div>
  );
}
