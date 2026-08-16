// Isolated, deterministic demo history fixture — Phase 4 decision: seed data
// must be fixture-isolated (never mixed with real live history), easy to
// reset, and never fabricate live programming. Loading/clearing this only
// ever touches the separate FIXTURE_HISTORY_STORAGE_KEY store instance (see
// lib/history/local-storage-history-store.ts) — it can never overwrite or
// leak into a client's real archived days.
//
// Deterministic: every date is computed as an offset from an explicit
// `anchorDateIso` the caller supplies (normally "today"), never from
// Date.now()/Math.random() inside this module — the same anchor always
// produces the exact same fixture content, which is what makes loading it
// twice idempotent and its content predictable for manual testing.
//
// Content reuses the demo's one real Workout (PUSH_WORKOUT) and real
// CardioOptions/MealOptions for every fixture day rather than inventing new
// exercise/meal content — consistent with the Phase 4 decision that no new
// Tue/Thu/Fri/Sat program content is authored in Phase 4.1, and avoids
// fabricating catalog detail nothing else in the app backs.

import { CARDIO_PRESCRIPTIONS_BY_CLIENT, MEAL_OPTIONS, NUTRITION_TARGETS, PUSH_WORKOUT } from "../mock-data.ts";
import { CLIENT_PROFILE_DEMO, WORKSPACE_OPTIM_ID } from "../tenancy/seed.ts";
import { addDaysToLocalDate, localDateDayOfWeek, startOfLocalWeek } from "../shared/local-date.ts";
import { deriveProgramPhase, deriveProgramWeek } from "../scheduling/enrollment.ts";
import { authorshipClient, authorshipSystem } from "./shared-types.ts";
import { buildCorrectionId, buildDailyRecordId, buildWeeklyReviewId } from "./types.ts";
import type { Authorship } from "./shared-types";
import type { ProgramEnrollment } from "../scheduling/types";
import type { MealPeriod, MealSelectionSource, PainReport, SkipReason } from "../types";
import type { Correction, DailyRecord, MealSelectionSnapshot, TrainingDayType, WeeklyReview } from "./types";

const COACH_ID = CLIENT_PROFILE_DEMO.primaryCoachId;

