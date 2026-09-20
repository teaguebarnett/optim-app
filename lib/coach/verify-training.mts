// Phase 5.2 — coach-authored training protocols (lib/coach/training.ts).
// Pure-logic verification: template/program construction, independent
// deep-copy on assignment, day/week duplication, exercise reordering, and
// the Week 1 validity check that gates activation.

import assert from "node:assert/strict";
import {
  assignTemplateToClient,
  createEmptyClientProgram,
  createEmptyExercise,
  createEmptyProgramDay,
  createEmptyProgramWeek,
  createEmptyTemplate,
  createEmptyWorkout,
  duplicateDayWithinWeek,
  duplicateWeek,
  isValidWeek1,
  reorderExercises,
  resolveProgramOrigin,
} from "./training.ts";
import { WORKSPACE_OPTIM_ID, COACH_PROFILE_TEAGUE, COACH_PROFILE_ALEX } from "../tenancy/seed.ts";

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

function usableWorkout(dayOfWeek: "Monday" | "Tuesday" | "Thursday" = "Monday") {
  const workout = createEmptyWorkout(WORKSPACE_OPTIM_ID, dayOfWeek);
  return { ...workout, exercises: [{ ...createEmptyExercise(1), name: "Back Squat" }, { ...createEmptyExercise(2), name: "Romanian Deadlift" }] };
}

console.log("\n1. Construction defaults\n");

check("a fresh program day defaults to rest with no workout", () => {
  const day = createEmptyProgramDay("Monday");
  assert.equal(day.type, "rest");
  assert.equal(day.workout, undefined);
});

check("a fresh program week has exactly 7 days, Monday-first, every one a rest day", () => {
  const week = createEmptyProgramWeek(1);
  assert.equal(week.days.length, 7);
  assert.deepEqual(
    week.days.map((d) => d.dayOfWeek),
    ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
  );
  assert.ok(week.days.every((d) => d.type === "rest"));
});

check("a fresh client program starts as a draft with one week and belongs to the right client/coach", () => {
  const program = createEmptyClientProgram({ workspaceId: WORKSPACE_OPTIM_ID, clientId: "client-1", coachId: COACH_PROFILE_TEAGUE.id, name: "12-Week Strength", durationWeeks: 12, nowIso: "2026-01-01T00:00:00.000Z" });
  assert.equal(program.status, "draft");
  assert.equal(program.clientId, "client-1");
  assert.equal(program.coachId, COACH_PROFILE_TEAGUE.id);
  assert.equal(program.weeks.length, 1);
  assert.equal(program.weeks[0].weekNumber, 1);
});

check("a fresh template belongs to the creating coach and starts with one week", () => {
  const template = createEmptyTemplate({ workspaceId: WORKSPACE_OPTIM_ID, coachId: COACH_PROFILE_TEAGUE.id, name: "Push/Pull/Legs", durationWeeks: 8, nowIso: "2026-01-01T00:00:00.000Z" });
  assert.equal(template.coachId, COACH_PROFILE_TEAGUE.id);
  assert.equal(template.weeks.length, 1);
});

console.log("\n2. Assigning a template produces a genuinely independent copy\n");

check("assignTemplateToClient copies content but generates fresh ids for the program, workouts, and exercises", () => {
  const template = createEmptyTemplate({ workspaceId: WORKSPACE_OPTIM_ID, coachId: COACH_PROFILE_TEAGUE.id, name: "Template A", durationWeeks: 12, nowIso: "2026-01-01T00:00:00.000Z" });
  const workout = usableWorkout();
  template.weeks[0].days = template.weeks[0].days.map((d) => (d.dayOfWeek === "Monday" ? { ...d, type: "training", workout } : d));

  const assigned = assignTemplateToClient(template, { clientId: "client-1", nowIso: "2026-01-02T00:00:00.000Z" });

  assert.equal(assigned.status, "assigned");
  assert.equal(assigned.sourceTemplateId, template.id);
  assert.equal(assigned.clientId, "client-1");
  assert.notEqual(assigned.id, template.id);

  const assignedMonday = assigned.weeks[0].days.find((d) => d.dayOfWeek === "Monday")!;
  assert.equal(assignedMonday.workout!.name, workout.name);
  assert.notEqual(assignedMonday.workout!.id, workout.id, "workout id must be regenerated, never shared with the template");
  assert.notEqual(assignedMonday.workout!.exercises[0].id, workout.exercises[0].id, "exercise id must be regenerated");
  assert.equal(assignedMonday.workout!.exercises[0].name, "Back Squat", "content itself must still match");
});

