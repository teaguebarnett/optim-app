// Phase 6.0B — Persist the Complete Revenue Loop.
//
// Pure logic tests for lib/production/validation.ts — every guard that
// stands between a training_program_versions/nutrition_plan_versions/
// daily_records `content jsonb` payload and an unsafe cast into the real
// domain types. No DB, no network. Run with: npm run verify:production-validation

import assert from "node:assert/strict";
import { InvalidPersistedContentError } from "./errors.ts";
import {
  validateClientAssignedProgramContent,
  validateAssignedNutritionPlanContent,
  validateDailyActivityContent,
} from "./validation.ts";

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

const VALID_WORKOUT = {
  id: "w1",
  workspaceId: "ws1",
  name: "Push",
  dayOfWeek: "Monday",
  focus: "Chest",
  estimatedDurationMin: 45,
  warmupOverview: "warm up",
  coachNote: "note",
  exercises: [
    {
      id: "e1",
      order: 1,
      name: "Bench",
      warmupSets: 1,
      workingSets: 3,
      targetRepsLow: 6,
      targetRepsHigh: 10,
      targetRpe: 8,
      restSeconds: 90,
      tempo: "2-0-1",
      cue: "brace",
      previousPerformance: [],
      prescribedSets: [],
    },
  ],
};

function buildValidWeek(weekNumber: number) {
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  return {
    weekNumber,
    days: days.map((dayOfWeek) => (dayOfWeek === "Monday" ? { dayOfWeek, type: "training", workout: VALID_WORKOUT } : { dayOfWeek, type: "rest" })),
  };
}

const VALID_PROGRAM = {
  id: "p1",
  workspaceId: "ws1",
  clientId: "c1",
  coachId: "coach1",
  name: "Program",
  durationWeeks: 1,
  weeks: [buildValidWeek(1)],
  status: "assigned",
  createdAtIso: "2026-01-01T00:00:00.000Z",
  updatedAtIso: "2026-01-01T00:00:00.000Z",
};

console.log("\n1. validateClientAssignedProgramContent\n");

check("a genuinely valid ClientAssignedProgram payload round-trips cleanly", () => {
  const result = validateClientAssignedProgramContent(VALID_PROGRAM);
  assert.equal(result.id, "p1");
  assert.equal(result.weeks[0].days[0].workout?.exercises[0].name, "Bench");
});

check("rejects a non-object payload", () => {
  assert.throws(() => validateClientAssignedProgramContent("not an object"), InvalidPersistedContentError);
});

check("rejects a payload missing durationWeeks", () => {
  const { durationWeeks, ...rest } = VALID_PROGRAM;
  void durationWeeks;
  assert.throws(() => validateClientAssignedProgramContent(rest), InvalidPersistedContentError);
});

check("rejects a week with fewer than 7 days", () => {
  const broken = { ...VALID_PROGRAM, weeks: [{ weekNumber: 1, days: [{ dayOfWeek: "Monday", type: "rest" }] }] };
  assert.throws(() => validateClientAssignedProgramContent(broken), InvalidPersistedContentError);
});

check("rejects a training day with type 'training' but no workout", () => {
  const days = buildValidWeek(1).days.map((d) => (d.dayOfWeek === "Monday" ? { dayOfWeek: "Monday", type: "training" } : d));
  const broken = { ...VALID_PROGRAM, weeks: [{ weekNumber: 1, days }] };
  assert.throws(() => validateClientAssignedProgramContent(broken), InvalidPersistedContentError);
});

check("rejects a workout whose exercise is missing required numeric fields", () => {
  const badWorkout = { ...VALID_WORKOUT, exercises: [{ ...VALID_WORKOUT.exercises[0], targetRpe: "eight" }] };
  const days = buildValidWeek(1).days.map((d) => (d.dayOfWeek === "Monday" ? { dayOfWeek: "Monday", type: "training", workout: badWorkout } : d));
  const broken = { ...VALID_PROGRAM, weeks: [{ weekNumber: 1, days }] };
  assert.throws(() => validateClientAssignedProgramContent(broken), InvalidPersistedContentError);
});

check("rejects an invalid day.type value", () => {
  const days = buildValidWeek(1).days.map((d) => (d.dayOfWeek === "Tuesday" ? { dayOfWeek: "Tuesday", type: "vacation" } : d));
  const broken = { ...VALID_PROGRAM, weeks: [{ weekNumber: 1, days }] };
  assert.throws(() => validateClientAssignedProgramContent(broken), InvalidPersistedContentError);
});

console.log("\n2. validateAssignedNutritionPlanContent\n");

const VALID_NUTRITION = {
  id: "n1",
  targets: { calories: 2200, proteinG: 160, carbsG: 220, fatG: 70 },
  usesTrainingRestSplit: false,
};

check("a genuinely valid AssignedNutritionPlan payload round-trips cleanly", () => {
  const result = validateAssignedNutritionPlanContent(VALID_NUTRITION);
  assert.equal(result.targets.calories, 2200);
});

check("rejects a payload with non-numeric targets", () => {
  const broken = { ...VALID_NUTRITION, targets: { ...VALID_NUTRITION.targets, calories: "a lot" } };
  assert.throws(() => validateAssignedNutritionPlanContent(broken), InvalidPersistedContentError);
});

check("rejects a payload with a non-boolean usesTrainingRestSplit", () => {
  const broken = { ...VALID_NUTRITION, usesTrainingRestSplit: "yes" };
  assert.throws(() => validateAssignedNutritionPlanContent(broken), InvalidPersistedContentError);
});

check("rejects a payload missing targets entirely", () => {
  const { targets, ...rest } = VALID_NUTRITION;
  void targets;
  assert.throws(() => validateAssignedNutritionPlanContent(rest), InvalidPersistedContentError);
});

console.log("\n3. validateDailyActivityContent\n");

const VALID_ACTIVITY = {
  training: {
    trainingDayType: "scheduled_workout",
    prescribedWorkoutSnapshot: null,
    sessionStatus: "completed",
    exerciseLogs: {},
    painReports: [],
    workingSetsCompleted: 3,
    workingSetsPrescribed: 3,
  },
  nutrition: {
    meals: {},
    periodsInPlan: [],
    targetsSnapshot: { calories: 2200, proteinG: 160, carbsG: 220, fatG: 70 },
  },
};

check("a genuinely valid daily activity payload round-trips cleanly", () => {
  const result = validateDailyActivityContent(VALID_ACTIVITY);
  assert.equal(result.training.workingSetsCompleted, 3);
});

check("rejects a payload with no training key", () => {
  const { training, ...rest } = VALID_ACTIVITY;
  void training;
  assert.throws(() => validateDailyActivityContent(rest), InvalidPersistedContentError);
});

check("rejects a payload with no nutrition key", () => {
  const { nutrition, ...rest } = VALID_ACTIVITY;
  void nutrition;
  assert.throws(() => validateDailyActivityContent(rest), InvalidPersistedContentError);
});

check("rejects a payload with a non-numeric workingSetsCompleted", () => {
  const broken = { ...VALID_ACTIVITY, training: { ...VALID_ACTIVITY.training, workingSetsCompleted: "three" } };
  assert.throws(() => validateDailyActivityContent(broken), InvalidPersistedContentError);
});

check("rejects a payload whose exerciseLogs isn't an object", () => {
  const broken = { ...VALID_ACTIVITY, training: { ...VALID_ACTIVITY.training, exerciseLogs: [] } };
  assert.throws(() => validateDailyActivityContent(broken), InvalidPersistedContentError);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
