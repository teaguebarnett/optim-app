import { getGreeting } from "@/lib/calculations";
import { DAILY_PLAN } from "@/lib/mock-data";
import { usePrototypeState } from "@/hooks/use-prototype-state";

function formatDateLabel(dateIso: string): string {
  const date = new Date(`${dateIso}T00:00:00`);
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

/** Greeting and current date only — no completion percentage. The Today
 * screen leads with "what's next," not a number; see NextActionBanner and
 * FuelSection for where the day's real progress is actually shown. */
export function DayHeader() {
  const { activeContext } = usePrototypeState();
  const greeting = getGreeting(new Date(), activeContext.clientProfile?.name ?? "there");

  return (
    <div className="px-4 pt-5">
      <h1 className="text-2xl font-semibold leading-tight text-off-white">{greeting.headline}</h1>
      <p className="mt-1 text-[15px] text-neutral">{greeting.subline}</p>

      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral">
        <span className="font-medium text-off-white">{DAILY_PLAN.dayOfWeek}</span>
        <span aria-hidden="true">·</span>
        <span>{formatDateLabel(DAILY_PLAN.dateIso)}</span>
        <span aria-hidden="true">·</span>
        <span>
          Week {DAILY_PLAN.programWeek} of {DAILY_PLAN.programTotalWeeks}
        </span>
      </div>
    </div>
  );
}
