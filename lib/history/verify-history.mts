// Phase 4.1 — history/scheduling domain verification.
//
// Exercises the client-local date utilities, program enrollment derivation,
// the HistoryStore boundary (idempotency, conflict detection, scoping), the
// live-state snapshot builder, every pure derivation rule, check-in
// scheduling, priority-action precedence, and date-rollover archival —
// directly against the real implementations, no UI rendering involved. Run
// with: npm run verify:history
//
// Uses Node's built-in TypeScript stripping (see package.json), matching
// the convention established by lib/tenancy/verify-isolation.mts and
// lib/planning/verify-planner.mts, rather than adding a test framework the
// project doesn't already use.

import assert from "node:assert/strict";

import {
  addDaysToLocalDate,
  compareLocalDates,
  diffInLocalDays,
  localDateDayOfWeek,
  resolveClientLocalDateIso,
  startOfLocalWeek,
  zonedDateTimeToInstant,
} from "../shared/local-date.ts";
import {
  buildDemoDefaultProgramEnrollment,
  deriveProgramPhase,
  deriveProgramWeek,
  deriveStartDatePreservingCurrentWeek,
} from "../scheduling/enrollment.ts";
import { buildDemoCheckInScheduleConfig, deriveCheckInStatus, finalScheduledTrainingDayOffset } from "../scheduling/check-in.ts";
import { createInitialState, reducer } from "../state.ts";
import { migrateStoredState } from "../tenancy/migrate.ts";
import { CLIENT_PROFILE_DEMO, WORKSPACE_OPTIM_ID } from "../tenancy/seed.ts";
import { buildDailyRecordFromLiveState } from "./build-daily-record.ts";
import { buildDailyRecordId } from "./types.ts";
import { LocalStorageHistoryStore } from "./local-storage-history-store.ts";
import { deriveTrainingAdherence } from "./derive-training-adherence.ts";
import { deriveCalorieTargetMet, deriveMealPlanAdherence, deriveProteinTargetMet } from "./derive-nutrition.ts";
import { deriveCardioAdherence } from "./derive-cardio.ts";
import { MIN_WEIGHT_TREND_DAYS, deriveWeightTrend } from "./derive-weight-trend.ts";
import { deriveOverallAdherenceStatus, deriveRequiredDomains } from "./derive-day-status.ts";
import { derivePriorityAction } from "./derive-priority-action.ts";
import { resolveRollover } from "./rollover.ts";
import { buildDemoHistoryFixture } from "./demo-fixture.ts";
import { PUSH_WORKOUT } from "../mock-data.ts";
import type { StorageLike } from "./local-storage-history-store.ts";
import type { DailyRecord } from "./types.ts";
import type { HistoryScope } from "./store.ts";

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

/** In-memory Storage-like backend so this suite exercises the real
 * LocalStorageHistoryStore idempotency/conflict logic under Node's test
 * runner, which has no window/localStorage at all. */
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
  return new LocalStorageHistoryStore("verify-history-test", new InMemoryStorage());
}

const ENROLLMENT = buildDemoDefaultProgramEnrollment(new Date("2026-08-14T12:00:00.000Z"));
const SCOPE: HistoryScope = { workspaceId: WORKSPACE_OPTIM_ID, clientId: CLIENT_PROFILE_DEMO.id, enrollmentId: ENROLLMENT.id };

function makeMinimalRecord(overrides: Partial<DailyRecord> = {}): DailyRecord {
  const dateIso = overrides.dateIso ?? "2026-08-01";
  const base: DailyRecord = {
    id: buildDailyRecordId({ workspaceId: SCOPE.workspaceId, clientId: SCOPE.clientId, enrollmentId: SCOPE.enrollmentId, dateIso, source: "live" }),
    schemaVersion: 1,
    workspaceId: SCOPE.workspaceId,
    clientId: SCOPE.clientId,
    coachId: CLIENT_PROFILE_DEMO.primaryCoachId,
    source: "live",
    authorship: { authorKind: "client", authorId: SCOPE.clientId },
    createdAtIso: "2026-08-01T23:59:00.000Z",
    enrollmentId: SCOPE.enrollmentId,
    dateIso,
    dayOfWeek: localDateDayOfWeek(dateIso),
    programWeek: deriveProgramWeek(ENROLLMENT, dateIso),
    programPhase: deriveProgramPhase(ENROLLMENT, dateIso),
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
      meals: {},
      periodsInPlan: ["breakfast", "postWorkout", "lunch", "dinner", "snack"],
      targetsSnapshot: { calories: 3000, proteinG: 200, carbsG: 360, fatG: 85 },
    },
    cardio: { cardioDayType: "scheduled", status: "completed", durationMin: 20, selectedOptionSnapshot: null },
    weight: { weightLb: 190, loggedAtIso: "2026-08-01T07:00:00.000Z", skipped: false },
  };
  return { ...base, ...overrides };
}

// ---------------------------------------------------------------------------

console.log("\n1. Client-local date utilities\n");

check("resolveClientLocalDateIso resolves a different calendar date in two different timezones for the same instant", () => {
  const instant = new Date("2026-08-14T02:30:00.000Z"); // late evening in US, already next day in Asia
  const tokyoDate = resolveClientLocalDateIso(instant, "Asia/Tokyo");
  const losAngelesDate = resolveClientLocalDateIso(instant, "America/Los_Angeles");
  assert.equal(tokyoDate, "2026-08-14");
  assert.equal(losAngelesDate, "2026-08-13");
  assert.notEqual(tokyoDate, losAngelesDate, "a client-local date must depend on the configured timezone, not the machine's own");
});

check("addDaysToLocalDate is DST-transition-safe (America/New_York spring-forward week)", () => {
  // 2026-03-08 is the US spring-forward date; calendar-day arithmetic must
  // never skip or repeat a day across it.
  assert.equal(addDaysToLocalDate("2026-03-07", 1), "2026-03-08");
  assert.equal(addDaysToLocalDate("2026-03-08", 1), "2026-03-09");
  assert.equal(diffInLocalDays("2026-03-07", "2026-03-09"), 2);
});