check("editing the assigned copy never mutates the source template (structurally independent objects)", () => {
  const template = createEmptyTemplate({ workspaceId: WORKSPACE_OPTIM_ID, coachId: COACH_PROFILE_TEAGUE.id, name: "Template B", durationWeeks: 12, nowIso: "2026-01-01T00:00:00.000Z" });
  template.weeks[0].days = template.weeks[0].days.map((d) => (d.dayOfWeek === "Monday" ? { ...d, type: "training", workout: usableWorkout() } : d));
  const originalExerciseName = template.weeks[0].days.find((d) => d.dayOfWeek === "Monday")!.workout!.exercises[0].name;

  const assigned = assignTemplateToClient(template, { clientId: "client-1", nowIso: "2026-01-02T00:00:00.000Z" });
  const assignedMonday = assigned.weeks[0].days.find((d) => d.dayOfWeek === "Monday")!;
  assignedMonday.workout!.exercises[0].name = "Renamed On The Client Copy";

  const templateMonday = template.weeks[0].days.find((d) => d.dayOfWeek === "Monday")!;
  assert.equal(templateMonday.workout!.exercises[0].name, originalExerciseName, "mutating the assigned copy must never reach back into the template");
});

check("assigning the same template to two different clients produces two independent copies", () => {
  const template = createEmptyTemplate({ workspaceId: WORKSPACE_OPTIM_ID, coachId: COACH_PROFILE_TEAGUE.id, name: "Shared Template", durationWeeks: 12, nowIso: "2026-01-01T00:00:00.000Z" });
  template.weeks[0].days = template.weeks[0].days.map((d) => (d.dayOfWeek === "Monday" ? { ...d, type: "training", workout: usableWorkout() } : d));

  const assignedA = assignTemplateToClient(template, { clientId: "client-a", nowIso: "2026-01-02T00:00:00.000Z" });
  const assignedB = assignTemplateToClient(template, { clientId: "client-b", nowIso: "2026-01-02T00:00:00.000Z" });

  assert.notEqual(assignedA.id, assignedB.id);
  const mondayA = assignedA.weeks[0].days.find((d) => d.dayOfWeek === "Monday")!;
  const mondayB = assignedB.weeks[0].days.find((d) => d.dayOfWeek === "Monday")!;
  assert.notEqual(mondayA.workout!.id, mondayB.workout!.id);

  mondayA.workout!.exercises[0].name = "Only on A";
  assert.notEqual(mondayB.workout!.exercises[0].name, "Only on A", "one client's copy must never be affected by editing another's");
});

console.log("\n3. Duplicating days and weeks in the editor\n");

check("duplicateDayWithinWeek copies a day's content onto another day, with fresh ids", () => {
  const week = createEmptyProgramWeek(1);
  const workout = usableWorkout();
  const withMonday = { ...week, days: week.days.map((d) => (d.dayOfWeek === "Monday" ? { ...d, type: "training" as const, workout } : d)) };

  const result = duplicateDayWithinWeek(withMonday, "Monday", "Thursday");
  const thursday = result.days.find((d) => d.dayOfWeek === "Thursday")!;
  assert.equal(thursday.type, "training");
  assert.equal(thursday.workout!.name, workout.name);
  assert.notEqual(thursday.workout!.id, workout.id);
  // The source day is untouched.
  const monday = result.days.find((d) => d.dayOfWeek === "Monday")!;
  assert.equal(monday.workout!.id, workout.id);
});

