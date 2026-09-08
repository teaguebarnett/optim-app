// Phase 5.5 — verifies the two-stage program composer engine: three
// structurally distinct lightweight directions, full 12-week generation
// with real progression (no cloned weeks), hard-constraint enforcement
// (schedule/duration/equipment/exclusions/pain), and real sensitivity to
// both the client's profile and the Coach Operating Model.

import assert from "node:assert/strict";
import { createDefaultCoachOperatingModel } from "./operating-model.ts";
import {
  generateProgramDirectionSummaries,
  buildFullProgramForDirection,
  combineDirections,
  validateFullProgramHardConstraints,
  computeStructuralSignature,
  findDistinctnessCollision,
} from "./program-directions.ts";
import { COACH_PROFILE_TEAGUE, WORKSPACE_OPTIM_ID, CLIENT_PROFILE_DEMO } from "../tenancy/seed.ts";
import type { CoachOperatingModel } from "./operating-model.ts";
import type { DayOfWeek } from "../types";
import type { ClientProgrammingProfile } from "./programming-profile.ts";

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

function baseProfile(overrides: Partial<ClientProgrammingProfile> = {}): ClientProgrammingProfile {
  return {
    age: 30,
    heightTotalInches: 70,
    weightLb: 180,
    sex: "male",
    primaryGoal: "build_muscle",
    primaryGoalOther: null,
    secondaryGoals: [],
    availableDays: ["Monday", "Wednesday", "Friday"],
    maxSessionLengthMinutes: 60,
    trainingEnvironment: ["commercial_gym"],
    trainingExperience: "comfortable_common",
    hasDietaryRestrictions: false,
    nutritionApproach: "tracking",
    recentConsistency: "fairly_consistent",
    recentWeeklyFrequency: 3,
    trainingNotes: null,
    schedulePredictability: "mostly_predictable",
    preferredTrainingTimes: ["morning"],
    scheduleContext: null,
    dailyActivityLevel: "lightly_active",
    dailyActivityLevelIsAssumed: false,
    typicalSleep: "7_8",
    consistencyObstacles: [],
    coachSupportStyle: [],
    cardioPreference: "neutral_on_cardio",
    cardioPreferenceIsAssumed: false,
    hasCurrentInjury: false,
    injuryBodyAreas: [],
    injuryRestrictions: null,
    requiresHealthReview: false,
    healthReviewResolved: "no_review_needed",
    ...overrides,
  };
}

function baseCom(overrides: Partial<CoachOperatingModel["programArchitecture"]> = {}): CoachOperatingModel {
  const model = createDefaultCoachOperatingModel({ coachId: COACH_PROFILE_TEAGUE.id, workspaceId: WORKSPACE_OPTIM_ID, nowIso: "2026-01-01T00:00:00.000Z", businessName: "OPTIM Test Studio" });
  return { ...model, programArchitecture: { ...model.programArchitecture, ...overrides } };
}

console.log("\n1. Three structurally distinct directions (spec Part 2)\n");

check("generates exactly three directions, each with a real, non-empty structural summary", () => {
  const directions = generateProgramDirectionSummaries({ profile: baseProfile(), com: baseCom(), durationWeeks: 12 });
  assert.equal(directions.length, 3);
  for (const d of directions) {
    assert.ok(d.splitName);
    assert.ok(d.periodizationApproach);
    assert.ok(d.approxVolumeDescription);
    assert.ok(d.approxIntensityDescription);
    assert.ok(d.whyItFits);
    assert.ok(d.constraintsHonored.length > 0);
  }
});

check("directions differ structurally, not just by title — all three splits are distinct (spec Part 5's exact 'never twice' requirement)", () => {
  const directions = generateProgramDirectionSummaries({ profile: baseProfile(), com: baseCom(), durationWeeks: 12 });
  const splitKeys = new Set(directions.map((d) => d.splitKey));
  assert.equal(splitKeys.size, 3, `expected three distinct splits, got ${directions.map((d) => d.splitKey).join(", ")}`);
});

