import { getGreeting, getTimeOfDay } from "@/lib/calculations";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { localDateDayOfWeek, resolveClientLocalTime24, startOfLocalWeek } from "@/lib/shared/local-date";
import { deriveProgramWeek } from "@/lib/scheduling/enrollment";

function formatDateLabel(dateIso: string): string {
  const date = new Date(`${dateIso}T00:00:00`);
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

/** Greeting and current date only — no completion percentage. The Today
 * screen leads with "what's next," not a number; see NextActionBanner and
 * FuelSection for where the day's real progress is actually shown.
 *
 * Phase 4.1 — day-of-week, date, and program week are derived from the
 * client's real dateIso/programEnrollment rather than the old hardcoded
 * DAILY_PLAN constant, so this no longer silently freezes on the date the
 * demo catalog was authored around.
 *
 * Phase 4.1 corrective — the greeting's weekday, "start of week" claim, and
 * time-of-day all now derive from the same client-local date/timezone this
 * header already uses, instead of a hardcoded "Monday" subline or the
 * machine's own clock. See lib/calculations.ts's getGreeting/getTimeOfDay.
 *
 * Composition refinement — getGreeting() still returns a `subline` (e.g.
 * "Happy Wednesday. Week 8 is underway.") but it's deliberately not
 * rendered here anymore: it restated exactly what the day/date/week meta
 * row directly below already says. The header is the headline plus that
 * one meta row now — nothing redundant in between. */
export function DayHeader() {
  const { state, activeContext } = usePrototypeState();
  const dayOfWeek = localDateDayOfWeek(state.dateIso);
  const programWeek = deriveProgramWeek(state.programEnrollment, state.dateIso);
  const weekStartDateIso = startOfLocalWeek(state.dateIso, state.programEnrollment.weekStartsOn);
  const isStartOfWeek = state.dateIso === weekStartDateIso;
  const localHour = Number(resolveClientLocalTime24(new Date(), state.programEnrollment.timeZone).split(":")[0]);
  const timeOfDay = getTimeOfDay(localHour);
  const greeting = getGreeting(dayOfWeek, timeOfDay, activeContext.clientProfile?.name ?? "there", {
    programWeek,
    isStartOfWeek,
  });

  return (
    <div className="px-4 pt-4">
      <h1 className="text-display text-off-white">{greeting.headline}</h1>

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-neutral">
        <span className="font-medium text-off-white">{dayOfWeek}</span>
        <span aria-hidden="true">·</span>
        <span>{formatDateLabel(state.dateIso)}</span>
        {programWeek !== null ? (
          <>
            <span aria-hidden="true">·</span>
            <span>
              Week {programWeek} of {state.programEnrollment.durationWeeks}
            </span>
          </>
        ) : null}
      </div>
    </div>
  );
}
