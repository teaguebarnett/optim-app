// Phase 4.3 — Historical Day Review verification.
//
// Exercises lib/progress/build-historical-day.ts (buildHistoricalDayReview,
// buildHistoryDayPickerEntries) directly against real implementations — no
// UI rendering involved. Run with: npm run verify:historical
//
// Uses Node's built-in TypeScript stripping, matching the convention
// established by the sibling verify:*.mts scripts.

import assert from "node:assert/strict";

import { buildDemoDefaultProgramEnrollment, deriveProgramWeek } from "../scheduling/enrollment.ts";
import { LocalStorageHistoryStore } from "../history/local-storage-history-store.ts";
import { buildDailyRecordId } from "../history/types.ts";
import { addDaysToLocalDate, localDateDayOfWeek } from "../shared/local-date.ts";
import { CLIENT_PROFILE_DEMO, CLIENT_PROFILE_SECONDARY, WORKSPACE_ATLAS_ID, WORKSPACE_OPTIM_ID } from "../tenancy/seed.ts";
import { buildHistoricalDayReview, buildHistoryDayPickerEntries } from "./build-historical-day.ts";
import { createInitialState } from "../state.ts";
import type { StorageLike } from "../history/local-storage-history-store.ts";
import type { DailyRecord } from "../history/types.ts";
import type { HistoryScope } from "../history/store.ts";
import type { ProgramEnrollment } from "../scheduling/types.ts";
import type { BuildHistoricalDayReviewInput } from "./build-historical-day.ts";

let passed = 0;
let failed = 0;

function check(description: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`  ok  - ${description}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL  - ${description}`);
    console.error(`        ${err instanceof Error ? err.message : String(err)}`);
  }
}