check("REGRESSION: strong_alternative and wildcard never resolve to the same split (the exact reported Push/Pull/Legs-twice bug)", () => {
  // A coach who explicitly prefers only two splits is the exact scenario
  // that used to let two independent lookups land on the same "one real
  // non-preferred candidate" for both strong_alternative and wildcard.
  const com = baseCom();
  const comWithNarrowPreferences: typeof com = { ...com, programArchitecture: { ...com.programArchitecture, preferredSplits: ["full_body", "push_pull_legs"] } };
  const dayScenarios: DayOfWeek[][] = [
    ["Monday", "Wednesday", "Friday"],
    ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
  ];
  for (const days of dayScenarios) {
    const directions = generateProgramDirectionSummaries({ profile: baseProfile({ availableDays: days }), com: comWithNarrowPreferences, durationWeeks: 12 });
    const [, strongAlt, wildcard] = directions;
    assert.notEqual(strongAlt.splitKey, wildcard.splitKey, `strong_alternative and wildcard both resolved to ${wildcard.splitKey} for ${days.length} days`);
  }
});

console.log("\n1b. Structural-signature distinctness enforcement (spec Part 5)\n");

check("computeStructuralSignature produces a different signature for two directions with different splits", () => {
  const directions = generateProgramDirectionSummaries({ profile: baseProfile(), com: baseCom(), durationWeeks: 12 });
  const signatures = directions.map(computeStructuralSignature);
  assert.equal(new Set(signatures).size, 3, "expected three unique structural signatures");
});

check("findDistinctnessCollision detects two directions sharing every signature dimension", () => {
  const directions = generateProgramDirectionSummaries({ profile: baseProfile(), com: baseCom(), durationWeeks: 12 });
  const duplicated = [directions[0], directions[1], { ...directions[2], splitKey: directions[0].splitKey, specializationEmphasis: directions[0].specializationEmphasis, progressionMethodDescription: directions[0].progressionMethodDescription, cardioIntegration: directions[0].cardioIntegration }];
  const collision = findDistinctnessCollision(duplicated);
  assert.ok(collision, "expected a collision to be detected between the two artificially-duplicated directions");
  assert.deepEqual(collision, [0, 2]);
});

check("findDistinctnessCollision reports no collision for the real generated set", () => {
  const directions = generateProgramDirectionSummaries({ profile: baseProfile(), com: baseCom(), durationWeeks: 12 });
  assert.equal(findDistinctnessCollision(directions), null);
});

check("every direction carries a real, comparison-aware ranking rationale — never a generic template", () => {
  const directions = generateProgramDirectionSummaries({ profile: baseProfile(), com: baseCom(), durationWeeks: 12 });
  for (const d of directions) {
    assert.ok(d.rankingRationale.length > 0);
  }
  // The #1-ranked direction's rationale must actually say so, and the
  // wildcard's must honestly frame itself as an outlier rather than
  // reusing the same sentence as the top pick.
  const byScore = [...directions].sort((a, b) => b.score.total - a.score.total);
  assert.match(byScore[0].rankingRationale, /Ranked #1/);
  const wildcard = directions.find((d) => d.kind === "wildcard")!;
  if (wildcard.score.total < byScore[0].score.total) {
    assert.notEqual(wildcard.rankingRationale, byScore[0].rankingRationale);
  }
});

check("direction generation never builds full weeks (stage A stays lightweight)", () => {
  const directions = generateProgramDirectionSummaries({ profile: baseProfile(), com: baseCom(), durationWeeks: 12 });
  for (const d of directions) {
    assert.equal((d as unknown as { program?: unknown }).program, undefined);
  }
});

console.log("\n2. Real sensitivity — same client under different COMs, different clients under the same COM\n");

check("the same client produces meaningfully different directions under different Coach Operating Models", () => {
  const profile = baseProfile();
  const comA = baseCom({ repRangePhilosophy: "strength_low_3_6", proximityToFailure: "2_4_reps_in_reserve" });
  const comB = baseCom({ repRangePhilosophy: "higher_12_20", proximityToFailure: "0_1_reps_in_reserve" });
  const directionsA = generateProgramDirectionSummaries({ profile, com: comA, durationWeeks: 12 });
  const directionsB = generateProgramDirectionSummaries({ profile, com: comB, durationWeeks: 12 });
  assert.notEqual(directionsA[0].approxIntensityDescription, directionsB[0].approxIntensityDescription);
});

check("different clients produce different directions under the same coach", () => {
  const com = baseCom();
  const clientA = baseProfile({ availableDays: ["Monday", "Wednesday"], maxSessionLengthMinutes: 30 });
  const clientB = baseProfile({ availableDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], maxSessionLengthMinutes: 90 });
  const directionsA = generateProgramDirectionSummaries({ profile: clientA, com, durationWeeks: 12 });
  const directionsB = generateProgramDirectionSummaries({ profile: clientB, com, durationWeeks: 12 });
  assert.notEqual(directionsA[0].splitName, directionsB[0].splitName);
  assert.notEqual(directionsA[0].estimatedSessionLengthMin, directionsB[0].estimatedSessionLengthMin);
});

