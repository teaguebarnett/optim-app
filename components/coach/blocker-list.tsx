"use client";

import Link from "next/link";
import { ArrowRight, XCircle } from "lucide-react";
import type { ActivationReadiness } from "@/lib/coach/types";

/**
 * "Required before activation" — every genuine, independent blocker exactly
 * once, each with one direct action. Phase 5.6A.1 — the health-review
 * requirement no longer renders here at all; it's its own dedicated
 * HealthReviewDecisionCard (components/coach/health-review-decision-card.tsx)
 * shown directly by the Activation Workspace, never a second, smaller
 * health control competing with it on the same page. Met requirements never
 * render here at all; see components/coach/activation-checklist.tsx (still
 * used, but only inside the secondary "Setup details" disclosure).
 */
export function BlockerList({ readiness, requirementActions }: { readiness: ActivationReadiness; requirementActions: Partial<Record<string, { href: string; label: string }>> }) {
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
              {requirementActions[req.id] ? (
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