check("duplicateDayWithinWeek copying a rest day just makes the target day rest too, with no workout", () => {
  const week = createEmptyProgramWeek(1);
  const result = duplicateDayWithinWeek(week, "Wednesday", "Friday");
  const friday = result.days.find((d) => d.dayOfWeek === "Friday")!;
  assert.equal(friday.type, "rest");
  assert.equal(friday.workout, undefined);
});

check("duplicateDayWithinWeek returns the same week reference when the source day doesn't exist at all", () => {
  const week = createEmptyProgramWeek(1);
  const missingDay = { ...week, days: week.days.filter((d) => d.dayOfWeek !== "Wednesday") };
  const result = duplicateDayWithinWeek(missingDay, "Wednesday", "Friday");
  assert.equal(result, missingDay);
});

check("duplicateWeek creates a new week with independently-copied content", () => {
  const program = createEmptyClientProgram({ workspaceId: WORKSPACE_OPTIM_ID, clientId: "client-1", coachId: COACH_PROFILE_TEAGUE.id, name: "Test", durationWeeks: 4, nowIso: "2026-01-01T00:00:00.000Z" });
  const workout = usableWorkout();
  program.weeks[0].days = program.weeks[0].days.map((d) => (d.dayOfWeek === "Monday" ? { ...d, type: "training", workout } : d));

  const withWeek2 = duplicateWeek(program, 1, 2);
  assert.equal(withWeek2.weeks.length, 2);
  const week2Monday = withWeek2.weeks.find((w) => w.weekNumber === 2)!.days.find((d) => d.dayOfWeek === "Monday")!;
  assert.equal(week2Monday.workout!.name, workout.name);
  assert.notEqual(week2Monday.workout!.id, workout.id);
});

check("duplicateWeek does nothing when the target week is outside durationWeeks", () => {
  const program = createEmptyClientProgram({ workspaceId: WORKSPACE_OPTIM_ID, clientId: "client-1", coachId: COACH_PROFILE_TEAGUE.id, name: "Test", durationWeeks: 4, nowIso: "2026-01-01T00:00:00.000Z" });
  const result = duplicateWeek(program, 1, 99);
  assert.equal(result, program);
});

check("duplicateWeek does nothing when the source week doesn't exist", () => {
  const program = createEmptyClientProgram({ workspaceId: WORKSPACE_OPTIM_ID, clientId: "client-1", coachId: COACH_PROFILE_TEAGUE.id, name: "Test", durationWeeks: 12, nowIso: "2026-01-01T00:00:00.000Z" });
  const result = duplicateWeek(program, 5, 6);
  assert.equal(result, program);
});

console.log("\n4. Reordering exercises\n");

check("reorderExercises moves an exercise and renumbers order sequentially", () => {
  const workout = usableWorkout();
  const withThird = { ...workout, exercises: [...workout.exercises, { ...createEmptyExercise(3), name: "Leg Press" }] };
  const reordered = reorderExercises(withThird, 2, 0);
  assert.deepEqual(
    reordered.exercises.map((e) => e.name),
    ["Leg Press", "Back Squat", "Romanian Deadlift"]
  );
  assert.deepEqual(
    reordered.exercises.map((e) => e.order),
    [1, 2, 3]
  );
});

check("reorderExercises is a no-op for an out-of-range index", () => {
  const workout = usableWorkout();
  assert.equal(reorderExercises(workout, 0, 5), workout);
  assert.equal(reorderExercises(workout, -1, 0), workout);
  assert.equal(reorderExercises(workout, 0, 0), workout);
});

console.log("\n5. isValidWeek1 — the activation gate\n");

check("a draft program never counts as valid, even with a fully-authored Week 1", () => {
  const program = createEmptyClientProgram({ workspaceId: WORKSPACE_OPTIM_ID, clientId: "client-1", coachId: COACH_PROFILE_TEAGUE.id, name: "Test", durationWeeks: 12, nowIso: "2026-01-01T00:00:00.000Z" });
  program.weeks[0].days = program.weeks[0].days.map((d) => (d.dayOfWeek === "Monday" ? { ...d, type: "training", workout: usableWorkout() } : d));
  assert.equal(isValidWeek1(program), false);
});