check("compareLocalDates and diffInLocalDays agree on ordering", () => {
  assert.equal(compareLocalDates("2026-08-01", "2026-08-14"), -1);
  assert.equal(compareLocalDates("2026-08-14", "2026-08-01"), 1);
  assert.equal(compareLocalDates("2026-08-14", "2026-08-14"), 0);
  assert.equal(diffInLocalDays("2026-08-01", "2026-08-14"), 13);
});

check("startOfLocalWeek anchors to Monday by default", () => {
  assert.equal(startOfLocalWeek("2026-08-14"), "2026-08-10"); // 2026-08-14 is a Friday
  assert.equal(localDateDayOfWeek("2026-08-10"), "Monday");
});

check("zonedDateTimeToInstant round-trips correctly across a DST boundary (America/New_York, spring-forward 2026-03-08)", () => {
  const beforeDst = zonedDateTimeToInstant("2026-03-01", "08:00", "America/New_York");
  const afterDst = zonedDateTimeToInstant("2026-03-15", "08:00", "America/New_York");
  // Standard time is UTC-5, daylight time is UTC-4 — the UTC hour for the
  // same local 8:00 AM shifts by exactly one hour across the transition.
  assert.equal(beforeDst.getUTCHours(), 13);
  assert.equal(afterDst.getUTCHours(), 12);
});

console.log("\n2. Program enrollment derivation\n");

check("deriveProgramWeek reports the anchored week, pre-program, and post-program phases correctly", () => {
  const enrollment = { ...ENROLLMENT, startDateIso: "2026-06-01", durationWeeks: 4, weekStartsOn: "monday" as const };
  assert.equal(deriveProgramPhase(enrollment, "2026-05-01"), "pre_program");
  assert.equal(deriveProgramWeek(enrollment, "2026-05-01"), null);
  assert.equal(deriveProgramPhase(enrollment, "2026-06-01"), "active_program");
  assert.equal(deriveProgramWeek(enrollment, "2026-06-01"), 1);
  assert.equal(deriveProgramWeek(enrollment, "2026-06-05"), 1); // same Monday-anchored week
  assert.equal(deriveProgramWeek(enrollment, "2026-06-08"), 2);
  assert.equal(deriveProgramPhase(enrollment, "2026-07-01"), "post_program");
  assert.equal(deriveProgramWeek(enrollment, "2026-07-01"), null);
});

check("deriveStartDatePreservingCurrentWeek is a true round-trip: evaluating the derived start date reports back the requested week", () => {
  const startDateIso = deriveStartDatePreservingCurrentWeek("2026-08-14", 8, "monday");
  const enrollment = { ...ENROLLMENT, startDateIso, durationWeeks: 16, weekStartsOn: "monday" as const };
  assert.equal(deriveProgramWeek(enrollment, "2026-08-14"), 8);
});

check("v3 -> v4 migration preserves the client's currently-displayed program week rather than resetting to Week 1", () => {
  const v3 = { ...createInitialState(), version: 3 as const };
  delete (v3 as Record<string, unknown>).programEnrollment;
  const migrated = migrateStoredState(v3);
  assert.ok(migrated);
  const today = resolveClientLocalDateIso(new Date(), migrated!.programEnrollment.timeZone);
  assert.equal(deriveProgramWeek(migrated!.programEnrollment, today), CLIENT_PROFILE_DEMO.programWeek);
});

check("migration is idempotent: migrating already-v4 data returns it unchanged rather than regenerating a new enrollment", () => {
  const state = createInitialState();
  const migratedAgain = migrateStoredState(state);
  assert.ok(migratedAgain);
  assert.equal(migratedAgain!.programEnrollment.id, state.programEnrollment.id);
  assert.equal(migratedAgain!.programEnrollment.startDateIso, state.programEnrollment.startDateIso);
});

console.log("\n2b. Phase 4.2 correction — program duration ownership\n");

check("The current prototype enrollment (createInitialState) resolves to a 12-week duration", () => {
  const state = createInitialState();
  assert.equal(state.programEnrollment.durationWeeks, 12);
});

check("The deterministic demo enrollment resolves to a 12-week duration", () => {
  const demoEnrollment = buildDemoDefaultProgramEnrollment(new Date("2026-08-14T12:00:00.000Z"));
  assert.equal(demoEnrollment.durationWeeks, 12);
});

check("Duration is stored as a valid positive integer directly on the enrollment record", () => {
  const state = createInitialState();
  assert.equal(typeof state.programEnrollment.durationWeeks, "number");
  assert.ok(Number.isInteger(state.programEnrollment.durationWeeks) && state.programEnrollment.durationWeeks > 0);
});

check("Explicit 8/12/16/20-week enrollments each remain active through their own final week and post-program the week after", () => {
  for (const weeks of [8, 12, 16, 20]) {
    const enrollment = { ...ENROLLMENT, startDateIso: "2026-01-05", durationWeeks: weeks, weekStartsOn: "monday" as const }; // 2026-01-05 is a Monday
    assert.equal(deriveProgramWeek(enrollment, "2026-01-05"), 1);
    const lastWeekStart = addDaysToLocalDate("2026-01-05", (weeks - 1) * 7);
    assert.equal(deriveProgramWeek(enrollment, lastWeekStart), weeks, `week ${weeks} must remain active for a ${weeks}-week enrollment`);
    assert.equal(deriveProgramPhase(enrollment, lastWeekStart), "active_program");
    const firstPostProgramWeekStart = addDaysToLocalDate(lastWeekStart, 7);
    assert.equal(deriveProgramWeek(enrollment, firstPostProgramWeekStart), null, `week ${weeks + 1} must never be reported for a ${weeks}-week enrollment`);
    assert.equal(deriveProgramPhase(enrollment, firstPostProgramWeekStart), "post_program");
  }
});

check("Duration is never a universal constant: two enrollments built in the same process independently report their own totals", () => {
  const twelve = buildDemoDefaultProgramEnrollment(new Date("2026-08-14T12:00:00.000Z"));
  const twenty: typeof twelve = { ...twelve, durationWeeks: 20 };
  assert.equal(twelve.durationWeeks, 12);
  assert.equal(twenty.durationWeeks, 20);
  assert.notEqual(twelve.durationWeeks, twenty.durationWeeks);
});