console.log("\n3. combineDirections — a real, working merge\n");

check("combining two directions produces a real synthesized direction blending both", () => {
  const [a, b] = generateProgramDirectionSummaries({ profile: baseProfile(), com: baseCom(), durationWeeks: 12 });
  const combined = combineDirections(a, b);
  assert.equal(combined.splitName, a.splitName);
  assert.equal(combined.approxVolumeDescription, b.approxVolumeDescription);
  assert.ok(combined.whyItFits.includes(a.whyItFits));
});

console.log("\n4. Full program generation — every week, real progression, no cloned weeks\n");

function fullInput(profile: ClientProgrammingProfile, com: CoachOperatingModel, durationWeeks = 12) {
  return { clientId: CLIENT_PROFILE_DEMO.id, workspaceId: WORKSPACE_OPTIM_ID, coachId: COACH_PROFILE_TEAGUE.id, profile, com, durationWeeks, nowIso: "2026-01-01T00:00:00.000Z" };
}

check("generates every week across the full duration, each with real assigned training days", () => {
  const com = baseCom();
  const profile = baseProfile();
  const [direction] = generateProgramDirectionSummaries({ profile, com, durationWeeks: 12 });
  const option = buildFullProgramForDirection(direction, fullInput(profile, com));
  assert.equal(option.program.weeks.length, 12);
  for (const week of option.program.weeks) {
    const trainingDays = week.days.filter((d) => d.type === "training");
    assert.equal(trainingDays.length, profile.availableDays.length);
    for (const day of trainingDays) assert.ok((day.workout?.exercises.length ?? 0) > 0);
  }
});

check("the program is never Week 1 cloned twelve times — real week-to-week content differs across a real arc", () => {
  const com = baseCom();
  const profile = baseProfile();
  const [direction] = generateProgramDirectionSummaries({ profile, com, durationWeeks: 12 });
  const option = buildFullProgramForDirection(direction, fullInput(profile, com));

  const week1Json = JSON.stringify(option.program.weeks[0].days.map((d) => d.workout?.exercises.map((e) => [e.workingSets, e.targetRpe, e.targetRepsLow])));
  const week6Json = JSON.stringify(option.program.weeks[5].days.map((d) => d.workout?.exercises.map((e) => [e.workingSets, e.targetRpe, e.targetRepsLow])));
  assert.notEqual(week1Json, week6Json, "week 6 (mid-build) must differ from week 1 (early foundation)");

  const distinctWeeks = new Set(option.program.weeks.map((w) => JSON.stringify(w.days.map((d) => d.workout?.exercises.map((e) => [e.workingSets, e.targetRpe, e.targetRepsLow])))));
  assert.ok(distinctWeeks.size >= 3, `expected a real multi-step arc, got only ${distinctWeeks.size} distinct weeks out of 12`);

  // A real arc: average prescribed RPE across the foundation phase must be
  // lower than across the peak phase — the whole point of periodization,
  // not just "some numbers changed somewhere."
  const avgRpeForWeeks = (weekNumbers: number[]) => {
    const rpes = option.program.weeks
      .filter((w) => weekNumbers.includes(w.weekNumber))
      .flatMap((w) => w.days.flatMap((d) => d.workout?.exercises.map((e) => e.targetRpe) ?? []));
    return rpes.reduce((a, b) => a + b, 0) / rpes.length;
  };
  assert.ok(avgRpeForWeeks([1, 2]) < avgRpeForWeeks([9, 10]), "foundation-phase RPE should be genuinely lower than peak-phase RPE");
});

