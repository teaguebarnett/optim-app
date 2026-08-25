// The one place Phase 4.2 assembles a full ProgressDashboardModel — every
// presentation component under components/progress/ consumes only this
// function's output, never storage or a Phase 4.1 derivation directly.

import { addDaysToLocalDate } from "../shared/local-date.ts";
import { deriveProgramPhase, deriveProgramWeek } from "../scheduling/enrollment.ts";
import { collectCurrentWeekRecords, collectDateRangeRecords } from "./collect-week-records.ts";
import type { CollectRecordsInput } from "./collect-week-records";
import { aggregateTraining } from "./aggregate-training.ts";
import { aggregateNutrition } from "./aggregate-nutrition.ts";
import { aggregateCardio } from "./aggregate-cardio.ts";
import { aggregateWeight } from "./aggregate-weight.ts";
import { aggregateCheckIn } from "./aggregate-checkin.ts";
import { aggregatePriority } from "./aggregate-priority.ts";
import { aggregateCoachGuidance } from "./aggregate-coach-guidance.ts";
import type { HistoryScope, HistoryStore } from "../history/store";
import type { CheckInScheduleConfig, ProgramEnrollment } from "../scheduling/types";
import type { AppState } from "../state";
import type { ProgressDashboardModel, ProgressSource } from "./types";
import type { ChatMessage } from "../types";

export interface BuildProgressDashboardInput {
  store: HistoryStore;
  scope: HistoryScope;
  source: ProgressSource;
  effectiveDateIso: string;
  enrollment: ProgramEnrollment;
  /** The active coach-assigned check-in, or null when none has been
   * assigned — see lib/state.ts's AppState.checkInSchedule. Null means the
   * dashboard's checkIn card model is also null (no card rendered); the
   * caller (see hooks/use-progress-dashboard.ts) decides what to pass for
   * live vs. fixture/demo mode. */
  checkInSchedule: CheckInScheduleConfig | null;
  /** Present only in live mode — used to project today's still-open day
   * without archiving it. Fixture/demo mode passes null: every date
   * resolves purely from what's already in the fixture store. */
  liveState: AppState | null;
  coachDisplayName: string;
  /** Real coach-sent messages, from live AppState.chatMessages. Empty for
   * fixture/demo mode — the fixture has no chat history, and demo mode must
   * never borrow live chat content. */
  chatMessages: ChatMessage[];
  now: Date;
}

export function buildProgressDashboard(input: BuildProgressDashboardInput): ProgressDashboardModel {
  const collectInput: CollectRecordsInput = {
    store: input.store,
    scope: input.scope,
    source: input.source,
    effectiveDateIso: input.effectiveDateIso,
    enrollment: input.enrollment,
    liveState: input.liveState,
  };

  const weekRecords = collectCurrentWeekRecords(collectInput, input.enrollment.weekStartsOn);

  const fourWeeksStart = addDaysToLocalDate(input.effectiveDateIso, -27);
  const fourWeekRecords = collectDateRangeRecords(collectInput, fourWeeksStart, input.effectiveDateIso);

  const fullProgramRecords = collectDateRangeRecords(collectInput, input.enrollment.startDateIso, input.effectiveDateIso);

  const training = aggregateTraining(weekRecords);
  const nutrition = aggregateNutrition(weekRecords);
  const cardio = aggregateCardio(weekRecords);
  const weight = aggregateWeight(fourWeekRecords, fullProgramRecords);

  // A check-in card only ever renders when the coach has actually assigned
  // one (input.checkInSchedule) — no client gets a check-in auto-populated
  // just because they exist. See AppState.checkInSchedule's doc.
  const checkIn = input.checkInSchedule
    ? aggregateCheckIn(input.store, input.scope, input.checkInSchedule, input.effectiveDateIso, input.enrollment.weekStartsOn, input.now)
    : null;

  const corrections = input.store.listCorrections(input.scope);
  const coachGuidance = aggregateCoachGuidance(input.chatMessages, corrections, input.coachDisplayName);

  // No read/unread tracking or adjustment-approval workflow exists anywhere
  // in this app's data model yet — always false, never fabricated. See
  // lib/progress/aggregate-priority.ts. With no assigned check-in at all,
  // "not_available" is the honest status to feed the priority precedence
  // (never overdue/due for a check-in that was never assigned).
  const priority = aggregatePriority({
    hasUnreadCoachFeedback: false,
    hasApprovedAdjustmentNeedingReview: false,
    checkInStatus: checkIn?.status ?? "not_available",
    correctionNeededDates: [],
  });

  return {
    source: input.source,
    effectiveDateIso: input.effectiveDateIso,
    header: {
      programWeek: deriveProgramWeek(input.enrollment, input.effectiveDateIso),
      programTotalWeeks: input.enrollment.durationWeeks,
      programPhase: deriveProgramPhase(input.enrollment, input.effectiveDateIso),
    },
    priority,
    weight,
    training,
    nutrition,
    cardio,
    checkIn,
    coachGuidance,
  };
}
