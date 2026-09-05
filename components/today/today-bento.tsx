"use client";

import { useState, type ReactNode } from "react";
import { MorningWeightTask } from "@/components/today/tasks/morning-weight-task";
import { MealTask } from "@/components/today/tasks/meal-task";
import { WorkoutTask } from "@/components/today/tasks/workout-task";
import { CardioTask } from "@/components/today/tasks/cardio-task";
import { DailyCompletionTask } from "@/components/today/tasks/daily-completion-task";
import { emphasisForState } from "@/components/today/task-shell";
import { ProgressStrip } from "@/components/today/tiles/progress-strip";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import type { DailyPlanResult, PlannerItem } from "@/lib/planning/types";
import type { DailyTaskId, DailyTaskState, MealPeriod } from "@/lib/types";

const MEAL_ID_TO_PERIOD: Partial<Record<string, MealPeriod>> = {
  breakfast: "breakfast",
  "post-workout-meal": "postWorkout",
  lunch: "lunch",
  dinner: "dinner",
  snack: "snack",
};

function renderItemFor(
  kind: string,
  id: string,
  taskState: (id: DailyTaskId) => DailyTaskState,
  emphasisOverride: "primary" | "secondary" | undefined,
  scheduleLabel: string | undefined,
  fillWidth: boolean,
  expanded: boolean,
  onToggleExpand: () => void
): ReactNode {
  if (kind === "morning-weight") {
    return (
      <MorningWeightTask
        key={id}
        state={taskState("morning-weight")}
        emphasisOverride={emphasisOverride}
        scheduleLabel={scheduleLabel}
        fillWidth={fillWidth}
        expanded={expanded}
        onToggleExpand={onToggleExpand}
      />
    );
  }
  if (kind === "workout") {
    return (
      <WorkoutTask
        key={id}
        state={taskState("workout")}
        emphasisOverride={emphasisOverride}
        scheduleLabel={scheduleLabel}
        fillWidth={fillWidth}
        expanded={expanded}
        onToggleExpand={onToggleExpand}
      />
    );
  }
  if (kind === "cardio") {
    return (
      <CardioTask
        key={id}
        state={taskState("cardio")}
        emphasisOverride={emphasisOverride}
        scheduleLabel={scheduleLabel}
        fillWidth={fillWidth}
        expanded={expanded}
        onToggleExpand={onToggleExpand}
      />
    );
  }
  if (kind === "review") {
    // The planner only ever includes a "review" item once its own
    // dayFullyResolved rule is satisfied, and selectNextAction() always
    // promotes it to the spotlight the moment it appears — so in practice
    // this branch never renders (review is always excluded as the
    // spotlight item below). Kept for safety since nothing guarantees
    // that coupling forever.
    return <DailyCompletionTask key={id} state="completed" />;
  }
  const period = MEAL_ID_TO_PERIOD[id];
  if (period) {
    return (
      <MealTask
        key={id}
        period={period}
        state={taskState(id as DailyTaskId)}
        emphasisOverride={emphasisOverride}
        scheduleLabel={scheduleLabel}
        fillWidth={fillWidth}
        expanded={expanded}
        onToggleExpand={onToggleExpand}
      />
    );
  }
  return null;
}

interface GridRow {
  items: PlannerItem[];
  fillWidth: boolean;
}

/**
 * Groups the remaining items into explicit rows in strict source order —
 * never CSS `grid-flow-row-dense` (see the module doc's Phase 4.4B-1.1
 * corrective). At most one item is ever expanded at a time (owned by
 * TodayBento below), so the only two things that ever force a tile to
 * fill its own row are: the expanded tile itself, and — so it never
 * leaves an orphaned single-column gap beside a spanning neighbor — the
 * tile immediately before it. Every other row pairs two tiles exactly as
 * before. With no expanded id (the common case), this reduces to the
 * exact original "pair up, last-odd-one-out goes full width" arrangement.
 */
