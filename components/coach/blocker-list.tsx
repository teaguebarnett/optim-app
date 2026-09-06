"use client";

import Link from "next/link";
import { ArrowRight, XCircle } from "lucide-react";
import { Combobox } from "@/components/ui/combobox";
import { HEALTH_REVIEW_STATUS_LABELS } from "@/lib/coach/labels";
import type { ActivationReadiness, HealthReviewRecord, HealthReviewStatus } from "@/lib/coach/types";

const HEALTH_STATUS_OPTIONS: HealthReviewStatus[] = [
  "review_needed",
  "discuss_with_client",
  "professional_guidance_requested",
  "professional_guidance_confirmed",
  "reviewed_by_coach",
];

/**
 * "Required before activation" (spec §4.3) — every genuine blocker exactly
 * once, each with one direct action. The health-review requirement gets an
 * inline status control right in its own row (the same real
 * HealthReviewStatus transitions components/coach/health-review-card.tsx
 * offers) rather than a second full card elsewhere on the page — this is
 * the ONE place a coach sees and resolves a client's flagged health/injury
 * concern on this page. Met requirements never render here at all; see
 * components/coach/activation-checklist.tsx (still used, but only for the
 * compact completed/optional summary, not blockers).
 */
export function BlockerList({
  readiness,
  healthReview,
  onChangeHealthReviewStatus,
  requirementActions,
}: {
  readiness: ActivationReadiness;
  healthReview: HealthReviewRecord | null;
  onChangeHealthReviewStatus: (status: HealthReviewStatus) => void;
  requirementActions: Partial<Record<string, { href: string; label: string }>>;
}) {
  const blockers = readiness.requirements.filter((r) => !r.met);

  if (blockers.length === 0) {
    return (
      <div className="rounded-[var(--radius-md)] border border-border bg-success-soft/40 px-4 py-3">
        <p className="text-sm font-medium text-success">Every requirement is met — ready to activate.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {blockers.map((req) => (
        <div key={req.id} className="rounded-[var(--radius-md)] border border-error/30 bg-error-soft/50 px-3.5 py-3">
          <div className="flex items-start gap-2.5">
            <XCircle size={16} className="mt-0.5 shrink-0 text-error" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-off-white">{req.label}</p>
              {req.reason ? <p className="mt-0.5 text-meta text-neutral">{req.reason}</p> : null}

              {req.id === "health_review_resolved" && healthReview ? (
                <div className="mt-2.5 space-y-1.5">
                  <ul className="space-y-0.5 text-sm text-off-white">
                    {healthReview.reasons.map((reason, i) => (
                      <li key={i}>&bull; {reason}</li>
                    ))}
                  </ul>
                  <Combobox
                    ariaLabel="Health review status"
                    value={healthReview.status}
                    onChange={(v) => onChangeHealthReviewStatus(v as HealthReviewStatus)}
                    options={HEALTH_STATUS_OPTIONS.map((status) => ({ value: status, label: HEALTH_REVIEW_STATUS_LABELS[status] }))}
                  />
                </div>
              ) : requirementActions[req.id] ? (
                <Link href={requirementActions[req.id]!.href} className="mt-1.5 inline-flex items-center gap-1 text-sm font-medium text-accent-strong hover:underline">
                  {requirementActions[req.id]!.label} <ArrowRight size={13} />
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
