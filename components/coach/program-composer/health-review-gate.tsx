"use client";

import { HealthReviewDecisionCard } from "@/components/coach/health-review-decision-card";
import type { HealthReviewRecord, HealthReviewStatus } from "@/lib/coach/types";

/**
 * The unified OPTIM Plan must always open, and a blocked generation must
 * explain the real concern with one clear decision rather than a dead end.
 * Phase 5.6A.1 — reuses the same HealthReviewDecisionCard the client page
 * shows, rather than a second, differently-worded resolution surface; the
 * outcome the coach records here is exactly the one that already unlocks
 * generation everywhere else (see lib/coach/activation-lifecycle.ts's
 * healthReviewPermitsActivation).
 */
export function HealthReviewGate({
  clientFirstName,
  healthReview,
  clientReportedDetail,
  onChangeStatus,
}: {
  clientFirstName: string;
  healthReview: HealthReviewRecord;
  clientReportedDetail?: string | null;
  onChangeStatus: (status: HealthReviewStatus, documentedLimitations?: string) => void;
}) {
  return <HealthReviewDecisionCard clientFirstName={clientFirstName} healthReview={healthReview} clientReportedDetail={clientReportedDetail} onResolve={onChangeStatus} />;
}
