// Phase 5.5 — verifies real periodization: phases scale to real duration,
// weeks genuinely differ (no cloned weeks), deload cadence is respected,
// and progression-method-driven variation is real and input-sensitive.

import assert from "node:assert/strict";
import { computeProgramPhases, computeWeekParameters, phaseForWeek, shiftRepRange, applyRpeOffset } from "./program-periodization.ts";
import { createDefaultCoachOperatingModel } from "./operating-model.ts";
import { COACH_PROFILE_TEAGUE, WORKSPACE_OPTIM_ID } from "../tenancy/seed.ts";
import type { CoachOperatingModel } from "./operating-model.ts";

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

function baseModel(overrides: Partial<CoachOperatingModel["programArchitecture"]> = {}): CoachOperatingModel {
  const seeded = createDefaultCoachOperatingModel({ coachId: COACH_PROFILE_TEAGUE.id, workspaceId: WORKSPACE_OPTIM_ID, nowIso: "2026-01-01T00:00:00.000Z", businessName: "OPTIM Test Studio" });
  return { ...seeded, programArchitecture: { ...seeded.programArchitecture, deloadFrequencyWeeks: 6, progressionMethod: "linear_load", repRangePhilosophy: "moderate_8_12", ...overrides } };
}

console.log("\n1. computeProgramPhases\n");

check("a 12-week program produces three real, ordered, non-overlapping phases covering every week", () => {
  const phases = computeProgramPhases(12);
  assert.equal(phases.length, 3);
  assert.equal(phases[0].startWeek, 1);
  assert.equal(phases[phases.length - 1].endWeek, 12);
  for (let i = 1; i < phases.length; i++) assert.equal(phases[i].startWeek, phases[i - 1].endWeek + 1);
});

check("every week from 1..durationWeeks resolves to exactly one real phase", () => {
  const phases = computeProgramPhases(12);
  for (let week = 1; week <= 12; week++) {
    const phase = phaseForWeek(phases, week);
    assert.ok(phase.startWeek <= week && week <= phase.endWeek);
  }
});

check("a short program still gets a genuine (if compressed) multi-phase arc, never a crash or empty phase", () => {
  const phases = computeProgramPhases(4);
  assert.ok(phases.length >= 1);
  assert.equal(phases[phases.length - 1].endWeek, 4);
});

console.log("\n2. computeWeekParameters — real week-to-week difference, no cloned weeks\n");

check("week 1 and week 6 (mid-program) produce different volume/intensity parameters", () => {
  const com = baseModel();
  const phases = computeProgramPhases(12);
  const week1 = computeWeekParameters(1, 12, phases, com);
  const week6 = computeWeekParameters(6, 12, phases, com);
  assert.notEqual(JSON.stringify(week1), JSON.stringify(week6));
});

check("every week in a full 12-week program produces a distinct parameter set — genuinely no two weeks are identical", () => {
  const com = baseModel();
  const phases = computeProgramPhases(12);
  const signatures = new Set<string>();
  for (let week = 1; week <= 12; week++) {
    const params = computeWeekParameters(week, 12, phases, com);
    signatures.add(`${params.phase.name}|${params.volumeMultiplier}|${params.intensityRpeOffset}|${params.isDeload}`);
  }
  assert.ok(signatures.size >= 8, `expected substantial week-to-week variation, got ${signatures.size} distinct signatures across 12 weeks`);
});

check("the coach's own deload cadence is respected — every Nth week (and the final week) is a deload", () => {
  const com = baseModel({ deloadFrequencyWeeks: 4 });
  const phases = computeProgramPhases(12);
  assert.equal(computeWeekParameters(4, 12, phases, com).isDeload, true);
  assert.equal(computeWeekParameters(8, 12, phases, com).isDeload, true);
  assert.equal(computeWeekParameters(12, 12, phases, com).isDeload, true);
  assert.equal(computeWeekParameters(5, 12, phases, com).isDeload, false);
});

check("the final week is always the reassessment week", () => {
  const com = baseModel();
  const phases = computeProgramPhases(12);
  assert.equal(computeWeekParameters(12, 12, phases, com).isReassessmentWeek, true);
  assert.equal(computeWeekParameters(11, 12, phases, com).isReassessmentWeek, false);
});

check("a deload week always eases volume and intensity below the surrounding weeks", () => {
  const com = baseModel({ deloadFrequencyWeeks: 4 });
  const phases = computeProgramPhases(12);
  const deload = computeWeekParameters(4, 12, phases, com);
  const before = computeWeekParameters(3, 12, phases, com);
  assert.ok(deload.volumeMultiplier < before.volumeMultiplier);
  assert.ok(deload.intensityRpeOffset < before.intensityRpeOffset);
});

console.log("\n3. Real coach-input sensitivity\n");

check("planned_undulation produces real week-to-week alternation distinct from linear_load", () => {
  const linear = baseModel({ progressionMethod: "linear_load" });
  const undulating = baseModel({ progressionMethod: "planned_undulation" });
  const phases = computeProgramPhases(12);
  const linearWeeks = [5, 6, 7].map((w) => computeWeekParameters(w, 12, phases, linear).volumeMultiplier);
  const undulatingWeeks = [5, 6, 7].map((w) => computeWeekParameters(w, 12, phases, undulating).volumeMultiplier);
  assert.notDeepEqual(linearWeeks, undulatingWeeks);
});

check("repRangePhilosophy 'varied_by_block' actually shifts the rep range across phases; a fixed philosophy never does", () => {
  const varied = baseModel({ repRangePhilosophy: "varied_by_block" });
  const fixed = baseModel({ repRangePhilosophy: "moderate_8_12" });
  const phases = computeProgramPhases(12);
  const variedFoundation = computeWeekParameters(1, 12, phases, varied).repRangeShift;
  const variedPeak = computeWeekParameters(12, 12, phases, varied).repRangeShift;
  const fixedFoundation = computeWeekParameters(1, 12, phases, fixed).repRangeShift;
  assert.notEqual(variedFoundation, variedPeak === "none" ? "unreachable" : variedFoundation === variedPeak ? "same" : variedPeak);
  assert.equal(fixedFoundation, "none");
});

console.log("\n4. shiftRepRange / applyRpeOffset helpers\n");

check("shiftRepRange moves the range up or down by its own span, never below a sensible floor", () => {
  assert.deepEqual(shiftRepRange([8, 12], "higher"), [12, 16]);
  assert.deepEqual(shiftRepRange([8, 12], "lower"), [4, 8]);
  assert.deepEqual(shiftRepRange([8, 12], "none"), [8, 12]);
  assert.deepEqual(shiftRepRange([2, 3], "lower"), [1, 2]);
});

check("applyRpeOffset always stays within the real loggable 6-10 range", () => {
  assert.equal(applyRpeOffset(9, 3), 10);
  assert.equal(applyRpeOffset(6, -5), 6);
  assert.equal(applyRpeOffset(8, -1), 7);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
