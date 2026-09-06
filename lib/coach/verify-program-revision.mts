// Phase 5.5 — verifies conversational revision: instruction interpretation,
// current-and-future-only application (never touching past weeks), real
// before/after change summaries, and honest handling of an unrecognized
// instruction.

import assert from "node:assert/strict";
import { interpretRevisionInstruction, applyProgramRevision } from "./program-revision.ts";
import { WORKSPACE_OPTIM_ID, COACH_PROFILE_TEAGUE, CLIENT_PROFILE_DEMO } from "../tenancy/seed.ts";
import type { ClientAssignedProgram, Exercise, ProgramWeek } from "../types";

let passed = 0;
let failed = 0;

function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ok  - ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL  - ${name}`);
    console.log(`        ${(err as Error).message}`);
    failed++;
  }
}

function makeExercise(name: string, overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: `ex-${name.replace(/\s+/g, "-").toLowerCase()}`,
    order: 1,
    name,
    warmupSets: 1,
    workingSets: 3,
    targetRepsLow: 8,
    targetRepsHigh: 12,
    targetRpe: 8,
    restSeconds: 90,
    tempo: "controlled",
    cue: "Real cue.",
    previousPerformance: [],
    prescribedSets: [],
    ...overrides,
  };
}

function makeProgram(weekCount: number): ClientAssignedProgram {
  const weeks: ProgramWeek[] = [];
  for (let weekNumber = 1; weekNumber <= weekCount; weekNumber++) {
    weeks.push({
      weekNumber,
      days: [
        { dayOfWeek: "Monday", type: "training", workout: { id: `w-${weekNumber}-mon`, workspaceId: WORKSPACE_OPTIM_ID, name: "Monday session", dayOfWeek: "Monday", focus: "squat", estimatedDurationMin: 60, warmupOverview: "", coachNote: "", exercises: [makeExercise("Barbell Back Squat"), makeExercise("Dumbbell Bicep Curl")] } },
        { dayOfWeek: "Tuesday", type: "rest" },
        { dayOfWeek: "Wednesday", type: "training", workout: { id: `w-${weekNumber}-wed`, workspaceId: WORKSPACE_OPTIM_ID, name: "Wednesday session", dayOfWeek: "Wednesday", focus: "push", estimatedDurationMin: 60, warmupOverview: "", coachNote: "", exercises: [makeExercise("Barbell Bench Press")] } },
        { dayOfWeek: "Thursday", type: "rest" },
        { dayOfWeek: "Friday", type: "training", workout: { id: `w-${weekNumber}-fri`, workspaceId: WORKSPACE_OPTIM_ID, name: "Friday session", dayOfWeek: "Friday", focus: "pull", estimatedDurationMin: 60, warmupOverview: "", coachNote: "", exercises: [makeExercise("Barbell Row")] } },
        { dayOfWeek: "Saturday", type: "rest" },
        { dayOfWeek: "Sunday", type: "rest" },
      ],
    });
  }
  return { id: "program-1", workspaceId: WORKSPACE_OPTIM_ID, clientId: CLIENT_PROFILE_DEMO.id, coachId: COACH_PROFILE_TEAGUE.id, name: "Test program", durationWeeks: weekCount, weeks, status: "assigned", createdAtIso: "2026-01-01T00:00:00.000Z", updatedAtIso: "2026-01-01T00:00:00.000Z" };
}

console.log("\n1. interpretRevisionInstruction — real, deterministic interpretation\n");

check("'keep all workouts under 60 minutes' interprets as a session-length cap", () => {
  const plan = interpretRevisionInstruction("Keep all workouts under 60 minutes.");
  assert.equal(plan.kind, "cap_session_length");
  assert.equal(plan.capMinutes, 60);
});

check("'replace barbell squats with a knee-tolerant alternative' interprets as a substitution", () => {
  const plan = interpretRevisionInstruction("Replace barbell squats with a knee-tolerant alternative.");
  assert.equal(plan.kind, "substitute_exercise");
  assert.ok(plan.fromExerciseTerm?.includes("barbell squats"));
});

check("'reduce week 6 fatigue without changing frequency' targets exactly week 6", () => {
  const plan = interpretRevisionInstruction("Reduce Week 6 fatigue without changing frequency.");
  assert.equal(plan.kind, "reduce_week_fatigue");
  assert.deepEqual(plan.targetWeeks, [6]);
});

check("'make friday slightly more lower-body focused' targets Friday with a lower-body pattern", () => {
  const plan = interpretRevisionInstruction("Make Friday slightly more lower-body focused without increasing session time.");
  assert.equal(plan.kind, "day_focus_shift");
  assert.equal(plan.targetDay, "Friday");
  assert.equal(plan.focusPattern, "squat");
});

check("an instruction with no recognizable pattern is honestly unrecognized, never a guess", () => {
  const plan = interpretRevisionInstruction("Make it better somehow.");
  assert.equal(plan.kind, "unrecognized");
});

console.log("\n2. applyProgramRevision — current-and-future only, real before/after diffs\n");

check("never touches a week strictly before the current week", () => {
  const program = makeProgram(12);
  const plan = interpretRevisionInstruction("Reduce fatigue this week.");
  const result = applyProgramRevision(program, plan, 6, ["barbell", "dumbbell", "bodyweight"]);
  assert.deepEqual(result.revisedProgram.weeks[0], program.weeks[0]);
  assert.deepEqual(result.revisedProgram.weeks[4], program.weeks[4]);
});

check("a session-length cap actually removes exercises until every future session fits", () => {
  const program = makeProgram(12);
  const plan = interpretRevisionInstruction("Keep sessions under 15 minutes.");
  const result = applyProgramRevision(program, plan, 1, ["barbell", "dumbbell", "bodyweight"]);
  const mondayWeek1 = result.revisedProgram.weeks[0].days.find((d) => d.dayOfWeek === "Monday")!;
  assert.ok((mondayWeek1.workout?.exercises.length ?? 0) < 2);
  assert.ok(result.changes.length > 0);
});

check("substitution produces a real, different exercise name and a real change record", () => {
  const program = makeProgram(12);
  const plan = interpretRevisionInstruction("Replace barbell back squat with a knee-tolerant alternative.");
  const result = applyProgramRevision(program, plan, 1, ["barbell", "dumbbell", "machine", "bodyweight"]);
  const mondayWeek1 = result.revisedProgram.weeks[0].days.find((d) => d.dayOfWeek === "Monday")!;
  const squatExercise = mondayWeek1.workout?.exercises.find((e) => e.name === "Barbell Back Squat");
  assert.equal(squatExercise, undefined);
  assert.ok(result.changes.some((c) => c.field === "exercise" && c.before === "Barbell Back Squat"));
});

check("reduce_week_fatigue for a specific week lowers sets/RPE only in that week, never elsewhere", () => {
  const program = makeProgram(12);
  const plan = interpretRevisionInstruction("Reduce week 6 fatigue.");
  const result = applyProgramRevision(program, plan, 1, ["barbell", "dumbbell", "bodyweight"]);
  const week5Monday = result.revisedProgram.weeks[4].days.find((d) => d.dayOfWeek === "Monday")!;
  const week6Monday = result.revisedProgram.weeks[5].days.find((d) => d.dayOfWeek === "Monday")!;
  assert.deepEqual(week5Monday, program.weeks[4].days.find((d) => d.dayOfWeek === "Monday"));
  assert.notDeepEqual(week6Monday, program.weeks[5].days.find((d) => d.dayOfWeek === "Monday"));
  assert.ok(result.changes.every((c) => c.weekNumber === 6));
});

check("an unrecognized instruction changes nothing and produces zero changes — never a fabricated edit", () => {
  const program = makeProgram(12);
  const plan = interpretRevisionInstruction("Make it better somehow.");
  const result = applyProgramRevision(program, plan, 1, ["barbell", "dumbbell", "bodyweight"]);
  assert.equal(result.changes.length, 0);
  assert.deepEqual(result.revisedProgram.weeks, program.weeks);
});

check("unrelated prescriptions (a different day in the same touched week) are preserved untouched", () => {
  const program = makeProgram(12);
  const plan = interpretRevisionInstruction("Make Friday more lower-body focused.");
  const result = applyProgramRevision(program, plan, 1, ["barbell", "dumbbell", "bodyweight"]);
  const mondayWeek1 = result.revisedProgram.weeks[0].days.find((d) => d.dayOfWeek === "Monday")!;
  assert.deepEqual(mondayWeek1, program.weeks[0].days.find((d) => d.dayOfWeek === "Monday"));
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