console.log("\n2c. Phase 4.2 correction — v4 -> v5 duration migration\n");

check("Legacy v4 state (durationWeeks 16, the old default) migrates to a 12-week enrollment at v5", () => {
  const base = createInitialState();
  const legacyV4: Record<string, unknown> = { ...base, version: 4, programEnrollment: { ...base.programEnrollment, durationWeeks: 16 } };
  const migrated = migrateStoredState(legacyV4);
  assert.ok(migrated);
  assert.equal(migrated!.version, 5);
  assert.equal(migrated!.programEnrollment.durationWeeks, 12);
});

check("Migration preserves the program start date and the current derived Week 8", () => {
  const base = createInitialState();
  const originalStart = base.programEnrollment.startDateIso;
  const legacyV4: Record<string, unknown> = { ...base, version: 4, programEnrollment: { ...base.programEnrollment, durationWeeks: 16 } };
  const migrated = migrateStoredState(legacyV4);
  assert.equal(migrated!.programEnrollment.startDateIso, originalStart);
  const today = resolveClientLocalDateIso(new Date(), migrated!.programEnrollment.timeZone);
  assert.equal(deriveProgramWeek(migrated!.programEnrollment, today), CLIENT_PROFILE_DEMO.programWeek);
});

check("Migration is idempotent and never rewrites an already-migrated (v5) enrollment's duration", () => {
  const base = createInitialState(); // already v5, durationWeeks 12
  // Simulates a hypothetical future coach-configured 16-week enrollment
  // already at v5 — repeated hydration must leave it alone.
  const customized = { ...base, programEnrollment: { ...base.programEnrollment, durationWeeks: 16 } };
  const migratedAgain = migrateStoredState(customized);
  assert.ok(migratedAgain);
  assert.equal(migratedAgain!.programEnrollment.durationWeeks, 16, "a real v5 16-week enrollment must never be silently reverted to 12");
});

check("A post-migration custom 16-week enrollment is never reconverted on a later pass", () => {
  const base = createInitialState();
  const legacyV4: Record<string, unknown> = { ...base, version: 4, programEnrollment: { ...base.programEnrollment, durationWeeks: 16 } };
  const firstMigration = migrateStoredState(legacyV4)!;
  assert.equal(firstMigration.programEnrollment.durationWeeks, 12);
  const reconfiguredAtV5 = { ...firstMigration, programEnrollment: { ...firstMigration.programEnrollment, durationWeeks: 16 } };
  const secondPass = migrateStoredState(reconfiguredAtV5);
  assert.equal(secondPass!.programEnrollment.durationWeeks, 16);
});

check("Repeated hydration of freshly created (already-v5) state retains its stored duration unchanged", () => {
  const state = createInitialState();
  const migratedOnce = migrateStoredState(state);
  const migratedTwice = migrateStoredState(migratedOnce);
  assert.equal(migratedOnce!.programEnrollment.durationWeeks, 12);
  assert.equal(migratedTwice!.programEnrollment.durationWeeks, 12);
});

check("Historical daily records are never touched by the AppState duration migration (migration only ever reads/writes AppState, never the separate HistoryStore)", () => {
  const store = newStore();
  const record = makeMinimalRecord({ dateIso: "2026-08-01" });
  store.putDailyRecordIdempotent(record);
  const base = createInitialState();
  const legacyV4: Record<string, unknown> = { ...base, version: 4, programEnrollment: { ...base.programEnrollment, durationWeeks: 16 } };
  migrateStoredState(legacyV4);
  const stillThere = store.getDailyRecord(SCOPE, "2026-08-01", "live");
  assert.deepEqual(stillThere, record, "the migration must never reach into or alter archived history");
});

console.log("\n3. Cardio partial status\n");

check("Skipping cardio with zero minutes logged reports skipped, not partial", () => {
  const state = reducer(createInitialState(), { type: "SKIP_CARDIO", reason: "forgot" });
  assert.equal(state.cardio.status, "skipped");
  assert.equal(state.cardio.durationMin, 0);
});

check("Skipping cardio with real minutes already logged reports partial and preserves the logged duration", () => {
  let state = reducer(createInitialState(), { type: "START_CARDIO", durationMin: 0 });
  state = reducer(state, { type: "SET_CARDIO_DURATION", durationMin: 9 });
  state = reducer(state, { type: "SKIP_CARDIO", reason: "out-of-time" });
  assert.equal(state.cardio.status, "partial");
  assert.equal(state.cardio.durationMin, 9, "partial progress must never be zeroed out, unlike a true skip");
});

console.log("\n4. HistoryStore idempotency, conflict detection, and scoping\n");

check("putDailyRecordIdempotent creates a new record on first write", () => {
  const store = newStore();
  const record = makeMinimalRecord({ dateIso: "2026-08-01" });
  const result = store.putDailyRecordIdempotent(record);
  assert.equal(result.status, "created");
  assert.ok(store.confirmDailyRecordPersisted(SCOPE, "2026-08-01", "live"));
});

check("Repeating an identical archival attempt is a safe no-op (already-exists), not a duplicate or an error", () => {
  const store = newStore();
  const record = makeMinimalRecord({ dateIso: "2026-08-02", createdAtIso: "2026-08-02T23:59:00.000Z" });
  store.putDailyRecordIdempotent(record);
  const secondAttempt = makeMinimalRecord({ dateIso: "2026-08-02", createdAtIso: "2026-08-02T23:59:30.000Z" }); // different createdAtIso only
  const result = store.putDailyRecordIdempotent(secondAttempt);
  assert.equal(result.status, "already-exists");
  const all = store.listDailyRecords(SCOPE, { fromDateIso: "2026-08-02", toDateIso: "2026-08-02" }, "live");
  assert.equal(all.length, 1, "repeated idempotent writes must never accumulate duplicates");
});

