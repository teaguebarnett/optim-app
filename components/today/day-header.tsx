import { getGreeting } from "@/lib/calculations";
import { CLIENT, DAILY_PLAN, PUSH_WORKOUT, CARDIO_TARGET } from "@/lib/mock-data";
import { ProgressRing } from "@/components/ui/progress-ring";

function formatDateLabel(dateIso: string): string {
  const date = new Date(`${dateIso}T00:00:00`);
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

export function DayHeader({ completionPercent }: { completionPercent: number }) {
  const greeting = getGreeting(new Date(), CLIENT.name);

  return (
    <div className="px-4 pt-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold leading-tight text-off-white">{greeting.headline}</h1>
          <p className="mt-1 text-[15px] text-neutral">{greeting.subline}</p>
        </div>
        <div className="shrink-0">
          <ProgressRing
            percent={completionPercent}
            size={64}
            strokeWidth={6}
            label={`${completionPercent}%`}
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral">
        <span className="font-medium text-off-white">{DAILY_PLAN.dayOfWeek}</span>
        <span aria-hidden="true">·</span>
        <span>{formatDateLabel(DAILY_PLAN.dateIso)}</span>
        <span aria-hidden="true">·</span>
        <span>
          Week {DAILY_PLAN.programWeek} of {DAILY_PLAN.programTotalWeeks}
        </span>
      </div>

      <p className="mt-2 text-[15px] leading-relaxed text-off-white/90">
        {PUSH_WORKOUT.name}, four meals, and {CARDIO_TARGET.durationMin} minutes of cardio.
      </p>
    </div>
  );
}