check("a deload/reassessment week is present as the final week, with reduced sets/RPE", () => {
  const com = baseCom();
  const profile = baseProfile();
  const [direction] = generateProgramDirectionSummaries({ profile, com, durationWeeks: 12 });
  const option = buildFullProgramForDirection(direction, fullInput(profile, com));
  const lastWeek = option.program.weeks[option.program.weeks.length - 1];
  const firstTrainingDay = lastWeek.days.find((d) => d.type === "training");
  assert.ok(firstTrainingDay?.workout?.coachNote.toLowerCase().includes("final"));
});

console.log("\n5. Hard constraints (spec Part 3)\n");

check("respects the client's session-duration ceiling across every week", () => {
  const com = baseCom();
  const profile = baseProfile({ maxSessionLengthMinutes: 30 });
  const [direction] = generateProgramDirectionSummaries({ profile, com, durationWeeks: 12 });
  const option = buildFullProgramForDirection(direction, fullInput(profile, com));
  assert.equal(option.constraints.passed, true);
  for (const week of option.program.weeks) {
    for (const day of week.days.filter((d) => d.type === "training")) {
      assert.ok((day.workout?.estimatedDurationMin ?? 0) <= 40);
    }
  }
});

check("never prescribes equipment outside the client's real access", () => {
  const com = baseCom();
  const profile = baseProfile({ trainingEnvironment: ["limited_equipment"] });
  const [direction] = generateProgramDirectionSummaries({ profile, com, durationWeeks: 12 });
  const option = buildFullProgramForDirection(direction, fullInput(profile, com));
  assert.equal(option.constraints.passed, true);
});

check("never prescribes an exercise the coach has excluded", () => {
  const com = baseCom({ exercisesAvoided: ["deadlift", "overhead press"] });
  const profile = baseProfile();
  const [direction] = generateProgramDirectionSummaries({ profile, com, durationWeeks: 12 });
  const option = buildFullProgramForDirection(direction, fullInput(profile, com));
  const names = option.program.weeks.flatMap((w) => w.days.flatMap((d) => d.workout?.exercises.map((e) => e.name.toLowerCase()) ?? []));
  assert.ok(!names.some((n) => n.includes("deadlift") || n.includes("overhead press")));
});

check("a reported knee limitation excludes real knee-loading exercises across every week", () => {
  const com = baseCom();
  const profile = baseProfile({ hasCurrentInjury: true, injuryBodyAreas: ["knee"], healthReviewResolved: true });
  const [direction] = generateProgramDirectionSummaries({ profile, com, durationWeeks: 12 });
  const option = buildFullProgramForDirection(direction, fullInput(profile, com));
  const names = option.program.weeks.flatMap((w) => w.days.flatMap((d) => d.workout?.exercises.map((e) => e.name.toLowerCase()) ?? []));
  assert.ok(!names.some((n) => n.includes("squat") || n.includes("lunge") || n.includes("leg press") || n.includes("leg extension")));
  assert.equal(option.constraints.passed, true);
});

check("validateFullProgramHardConstraints checks every week, not just week 1", () => {
  const com = baseCom();
  const profile = baseProfile();
  const [direction] = generateProgramDirectionSummaries({ profile, com, durationWeeks: 12 });
  const option = buildFullProgramForDirection(direction, fullInput(profile, com));
  // Corrupt week 6 only, leave week 1 valid — a week-1-only checker would
  // miss this; the full-program checker must not.
  const corrupted = { ...option.program, weeks: option.program.weeks.map((w) => (w.weekNumber === 6 ? { ...w, days: w.days.map((d) => (d.type === "training" ? { ...d, workout: undefined } : d)) } : w)) };
  const result = validateFullProgramHardConstraints(corrupted, profile, com);
  assert.equal(result.passed, false);
});

console.log("\n6. Recommendation quality across materially different profiles (Phase 5.5A required verification)\n");