check("A genuinely different record at the same key is reported as a conflict and never silently overwritten", () => {
  const store = newStore();
  const original = makeMinimalRecord({ dateIso: "2026-08-03", weight: { weightLb: 190, skipped: false } });
  store.putDailyRecordIdempotent(original);
  const different = makeMinimalRecord({ dateIso: "2026-08-03", weight: { weightLb: 195, skipped: false } });
  const result = store.putDailyRecordIdempotent(different);
  assert.equal(result.status, "conflict");
  const stored = store.getDailyRecord(SCOPE, "2026-08-03", "live");
  assert.equal(stored?.weight.weightLb, 190, "the original record must remain untouched after a conflicting write attempt");
});

check("Corrections and daily records are scoped independently and never leak across a different enrollment", () => {
  const store = newStore();
  store.putDailyRecordIdempotent(makeMinimalRecord({ dateIso: "2026-08-04" }));
  const otherScope: HistoryScope = { ...SCOPE, enrollmentId: "some-other-enrollment" };
  const foreign = makeMinimalRecord({
    dateIso: "2026-08-04",
    enrollmentId: otherScope.enrollmentId,
    id: buildDailyRecordId({ ...otherScope, dateIso: "2026-08-04", source: "live" }),
  });
  store.putDailyRecordIdempotent(foreign);
  const inScope = store.listDailyRecords(SCOPE, { fromDateIso: "2026-08-04", toDateIso: "2026-08-04" }, "live");
  assert.equal(inScope.length, 1);
  assert.equal(inScope[0].enrollmentId, SCOPE.enrollmentId);
});

check("clearScope removes only records in the given scope, leaving others intact", () => {
  const store = newStore();
  store.putDailyRecordIdempotent(makeMinimalRecord({ dateIso: "2026-08-05" }));
  const otherScope: HistoryScope = { ...SCOPE, clientId: "other-client" };
  store.putDailyRecordIdempotent(
    makeMinimalRecord({ dateIso: "2026-08-05", clientId: otherScope.clientId, id: buildDailyRecordId({ ...otherScope, dateIso: "2026-08-05", source: "live" }) })
  );
  store.clearScope(SCOPE);
  assert.equal(store.getDailyRecord(SCOPE, "2026-08-05", "live"), null);
  assert.ok(store.getDailyRecord(otherScope, "2026-08-05", "live"));
});

console.log("\n5. Live-state snapshot builder (snapshot integrity)\n");

check("A scheduled_workout day's prescribed workout is a deep copy, never the same object as the live catalog entry", () => {
  const state = createInitialState();
  const record = buildDailyRecordFromLiveState(state, state.programEnrollment, "live");
  assert.ok(record.training.prescribedWorkoutSnapshot);
  assert.notEqual(record.training.prescribedWorkoutSnapshot, PUSH_WORKOUT, "must be a deep copy, not a live reference");
  assert.deepEqual(record.training.prescribedWorkoutSnapshot!.exercises[0].name, PUSH_WORKOUT.exercises[0].name);
  // Mutating the snapshot must never be able to reach the live catalog.
  record.training.prescribedWorkoutSnapshot!.name = "Mutated for test";
  assert.notEqual(PUSH_WORKOUT.name, "Mutated for test");
});

check("A scheduled_rest day snapshots no workout prescription", () => {
  let state = createInitialState();
  state = reducer(state, { type: "SET_TRAINING_REST_DAY" });
  const record = buildDailyRecordFromLiveState(state, state.programEnrollment, "live");
  assert.equal(record.training.trainingDayType, "scheduled_rest");
  assert.equal(record.training.prescribedWorkoutSnapshot, null);
});

console.log("\n6. Training-adherence derivation (Phase 4 Correction #2)\n");

check("A fully completed prescribed workout derives complete adherence with ratio 1", () => {
  const record = makeMinimalRecord({ training: { trainingDayType: "scheduled_workout", prescribedWorkoutSnapshot: null, sessionStatus: "completed", exerciseLogs: {}, painReports: [], workingSetsCompleted: 15, workingSetsPrescribed: 15 } });
  const result = deriveTrainingAdherence(record);
  assert.equal(result.outcome, "complete");
  assert.equal(result.ratio, 1);
});

check("A justified skip is resolved-with-context but still zero adherence — never inflated by a good reason", () => {
  const record = makeMinimalRecord({
    training: { trainingDayType: "scheduled_workout", prescribedWorkoutSnapshot: null, sessionStatus: "skipped", exerciseLogs: {}, painReports: [], skipReason: "feeling-sick", workingSetsCompleted: 0, workingSetsPrescribed: 15 },
  });
  const result = deriveTrainingAdherence(record);
  assert.equal(result.outcome, "missed");
  assert.equal(result.ratio, 0);
  assert.equal(result.resolvedWithContext, true, "a real reason was given, even though adherence itself is zero");
});

check("An ended-early session derives a real partial ratio, capped at 1", () => {
  const record = makeMinimalRecord({
    training: { trainingDayType: "scheduled_workout", prescribedWorkoutSnapshot: null, sessionStatus: "ended-early", exerciseLogs: {}, painReports: [], workingSetsCompleted: 5, workingSetsPrescribed: 15 },
  });
  const result = deriveTrainingAdherence(record);
  assert.equal(result.outcome, "partial");
  assert.ok(Math.abs(result.ratio! - 5 / 15) < 1e-9);
});

check("A rest day is not_applicable for training adherence, not missed", () => {
  const record = makeMinimalRecord({
    training: { trainingDayType: "scheduled_rest", prescribedWorkoutSnapshot: null, sessionStatus: null, exerciseLogs: {}, painReports: [], workingSetsCompleted: 0, workingSetsPrescribed: 0 },
  });
  const result = deriveTrainingAdherence(record);
  assert.equal(result.outcome, "not_applicable");
  assert.equal(result.ratio, null);
});

console.log("\n7. Nutrition derivation (Phase 4 Correction #3)\n");

check("Meal-plan adherence counts a logged replacement the same as a catalog option", () => {
  const record = makeMinimalRecord({
    nutrition: {
      meals: {
        breakfast: { period: "breakfast", source: "option", macros: { calories: 600, proteinG: 40, carbsG: 60, fatG: 15 } },
        postWorkout: { period: "postWorkout", source: "manual", macros: { calories: 600, proteinG: 50, carbsG: 60, fatG: 15 } },
      },
      periodsInPlan: ["breakfast", "postWorkout"],
      targetsSnapshot: { calories: 3000, proteinG: 200, carbsG: 360, fatG: 85 },
    },
  });
  const result = deriveMealPlanAdherence(record);
  assert.equal(result.outcome, "complete");
  assert.equal(result.ratio, 1);
});