check("an assigned program with no Week 1 authored (still every day's untouched default rest) is invalid", () => {
  const program = { ...createEmptyClientProgram({ workspaceId: WORKSPACE_OPTIM_ID, clientId: "client-1", coachId: COACH_PROFILE_TEAGUE.id, name: "Test", durationWeeks: 12, nowIso: "2026-01-01T00:00:00.000Z" }), status: "assigned" as const };
  // An all-rest week is indistinguishable from a week the coach never
  // touched (every fresh week starts exactly this way) — it must never
  // satisfy the gate on its own.
  assert.equal(isValidWeek1(program), false);
});

check("a training day with no workout at all is invalid", () => {
  const program = createEmptyClientProgram({ workspaceId: WORKSPACE_OPTIM_ID, clientId: "client-1", coachId: COACH_PROFILE_TEAGUE.id, name: "Test", durationWeeks: 12, nowIso: "2026-01-01T00:00:00.000Z" });
  const assigned = { ...program, status: "assigned" as const, weeks: [{ weekNumber: 1, days: program.weeks[0].days.map((d) => (d.dayOfWeek === "Monday" ? { ...d, type: "training" as const } : d)) }] };
  assert.equal(isValidWeek1(assigned), false);
});

check("a training day whose workout has zero exercises is invalid", () => {
  const program = createEmptyClientProgram({ workspaceId: WORKSPACE_OPTIM_ID, clientId: "client-1", coachId: COACH_PROFILE_TEAGUE.id, name: "Test", durationWeeks: 12, nowIso: "2026-01-01T00:00:00.000Z" });
  const emptyWorkout = createEmptyWorkout(WORKSPACE_OPTIM_ID, "Monday");
  const assigned = { ...program, status: "assigned" as const, weeks: [{ weekNumber: 1, days: program.weeks[0].days.map((d) => (d.dayOfWeek === "Monday" ? { ...d, type: "training" as const, workout: emptyWorkout } : d)) }] };
  assert.equal(isValidWeek1(assigned), false);
});

check("an exercise with no name, zero working sets, or an inverted rep range makes the whole week invalid", () => {
  const base = usableWorkout();
  const noName = { ...base, exercises: [{ ...base.exercises[0], name: "" }] };
  const zeroSets = { ...base, exercises: [{ ...base.exercises[0], workingSets: 0 }] };
  const invertedReps = { ...base, exercises: [{ ...base.exercises[0], targetRepsLow: 12, targetRepsHigh: 8 }] };

  for (const badWorkout of [noName, zeroSets, invertedReps]) {
    const program = createEmptyClientProgram({ workspaceId: WORKSPACE_OPTIM_ID, clientId: "client-1", coachId: COACH_PROFILE_TEAGUE.id, name: "Test", durationWeeks: 12, nowIso: "2026-01-01T00:00:00.000Z" });
    const assigned = { ...program, status: "assigned" as const, weeks: [{ weekNumber: 1, days: program.weeks[0].days.map((d) => (d.dayOfWeek === "Monday" ? { ...d, type: "training" as const, workout: badWorkout } : d)) }] };
    assert.equal(isValidWeek1(assigned), false);
  }
});

check("an assigned program with a genuinely usable Week 1 (mixed training/rest days) is valid", () => {
  const program = createEmptyClientProgram({ workspaceId: WORKSPACE_OPTIM_ID, clientId: "client-1", coachId: COACH_PROFILE_TEAGUE.id, name: "Test", durationWeeks: 12, nowIso: "2026-01-01T00:00:00.000Z" });
  const assigned = {
    ...program,
    status: "assigned" as const,
    weeks: [{ weekNumber: 1, days: program.weeks[0].days.map((d) => ((d.dayOfWeek === "Monday" || d.dayOfWeek === "Thursday") ? { ...d, type: "training" as const, workout: usableWorkout(d.dayOfWeek) } : d)) }],
  };
  assert.equal(isValidWeek1(assigned), true);
});