function buildGridRows(items: PlannerItem[], expandedId: string | null): GridRow[] {
  const rows: GridRow[] = [];
  let i = 0;
  while (i < items.length) {
    const isExpanded = items[i].id === expandedId;
    const nextIsExpanded = i + 1 < items.length && items[i + 1].id === expandedId;
    const isLastItem = i === items.length - 1;
    if (isExpanded || nextIsExpanded || isLastItem) {
      rows.push({ items: [items[i]], fillWidth: true });
      i += 1;
    } else {
      rows.push({ items: [items[i], items[i + 1]], fillWidth: false });
      i += 2;
    }
  }
  return rows;
}

/**
 * Today's adaptive bento grid — the planner's full day, composed rather
 * than stacked, following the spatial grammar in the Visual Constitution
 * §6.1: the grid composes around the content, never the other way around.
 *
 * - Current Priority + Day Progress share ONE card (a hairline divider
 *   inside it, same pattern as the Fuel/Training panel above) — a
 *   coordinated region, not a dominant tile with a detached strip beneath
 *   it. When there's no spotlight, Day Progress gets its own compact card
 *   instead of attaching to nothing.
 * - Every remaining item renders in explicit rows (see buildGridRows) —
 *   never a single dense-packed CSS grid. Phase 4.4B-1.1 corrective: dense
 *   packing let an opened tile's later siblings backfill the gap it left
 *   behind, visually reordering the approved task sequence. Rows are now
 *   computed directly from canonical source order instead.
 * - `expandedTaskId` is the ONE piece of expansion state for the whole
 *   grid — previously each TaskShell instance owned its own local
 *   `expanded` boolean, so multiple tiles could be open simultaneously.
 *   Tapping a tile toggles it via the same setter every tile shares, which
 *   both enforces "only one open at a time" and automatically closes
 *   whichever tile was previously expanded.
 *
 * Nothing here is a new decision: the spotlight is exactly
 * usePrototypeState().dailyPlan.nextAction, and emphasis tiers are the
 * existing emphasisForState() mapping.
 */
export function TodayBento({ dailyPlan }: { dailyPlan: DailyPlanResult }) {
  const { tasks } = usePrototypeState();
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const taskState = (id: DailyTaskId): DailyTaskState => tasks.find((t) => t.id === id)?.state ?? "upcoming";

  function emphasisFor(state: DailyTaskState, isNextAction: boolean): "primary" | "secondary" | undefined {
    if (isNextAction) return "primary";
    return emphasisForState(state) === "primary" ? "secondary" : undefined;
  }

  const next = dailyPlan.nextAction;
  const spotlightId = next && next.kind !== "training-time" ? next.id : null;
  const spotlightItem = spotlightId ? dailyPlan.items.find((i) => i.id === spotlightId) : undefined;

  const spotlight =
    spotlightItem && next
      ? renderItemFor(
          spotlightItem.kind,
          spotlightItem.id,
          taskState,
          "primary",
          spotlightItem.timeLabel ?? undefined,
          false,
          false,
          () => {}
        )
      : null;

  const remainingItems = dailyPlan.items.filter((item) => {
    if (item.id === spotlightId) return false;
    const s = taskState(item.id as DailyTaskId);
    return s !== "completed" && s !== "skipped";
  });

  const gridRows = buildGridRows(remainingItems, expandedTaskId);

  return (
    <div className="px-4">
      {/* Current Priority + Day Progress: one coordinated region. */}
      {spotlight ? (
        <div className="divide-y divide-border/70 rounded-[var(--radius-lg)] bg-charcoal shadow-[var(--shadow-subtle)]">
          {spotlight}
          <ProgressStrip />
        </div>
      ) : (
        <ProgressStrip attached={false} />
      )}

      {gridRows.length > 0 ? (
        <div className="mt-3 flex flex-col gap-3">
          {gridRows.map((row) => (
            <div key={row.items[0].id} className={row.fillWidth ? undefined : "grid grid-cols-2 gap-3"}>
              {row.items.map((item) => {
                const emphasisOverride = emphasisFor(taskState(item.id as DailyTaskId), item.isNextAction);
                return renderItemFor(
                  item.kind,
                  item.id,
                  taskState,
                  emphasisOverride,
                  item.timeLabel ?? undefined,
                  row.fillWidth,
                  item.id === expandedTaskId,
                  () => setExpandedTaskId((prev) => (prev === item.id ? null : item.id))
                );
              })}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