check("A partially resolved day (some meals logged, others not) derives a real partial ratio", () => {
  const record = makeMinimalRecord({
    nutrition: {
      meals: { breakfast: { period: "breakfast", source: "option", macros: { calories: 600, proteinG: 40, carbsG: 60, fatG: 15 } } },
      periodsInPlan: ["breakfast", "postWorkout", "lunch", "dinner"],
      targetsSnapshot: { calories: 3000, proteinG: 200, carbsG: 360, fatG: 85 },
    },
  });
  const result = deriveMealPlanAdherence(record);
  assert.equal(result.outcome, "partial");
  assert.equal(result.ratio, 0.25);
});

check("Calorie target-met is symmetric and returns insufficient_data when a counted meal's macros are unknown", () => {
  const onTarget = makeMinimalRecord({
    nutrition: {
      meals: { breakfast: { period: "breakfast", source: "option", macros: { calories: 3050, proteinG: 200, carbsG: 360, fatG: 85 } } },
      periodsInPlan: ["breakfast"],
      targetsSnapshot: { calories: 3000, proteinG: 200, carbsG: 360, fatG: 85 },
    },
  });
  assert.equal(deriveCalorieTargetMet(onTarget), "met");

  const overTarget = makeMinimalRecord({
    nutrition: {
      meals: { breakfast: { period: "breakfast", source: "option", macros: { calories: 3300, proteinG: 200, carbsG: 360, fatG: 85 } } },
      periodsInPlan: ["breakfast"],
      targetsSnapshot: { calories: 3000, proteinG: 200, carbsG: 360, fatG: 85 },
    },
  });
  assert.equal(deriveCalorieTargetMet(overTarget), "not_met");

  const unknownMacros = makeMinimalRecord({
    nutrition: {
      meals: { breakfast: { period: "breakfast", source: "manual" } }, // no macros known
      periodsInPlan: ["breakfast"],
      targetsSnapshot: { calories: 3000, proteinG: 200, carbsG: 360, fatG: 85 },
    },
  });
  assert.equal(deriveCalorieTargetMet(unknownMacros), "insufficient_data");
});

check("Protein target-met is asymmetric: below target minus tolerance fails, at or above target is always met, never penalized for being high", () => {
  const targetsSnapshot = { calories: 3000, proteinG: 200, carbsG: 360, fatG: 85 };
  const justBelowTolerance = makeMinimalRecord({
    nutrition: { meals: { breakfast: { period: "breakfast", source: "option", macros: { calories: 3000, proteinG: 191, carbsG: 360, fatG: 85 } } }, periodsInPlan: ["breakfast"], targetsSnapshot },
  });
  assert.equal(deriveProteinTargetMet(justBelowTolerance), "met"); // 200 - 10 = 190 floor, 191 clears it

  const belowTolerance = makeMinimalRecord({
    nutrition: { meals: { breakfast: { period: "breakfast", source: "option", macros: { calories: 3000, proteinG: 150, carbsG: 360, fatG: 85 } } }, periodsInPlan: ["breakfast"], targetsSnapshot },
  });
  assert.equal(deriveProteinTargetMet(belowTolerance), "not_met");

  const wayOverTarget = makeMinimalRecord({
    nutrition: { meals: { breakfast: { period: "breakfast", source: "option", macros: { calories: 3000, proteinG: 260, carbsG: 360, fatG: 85 } } }, periodsInPlan: ["breakfast"], targetsSnapshot },
  });
  assert.equal(deriveProteinTargetMet(wayOverTarget), "met", "coming in well above the protein target must never be penalized");
});

console.log("\n8. Cardio derivation (Phase 4 Correction #4)\n");

check("A skip is always zero adherence regardless of any prior partial progress on the snapshot", () => {
  const record = makeMinimalRecord({ cardio: { cardioDayType: "scheduled", status: "skipped", durationMin: 0, selectedOptionSnapshot: { id: "cardio-stairmaster", type: "StairMaster", displayName: "StairMaster", isDefault: true, intendedUse: "", targetDurationMin: 20, protocol: "" } } });
  const result = deriveCardioAdherence(record);
  assert.equal(result.outcome, "missed");
  assert.equal(result.ratio, 0);
});

check("A partial cardio session derives a real ratio against its own selected option's target, capped at 1", () => {
  const record = makeMinimalRecord({
    cardio: { cardioDayType: "scheduled", status: "partial", durationMin: 10, selectedOptionSnapshot: { id: "cardio-stairmaster", type: "StairMaster", displayName: "StairMaster", isDefault: true, intendedUse: "", targetDurationMin: 20, protocol: "" } },
  });
  const result = deriveCardioAdherence(record);
  assert.equal(result.outcome, "partial");
  assert.equal(result.ratio, 0.5);
});

check("An approved alternative gets full credit measured against its own (shorter) target, never the default option's", () => {
  const record = makeMinimalRecord({
    cardio: { cardioDayType: "scheduled", status: "completed", durationMin: 12, selectedOptionSnapshot: { id: "cardio-hiit", type: "HIIT", displayName: "HIIT workout", isDefault: false, intendedUse: "", targetDurationMin: 12, protocol: "" } },
  });
  const result = deriveCardioAdherence(record);
  assert.equal(result.outcome, "complete");
  assert.equal(result.ratio, 1);
});

check("A day cardio was never assigned for derives not_applicable, never missed, regardless of what the log shows", () => {
  const record = makeMinimalRecord({
    cardio: { cardioDayType: "not_scheduled", status: "not-started", durationMin: 0, selectedOptionSnapshot: null },
  });
  const result = deriveCardioAdherence(record);
  assert.equal(result.outcome, "not_applicable");
  assert.equal(result.ratio, 0);
});

