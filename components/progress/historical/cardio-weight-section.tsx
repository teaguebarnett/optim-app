import { HeartPulse, Scale } from "lucide-react";
import { SectionCard } from "./section-card";
import { OutcomeBadge } from "./outcome-badge";
import { SKIP_REASON_LABELS } from "@/components/ui/reason-picker";
import type { HistoricalCardioModel, HistoricalWeightModel } from "@/lib/progress/types";

function CardioBody({ cardio }: { cardio: HistoricalCardioModel }) {
  if (cardio.outcome === "no_record") {
    return <p className="text-sm text-neutral">Nothing recorded for this day.</p>;
  }
  if (cardio.outcome === "not_applicable") {
    return <p className="text-sm text-neutral">Not scheduled for this day.</p>;
  }
  if (cardio.status === "not-started") {
    return <p className="text-sm text-neutral">Not started.</p>;
  }
  return (
    <div>
      <p className="text-sm text-off-white">
        {cardio.durationMin} min{cardio.targetDurationMin !== null ? <span className="text-neutral"> / {cardio.targetDurationMin} min target</span> : null}
      </p>
      {cardio.optionName ? (
        <p className="mt-0.5 text-xs text-neutral">
          {cardio.optionName}
          {cardio.usedApprovedAlternative ? " (approved alternative)" : ""}
        </p>
      ) : null}
      {cardio.skipReason ? <p className="mt-0.5 text-xs text-neutral">Reason: {SKIP_REASON_LABELS[cardio.skipReason]}</p> : null}
      {cardio.completedTimeLabel ? <p className="mt-0.5 text-xs text-neutral">Logged {cardio.completedTimeLabel}</p> : null}
    </div>
  );
}

function WeightBody({ weight }: { weight: HistoricalWeightModel }) {
  if (weight.weightLb === null) {
    return <p className="text-sm text-neutral">{weight.skipped ? "Skipped." : "Not logged."}</p>;
  }
  return (
    <div>
      <p className="text-sm text-off-white">
        {weight.weightLb} lb{weight.isCorrected ? <span className="ml-1 text-xs text-warning">(corrected)</span> : null}
      </p>
      {weight.loggedTimeLabel ? <p className="mt-0.5 text-xs text-neutral">Logged {weight.loggedTimeLabel}</p> : null}
    </div>
  );
}

export function CardioWeightSection({ cardio, weight }: { cardio: HistoricalCardioModel; weight: HistoricalWeightModel }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <SectionCard title="Cardio" icon={<HeartPulse size={16} aria-hidden="true" />} headerRight={<OutcomeBadge outcome={cardio.outcome} />}>
        <CardioBody cardio={cardio} />
      </SectionCard>
      <SectionCard title="Body weight" icon={<Scale size={16} aria-hidden="true" />}>
        <WeightBody weight={weight} />
      </SectionCard>
    </div>
  );
}
