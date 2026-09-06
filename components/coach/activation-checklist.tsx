"use client";

import Link from "next/link";
import { CheckCircle2, XCircle, Info, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { ActivationReadiness } from "@/lib/coach/types";

/**
 * The one place activation-readiness (see lib/coach/activation.ts) is
 * actually shown and gated — a meaningful checklist, not a technical status
 * dump. Every unmet requirement carries its own honest reason and a
 * "Blocking" label (never color alone), and the Activate action is disabled
 * outright whenever any requirement isn't met, so invalid activation is
 * structurally impossible from this UI, not just discouraged. The optional
 * weekly check-in is shown as its own distinct, clearly non-blocking row —
 * it never appears in readiness.requirements at all (see
 * lib/coach/activation.ts's own doc), so this is the one place a coach sees
 * it alongside the real requirements without mistaking it for one.
 */
export function ActivationChecklist({
  readiness,
  alreadyActive,
  onActivate,
  checkInAssigned,
  compact,
}: {
  readiness: ActivationReadiness;
  alreadyActive: boolean;
  onActivate: () => void;
  /** undefined when there's no program yet to attach a check-in to at all. */
  checkInAssigned?: boolean;
  /** Phase 5.4B completion pass — true on the Activation Workspace, where
   * BlockerList (see components/coach/blocker-list.tsx) already shows each
   * unmet requirement's full reason and direct action prominently above
   * this card. Compact mode shows only label + Blocking/Complete here, so
   * the same issue is never explained twice on one screen — this becomes
   * purely the overall gate + the Activate action, not a second blocker
   * list. */
  compact?: boolean;
}) {
  const metCount = readiness.requirements.filter((r) => r.met).length;
  const total = readiness.requirements.length;
  const firstUnmet = readiness.requirements.find((r) => !r.met);

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <p className="text-subheading text-off-white">Activation readiness</p>
        <span className="text-meta text-neutral">
          {metCount} of {total} complete
        </span>
      </div>

      <ul className="mt-3.5 space-y-2.5">
        {readiness.requirements.map((req) => (
          <li
            key={req.id}
            className={cn(
              "flex items-start gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2",
              req.met || compact ? "" : "bg-error-soft/60"
            )}
          >
            {req.met ? (
              <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
            ) : (
              <XCircle size={17} className="mt-0.5 shrink-0 text-error" aria-hidden="true" />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className={cn("text-sm", req.met ? "font-medium text-off-white" : compact ? "text-off-white" : "font-medium text-off-white")}>{req.label}</p>
                <span
                  className={cn(
                    "shrink-0 text-[10px] font-semibold uppercase tracking-wide",
                    req.met ? "text-success" : "text-error"
                  )}
                >
                  {req.met ? "Complete" : "Blocking"}
                </span>
              </div>
              {!compact && !req.met && req.reason ? <p className="mt-0.5 text-meta text-neutral">{req.reason}</p> : null}
              {!compact && !req.met && req.actionHref ? (
                <Link href={req.actionHref} className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-accent-strong hover:underline">
                  {req.actionLabel ?? "Complete it"} <ArrowRight size={13} />
                </Link>
              ) : null}
            </div>
          </li>
        ))}

        {checkInAssigned !== undefined ? (
          <li className="flex items-start gap-2.5 border-t border-border px-2.5 pt-3">
            <Info size={17} className="mt-0.5 shrink-0 text-steel" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-off-white">Weekly check-in</p>
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-steel">Optional</span>
              </div>
              <p className="mt-0.5 text-meta text-neutral">{checkInAssigned ? "Assigned" : "None for now — never required"}</p>
            </div>
          </li>
        ) : null}
      </ul>

      <Button className="mt-4 w-full" size="lg" disabled={!readiness.ready || alreadyActive} onClick={onActivate}>
        {alreadyActive ? "Already active" : "Activate client"}
      </Button>
      {!readiness.ready && !alreadyActive && firstUnmet ? (
        <p className="mt-2 text-center text-meta text-neutral">Blocked by: {firstUnmet.label}</p>
      ) : null}
    </Card>
  );
}