check("A record archived before cardioDayType existed (missing the field entirely) keeps behaving as scheduled, never silently reclassified", () => {
  const legacyCardio = { status: "completed", durationMin: 20, selectedOptionSnapshot: null } as unknown as DailyRecord["cardio"];
  const record = makeMinimalRecord({ cardio: legacyCardio });
  const result = deriveCardioAdherence(record);
  assert.equal(result.outcome, "complete", "a pre-existing record with no cardioDayType field must default to scheduled, not not_scheduled");
});

console.log("\n9. Weight trend derivation (Phase 4 Correction #5)\n");

check(`Fewer than ${MIN_WEIGHT_TREND_DAYS} distinct dated points reports insufficient_data, never a fabricated trend`, () => {
  const records = [makeMinimalRecord({ dateIso: "2026-08-01", weight: { weightLb: 190, skipped: false } })];
  const result = deriveWeightTrend(records);
  assert.equal(result.status, "insufficient_data");
  assert.equal(result.points.length, 1, "the one real raw point is still preserved even while insufficient");
});

check("Multiple entries on the same date keep only the latest for the trend value, without discarding the underlying records", () => {
  const records = [
    makeMinimalRecord({ dateIso: "2026-08-01", weight: { weightLb: 190, loggedAtIso: "2026-08-01T06:00:00.000Z", skipped: false } }),
    { ...makeMinimalRecord({ dateIso: "2026-08-01", weight: { weightLb: 191, loggedAtIso: "2026-08-01T09:00:00.000Z", skipped: false } }), id: "duplicate-same-date" },
    makeMinimalRecord({ dateIso: "2026-08-02", weight: { weightLb: 191, skipped: false } }),
    makeMinimalRecord({ dateIso: "2026-08-03", weight: { weightLb: 190.5, skipped: false } }),
    makeMinimalRecord({ dateIso: "2026-08-04", weight: { weightLb: 190, skipped: false } }),
  ];
  const result = deriveWeightTrend(records);
  const aug1 = result.points.find((p) => p.dateIso === "2026-08-01");
  assert.equal(aug1?.weightLb, 191, "the later-logged entry for the same date must win");
});

check("A gap day with no logged weight is excluded from the trailing average, never interpolated", () => {
  const records = [
    makeMinimalRecord({ dateIso: "2026-08-01", weight: { weightLb: 200, skipped: false } }),
    makeMinimalRecord({ dateIso: "2026-08-02", weight: { weightLb: 200, skipped: false } }),
    // 2026-08-03 intentionally has no weight record at all.
    makeMinimalRecord({ dateIso: "2026-08-04", weight: { weightLb: 190, skipped: false } }),
    makeMinimalRecord({ dateIso: "2026-08-05", weight: { weightLb: 190, skipped: false } }),
  ];
  const result = deriveWeightTrend(records);
  assert.equal(result.points.some((p) => p.dateIso === "2026-08-03"), false, "no point may be fabricated for an unlogged day");
  const aug5 = result.points.find((p) => p.dateIso === "2026-08-05");
  // Average of the real points within the trailing window (08-01, 08-02, 08-04, 08-05) — 08-03 excluded, not filled with an interpolated value.
  assert.equal(aug5?.trailingAverageLb, Math.round(((200 + 200 + 190 + 190) / 4) * 10) / 10);
});

console.log("\n10. Overall day-status derivation (Phase 4 Correction #1)\n");

check("A rest day requires nutrition/cardio/weight but never training", () => {
  const required = deriveRequiredDomains("scheduled_rest", "scheduled");
  assert.equal(required.training, false);
  assert.equal(required.weight && required.nutrition && required.cardio, true);
});

check("A day cardio wasn't assigned for excludes cardio from required domains, regardless of training day type", () => {
  const required = deriveRequiredDomains("scheduled_workout", "not_scheduled");
  assert.equal(required.cardio, false);
  assert.equal(required.training, true, "cardio assignment must never affect the separate training requirement");
});

check("Every required domain fully complete derives an overall complete day", () => {
  const record = makeMinimalRecord({
    training: { trainingDayType: "scheduled_workout", prescribedWorkoutSnapshot: null, sessionStatus: "completed", exerciseLogs: {}, painReports: [], workingSetsCompleted: 15, workingSetsPrescribed: 15 },
    nutrition: { meals: Object.fromEntries(["breakfast", "postWorkout", "lunch", "dinner", "snack"].map((p) => [p, { period: p, source: "option", macros: { calories: 500, proteinG: 30, carbsG: 50, fatG: 10 } }])) as never, periodsInPlan: ["breakfast", "postWorkout", "lunch", "dinner", "snack"], targetsSnapshot: { calories: 3000, proteinG: 200, carbsG: 360, fatG: 85 } },
    cardio: { cardioDayType: "scheduled", status: "completed", durationMin: 20, selectedOptionSnapshot: null },
    weight: { weightLb: 190, skipped: false },
  });
  assert.equal(deriveOverallAdherenceStatus(record, "closed"), "complete");
});

check("A day cardio wasn't assigned for still derives an overall complete day when every required domain is complete", () => {
  const record = makeMinimalRecord({
    training: { trainingDayType: "scheduled_workout", prescribedWorkoutSnapshot: null, sessionStatus: "completed", exerciseLogs: {}, painReports: [], workingSetsCompleted: 15, workingSetsPrescribed: 15 },
    nutrition: { meals: Object.fromEntries(["breakfast", "postWorkout", "lunch", "dinner", "snack"].map((p) => [p, { period: p, source: "option", macros: { calories: 500, proteinG: 30, carbsG: 50, fatG: 10 } }])) as never, periodsInPlan: ["breakfast", "postWorkout", "lunch", "dinner", "snack"], targetsSnapshot: { calories: 3000, proteinG: 200, carbsG: 360, fatG: 85 } },
    cardio: { cardioDayType: "not_scheduled", status: "not-started", durationMin: 0, selectedOptionSnapshot: null },
    weight: { weightLb: 190, skipped: false },
  });
  assert.equal(deriveOverallAdherenceStatus(record, "closed"), "complete", "an unassigned cardio day must never hold back an otherwise-complete day");
});