function authorshipCoach(): Authorship {
  return { authorKind: "coach", authorId: COACH_ID };
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function meal(period: MealPeriod, source: MealSelectionSource, completedAtIso: string, skipReason?: SkipReason): MealSelectionSnapshot {
  if (source === "skipped") {
    return { period, source, skipReason, completedAtIso };
  }
  const option = MEAL_OPTIONS[period][0];
  return { period, source: "option", optionId: option.id, macros: deepClone(option.macros), completedAtIso };
}

function fullMealsForDay(dateIso: string, source: MealSelectionSource = "option"): Partial<Record<MealPeriod, MealSelectionSnapshot>> {
  const periods: MealPeriod[] = ["breakfast", "postWorkout", "lunch", "dinner", "snack"];
  const out: Partial<Record<MealPeriod, MealSelectionSnapshot>> = {};
  for (const period of periods) {
    out[period] = meal(period, source, `${dateIso}T18:00:00.000Z`, source === "skipped" ? "forgot" : undefined);
  }
  return out;
}

interface FixtureDayInput {
  dateIso: string;
  trainingDayType: TrainingDayType;
  sessionStatus: "completed" | "ended-early" | "skipped" | null;
  workingSetsCompleted: number;
  skipReason?: SkipReason;
  painReports?: PainReport[];
  meals: Partial<Record<MealPeriod, MealSelectionSnapshot>>;
  cardio: { status: "completed" | "partial" | "skipped" | "not-started"; durationMin: number; optionId: string; skipReason?: SkipReason };
  weightLb: number | null;
  weightSkipped: boolean;
}

function buildFixtureDay(enrollment: ProgramEnrollment, input: FixtureDayInput): DailyRecord {
  const workingSetsPrescribed = input.trainingDayType === "scheduled_workout"
    ? PUSH_WORKOUT.exercises.reduce((sum, e) => sum + e.prescribedSets.filter((s) => !s.isWarmup).length, 0)
    : 0;

  const cardioOption = CARDIO_PRESCRIPTIONS_BY_CLIENT[CLIENT_PROFILE_DEMO.id]?.options.find(
    (o) => o.id === input.cardio.optionId
  ) ?? null;

  return {
    id: buildDailyRecordId({
      workspaceId: WORKSPACE_OPTIM_ID,
      clientId: CLIENT_PROFILE_DEMO.id,
      enrollmentId: enrollment.id,
      dateIso: input.dateIso,
      source: "fixture",
    }),
    schemaVersion: 1,
    workspaceId: WORKSPACE_OPTIM_ID,
    clientId: CLIENT_PROFILE_DEMO.id,
    coachId: COACH_ID,
    source: "fixture",
    authorship: authorshipClient(CLIENT_PROFILE_DEMO.id),
    createdAtIso: `${input.dateIso}T23:59:00.000Z`,
    enrollmentId: enrollment.id,
    dateIso: input.dateIso,
    dayOfWeek: localDateDayOfWeek(input.dateIso),
    programWeek: deriveProgramWeek(enrollment, input.dateIso),
    programPhase: deriveProgramPhase(enrollment, input.dateIso),
    training: {
      trainingDayType: input.trainingDayType,
      prescribedWorkoutSnapshot: input.trainingDayType === "scheduled_workout" ? deepClone(PUSH_WORKOUT) : null,
      sessionStatus: input.sessionStatus,
      exerciseLogs: {},
      skipReason: input.skipReason,
      painReports: input.painReports ?? [],
      workingSetsCompleted: input.workingSetsCompleted,
      workingSetsPrescribed,
    },
    nutrition: {
      meals: input.meals,
      periodsInPlan: ["breakfast", "postWorkout", "lunch", "dinner", "snack"],
      targetsSnapshot: deepClone(NUTRITION_TARGETS),
    },
    cardio: {
      status: input.cardio.status,
      durationMin: input.cardio.durationMin,
      selectedOptionSnapshot: cardioOption ? deepClone(cardioOption) : null,
      skipReason: input.cardio.skipReason,
      completedAtIso: input.cardio.status !== "skipped" ? `${input.dateIso}T19:00:00.000Z` : undefined,
    },
    weight: {
      weightLb: input.weightLb,
      loggedAtIso: input.weightLb !== null ? `${input.dateIso}T07:00:00.000Z` : undefined,
      skipped: input.weightSkipped,
    },
  };
}

/**
 * A minimal, isolated weight-only record — no prescribed workout, no meal
 * plan, no cardio prescription claimed for that day. Used only to extend
 * the fixture's weight history further back than the six representative
 * days above (Phase 4.2 correction: gives the Body Weight card's "4 Weeks"
 * vs "Full Program" range controls a genuinely different dataset to show).
 * trainingDayType "scheduled_rest" is a real, non-fabricated classification
 * ("nothing was prescribed/logged that day"), never "skipped" or
 * "completed" — see the module doc's "no unrelated prescribed tasks"
 * requirement. These dates are always more than four weeks before the
 * fixture's other six days, so they can never affect current-week
 * training/nutrition/cardio aggregates (see lib/progress/aggregate-*.ts,
 * which only ever look at the most recent 7 days).
 */
function buildWeightOnlyFixtureDay(enrollment: ProgramEnrollment, dateIso: string, weightLb: number): DailyRecord {
  return buildFixtureDay(enrollment, {
    dateIso,
    trainingDayType: "scheduled_rest",
    sessionStatus: null,
    workingSetsCompleted: 0,
    meals: {},
    cardio: { status: "not-started", durationMin: 0, optionId: "cardio-stairmaster" },
    weightLb,
    weightSkipped: false,
  });
}

export interface DemoHistoryFixture {
  dailyRecords: DailyRecord[];
  corrections: Correction[];
  weeklyReviews: WeeklyReview[];
}

/**
 * Builds six representative past days ending the day before `anchorDateIso`
 * (never on or after the anchor, so fixture data can never collide with a
 * genuinely live day): a fully complete day, a partial day, a fully missed
 * day, a rest day, a day with a pain report, and a day using the approved
 * cardio alternative — plus three isolated older weight-only days near the
 * program start (Phase 4.2 correction, see buildWeightOnlyFixtureDay) and
 * one example Correction and one example WeeklyReview, so every Phase 4.1
 * record type has at least one real, inspectable instance.
 */
export function buildDemoHistoryFixture(anchorDateIso: string, enrollment: ProgramEnrollment): DemoHistoryFixture {
  const dMinus = (n: number) => addDaysToLocalDate(anchorDateIso, -n);

  const completeDay = buildFixtureDay(enrollment, {
    dateIso: dMinus(1),
    trainingDayType: "scheduled_workout",
    sessionStatus: "completed",
    workingSetsCompleted: 15,
    meals: fullMealsForDay(dMinus(1)),
    cardio: { status: "completed", durationMin: 20, optionId: "cardio-stairmaster" },
    weightLb: 191.6,
    weightSkipped: false,
  });

  const partialDay = buildFixtureDay(enrollment, {
    dateIso: dMinus(2),
    trainingDayType: "scheduled_workout",
    sessionStatus: "ended-early",
    workingSetsCompleted: 8,
    skipReason: "excessive-fatigue",
    meals: {
      breakfast: meal("breakfast", "option", `${dMinus(2)}T08:00:00.000Z`),
      postWorkout: meal("postWorkout", "option", `${dMinus(2)}T11:00:00.000Z`),
      lunch: meal("lunch", "option", `${dMinus(2)}T13:00:00.000Z`),
      // dinner/snack intentionally absent — never logged that day.
    },
    cardio: { status: "partial", durationMin: 10, optionId: "cardio-stairmaster" },
    weightLb: 192.0,
    weightSkipped: false,
  });

  const missedDay = buildFixtureDay(enrollment, {
    dateIso: dMinus(3),
    trainingDayType: "scheduled_workout",
    sessionStatus: "skipped",
    workingSetsCompleted: 0,
    skipReason: "feeling-sick",
    meals: fullMealsForDay(dMinus(3), "skipped"),
    cardio: { status: "skipped", durationMin: 0, optionId: "cardio-stairmaster", skipReason: "feeling-sick" },
    weightLb: null,
    weightSkipped: true,
  });

  const restDay = buildFixtureDay(enrollment, {
    dateIso: dMinus(4),
    trainingDayType: "scheduled_rest",
    sessionStatus: null,
    workingSetsCompleted: 0,
    meals: fullMealsForDay(dMinus(4)),
    cardio: { status: "completed", durationMin: 20, optionId: "cardio-stairmaster" },
    weightLb: 192.6,
    weightSkipped: false,
  });

  const painReportDay = buildFixtureDay(enrollment, {
    dateIso: dMinus(5),
    trainingDayType: "scheduled_workout",
    sessionStatus: "completed",
    workingSetsCompleted: 15,
    painReports: [
      {
        id: `pain-fixture-${dMinus(5)}`,
        workspaceId: WORKSPACE_OPTIM_ID,
        clientId: CLIENT_PROFILE_DEMO.id,
        createdAtIso: `${dMinus(5)}T18:30:00.000Z`,
        exerciseId: "incline-db-press",
        location: "Right shoulder",
        ratingZeroToTen: 3,
        onset: "During the final working set",
        causedByMovement: "Incline Dumbbell Press",
        continuedAfterSet: false,
        affectsOutsideGym: false,
        note: "Mild tightness, eased off after the set.",
      },
    ],
    meals: fullMealsForDay(dMinus(5)),
    cardio: { status: "completed", durationMin: 20, optionId: "cardio-stairmaster" },
    weightLb: 193.0,
    weightSkipped: false,
  });

  const cardioAlternativeDay = buildFixtureDay(enrollment, {
    dateIso: dMinus(6),
    trainingDayType: "scheduled_workout",
    sessionStatus: "completed",
    workingSetsCompleted: 15,
    meals: fullMealsForDay(dMinus(6)),
    cardio: { status: "completed", durationMin: 12, optionId: "cardio-hiit" },
    weightLb: 193.4,
    weightSkipped: false,
  });

  // Extends weight history back toward the program start (well beyond the
  // four-week cutoff) so the Body Weight card's "4 Weeks" and "Full
  // Program" range controls show genuinely different datasets — see
  // buildWeightOnlyFixtureDay's doc. Anchored to enrollment.startDateIso
  // itself (never a hardcoded day-offset from the anchor date), so these
  // three dates are always safely within the active enrollment regardless
  // of which real weekday the fixture happens to be built on.
  const olderWeighIn1 = buildWeightOnlyFixtureDay(enrollment, addDaysToLocalDate(enrollment.startDateIso, 3), 197.4);
  const olderWeighIn2 = buildWeightOnlyFixtureDay(enrollment, addDaysToLocalDate(enrollment.startDateIso, 10), 196.8);
  const olderWeighIn3 = buildWeightOnlyFixtureDay(enrollment, addDaysToLocalDate(enrollment.startDateIso, 17), 196.0);

  const dailyRecords = [
    completeDay,
    partialDay,
    missedDay,
    restDay,
    painReportDay,
    cardioAlternativeDay,
    olderWeighIn1,
    olderWeighIn2,
    olderWeighIn3,
  ];

  // One example correction: the client's actual cardio duration on the
  // partial day was later confirmed (via chat, outside this prototype) to
  // be a bit longer than first logged.
  const correctionCreatedAtIso = `${dMinus(2)}T20:00:00.000Z`;
  const correction: Correction = {
    id: buildCorrectionId({ dailyRecordId: partialDay.id, fieldPath: "cardio.durationMin", createdAtIso: correctionCreatedAtIso }),
    schemaVersion: 1,
    workspaceId: WORKSPACE_OPTIM_ID,
    clientId: CLIENT_PROFILE_DEMO.id,
    coachId: COACH_ID,
    source: "correction",
    authorship: authorshipCoach(),
    createdAtIso: correctionCreatedAtIso,
    enrollmentId: enrollment.id,
    dailyRecordId: partialDay.id,
    effectiveDateIso: partialDay.dateIso,
    fieldPath: "cardio.durationMin",
    previousValue: 10,
    correctedValue: 15,
    reason: "Client confirmed the actual logged duration was longer once double-checked against the machine display.",
  };

  const weekStartDateIso = startOfLocalWeek(dMinus(6), enrollment.weekStartsOn);
  const weeklyReview: WeeklyReview = {
    id: buildWeeklyReviewId({
      workspaceId: WORKSPACE_OPTIM_ID,
      clientId: CLIENT_PROFILE_DEMO.id,
      enrollmentId: enrollment.id,
      weekStartDateIso,
    }),
    schemaVersion: 1,
    workspaceId: WORKSPACE_OPTIM_ID,
    clientId: CLIENT_PROFILE_DEMO.id,
    coachId: COACH_ID,
    source: "fixture",
    authorship: authorshipClient(CLIENT_PROFILE_DEMO.id),
    createdAtIso: `${dMinus(1)}T09:00:00.000Z`,
    enrollmentId: enrollment.id,
    weekStartDateIso,
    programWeek: deriveProgramWeek(enrollment, weekStartDateIso),
    status: "submitted",
    submittedAtIso: `${dMinus(1)}T09:00:00.000Z`,
    clientNote: "Felt strong most of the week — shoulder was a little tight during pressing on Thursday but settled quickly.",
    coachNoteAuthorship: authorshipSystem(),
  };

  return { dailyRecords, corrections: [correction], weeklyReviews: [weeklyReview] };
}
