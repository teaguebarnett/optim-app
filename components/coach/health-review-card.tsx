"use client";

import { HeartPulse } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { HEALTH_REVIEW_STATUS_LABELS } from "@/lib/coach/labels";
import { RESOLVED_HEALTH_REVIEW_STATUSES } from "@/lib/coach/types";
import type { HealthReviewRecord, HealthReviewStatus } from "@/lib/coach/types";

const STATUS_OPTIONS: HealthReviewStatus[] = [
  "review_needed",
  "discuss_with_client",
  "professional_guidance_requested",
  "professional_guidance_confirmed",
  "reviewed_by_coach",
];

/**
 * The one place Teague reviews and resolves a positive intake safety
 * response — see lib/coach/health-review.ts for what triggers one. Every
 * status here records what TEAGUE did, never a determination OPTIM made
 * about the client's safety; nothing here is labeled "medically cleared."
 * Blocks activation until resolved (see lib/coach/activation.ts) — this
 * card is the only way to change that.
 */
export function HealthReviewCard({
  healthReview,
  onChangeStatus,
}: {
  healthReview: HealthReviewRecord;
  onChangeStatus: (status: HealthReviewStatus) => void;
}) {
  const resolved = RESOLVED_HEALTH_REVIEW_STATUSES.has(healthReview.status);

  return (
    <Card className="border-l-2 border-l-error">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-error-soft text-error">
          <HeartPulse size={16} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-subheading text-off-white">Health review</p>
          <p className="mt-0.5 text-meta text-neutral">
            The client&apos;s intake flagged the following before you finalize their training. This is not a diagnosis —
            review it and record what you did.
          </p>
        </div>
      </div>

      <ul className="mt-3 space-y-1 text-sm text-off-white">
        {healthReview.reasons.map((reason, i) => (
          <li key={i}>&bull; {reason}</li>
        ))}
      </ul>

      <div className="mt-4">
        <p className="mb-1.5 text-sm font-medium text-off-white">Status</p>
        <Combobox
          ariaLabel="Health review status"
          value={healthReview.status}
          onChange={(v) => onChangeStatus(v as HealthReviewStatus)}
          options={STATUS_OPTIONS.map((status) => ({ value: status, label: HEALTH_REVIEW_STATUS_LABELS[status] }))}
        />
        <p className="mt-1.5 text-meta text-neutral">
          {resolved
            ? "Resolved — activation is no longer blocked by this review."
            : "Activation stays blocked until this is Reviewed by coach or Professional guidance confirmed."}
        </p>
      </div>
    </Card>
  );
}