check("Every required domain fully missed derives an overall missed day (closed)", () => {
  const record = makeMinimalRecord({
    training: { trainingDayType: "scheduled_workout", prescribedWorkoutSnapshot: null, sessionStatus: "skipped", exerciseLogs: {}, painReports: [], workingSetsCompleted: 0, workingSetsPrescribed: 15 },
    nutrition: { meals: {}, periodsInPlan: ["breakfast"], targetsSnapshot: { calories: 3000, proteinG: 200, carbsG: 360, fatG: 85 } },
    cardio: { cardioDayType: "scheduled", status: "skipped", durationMin: 0, selectedOptionSnapshot: null },
    weight: { weightLb: null, skipped: true },
  });
  assert.equal(deriveOverallAdherenceStatus(record, "closed"), "missed");
});

check("A mix of complete and missed domains derives partial, not missed or complete", () => {
  const record = makeMinimalRecord({
    training: { trainingDayType: "scheduled_workout", prescribedWorkoutSnapshot: null, sessionStatus: "completed", exerciseLogs: {}, painReports: [], workingSetsCompleted: 15, workingSetsPrescribed: 15 },
    nutrition: { meals: {}, periodsInPlan: ["breakfast"], targetsSnapshot: { calories: 3000, proteinG: 200, carbsG: 360, fatG: 85 } },
    cardio: { cardioDayType: "scheduled", status: "skipped", durationMin: 0, selectedOptionSnapshot: null },
    weight: { weightLb: null, skipped: true },
  });
  assert.equal(deriveOverallAdherenceStatus(record, "closed"), "partial");
});

check("An open (still-live) day short of complete reports in_progress, never partial or missed", () => {
  const record = makeMinimalRecord({
    weight: { weightLb: null, skipped: false },
  });
  assert.equal(deriveOverallAdherenceStatus(record, "open"), "in_progress");
});

console.log("\n11. Check-in schedule derivation\n");

check("finalScheduledTrainingDayOffset returns null (insufficient_data upstream) for a template with no training days", () => {
  assert.equal(finalScheduledTrainingDayOffset([]), null);
  assert.equal(
    finalScheduledTrainingDayOffset([{ dayOfWeek: "Monday", label: "Mon", type: "rest", status: "rest" }]),
    null
  );
});

check("A check-in is not_available before its open time, due within the window, and overdue after it", () => {
  const config = buildDemoCheckInScheduleConfig({ workspaceId: WORKSPACE_OPTIM_ID, clientId: CLIENT_PROFILE_DEMO.id, enrollmentId: ENROLLMENT.id, timeZone: "UTC", now: new Date("2026-08-01T00:00:00.000Z") });
  const weekStart = "2026-08-03"; // a Monday
  const dueDateIso = addDaysToLocalDate(weekStart, finalScheduledTrainingDayOffset()! + 1);
  const opensAt = zonedDateTimeToInstant(dueDateIso, "08:00", "UTC");

  const beforeOpen = new Date(opensAt.getTime() - 60_000);
  assert.equal(deriveCheckInStatus(config, weekStart, null, beforeOpen), "not_available");

  const withinWindow = new Date(opensAt.getTime() + 60_000);
  assert.equal(deriveCheckInStatus(config, weekStart, null, withinWindow), "due");

  const pastWindow = new Date(opensAt.getTime() + config.dueWindowHours * 60 * 60 * 1000 + 60_000);
  assert.equal(deriveCheckInStatus(config, weekStart, null, pastWindow), "overdue");
});

check("An existing WeeklyReview's own stored status always overrides a time-based guess", () => {
  const config = buildDemoCheckInScheduleConfig({ workspaceId: WORKSPACE_OPTIM_ID, clientId: CLIENT_PROFILE_DEMO.id, enrollmentId: ENROLLMENT.id, timeZone: "UTC" });
  const review = { status: "submitted" as const } as never;
  assert.equal(deriveCheckInStatus(config, "2026-08-03", review, new Date("2026-08-01T00:00:00.000Z")), "submitted");
});

console.log("\n12. Priority-action precedence (Phase 4 Correction #6)\n");

check("Unread coach feedback outranks every other signal", () => {
  const action = derivePriorityAction({
    hasUnreadCoachFeedback: true,
    hasApprovedAdjustmentNeedingReview: true,
    checkInStatus: "overdue",
    correctionNeededDates: ["2026-08-01"],
    fallbackAction: { kind: "other_derived_action" },
  });
  assert.equal(action?.kind, "unread_coach_feedback");
});

check("Overdue check-in outranks a currently-due check-in", () => {
  const overdue = derivePriorityAction({ hasUnreadCoachFeedback: false, hasApprovedAdjustmentNeedingReview: false, checkInStatus: "overdue", correctionNeededDates: [], fallbackAction: null });
  const due = derivePriorityAction({ hasUnreadCoachFeedback: false, hasApprovedAdjustmentNeedingReview: false, checkInStatus: "due", correctionNeededDates: [], fallbackAction: null });
  assert.equal(overdue?.kind, "checkin_overdue");
  assert.equal(due?.kind, "checkin_due");
});

check("Correction-needed picks the oldest unresolved date deterministically", () => {
  const action = derivePriorityAction({
    hasUnreadCoachFeedback: false,
    hasApprovedAdjustmentNeedingReview: false,
    checkInStatus: "not_available",
    correctionNeededDates: ["2026-08-05", "2026-08-01", "2026-08-03"],
    fallbackAction: null,
  });
  assert.equal(action?.kind, "correction_needed");
  assert.equal(action?.targetDateIso, "2026-08-01");
});

check("With nothing outstanding, the real fallback is returned rather than a fabricated claim, and null propagates honestly when there truly is none", () => {
  const withFallback = derivePriorityAction({ hasUnreadCoachFeedback: false, hasApprovedAdjustmentNeedingReview: false, checkInStatus: "not_available", correctionNeededDates: [], fallbackAction: { kind: "other_derived_action", detail: "Review this week's progress." } });
  assert.equal(withFallback?.kind, "other_derived_action");

  const withoutFallback = derivePriorityAction({ hasUnreadCoachFeedback: false, hasApprovedAdjustmentNeedingReview: false, checkInStatus: "not_available", correctionNeededDates: [], fallbackAction: null });
  assert.equal(withoutFallback, null);
});

