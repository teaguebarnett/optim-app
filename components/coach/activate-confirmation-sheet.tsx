"use client";

import { CalendarClock, Flame, Beef, Info } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { deriveProgramWeek } from "@/lib/scheduling/enrollment";
import type { AppState } from "@/lib/state";

function SummaryRow({ icon: Icon, label, value }: { icon: typeof CalendarClock; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-raised text-neutral">
        <Icon size={15} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 text-sm text-neutral">{label}</span>
      <span className="shrink-0 text-sm font-semibold text-off-white">{value}</span>
    </div>
  );
}

/**
 * The one, deliberately important confirmation shown before an activation
 * actually fires — a real human handoff, not an ordinary "are you sure"
 * modal. Every value here is read straight from the client's own real
 * AppState (see lib/coach/setup.ts) — nothing summarized here is invented
 * or rounded from a different source. One unmistakable primary action, one
 * quiet cancel; no celebration animation — the calm confirmation is the
 * status change itself once this closes.
 */
export function ActivateConfirmationSheet({
  open,
  onClose,
  onConfirm,
  clientName,
  clientAppState,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  clientName: string;
  clientAppState: AppState | null;
}) {
  const enrollment = clientAppState?.programEnrollment ?? null;
  const targets = clientAppState?.nutritionTargets ?? null;
  const weekOne = enrollment ? deriveProgramWeek(enrollment, enrollment.startDateIso) : null;
  const startDateLabel = enrollment ? new Date(`${enrollment.startDateIso}T00:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric" }) : "—";

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Activate ${clientName}?`}
      description="They'll immediately get access to their daily plan, built from exactly what's below."
      footer={
        <div className="flex gap-2">
          <Button className="flex-1" size="lg" onClick={onConfirm}>
            Confirm activation
          </Button>
          <Button variant="ghost" size="lg" onClick={onClose}>
            Cancel
          </Button>
        </div>
      }
    >
      <div className="divide-y divide-border rounded-[var(--radius-md)] bg-surface-input px-3.5">
        <SummaryRow icon={CalendarClock} label="Start date" value={enrollment ? `${startDateLabel}${weekOne === 1 ? " · Week 1" : ""}` : "—"} />
        <SummaryRow icon={CalendarClock} label="Duration" value={enrollment ? `${enrollment.durationWeeks} weeks` : "—"} />
        <SummaryRow icon={Flame} label="Daily calories" value={targets ? `${targets.calories} cal` : "—"} />
        <SummaryRow icon={Beef} label="Macros" value={targets ? `${targets.proteinG}P / ${targets.carbsG}C / ${targets.fatG}F` : "—"} />
        <SummaryRow icon={Info} label="Weekly check-in" value={clientAppState?.checkInSchedule ? "Assigned" : "None for now"} />
      </div>
    </Sheet>
  );
}