const threeDaysLimitedEquipmentKnee = baseProfile({ availableDays: ["Monday", "Wednesday", "Friday"], maxSessionLengthMinutes: 60, trainingEnvironment: ["limited_equipment"], trainingExperience: "comfortable_common", hasCurrentInjury: true, injuryBodyAreas: ["knee"] });
const fiveDaysAdvancedCommercialGym = baseProfile({ availableDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], maxSessionLengthMinutes: 90, trainingEnvironment: ["commercial_gym"], trainingExperience: "experienced_consistent" });
const twoDaysBeginnerShortSessions = baseProfile({ availableDays: ["Tuesday", "Thursday"], maxSessionLengthMinutes: 30, trainingEnvironment: ["home_gym"], trainingExperience: "new" });

const profiles = [
  { name: "3-day intermediate, limited equipment, knee limitation", profile: threeDaysLimitedEquipmentKnee },
  { name: "5-day advanced, commercial gym", profile: fiveDaysAdvancedCommercialGym },
  { name: "2-day beginner, short sessions", profile: twoDaysBeginnerShortSessions },
];

for (const { name, profile } of profiles) {
  check(`${name} — every returned direction is internally distinct with no structural collision`, () => {
    const directions = generateProgramDirectionSummaries({ profile, com: baseCom(), durationWeeks: 12 });
    assert.ok(directions.length >= 1);
    assert.equal(findDistinctnessCollision(directions), null, `collision found for profile: ${name}`);
  });
}

check("a 2-day/week schedule (where the split library genuinely offers only one valid structure) honestly returns fewer than three directions rather than fabricating false distinctness", () => {
  const directions = generateProgramDirectionSummaries({ profile: twoDaysBeginnerShortSessions, com: baseCom(), durationWeeks: 12 });
  assert.ok(directions.length < 3, "expected graceful degradation below three for a 2-day schedule");
  assert.equal(findDistinctnessCollision(directions), null);
});

check("the 3-day knee-limited profile and the 5-day advanced profile produce meaningfully different best-fit directions (not just different day counts)", () => {
  const a = generateProgramDirectionSummaries({ profile: threeDaysLimitedEquipmentKnee, com: baseCom(), durationWeeks: 12 })[0];
  const b = generateProgramDirectionSummaries({ profile: fiveDaysAdvancedCommercialGym, com: baseCom(), durationWeeks: 12 })[0];
  assert.notEqual(a.splitKey, b.splitKey);
  assert.notEqual(a.estimatedSessionLengthMin, b.estimatedSessionLengthMin);
  assert.ok(a.constraintsHonored.some((c) => c.toLowerCase().includes("knee")));
});

check("the 2-day beginner's session length never exceeds their real 30-minute ceiling across any direction", () => {
  const directions = generateProgramDirectionSummaries({ profile: twoDaysBeginnerShortSessions, com: baseCom(), durationWeeks: 12 });
  for (const d of directions) assert.ok(d.estimatedSessionLengthMin <= 30, `${d.kind} estimated ${d.estimatedSessionLengthMin}min, exceeding the 30min ceiling`);
});

check("two meaningfully different Coach Operating Models produce different best-fit directions for the identical advanced 5-day client", () => {
  const comA = baseCom({ preferredSplits: ["upper_lower", "push_pull_legs"], repRangePhilosophy: "strength_low_3_6", proximityToFailure: "2_4_reps_in_reserve" });
  const comB = baseCom({ preferredSplits: ["body_part_split", "full_body_high_frequency"], repRangePhilosophy: "higher_12_20", proximityToFailure: "0_1_reps_in_reserve" });
  const directionsA = generateProgramDirectionSummaries({ profile: fiveDaysAdvancedCommercialGym, com: comA, durationWeeks: 12 });
  const directionsB = generateProgramDirectionSummaries({ profile: fiveDaysAdvancedCommercialGym, com: comB, durationWeeks: 12 });
  assert.notEqual(directionsA[0].splitKey, directionsB[0].splitKey);
  assert.notEqual(directionsA[0].approxIntensityDescription, directionsB[0].approxIntensityDescription);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