console.log("\n13. Date rollover and daily archival\n");

check("A stored date matching today is a no-op — no archival, state passes through unchanged", () => {
  const state = createInitialState();
  const result = resolveRollover(state, state.dateIso, newStore());
  assert.equal(result.archived, false);
  assert.equal(result.nextState, state);
});

check("A forward rollover archives the stale day, then resets to a fresh day for today", () => {
  const store = newStore();
  let state = createInitialState();
  state = reducer(state, { type: "SET_MORNING_WEIGHT", weightLb: 189.2 });
  const yesterday = addDaysToLocalDate(state.dateIso, -1);
  const stale = { ...state, dateIso: yesterday };

  const result = resolveRollover(stale, state.dateIso, store);
  assert.equal(result.archived, true);
  assert.equal(result.nextState.dateIso, state.dateIso);
  assert.equal(result.nextState.morningWeight.weightLb, null, "the fresh day must start clean, not carry yesterday's logged weight forward");

  const scope: HistoryScope = { workspaceId: stale.workspaceId, clientId: stale.clientId, enrollmentId: stale.programEnrollment.id };
  const archived = store.getDailyRecord(scope, yesterday, "live");
  assert.ok(archived, "yesterday's day must actually be archived");
  assert.equal(archived!.weight.weightLb, 189.2);
});

check("Repeating the same rollover attempt is idempotent — archival converges rather than erroring or duplicating", () => {
  const store = newStore();
  let state = createInitialState();
  state = reducer(state, { type: "SET_MORNING_WEIGHT", weightLb: 200 });
  const yesterday = addDaysToLocalDate(state.dateIso, -1);
  const stale = { ...state, dateIso: yesterday };

  const first = resolveRollover(stale, state.dateIso, store);
  const second = resolveRollover(stale, state.dateIso, store);
  assert.equal(first.archived, true);
  assert.equal(second.archived, true);
  const scope: HistoryScope = { workspaceId: stale.workspaceId, clientId: stale.clientId, enrollmentId: stale.programEnrollment.id };
  const all = store.listDailyRecords(scope, { fromDateIso: yesterday, toDateIso: yesterday }, "live");
  assert.equal(all.length, 1, "no duplicate archived record from the repeated attempt");
});

check("An archival conflict never discards the live state", () => {
  const store = newStore();
  let state = createInitialState();
  state = reducer(state, { type: "SET_MORNING_WEIGHT", weightLb: 189 });
  const yesterday = addDaysToLocalDate(state.dateIso, -1);
  const stale = { ...state, dateIso: yesterday };

  // Pre-populate a genuinely different record at the same archival key.
  const conflicting = buildDailyRecordFromLiveState({ ...stale, morningWeight: { weightLb: 999, skipped: false } }, stale.programEnrollment, "live");
  store.putDailyRecordIdempotent(conflicting);

  const result = resolveRollover(stale, state.dateIso, store);
  assert.equal(result.archived, false);
  assert.equal(result.nextState, stale, "live state must be preserved untouched, never silently reset, on a conflict");
});

check("A backward clock/timezone move preserves the live state rather than archiving it as complete or resetting it", () => {
  const state = createInitialState();
  const earlierToday = addDaysToLocalDate(state.dateIso, -1);
  const result = resolveRollover(state, earlierToday, newStore());
  assert.equal(result.archived, false);
  assert.equal(result.nextState, state);
});

console.log("\n14. Demo history fixture\n");

check("The demo fixture is fully deterministic for a given anchor date", () => {
  const fixtureA = buildDemoHistoryFixture("2026-08-14", ENROLLMENT);
  const fixtureB = buildDemoHistoryFixture("2026-08-14", ENROLLMENT);
  assert.deepEqual(fixtureA.dailyRecords.map((r) => r.id).sort(), fixtureB.dailyRecords.map((r) => r.id).sort());
  assert.deepEqual(fixtureA, fixtureB);
});

check("Every fixture day is strictly before the anchor date, never colliding with a live day", () => {
  const anchor = "2026-08-14";
  const fixture = buildDemoHistoryFixture(anchor, ENROLLMENT);
  for (const record of fixture.dailyRecords) {
    assert.ok(compareLocalDates(record.dateIso, anchor) < 0, `${record.dateIso} must be before the anchor date`);
  }
});

check("The fixture is loadable into an isolated store without colliding with unrelated live records, and clears cleanly", () => {
  const store = newStore();
  const fixture = buildDemoHistoryFixture("2026-08-14", ENROLLMENT);
  for (const record of fixture.dailyRecords) {
    const result = store.putDailyRecordIdempotent(record);
    assert.equal(result.status, "created");
  }
  const scope: HistoryScope = { workspaceId: WORKSPACE_OPTIM_ID, clientId: CLIENT_PROFILE_DEMO.id, enrollmentId: ENROLLMENT.id };
  assert.equal(store.listDailyRecords(scope, { fromDateIso: "2000-01-01", toDateIso: "2100-01-01" }, "fixture").length, fixture.dailyRecords.length);
  store.clearScope(scope);
  assert.equal(store.listDailyRecords(scope, { fromDateIso: "2000-01-01", toDateIso: "2100-01-01" }, "fixture").length, 0);
});

check("The fixture's missed day derives an overall missed status and its complete day derives complete", () => {
  const fixture = buildDemoHistoryFixture("2026-08-14", ENROLLMENT);
  const missedDay = fixture.dailyRecords.find((r) => r.training.sessionStatus === "skipped");
  const completeDay = fixture.dailyRecords.find(
    (r) => r.training.sessionStatus === "completed" && r.training.painReports.length === 0 && r.cardio.selectedOptionSnapshot?.id === "cardio-stairmaster" && r.cardio.durationMin === 20 && Object.keys(r.nutrition.meals).length === 5
  );
  assert.ok(missedDay);
  assert.ok(completeDay);
  assert.equal(deriveOverallAdherenceStatus(missedDay!, "closed"), "missed");
  assert.equal(deriveOverallAdherenceStatus(completeDay!, "closed"), "complete");
});

console.log(`\n${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
