"use client";

import { useState } from "react";
import { HeartPulse } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { HealthReviewCard } from "@/components/coach/health-review-card";
import type { HealthReviewRecord, HealthReviewStatus } from "@/lib/coach/types";

/**
 * Phase 5.5A Part 3's health-review gate correction — the unified OPTIM
 * Plan must always open, and a blocked generation must explain the real
 * concern with one clear action rather than a dead end. Reuses the
 * existing HealthReviewCard (the same real HealthReviewStatus transitions
 * everywhere else in the product already uses) rather than inventing a
 * parallel resolution flow — the outcome the coach records here is exactly
 * the one that already unlocks generation everywhere else (see
 * lib/coach/activation-lifecycle.ts's healthReviewPermitsActivation).
 */
export function HealthReviewGate({
  clientFirstName,
  healthReview,
  onChangeStatus,
}: {
  clientFirstName: string;
  healthReview: HealthReviewRecord;
  onChangeStatus: (status: HealthReviewStatus) => void;
}) {
  const [reviewing, setReviewing] = useState(false);

  return (
    <Card className="border-l-2 border-l-warning">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning-strong">
            <HeartPulse size={18} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-subheading text-off-white">Generation paused</p>
            <p className="mt-0.5 text-sm text-off-white">
              {clientFirstName} reported: {healthReview.reasons.join("; ")}. Review the concern so OPTIM can program around it safely.
            </p>
          </div>
        </div>
        {!reviewing ? (
          <Button size="sm" onClick={() => setReviewing(true)}>
            Review health concern
          </Button>
        ) : null}
      </div>

      {reviewing ? (
        <div className="mt-4 border-t border-border pt-4">
          <p className="mb-2 text-meta text-neutral">
            Record what you did — the important outcome is that you reviewed the concern and set a real programming boundary, not that the pain itself is
            &quot;resolved.&quot;
          </p>
          <HealthReviewCard healthReview={healthReview} onChangeStatus={onChangeStatus} />
        </div>
      ) : null}
    </Card>
  );
}
