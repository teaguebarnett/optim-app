import { Target, Dumbbell, Salad, HeartPulse, CalendarClock } from "lucide-react";
import type { OptimClientBrief as OptimClientBriefContent } from "@/lib/coach/activation-brief";

function BriefRow({ icon: Icon, label, value, tone }: { icon: typeof Target; label: string; value: string; tone?: "warning" }) {
  return (
    <div className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
      <span className={tone === "warning" ? "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning-strong" : "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brass-soft text-brass-strong"}>
        <Icon size={14} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-navy-ink-muted">{label}</p>
        <p className="mt-0.5 text-sm text-navy-ink">{value}</p>
      </div>
    </div>
  );
}

/**
 * Phase 5.6A.1 — the "OPTIM Client Brief" (spec Part 1's primary client
 * brief): one coherent synthesis built from buildOptimClientBrief, replacing
 * the old stacked Activation Brief + Setup essentials + View full intake
 * trio's competing repetition. The complete raw intake still lives one level
 * deeper (see FullIntakeDisclosure), untouched.
 */
export function OptimClientBrief({ brief }: { brief: OptimClientBriefContent }) {
  return (
    <div className="pc-signature-surface rounded-[var(--radius-xl)] p-5 md:p-6">
      <p className="text-label text-navy-ink-muted">OPTIM Client Brief</p>
      <div className="mt-2 divide-y divide-white/10">
        <BriefRow icon={Target} label="Primary outcome" value={brief.primaryOutcome} />
        {brief.secondaryOutcomes ? <BriefRow icon={Target} label="Also working on" value={brief.secondaryOutcomes} /> : null}
        <BriefRow icon={Dumbbell} label="Training fit" value={brief.trainingFit} />
        <BriefRow icon={Salad} label="Nutrition reality" value={brief.nutritionReality} />
        {brief.readinessAndSafety ? <BriefRow icon={HeartPulse} label="Readiness & safety" value={brief.readinessAndSafety} tone="warning" /> : null}
        <BriefRow icon={CalendarClock} label="Start date" value={brief.startDateLabel} />
      </div>
    </div>
  );
}