class InMemoryStorage implements StorageLike {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

function newStore(): LocalStorageHistoryStore {
  return new LocalStorageHistoryStore("verify-historical-day-test", new InMemoryStorage());
}

const ANCHOR_NOW = new Date("2026-08-14T19:00:00.000Z"); // a Friday
const TODAY = "2026-08-14";
const ENROLLMENT: ProgramEnrollment = buildDemoDefaultProgramEnrollment(ANCHOR_NOW);
const SCOPE: HistoryScope = { workspaceId: WORKSPACE_OPTIM_ID, clientId: CLIENT_PROFILE_DEMO.id, enrollmentId: ENROLLMENT.id };

function record(dateIso: string, overrides: Partial<DailyRecord> = {}): DailyRecord {
  const base: DailyRecord = {
    id: buildDailyRecordId({ workspaceId: SCOPE.workspaceId, clientId: SCOPE.clientId, enrollmentId: SCOPE.enrollmentId, dateIso, source: "live" }),
    schemaVersion: 1,
    workspaceId: SCOPE.workspaceId,
    clientId: SCOPE.clientId,
    coachId: CLIENT_PROFILE_DEMO.primaryCoachId,
    source: "live",
    authorship: { authorKind: "client", authorId: SCOPE.clientId },
    createdAtIso: `${dateIso}T23:59:00.000Z`,
    enrollmentId: SCOPE.enrollmentId,
    dateIso,
    dayOfWeek: localDateDayOfWeek(dateIso),
    programWeek: deriveProgramWeek(ENROLLMENT, dateIso),
    programPhase: "active_program",
    training: {
      trainingDayType: "scheduled_workout",
      prescribedWorkoutSnapshot: null,
      sessionStatus: "completed",
      exerciseLogs: {},
      painReports: [],
      workingSetsCompleted: 15,
      workingSetsPrescribed: 15,
    },
    nutrition: {
      meals: {
        breakfast: { period: "breakfast", source: "option", optionId: "opt-breakfast", macros: { calories: 600, proteinG: 40, carbsG: 60, fatG: 15 } },
        postWorkout: { period: "postWorkout", source: "option", optionId: "opt-postworkout", macros: { calories: 600, proteinG: 50, carbsG: 60, fatG: 15 } },
        lunch: { period: "lunch", source: "option", optionId: "opt-lunch", macros: { calories: 700, proteinG: 45, carbsG: 70, fatG: 18 } },
        dinner: { period: "dinner", source: "option", optionId: "opt-dinner", macros: { calories: 750, proteinG: 45, carbsG: 65, fatG: 25 } },
        snack: { period: "snack", source: "option", optionId: "opt-snack", macros: { calories: 300, proteinG: 20, carbsG: 30, fatG: 8 } },
      },
      periodsInPlan: ["breakfast", "postWorkout", "lunch", "dinner", "snack"],
      targetsSnapshot: { calories: 2950, proteinG: 200, carbsG: 360, fatG: 85 },
    },
    cardio: {
      cardioDayType: "scheduled",
      status: "completed",
      durationMin: 20,
      selectedOptionSnapshot: { id: "cardio-stairmaster", type: "StairMaster", displayName: "StairMaster", isDefault: true, intendedUse: "", targetDurationMin: 20, protocol: "" },
    },
    weight: { weightLb: 190, loggedAtIso: `${dateIso}T07:00:00.000Z`, skipped: false },
  };
  return { ...base, ...overrides };
}

function baseInput(overrides: Partial<BuildHistoricalDayReviewInput> = {}): BuildHistoricalDayReviewInput {
  return {
    store: newStore(),
    scope: SCOPE,
    source: "live",
    effectiveDateIso: TODAY,
    enrollment: ENROLLMENT,
    liveState: null,
    requestedDateIso: addDaysToLocalDate(TODAY, -1),
    ...overrides,
  };
}

console.log("\n1. Eligibility — future, today, invalid, and genuinely past dates\n");

check("A genuinely past date resolves ok and opens exactly that date", () => {
  const store = newStore();
  const dateIso = addDaysToLocalDate(TODAY, -2);
  store.putDailyRecordIdempotent(record(dateIso));
  const result = buildHistoricalDayReview(baseInput({ store, requestedDateIso: dateIso }));
  assert.equal(result.status, "ok");
  if (result.status === "ok") assert.equal(result.review.summary.dateIso, dateIso);
});

check("A future date is never eligible", () => {
  const result = buildHistoricalDayReview(baseInput({ requestedDateIso: addDaysToLocalDate(TODAY, 1) }));
  assert.equal(result.status, "future");
});

check("Today itself is never eligible — only past days open a review", () => {
  const result = buildHistoricalDayReview(baseInput({ requestedDateIso: TODAY }));
  assert.equal(result.status, "today");
});

check("A malformed date param is rejected rather than crashing", () => {
  const result = buildHistoricalDayReview(baseInput({ requestedDateIso: "not-a-date" }));
  assert.equal(result.status, "invalid_date");
});

console.log("\n2. Correct client and date resolution\n");

check("The correct client and date record is rendered, never a different date's data", () => {
  const store = newStore();
  const target = addDaysToLocalDate(TODAY, -3);
  const neighbor = addDaysToLocalDate(TODAY, -4);
  store.putDailyRecordIdempotent(record(target, { weight: { weightLb: 201, skipped: false } }));
  store.putDailyRecordIdempotent(record(neighbor, { weight: { weightLb: 150, skipped: false } }));
  const result = buildHistoricalDayReview(baseInput({ store, requestedDateIso: target }));
  assert.equal(result.status, "ok");
  if (result.status === "ok") assert.equal(result.review.weight.weightLb, 201);
});

console.log("\n3. A fully completed day — workout, RPE, nutrition, cardio, weight, timing, adherence\n");

check("A fully completed day displays its stored exercise sets, RPE, meals, cardio, weight, timing, and adherence correctly", () => {
  const store = newStore();
  const dateIso = addDaysToLocalDate(TODAY, -5);
  const workout = {
    id: "push-day",
    workspaceId: WORKSPACE_OPTIM_ID,
    name: "Push Day",
    dayOfWeek: "Monday" as const,
    focus: "Chest, shoulders, triceps",
    estimatedDurationMin: 60,
    warmupOverview: "",
    coachNote: "",
    exercises: [
      { id: "bench", order: 1, name: "Bench Press", warmupSets: 0, workingSets: 2, targetRepsLow: 6, targetRepsHigh: 8, targetRpe: 8 as const, restSeconds: 120, tempo: "2-0-1", cue: "", previousPerformance: [], prescribedSets: [] },
    ],
  };
  const full = record(dateIso, {
    training: {
      trainingDayType: "scheduled_workout",
      prescribedWorkoutSnapshot: workout,
      sessionStatus: "completed",
      exerciseLogs: {
        bench: {
          exerciseId: "bench",
          status: "completed",
          loggedSets: [
            { setNumber: 1, isWarmup: false, weightLb: 185, reps: 6, rpe: 8, status: "completed", completedAtIso: `${dateIso}T10:00:00.000Z` },
            { setNumber: 2, isWarmup: false, weightLb: 185, reps: 6, rpe: 9, status: "completed", completedAtIso: `${dateIso}T10:05:00.000Z` },
          ],
        },
      },
      painReports: [],
      startedAtIso: `${dateIso}T09:55:00.000Z`,
      completedAtIso: `${dateIso}T10:30:00.000Z`,
      workingSetsCompleted: 2,
      workingSetsPrescribed: 2,
    },
  });
  store.putDailyRecordIdempotent(full);
  const result = buildHistoricalDayReview(baseInput({ store, requestedDateIso: dateIso }));
  assert.equal(result.status, "ok");
  if (result.status !== "ok") return;
  const { review } = result;

  assert.equal(review.training.outcome, "complete");
  assert.equal(review.training.workoutName, "Push Day");
  assert.equal(review.training.exercises.length, 1);
  assert.equal(review.training.exercises[0].hasSetDetail, true);
  assert.equal(review.training.exercises[0].sets.length, 2);
  assert.equal(review.training.exercises[0].sets[0].rpe, 8);
  assert.equal(review.training.exercises[0].sets[1].weightLb, 185);
  assert.ok(review.training.startedTimeLabel !== null);
  assert.ok(review.training.completedTimeLabel !== null);

  assert.equal(review.nutrition.mealPlanOutcome, "complete");
  assert.equal(review.nutrition.totals?.calories, 2950);
  assert.equal(review.nutrition.calorieResult, "met");
  assert.equal(review.nutrition.proteinResult, "met");

  assert.equal(review.cardio.outcome, "complete");
  assert.equal(review.cardio.durationMin, 20);

  assert.equal(review.weight.weightLb, 190);
  assert.equal(review.summary.overallStatus, "complete");
});

console.log("\n4. A partially completed day — accurate statuses, never filled from current state\n");

check("A partially completed day reports partial statuses honestly and never borrows from a different live state", () => {
  const store = newStore();
  const dateIso = addDaysToLocalDate(TODAY, -6);
  const partial = record(dateIso, {
    training: {
      trainingDayType: "scheduled_workout",
      prescribedWorkoutSnapshot: null,
      sessionStatus: "ended-early",
      exerciseLogs: {},
      skipReason: "excessive-fatigue",
      painReports: [],
      workingSetsCompleted: 6,
      workingSetsPrescribed: 15,
    },
    nutrition: {
      meals: {
        breakfast: { period: "breakfast", source: "option", optionId: "opt-breakfast", macros: { calories: 600, proteinG: 40, carbsG: 60, fatG: 15 } },
      },
      periodsInPlan: ["breakfast", "postWorkout", "lunch", "dinner", "snack"],
      targetsSnapshot: { calories: 2950, proteinG: 200, carbsG: 360, fatG: 85 },
    },
  });
  store.putDailyRecordIdempotent(partial);
  const result = buildHistoricalDayReview(baseInput({ store, requestedDateIso: dateIso }));
  assert.equal(result.status, "ok");
  if (result.status !== "ok") return;
  assert.equal(result.review.training.outcome, "partial");
  assert.equal(result.review.training.resolvedWithContext, true);
  assert.equal(result.review.nutrition.mealPlanOutcome, "partial");
  assert.equal(result.review.summary.overallStatus, "partial");
});

console.log("\n5. Skipped meals, replacements, skipped workouts, and stored reasons\n");

check("Skipped meals, a replaced meal, and a skipped workout all render their stored reason correctly", () => {
  const store = newStore();
  const dateIso = addDaysToLocalDate(TODAY, -7);
  const day = record(dateIso, {
    training: {
      trainingDayType: "scheduled_workout",
      prescribedWorkoutSnapshot: null,
      sessionStatus: "skipped",
      exerciseLogs: {},
      skipReason: "feeling-sick",
      painReports: [],
      workingSetsCompleted: 0,
      workingSetsPrescribed: 15,
    },
    nutrition: {
      meals: {
        breakfast: { period: "breakfast", source: "skipped", skipReason: "forgot" },
        postWorkout: { period: "postWorkout", source: "manual", manualName: "Protein shake", macros: { calories: 200, proteinG: 30, carbsG: 10, fatG: 3 } },
      },
      periodsInPlan: ["breakfast", "postWorkout", "lunch", "dinner", "snack"],
      targetsSnapshot: { calories: 2950, proteinG: 200, carbsG: 360, fatG: 85 },
    },
  });
  store.putDailyRecordIdempotent(day);
  const result = buildHistoricalDayReview(baseInput({ store, requestedDateIso: dateIso }));
  assert.equal(result.status, "ok");
  if (result.status !== "ok") return;
  const { review } = result;
  assert.equal(review.training.outcome, "missed");
  assert.equal(review.training.skipReason, "feeling-sick");
  const breakfast = review.nutrition.meals.find((m) => m.period === "breakfast")!;
  assert.equal(breakfast.status, "skipped");
  assert.equal(breakfast.skipReason, "forgot");
  const postWorkout = review.nutrition.meals.find((m) => m.period === "postWorkout")!;
  assert.equal(postWorkout.status, "replaced");
  assert.equal(postWorkout.itemName, "Protein shake");
});

console.log("\n6. Rest days\n");

check("A rest day renders as not_applicable, never as a missed workout", () => {
  const store = newStore();
  const dateIso = addDaysToLocalDate(TODAY, -8);
  store.putDailyRecordIdempotent(
    record(dateIso, {
      training: { trainingDayType: "scheduled_rest", prescribedWorkoutSnapshot: null, sessionStatus: null, exerciseLogs: {}, painReports: [], workingSetsCompleted: 0, workingSetsPrescribed: 0 },
    })
  );
  const result = buildHistoricalDayReview(baseInput({ store, requestedDateIso: dateIso }));
  assert.equal(result.status, "ok");
  if (result.status !== "ok") return;
  assert.equal(result.review.training.trainingDayType, "scheduled_rest");
  assert.equal(result.review.training.outcome, "not_applicable");
});

check("A day cardio wasn't assigned for renders as not_applicable, never as a missed session, and never holds back an otherwise-complete day", () => {
  const store = newStore();
  const dateIso = addDaysToLocalDate(TODAY, -9);
  store.putDailyRecordIdempotent(
    record(dateIso, {
      cardio: { cardioDayType: "not_scheduled", status: "not-started", durationMin: 0, selectedOptionSnapshot: null },
    })
  );
  const result = buildHistoricalDayReview(baseInput({ store, requestedDateIso: dateIso }));
  assert.equal(result.status, "ok");
  if (result.status !== "ok") return;
  assert.equal(result.review.cardio.outcome, "not_applicable");
  assert.equal(result.review.summary.overallStatus, "complete", "an unassigned cardio day must never hold back an otherwise-complete day");
});

console.log("\n7. Sparse and legacy records — honest empty states, never fabricated\n");

check("A genuinely missing record for a past date shows honest not-recorded states everywhere, no crash", () => {
  const store = newStore();
  const dateIso = addDaysToLocalDate(TODAY, -9);
  const result = buildHistoricalDayReview(baseInput({ store, requestedDateIso: dateIso }));
  assert.equal(result.status, "ok");
  if (result.status !== "ok") return;
  const { review } = result;
  assert.equal(review.summary.hasRecord, false);
  assert.equal(review.summary.overallStatus, "no_record");
  assert.equal(review.training.outcome, "no_record");
  assert.equal(review.nutrition.mealPlanOutcome, "no_record");
  assert.equal(review.cardio.outcome, "no_record");
  assert.equal(review.weight.weightLb, null);
  assert.equal(review.training.exercises.length, 0);
  assert.equal(review.nutrition.meals.length, 0);
});

check("A record with an aggregate-only workout (no per-set detail, like the demo fixture) never fabricates set data", () => {
  const store = newStore();
  const dateIso = addDaysToLocalDate(TODAY, -10);
  const workout = {
    id: "push-day",
    workspaceId: WORKSPACE_OPTIM_ID,
    name: "Push Day",
    dayOfWeek: "Monday" as const,
    focus: "",
    estimatedDurationMin: 60,
    warmupOverview: "",
    coachNote: "",
    exercises: [{ id: "bench", order: 1, name: "Bench Press", warmupSets: 0, workingSets: 2, targetRepsLow: 6, targetRepsHigh: 8, targetRpe: 8 as const, restSeconds: 120, tempo: "", cue: "", previousPerformance: [], prescribedSets: [] }],
  };
  store.putDailyRecordIdempotent(
    record(dateIso, {
      training: {
        trainingDayType: "scheduled_workout",
        prescribedWorkoutSnapshot: workout,
        sessionStatus: "completed",
        exerciseLogs: {},
        painReports: [],
        workingSetsCompleted: 15,
        workingSetsPrescribed: 15,
      },
    })
  );
  const result = buildHistoricalDayReview(baseInput({ store, requestedDateIso: dateIso }));
  assert.equal(result.status, "ok");
  if (result.status !== "ok") return;
  const { review } = result;
  assert.equal(review.training.hasAnySetDetail, false);
  assert.equal(review.training.exercises.length, 1);
  assert.equal(review.training.exercises[0].hasSetDetail, false);
  assert.equal(review.training.exercises[0].sets.length, 0);
  // The aggregate counts the record DID capture must still be shown honestly.
  assert.equal(review.training.workingSetsCompleted, 15);
  assert.equal(review.training.workingSetsPrescribed, 15);
});

console.log("\n8. Isolation — never mutates state, never leaks across client/workspace/live-state\n");

check("Opening and re-opening a historical day never mutates the underlying store", () => {
  const store = newStore();
  const dateIso = addDaysToLocalDate(TODAY, -11);
  store.putDailyRecordIdempotent(record(dateIso));
  const before = JSON.stringify(store.listDailyRecords(SCOPE, { fromDateIso: dateIso, toDateIso: dateIso }, "live"));
  buildHistoricalDayReview(baseInput({ store, requestedDateIso: dateIso }));
  buildHistoricalDayReview(baseInput({ store, requestedDateIso: dateIso }));
  const after = JSON.stringify(store.listDailyRecords(SCOPE, { fromDateIso: dateIso, toDateIso: dateIso }, "live"));
  assert.equal(before, after);
});

check("Editing today's live state never rewrites or bleeds into the selected historical record", () => {
  const store = newStore();
  const dateIso = addDaysToLocalDate(TODAY, -12);
  store.putDailyRecordIdempotent(record(dateIso, { weight: { weightLb: 175, skipped: false } }));
  const liveState = { ...createInitialState(), dateIso: TODAY, programEnrollment: ENROLLMENT, morningWeight: { weightLb: 999, skipped: false } };
  const result = buildHistoricalDayReview(baseInput({ store, requestedDateIso: dateIso, liveState }));
  assert.equal(result.status, "ok");
  if (result.status !== "ok") return;
  assert.equal(result.review.weight.weightLb, 175);
  const stillStored = store.getDailyRecord(SCOPE, dateIso, "live");
  assert.equal(stillStored?.weight.weightLb, 175);
});

check("A different client's record on the same date is never returned", () => {
  const store = newStore();
  const dateIso = addDaysToLocalDate(TODAY, -13);
  const otherScope: HistoryScope = { workspaceId: SCOPE.workspaceId, clientId: CLIENT_PROFILE_SECONDARY.id, enrollmentId: "enrollment-other-client" };
  store.putDailyRecordIdempotent(record(dateIso, { weight: { weightLb: 210, skipped: false } }));
  store.putDailyRecordIdempotent({
    ...record(dateIso, { weight: { weightLb: 130, skipped: false } }),
    id: buildDailyRecordId({ ...otherScope, dateIso, source: "live" }),
    clientId: otherScope.clientId,
    enrollmentId: otherScope.enrollmentId,
  });
  const result = buildHistoricalDayReview(baseInput({ store, requestedDateIso: dateIso }));
  assert.equal(result.status, "ok");
  if (result.status !== "ok") return;
  assert.equal(result.review.weight.weightLb, 210);
});

check("A different workspace's record on the same date/client-id collision is never returned (tenant isolation)", () => {
  const store = newStore();
  const dateIso = addDaysToLocalDate(TODAY, -14);
  const otherWorkspaceScope: HistoryScope = { workspaceId: WORKSPACE_ATLAS_ID, clientId: SCOPE.clientId, enrollmentId: "enrollment-other-workspace" };
  store.putDailyRecordIdempotent(record(dateIso, { weight: { weightLb: 210, skipped: false } }));
  store.putDailyRecordIdempotent({
    ...record(dateIso, { weight: { weightLb: 130, skipped: false } }),
    id: buildDailyRecordId({ ...otherWorkspaceScope, dateIso, source: "live" }),
    workspaceId: otherWorkspaceScope.workspaceId,
    enrollmentId: otherWorkspaceScope.enrollmentId,
  });
  const result = buildHistoricalDayReview(baseInput({ store, requestedDateIso: dateIso }));
  assert.equal(result.status, "ok");
  if (result.status !== "ok") return;
  assert.equal(result.review.weight.weightLb, 210);
});

console.log("\n9. Client-local date/timezone correctness\n");

check("Timing labels resolve in the enrollment's own timezone, not UTC or the machine's local time", () => {
  const store = newStore();
  const dateIso = addDaysToLocalDate(TODAY, -15);
  const pacificEnrollment: ProgramEnrollment = { ...ENROLLMENT, timeZone: "America/Los_Angeles" };
  const pacificScope: HistoryScope = { ...SCOPE, enrollmentId: pacificEnrollment.id };
  const day = record(dateIso, {
    enrollmentId: pacificEnrollment.id,
    // 03:15 UTC is 20:15 the PREVIOUS local day in America/Los_Angeles (PDT,
    // UTC-7 in August) — a genuine UTC-day-boundary case a naive UTC read
    // would get wrong (would show 03:15, not 20:15).
    weight: { weightLb: 190, loggedAtIso: `${addDaysToLocalDate(dateIso, 1)}T03:15:00.000Z`, skipped: false },
  });
  store.putDailyRecordIdempotent(day);
  const result = buildHistoricalDayReview(
    baseInput({ store, scope: pacificScope, enrollment: pacificEnrollment, requestedDateIso: dateIso })
  );
  assert.equal(result.status, "ok");
  if (result.status !== "ok") return;
  assert.equal(result.review.weight.loggedTimeLabel, "20:15");
});

check("A date exactly at the enrollment's own program-start boundary is still a valid, distinct past day", () => {
  const store = newStore();
  store.putDailyRecordIdempotent(record(ENROLLMENT.startDateIso, { weight: { weightLb: 200, skipped: false } }));
  const result = buildHistoricalDayReview(baseInput({ store, requestedDateIso: ENROLLMENT.startDateIso }));
  assert.equal(result.status, "ok");
  if (result.status !== "ok") return;
  assert.equal(result.review.summary.programWeek, 1);
});

console.log("\n10. History day picker — Progress entry point\n");

check("The picker never includes today or any future date", () => {
  const store = newStore();
  const entries = buildHistoryDayPickerEntries({ store, scope: SCOPE, source: "live", effectiveDateIso: TODAY, enrollment: ENROLLMENT, liveState: null });
  assert.ok(entries.every((e) => e.dateIso < TODAY));
});

check("The picker never offers a date before the enrollment's own start", () => {
  const store = newStore();
  const entries = buildHistoryDayPickerEntries(
    { store, scope: SCOPE, source: "live", effectiveDateIso: TODAY, enrollment: ENROLLMENT, liveState: null },
    365
  );
  assert.ok(entries.every((e) => e.dateIso >= ENROLLMENT.startDateIso));
});

check("A picker entry's status matches what buildHistoricalDayReview reports for that same date", () => {
  const store = newStore();
  const dateIso = addDaysToLocalDate(TODAY, -1);
  store.putDailyRecordIdempotent(record(dateIso));
  const entries = buildHistoryDayPickerEntries({ store, scope: SCOPE, source: "live", effectiveDateIso: TODAY, enrollment: ENROLLMENT, liveState: null });
  const entry = entries.find((e) => e.dateIso === dateIso);
  const result = buildHistoricalDayReview(baseInput({ store, requestedDateIso: dateIso }));
  assert.ok(entry);
  assert.equal(result.status, "ok");
  if (result.status === "ok") assert.equal(entry!.status, result.review.summary.overallStatus);
});

// Correction — the picker previously returned entries newest-first (a
// `.reverse()` after the otherwise-chronological collectDateRangeRecords
// result), which combined with left-to-right rendering put the most recent
// day on the LEFT — backwards for a left-to-right timeline. Entries must now
// be strictly chronological, oldest first, so the component can render them
// left-to-right and scroll itself to the newest (rightmost) entry on load.
check("Picker entries are strictly chronological, oldest first, never reversed", () => {
  const store = newStore();
  const entries = buildHistoryDayPickerEntries({ store, scope: SCOPE, source: "live", effectiveDateIso: TODAY, enrollment: ENROLLMENT, liveState: null }, 10);
  assert.ok(entries.length >= 2, "need at least two entries to prove ordering");
  for (let i = 1; i < entries.length; i++) {
    assert.ok(entries[i - 1].dateIso < entries[i].dateIso, `expected ${entries[i - 1].dateIso} before ${entries[i].dateIso}`);
  }
});

check("The last (rightmost) entry is always the most recent eligible day — yesterday — so the component's scroll-to-end positions on today's most recent history", () => {
  const store = newStore();
  const entries = buildHistoryDayPickerEntries({ store, scope: SCOPE, source: "live", effectiveDateIso: TODAY, enrollment: ENROLLMENT, liveState: null });
  const yesterday = addDaysToLocalDate(TODAY, -1);
  assert.equal(entries[entries.length - 1].dateIso, yesterday);
  assert.equal(entries[0].dateIso, addDaysToLocalDate(TODAY, -14));
});

console.log(`\n${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
