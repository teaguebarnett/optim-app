import type { ProgressHeaderModel } from "@/lib/progress/types";

function contextLabel(header: ProgressHeaderModel): string {
  if (header.programPhase === "active_program" && header.programWeek !== null) {
    return `Week ${header.programWeek} of ${header.programTotalWeeks}`;
  }
  if (header.programPhase === "pre_program") return "Program starts soon";
  if (header.programPhase === "post_program") return "Program complete";
  return "";
}

/** Structure is reserved for a future calendar entry point (Phase 4.3) —
 * deliberately not rendered here, since Phase 4.2 has no calendar
 * destination to open yet. See the "Do not render an inert calendar
 * button" requirement. */
export function ProgressHeader({ header }: { header: ProgressHeaderModel }) {
  const context = contextLabel(header);
  return (
    <div className="flex items-center justify-between px-4">
      <h1 className="text-xl font-semibold text-off-white">Progress</h1>
      {context ? <span className="text-sm text-neutral">{context}</span> : null}
    </div>
  );
}