check("isValidWeek1 never crosses coach boundaries — validity is purely about content, ownership is enforced elsewhere", () => {
  const program = createEmptyClientProgram({ workspaceId: WORKSPACE_OPTIM_ID, clientId: "client-1", coachId: COACH_PROFILE_ALEX.id, name: "Test", durationWeeks: 12, nowIso: "2026-01-01T00:00:00.000Z" });
  const assigned = { ...program, status: "assigned" as const, weeks: [{ weekNumber: 1, days: program.weeks[0].days.map((d) => (d.dayOfWeek === "Monday" ? { ...d, type: "training" as const, workout: usableWorkout() } : d)) }] };
  assert.equal(isValidWeek1(assigned), true);
  assert.equal(assigned.coachId, COACH_PROFILE_ALEX.id);
});

console.log("\nGate 4D — resolveProgramOrigin: the real, honest account of where a current program came from\n");

check("a template-sourced program reports the real template's name", () => {
  const template = createEmptyTemplate({ workspaceId: WORKSPACE_OPTIM_ID, coachId: COACH_PROFILE_TEAGUE.id, name: "Hypertrophy Block", durationWeeks: 8, nowIso: "2026-01-01T00:00:00.000Z" });
  const program = assignTemplateToClient(template, { clientId: "client-1", nowIso: "2026-01-01T00:00:00.000Z" });
  const origin = resolveProgramOrigin(program, [], [template]);
  assert.deepEqual(origin, { kind: "template", templateId: template.id, templateName: "Hypertrophy Block" });
});

check("a template-sourced program whose template was later deleted still reports 'template', never crashing or silently becoming 'manual'", () => {
  const template = createEmptyTemplate({ workspaceId: WORKSPACE_OPTIM_ID, coachId: COACH_PROFILE_TEAGUE.id, name: "Deleted Later", durationWeeks: 8, nowIso: "2026-01-01T00:00:00.000Z" });
  const program = assignTemplateToClient(template, { clientId: "client-1", nowIso: "2026-01-01T00:00:00.000Z" });
  const origin = resolveProgramOrigin(program, [], []);
  assert.equal(origin.kind, "template");
});

check("a program matching an approved activation generation's resultingProgramId reports 'optim_generated' with the real approval date", () => {
  const program = createEmptyClientProgram({ workspaceId: WORKSPACE_OPTIM_ID, clientId: "client-1", coachId: COACH_PROFILE_TEAGUE.id, name: "OPTIM Plan", durationWeeks: 12, nowIso: "2026-01-01T00:00:00.000Z" });
  const origin = resolveProgramOrigin(program, [{ clientId: "client-1", approval: { resultingProgramId: program.id, approvedAtIso: "2026-02-01T00:00:00.000Z" } }], []);
  assert.deepEqual(origin, { kind: "optim_generated", approvedAtIso: "2026-02-01T00:00:00.000Z" });
});

check("a generation record for a DIFFERENT client is never matched, even if the program id happens to collide", () => {
  const program = createEmptyClientProgram({ workspaceId: WORKSPACE_OPTIM_ID, clientId: "client-1", coachId: COACH_PROFILE_TEAGUE.id, name: "OPTIM Plan", durationWeeks: 12, nowIso: "2026-01-01T00:00:00.000Z" });
  const origin = resolveProgramOrigin(program, [{ clientId: "client-2", approval: { resultingProgramId: program.id, approvedAtIso: "2026-02-01T00:00:00.000Z" } }], []);
  assert.equal(origin.kind, "manual", "an approval scoped to another client must never be attributed to this one");
});

check("no template and no matching activation approval — built directly in the manual editor, never fabricated as OPTIM-generated", () => {
  const program = createEmptyClientProgram({ workspaceId: WORKSPACE_OPTIM_ID, clientId: "client-1", coachId: COACH_PROFILE_TEAGUE.id, name: "Hand-built", durationWeeks: 12, nowIso: "2026-01-01T00:00:00.000Z" });
  const origin = resolveProgramOrigin(program, [{ clientId: "client-1", approval: undefined }], []);
  assert.equal(origin.kind, "manual");
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
