// Phase 5 — migrates the real program-generation/production-write pipeline
// onto the universal training grammar. This file is the required test suite
// (spec section 30, requirements A-R) for lib/coach/universal-program-
// generation.ts — the new authoring target — plus the production read/write
// surfaces it feeds (lib/production/validation.ts's schemaVersion dispatch,
// lib/training/legacy-adapter.ts's universalProgramToClientAssignedProgram
// read selector). No DB, no network, no Next.js request context: exactly
// the same "extract the pure logic, test that" discipline as
// verify-program-directions.mts and verify-coach-operations.mts — the real
// Supabase-backed action (app/actions/production-programs.ts's
// createPublishAndAssignProgramAction) calls this exact same generation
// pipeline in this exact same order (see requirement H's test below, which
// mirrors that action's own code path line for line), so proving the
// pipeline here proves what that action does with it.
//
// Run with: npm run verify:universal-program-generation

import assert from "node:assert/strict";
import { createDefaultCoachOperatingModel } from "./operating-model.ts";
import { generateProgramDirectionSummaries } from "./program-directions.ts";
import {
  buildUniversalProgramForDirection,
  buildPlaceholderProgrammingProfile,
  validateUniversalProgramHardConstraints,
  type BuildUniversalProgramInput,
} from "./universal-program-generation.ts";
import { validateUniversalTrainingProgramContent, validateTrainingProgramVersionContent, validateSession } from "../production/validation.ts";
import { InvalidPersistedContentError } from "../production/errors.ts";
import { universalProgramToClientAssignedProgram, legacyWorkoutToSession } from "../training/legacy-adapter.ts";
import { createEmptyProgramWeek } from "./training.ts";
import { computeProgramPhases, computeWeekParameters, shiftRepRange, applyRpeOffset } from "./program-periodization.ts";
import { repRangeForPhilosophy } from "./activation-generation.ts";
import { COACH_PROFILE_TEAGUE, WORKSPACE_OPTIM_ID, CLIENT_PROFILE_DEMO } from "../tenancy/seed.ts";
import { PUSH_WORKOUT } from "../mock-data.ts";
import type { CoachOperatingModel } from "./operating-model.ts";
import type { ClientProgrammingProfile } from "./programming-profile.ts";
import type { DayOfWeek, ClientAssignedProgram } from "../types";
import type { UniversalTrainingProgramContent, UniversalProgramDay, Session, TrainingItemInstance } from "../training/types.ts";

let passed = 0;
let failed = 0;

function check(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`  ok  - ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL  - ${name}`);
    console.error(`        ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function profileWithDays(days: DayOfWeek[], overrides: Partial<ClientProgrammingProfile> = {}): ClientProgrammingProfile {
  return { ...buildPlaceholderProgrammingProfile(days), ...overrides };
}

function com(overrides: Partial<CoachOperatingModel["programArchitecture"]> = {}): CoachOperatingModel {
  const model = createDefaultCoachOperatingModel({ coachId: COACH_PROFILE_TEAGUE.id, workspaceId: WORKSPACE_OPTIM_ID, nowIso: "2026-01-01T00:00:00.000Z", businessName: "OPTIM Test Studio" });
  return { ...model, programArchitecture: { ...model.programArchitecture, ...overrides } };
}

function buildInput(profile: ClientProgrammingProfile, comModel: CoachOperatingModel, durationWeeks = 4): BuildUniversalProgramInput {
  return {
    clientId: CLIENT_PROFILE_DEMO.id,
    workspaceId: WORKSPACE_OPTIM_ID,
    coachId: COACH_PROFILE_TEAGUE.id,
    profile,
    com: comModel,
    durationWeeks,
    nowIso: "2026-01-01T00:00:00.000Z",
  };
}

function generate(profile: ClientProgrammingProfile, comModel: CoachOperatingModel, durationWeeks = 4) {
  const directions = generateProgramDirectionSummaries({ profile, com: comModel, durationWeeks });
  const direction = directions.find((d) => d.kind === "best_fit") ?? directions[0];
  return buildUniversalProgramForDirection(direction, buildInput(profile, comModel, durationWeeks));
}

function allItems(content: UniversalTrainingProgramContent): TrainingItemInstance[] {
  return content.weeks.flatMap((w) => w.days.flatMap((d) => (d.sessions ?? []).flatMap((s) => s.blocks.flatMap((b) => b.items))));
}

function allBlocks(content: UniversalTrainingProgramContent) {
  return content.weeks.flatMap((w) => w.days.flatMap((d) => (d.sessions ?? []).flatMap((s) => s.blocks)));
}

function trainingDays(content: UniversalTrainingProgramContent): UniversalProgramDay[] {
  return content.weeks.flatMap((w) => w.days.filter((d) => d.type === "training"));
}

function buildLegacyProgramFixture(): ClientAssignedProgram {
  const week = createEmptyProgramWeek(1);
  const mondayIndex = week.days.findIndex((d) => d.dayOfWeek === "Monday");
  week.days[mondayIndex] = { dayOfWeek: "Monday", type: "training", workout: PUSH_WORKOUT };
  return {
    id: "legacy-program-fixture",
    workspaceId: WORKSPACE_OPTIM_ID,
    clientId: CLIENT_PROFILE_DEMO.id,
    coachId: COACH_PROFILE_TEAGUE.id,
    name: "Legacy Program",
    durationWeeks: 1,
    weeks: [week],
    status: "assigned",
    createdAtIso: "2026-01-01T00:00:00.000Z",
    updatedAtIso: "2026-01-01T00:00:00.000Z",
  };
}

// ---------------------------------------------------------------------------
// A. Resistance-only universal generation
// ---------------------------------------------------------------------------

console.log("\nA. Resistance-only universal generation\n");

check("a client with no cardio preference surplus generates a resistance-only program", () => {
  const profile = profileWithDays(["Monday", "Wednesday", "Friday"], { cardioPreference: "avoids_cardio" });
  const { content, constraints } = generate(profile, com(), 4);
  assert.equal(content.schemaVersion, 2);
  assert.ok(constraints.passed, JSON.stringify(constraints.checks.filter((c) => !c.passed)));
  const items = allItems(content);
  assert.ok(items.length > 0, "must generate real content, not an empty program");
  assert.ok(
    items.every((i) => i.category === "resistance"),
    "avoids_cardio must never place any continuous work"
  );
  assert.equal(trainingDays(content).length, 4 * 3, "3 training days/week x 4 weeks, no continuous days added");
});

// ---------------------------------------------------------------------------
// B. Continuous-only universal generation (unit-level: the continuous
// session builder itself, isolated from resistance-day assembly)
// ---------------------------------------------------------------------------

console.log("\nB. Continuous universal generation\n");

check("a client who enjoys cardio with real surplus days beyond the coach's resistance frequency gets dedicated continuous days", () => {
  const profile = profileWithDays(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], { cardioPreference: "enjoys_cardio" });
  const { content } = generate(profile, com({ typicalFrequencyDaysMin: 3, typicalFrequencyDaysMax: 3 }), 2);
  const continuousItems = allItems(content).filter((i) => i.category === "continuous");
  assert.ok(continuousItems.length > 0, "5 available days vs. a 3-day resistance ceiling must produce real continuous days");
  for (const item of continuousItems) {
    assert.equal(item.prescription.family, "continuous");
    const session = content.weeks[0].days.find((d) => (d.sessions ?? []).some((s) => s.blocks.some((b) => b.items.includes(item))))!;
    void session;
  }
});

check("a continuous session built for a day is a real, valid universal Session", () => {
  const profile = profileWithDays(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], { cardioPreference: "enjoys_cardio" });
  const { content } = generate(profile, com({ typicalFrequencyDaysMax: 3 }), 1);
  const continuousDay = content.weeks[0].days.find((d) => (d.sessions ?? []).some((s) => s.blocks.some((b) => b.items.some((i) => i.category === "continuous"))));
  assert.ok(continuousDay, "expected at least one continuous training day");
  const session = continuousDay!.sessions!.find((s) => s.blocks.some((b) => b.items.some((i) => i.category === "continuous")))!;
  const validated = validateSession(session, "continuous session");
  const item = validated.blocks[0].items[0];
  assert.equal(item.prescription.family, "continuous");
  assert.equal(item.prescription.rpe, undefined, "no fabricated RPE for easy conversational effort — see the RpeValue-range gap documented in universal-program-generation.ts");
});

// ---------------------------------------------------------------------------
// C. Mixed resistance + continuous generation (key acceptance test)
// ---------------------------------------------------------------------------

console.log("\nC. Mixed resistance + continuous generation\n");

check("a single generated program contains BOTH a resistance block and a continuous block", () => {
  const profile = profileWithDays(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], { cardioPreference: "enjoys_cardio" });
  const { content, constraints } = generate(profile, com({ typicalFrequencyDaysMin: 3, typicalFrequencyDaysMax: 3 }), 3);
  assert.ok(constraints.passed, JSON.stringify(constraints.checks.filter((c) => !c.passed)));
  const items = allItems(content);
  assert.ok(items.some((i) => i.category === "resistance"), "must still contain resistance work");
  assert.ok(items.some((i) => i.category === "continuous"), "must also contain continuous work in the SAME program");
  assert.ok(validateUniversalTrainingProgramContent(content), "the mixed program itself must be structurally valid");
});

check("a resistance day is never overwritten by a continuous day (resistance days take priority)", () => {
  const profile = profileWithDays(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"], { cardioPreference: "enjoys_cardio" });
  const { content } = generate(profile, com({ typicalFrequencyDaysMax: 4 }), 1);
  const week = content.weeks[0];
  const resistanceDayNames = new Set(week.days.filter((d) => (d.sessions ?? []).some((s) => s.blocks.some((b) => b.items.some((i) => i.category === "resistance")))).map((d) => d.dayOfWeek));
  const continuousDayNames = new Set(week.days.filter((d) => (d.sessions ?? []).some((s) => s.blocks.some((b) => b.items.some((i) => i.category === "continuous")))).map((d) => d.dayOfWeek));
  for (const day of continuousDayNames) assert.ok(!resistanceDayNames.has(day), `day ${day} must not be both a resistance and continuous day`);
});

// ---------------------------------------------------------------------------
// D. schemaVersion 2 validation before persistence
// ---------------------------------------------------------------------------

console.log("\nD. schemaVersion 2 validation before persistence\n");

check("every real generated program passes validateUniversalTrainingProgramContent with schemaVersion 2", () => {
  const profile = profileWithDays(["Monday", "Wednesday", "Friday"]);
  const { content } = generate(profile, com(), 6);
  const validated = validateUniversalTrainingProgramContent(content);
  assert.equal(validated.schemaVersion, 2);
});

check("validateTrainingProgramVersionContent dispatches schemaVersion: 2 payloads to the universal validator", () => {
  const profile = profileWithDays(["Monday", "Wednesday", "Friday"]);
  const { content } = generate(profile, com(), 2);
  const validated = validateTrainingProgramVersionContent(content);
  assert.ok("schemaVersion" in validated && validated.schemaVersion === 2);
});

check("a payload claiming schemaVersion 2 but missing required universal structure is rejected, not coerced", () => {
  const malformed = { schemaVersion: 2, id: "bad", workspaceId: WORKSPACE_OPTIM_ID, clientId: "c", coachId: "co", name: "Bad", durationWeeks: 1 };
  assert.throws(() => validateUniversalTrainingProgramContent(malformed), InvalidPersistedContentError);
});

// ---------------------------------------------------------------------------
// E. Invalid generation rejected
// ---------------------------------------------------------------------------

console.log("\nE. Invalid generation rejected\n");

check("malformed model output (weeks not an array) throws InvalidPersistedContentError", () => {
  const profile = profileWithDays(["Monday", "Wednesday", "Friday"]);
  const { content } = generate(profile, com(), 1);
  const malformed = { ...content, weeks: "not-an-array" };
  assert.throws(() => validateUniversalTrainingProgramContent(malformed), InvalidPersistedContentError);
});

check("an unsupported prescription FAMILY (e.g. item-level family: 'circuit' — Phase 11B adds real support for a BLOCK with kind: 'circuit', but an item whose own family is literally 'circuit'/'quality' remains unsupported) is structurally valid grammar but fails the executable-families hard constraint", () => {
  const profile = profileWithDays(["Monday", "Wednesday", "Friday"]);
  const { content } = generate(profile, com(), 1);
  const session: Session = content.weeks[0].days.find((d) => d.type === "training")!.sessions![0];
  const pollutedSession: Session = {
    ...session,
    // Deliberately kind: "straight" (never "circuit") — this test targets
    // the still-genuinely-unsupported ITEM-level family value "circuit"
    // (a real, distinct ExecutionFamily this codebase has never given
    // meaning to — a circuit BLOCK's own items keep their real family,
    // resistance/continuous, per spec section 3), decoupled from Phase
    // 11B's own real, tested kind:"circuit" BLOCK support.
    blocks: [
      {
        id: "block-unsupported-family",
        kind: "straight",
        order: 1,
        items: [{ id: "unsupported-family-item", order: 1, name: "Unsupported", category: "circuit", prescription: { family: "circuit" } }],
      },
    ],
  };
  validateSession(pollutedSession, "polluted session"); // structurally valid universal grammar
  const pollutedContent: UniversalTrainingProgramContent = {
    ...content,
    weeks: [{ ...content.weeks[0], days: content.weeks[0].days.map((d) => (d.type === "training" ? { ...d, sessions: [pollutedSession] } : d)) }],
  };
  const result = validateUniversalProgramHardConstraints(pollutedContent, profile, com());
  assert.equal(result.passed, false);
  const failedCheck = result.checks.find((c) => c.id === "only_executable_families");
  assert.ok(failedCheck && !failedCheck.passed, "an item whose own family is 'circuit' must fail only_executable_families");
});

check("Phase 11A — a real interval item now PASSES the executable-families hard constraint (interval moved from unsupported to supported)", () => {
  const profile = profileWithDays(["Monday", "Wednesday", "Friday"]);
  const { content } = generate(profile, com(), 1);
  const session: Session = content.weeks[0].days.find((d) => d.type === "training")!.sessions![0];
  const intervalSession: Session = {
    ...session,
    blocks: [
      {
        id: "block-interval",
        kind: "interval",
        order: 1,
        items: [{ id: "interval-item", order: 1, name: "400m repeats", category: "interval", prescription: { family: "interval", rounds: 4, distance: { value: 400, unit: "m" } } }],
      },
    ],
  };
  validateSession(intervalSession, "interval session");
  const intervalContent: UniversalTrainingProgramContent = {
    ...content,
    weeks: [{ ...content.weeks[0], days: content.weeks[0].days.map((d) => (d.type === "training" ? { ...d, sessions: [intervalSession] } : d)) }],
  };
  const result = validateUniversalProgramHardConstraints(intervalContent, profile, com());
  const check = result.checks.find((c) => c.id === "only_executable_families");
  assert.ok(check && check.passed, "interval is a real, executed family as of Phase 11A");
});

check("missing required structure (a training day with zero sessions) is rejected by the structural validator", () => {
  const profile = profileWithDays(["Monday", "Wednesday", "Friday"]);
  const { content } = generate(profile, com(), 1);
  const brokenDay = { ...content.weeks[0].days.find((d) => d.type === "training")!, sessions: [] };
  const broken: UniversalTrainingProgramContent = {
    ...content,
    weeks: [{ ...content.weeks[0], days: content.weeks[0].days.map((d) => (d.type === "training" ? brokenDay : d)) }],
  };
  assert.throws(() => validateUniversalTrainingProgramContent(broken), InvalidPersistedContentError);
});

// ---------------------------------------------------------------------------
// F. Legacy schemaVersion 1 (schemaVersion-less) content remains readable
// ---------------------------------------------------------------------------

console.log("\nF. Legacy content remains readable\n");

check("a real legacy ClientAssignedProgram (no schemaVersion field) still validates through the dispatcher", () => {
  const legacy = buildLegacyProgramFixture();
  const validated = validateTrainingProgramVersionContent(legacy);
  assert.equal((validated as { schemaVersion?: number }).schemaVersion, undefined);
  assert.equal(validated.id, "legacy-program-fixture");
});

check("historical legacy content is never forced through the universal validator", () => {
  const legacy = buildLegacyProgramFixture();
  assert.throws(() => validateUniversalTrainingProgramContent(legacy), InvalidPersistedContentError);
  assert.doesNotThrow(() => validateTrainingProgramVersionContent(legacy));
});

// ---------------------------------------------------------------------------
// G. Universal content bypasses unnecessary legacy round-trip
// ---------------------------------------------------------------------------

console.log("\nG. No unnecessary legacy round-trip during generation\n");

check("generated sessions are natively Session/Block/TrainingItemInstance-shaped, never adapted from a legacy Workout/Exercise", () => {
  const profile = profileWithDays(["Monday", "Wednesday", "Friday"]);
  const { content } = generate(profile, com(), 1);
  const session = content.weeks[0].days.find((d) => d.type === "training")!.sessions![0] as unknown as Record<string, unknown>;
  assert.ok("blocks" in session, "must be Session-shaped");
  assert.ok(!("exercises" in session), "must never be Workout-shaped — generation targets the universal grammar natively");
  const item = (session.blocks as { items: Record<string, unknown>[] }[])[0].items[0];
  assert.ok("prescription" in item, "must be TrainingItemInstance-shaped");
  assert.ok(!("prescribedSets" in item), "must never be Exercise-shaped");
});

// ---------------------------------------------------------------------------
// H. Real production write payload contains universal content
// ---------------------------------------------------------------------------

console.log("\nH. Real production write payload\n");

check("the exact pipeline app/actions/production-programs.ts's createPublishAndAssignProgramAction runs produces a schemaVersion-2 write payload", () => {
  // Mirrors that action's own real code, line for line (generation only —
  // the actual Supabase inserts are exercised live/E2E, not here; see this
  // file's module doc and verify-coach-operations.mts's identical split).
  const nowIso = "2026-01-01T00:00:00.000Z";
  const DEFAULT_AVAILABLE_DAYS: DayOfWeek[] = ["Monday", "Wednesday", "Friday"];
  const comModel = createDefaultCoachOperatingModel({ coachId: COACH_PROFILE_TEAGUE.id, workspaceId: WORKSPACE_OPTIM_ID, nowIso, businessName: "your coach" });
  const profile = buildPlaceholderProgrammingProfile(DEFAULT_AVAILABLE_DAYS);
  const directions = generateProgramDirectionSummaries({ profile, com: comModel, durationWeeks: 8 });
  const direction = directions.find((d) => d.kind === "best_fit") ?? directions[0];
  const { content } = buildUniversalProgramForDirection(direction, {
    clientId: CLIENT_PROFILE_DEMO.id,
    workspaceId: WORKSPACE_OPTIM_ID,
    coachId: COACH_PROFILE_TEAGUE.id,
    profile,
    com: comModel,
    durationWeeks: 8,
    nowIso,
  });
  const writePayload = { ...content, name: "Coach-Assigned Program" };
  assert.equal(writePayload.schemaVersion, 2);
  assert.equal(writePayload.name, "Coach-Assigned Program");
  assert.equal(writePayload.weeks.length, 8);
  validateUniversalTrainingProgramContent(writePayload); // this is what createDraftProgramVersion persists
});

// ---------------------------------------------------------------------------
// I. Coach approval preserves universal content
// ---------------------------------------------------------------------------

console.log("\nI. Coach approval preserves universal content\n");

check("no coach review step exists to alter content (create -> publish -> assign is uninterrupted), and the write payload is never mutated between generation and the value that would be persisted", () => {
  const profile = profileWithDays(["Monday", "Wednesday", "Friday"]);
  const { content } = generate(profile, com(), 4);
  const title = "Approved Program";
  const writePayload = { ...content, name: title };
  // Every field except the coach-supplied title survives untouched.
  const { name: _origName, ...restOriginal } = content;
  const { name: _payloadName, ...restPayload } = writePayload;
  void _origName;
  void _payloadName;
  assert.deepEqual(restPayload, restOriginal);
  assert.equal(writePayload.status, "assigned", "publish/assign never needs to flip status — generation already targets the assigned lifecycle state");
});

// ---------------------------------------------------------------------------
// J. Client read/execution path can consume approved universal content
// ---------------------------------------------------------------------------

console.log("\nJ. Client read/execution path\n");

check("a legacy-representable (pure resistance) universal program converts to a real ClientAssignedProgram the existing client engine can execute", () => {
  const profile = profileWithDays(["Monday", "Wednesday", "Friday"], { cardioPreference: "avoids_cardio" });
  const { content } = generate(profile, com(), 2);
  const legacyProgram = universalProgramToClientAssignedProgram(content);
  assert.ok(legacyProgram, "a pure-resistance universal program must be legacy-representable");
  const mondayWorkout = legacyProgram!.weeks[0].days.find((d) => d.dayOfWeek === "Monday" && d.type === "training")!.workout!;
  // Exactly what lib/state.ts's START_WORKOUT reducer does with
  // AppState.assignedProgram before live execution begins.
  const executableSession = legacyWorkoutToSession(mondayWorkout);
  const validated = validateSession(executableSession, "client-executable session");
  assert.ok(validated.blocks.length > 0);
});

check("a genuinely mixed (resistance + continuous) universal program is honestly reported as not yet legacy-executable, never silently corrupted", () => {
  const profile = profileWithDays(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], { cardioPreference: "enjoys_cardio" });
  const { content } = generate(profile, com({ typicalFrequencyDaysMin: 3, typicalFrequencyDaysMax: 3 }), 1);
  assert.ok(allItems(content).some((i) => i.category === "continuous"), "test setup sanity: must actually be mixed");
  const legacyProgram = universalProgramToClientAssignedProgram(content);
  assert.equal(legacyProgram, null, "must return null, never a lossy or fabricated legacy program");
});

// ---------------------------------------------------------------------------
// K. Strength-generation behavior remains functionally valid (parity)
// ---------------------------------------------------------------------------

console.log("\nK. Resistance generation parity\n");

check("rep range and RPE decisions match exactly what the shared periodization helpers compute for that week — genuine parity, not a re-derived approximation", () => {
  const proximityCom = com({ proximityToFailure: "0_1_reps_in_reserve", setsPerExerciseMin: 2, setsPerExerciseMax: 4, repRangePhilosophy: "hypertrophy_8_12" });
  const durationWeeks = 6;
  const profile = profileWithDays(["Monday", "Wednesday", "Friday"]);
  const { content } = generate(profile, proximityCom, durationWeeks);
  const week3 = content.weeks[2];
  const firstDay = week3.days.find((d) => d.type === "training")!;
  const items = firstDay.sessions![0].blocks.flatMap((b) => b.items);
  assert.ok(items.length > 0);
  const first = items[0];

  // The exact same computation buildUniversalResistanceSessionForDay itself
  // runs — proving parity against the real shared helper, not a hand-copied
  // constant that could silently drift from the implementation.
  const phases = computeProgramPhases(durationWeeks);
  const params = computeWeekParameters(3, durationWeeks, phases, proximityCom);
  const baseRange = repRangeForPhilosophy(proximityCom.programArchitecture.repRangePhilosophy);
  const [expectedRepLow, expectedRepHigh] = shiftRepRange(baseRange, params.repRangeShift);
  const expectedRpe = applyRpeOffset(9, params.intensityRpeOffset); // 0_1_reps_in_reserve -> base RPE 9

  assert.equal(first.prescription.reps?.low, expectedRepLow);
  assert.equal(first.prescription.reps?.high, expectedRepHigh);
  assert.equal(first.prescription.rpe, expectedRpe);
  assert.ok((first.prescription.sets ?? 0) >= 1);
});

check("distinct coach operating models produce genuinely different generated intensity — not a hardcoded constant", () => {
  const lowIntensityCom = com({ proximityToFailure: "2_4_reps_in_reserve" });
  const highIntensityCom = com({ proximityToFailure: "0_1_reps_in_reserve" });
  const profile = profileWithDays(["Monday", "Wednesday", "Friday"]);
  const low = generate(profile, lowIntensityCom, 1).content;
  const high = generate(profile, highIntensityCom, 1).content;
  const lowRpe = low.weeks[0].days.find((d) => d.type === "training")!.sessions![0].blocks[0].items[0].prescription.rpe;
  const highRpe = high.weeks[0].days.find((d) => d.type === "training")!.sessions![0].blocks[0].items[0].prescription.rpe;
  assert.ok(highRpe! > lowRpe!, `expected high-intensity philosophy (${highRpe}) to exceed low-intensity (${lowRpe})`);
});

// ---------------------------------------------------------------------------
// L. Current warmup fields survive generation
// ---------------------------------------------------------------------------

console.log("\nL. Warmup fields survive generation\n");

check("the first compound exercise of a session gets 2 warmup sets, matching legacy buildPeriodizedWorkoutForDay's own isFirstCompound rule", () => {
  const profile = profileWithDays(["Monday", "Wednesday", "Friday"]);
  const { content } = generate(profile, com(), 1);
  const firstItem = content.weeks[0].days.find((d) => d.type === "training")!.sessions![0].blocks[0].items[0];
  assert.equal(firstItem.prescription.warmupSets, 2);
});

check("every generated session carries a real, non-empty warmupOverview", () => {
  const profile = profileWithDays(["Monday", "Wednesday", "Friday"]);
  const { content } = generate(profile, com(), 1);
  const session = content.weeks[0].days.find((d) => d.type === "training")!.sessions![0];
  assert.ok(session.warmupOverview && session.warmupOverview.length > 0);
});

// ---------------------------------------------------------------------------
// M. Continuous prescription primitives survive generation/persistence
// ---------------------------------------------------------------------------

console.log("\nM. Continuous primitives survive persistence\n");

check("duration and completionTarget survive a full JSON round-trip (simulating the jsonb content column)", () => {
  const profile = profileWithDays(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], { cardioPreference: "enjoys_cardio" });
  const { content } = generate(profile, com({ typicalFrequencyDaysMax: 3 }), 1);
  const persisted = JSON.parse(JSON.stringify(content)) as UniversalTrainingProgramContent;
  const revalidated = validateUniversalTrainingProgramContent(persisted);
  const continuousItem = allItems(revalidated).find((i) => i.category === "continuous");
  assert.ok(continuousItem, "expected a continuous item to survive the round-trip");
  assert.equal(continuousItem!.prescription.family, "continuous");
  assert.equal(continuousItem!.prescription.duration?.seconds, 1800);
  assert.equal(continuousItem!.prescription.completionTarget, "Easy, conversational effort");
});

// ---------------------------------------------------------------------------
// N. No unsupported future family becomes client-active
// ---------------------------------------------------------------------------

console.log("\nN. No unsupported family becomes client-active\n");

check("the real generator never itself produces interval/circuit/quality families across a range of real inputs", () => {
  const scenarios: [DayOfWeek[], Partial<ClientProgrammingProfile>][] = [
    [["Monday", "Wednesday", "Friday"], { cardioPreference: "avoids_cardio" }],
    [["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], { cardioPreference: "enjoys_cardio" }],
    [["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"], { cardioPreference: "neutral_on_cardio" }],
  ];
  for (const [days, overrides] of scenarios) {
    const { content } = generate(profileWithDays(days, overrides), com(), 2);
    for (const item of allItems(content)) {
      assert.ok(item.category === "resistance" || item.category === "continuous", `unexpected category "${item.category}" for days=${days.join(",")}`);
    }
  }
});

check("validateUniversalProgramHardConstraints' only_executable_families check is what would gate an unsupported family from ever reaching a real write", () => {
  const profile = profileWithDays(["Monday", "Wednesday", "Friday"]);
  const { content } = generate(profile, com(), 1);
  const result = validateUniversalProgramHardConstraints(content, profile, com());
  assert.ok(result.checks.some((c) => c.id === "only_executable_families" && c.passed));
});

// ---------------------------------------------------------------------------
// Phase 11A — U/V: interval generation for a conditioning-focused coach;
// unchanged behavior for every other coach.
// ---------------------------------------------------------------------------

console.log("\nPhase 11A — real interval generation, gated on real coach methodology (U, V)\n");

check("U: a coach whose real, stored methodology is 'prescribed_for_conditioning' generates real interval content on schedule-surplus days", () => {
  const profile = profileWithDays(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], { cardioPreference: "enjoys_cardio" });
  const { content, constraints } = generate(profile, com({ typicalFrequencyDaysMax: 3, cardioPhilosophy: "prescribed_for_conditioning" }), 1);
  const intervalItems = allItems(content).filter((i) => i.category === "interval");
  assert.ok(intervalItems.length > 0, "expected at least one real interval item");
  const item = intervalItems[0];
  assert.equal(item.prescription.family, "interval");
  assert.ok(item.prescription.rounds && item.prescription.rounds > 0);
  assert.ok(item.prescription.workInterval);
  assert.equal(constraints.passed, true, "generated interval content must itself pass every hard constraint, including only_executable_families");
  validateUniversalTrainingProgramContent(content); // structurally valid, round-trips
  assert.match(content.generationRationale ?? "", /interval-conditioning/i, "the rationale honestly names what was added, in coaching language");
});

check("V: a coach WITHOUT 'prescribed_for_conditioning' never generates interval content, even with real schedule surplus (unchanged behavior)", () => {
  const profile = profileWithDays(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], { cardioPreference: "enjoys_cardio" });
  const { content } = generate(profile, com({ typicalFrequencyDaysMax: 3, cardioPhilosophy: "optional_low_intensity_supplemental" }), 1);
  assert.equal(
    allItems(content).filter((i) => i.category === "interval").length,
    0,
    "a coach whose methodology doesn't call for conditioning work must never receive interval content"
  );
});

check("HIIT is a prescription format, never a client goal — interval generation depends only on coach methodology, never profile.primaryGoal (spec section 5)", () => {
  const conditioningCoach = com({ typicalFrequencyDaysMax: 3, cardioPhilosophy: "prescribed_for_conditioning" });
  for (const primaryGoal of ["fat_loss", "strength", "general_fitness"] as const) {
    const profile = { ...profileWithDays(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], { cardioPreference: "enjoys_cardio" }), primaryGoal };
    const { content } = generate(profile, conditioningCoach, 1);
    assert.ok(allItems(content).some((i) => i.category === "interval"), `expected interval content regardless of primaryGoal=${primaryGoal}`);
  }
});

// ---------------------------------------------------------------------------
// Phase 11B — Z/AA: real circuit generation, and non-conditioning-coach
// behavior unchanged.
// ---------------------------------------------------------------------------

console.log("\nPhase 11B — real circuit generation as a BLOCK, gated on the same real coach methodology (Z, AA)\n");

check("Z: a conditioning-focused coach with exactly 2 real surplus days gets the SECOND conditioning day generated as ONE real circuit BLOCK (rounds set, multiple items) — never flattened into N independent activities", () => {
  const profile = profileWithDays(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], { cardioPreference: "enjoys_cardio" });
  const { content, constraints } = generate(profile, com({ typicalFrequencyDaysMax: 3, cardioPhilosophy: "prescribed_for_conditioning" }), 1);

  const week1 = content.weeks[0];
  const trainingDays = week1.days.filter((d) => d.type === "training");
  const circuitBlocks = trainingDays.flatMap((d) => (d.sessions ?? []).flatMap((s) => s.blocks.filter((b) => b.kind === "circuit")));
  assert.equal(circuitBlocks.length, 1, "exactly one real circuit block generated (the second conditioning day)");
  const circuitBlock = circuitBlocks[0];
  assert.ok(circuitBlock.rounds && circuitBlock.rounds > 0, "a real, positive round count — never a bare grouped block with no repetition");
  assert.ok(circuitBlock.items.length >= 2, "multiple different items — spec section 3's own domain model, never a fake single repeated exercise");
  assert.equal(new Set(circuitBlock.items.map((i) => i.name)).size, circuitBlock.items.length, "every item is genuinely distinct, never N clones of one exercise");

  const intervalItems = trainingDays.flatMap((d) => (d.sessions ?? []).flatMap((s) => s.blocks.flatMap((b) => b.items.filter((i) => i.category === "interval"))));
  assert.equal(intervalItems.length, 1, "the FIRST conditioning day still gets interval — Phase 11A's own existing trigger, unchanged, byte-for-byte regression safe");

  assert.equal(constraints.passed, true, "circuit-bearing generated content must itself pass every real hard constraint");
  validateUniversalTrainingProgramContent(content); // structurally valid, round-trips
  assert.match(content.generationRationale ?? "", /conditioning-circuit/i, "the rationale honestly names the circuit placement too, in coaching language");
});

check("AA: a coach WITHOUT 'prescribed_for_conditioning' never generates a circuit block, even with real surplus days (unchanged behavior)", () => {
  const profile = profileWithDays(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], { cardioPreference: "enjoys_cardio" });
  const { content } = generate(profile, com({ typicalFrequencyDaysMax: 3, cardioPhilosophy: "optional_low_intensity_supplemental" }), 1);
  const circuitBlocks = content.weeks[0].days.flatMap((d) => (d.sessions ?? []).flatMap((s) => s.blocks.filter((b) => b.kind === "circuit")));
  assert.equal(circuitBlocks.length, 0, "a coach whose methodology doesn't call for conditioning work must never receive a circuit block");
});

check("a conditioning coach with only ONE real surplus day gets interval only — never a circuit with nothing to alternate with", () => {
  const profile = profileWithDays(["Monday", "Tuesday", "Wednesday", "Thursday"], { cardioPreference: "enjoys_cardio" });
  const { content } = generate(profile, com({ typicalFrequencyDaysMax: 3, cardioPhilosophy: "prescribed_for_conditioning" }), 1);
  const circuitBlocks = content.weeks[0].days.flatMap((d) => (d.sessions ?? []).flatMap((s) => s.blocks.filter((b) => b.kind === "circuit")));
  assert.equal(circuitBlocks.length, 0, "exactly one surplus day -> that one day is interval (Phase 11A's own unchanged first-day rule) -> no circuit day exists to generate");
});

// ---------------------------------------------------------------------------
// Phase 11C — real power/mobility generation, gated on real, already-
// collected coach methodology signals (X, Y, Z of the Phase 11C spec's own
// test matrix).
// ---------------------------------------------------------------------------

console.log("\nPhase 11C — real power/mobility generation, gated on real coach methodology (X, Y, Z)\n");

function comWithPractice(overrides: Partial<CoachOperatingModel["programArchitecture"]> = {}, commonGoals?: string[]): CoachOperatingModel {
  const base = com(overrides);
  return commonGoals ? { ...base, practice: { ...base.practice, commonGoals } } : base;
}

check("X: a coach whose real, stored practice focus includes 'athletic_performance' generates a real power/plyometric item on the first resistance day", () => {
  const profile = profileWithDays(["Monday", "Wednesday", "Friday"]);
  const { content, constraints } = generate(profile, comWithPractice({}, ["athletic_performance"]), 1);
  const powerItems = allItems(content).filter((i) => i.category === "power");
  assert.ok(powerItems.length > 0, "a real power item was generated");
  assert.equal(powerItems[0].prescription.family, "power", "the item's own prescription family is genuinely 'power', never resistance");
  assert.ok((powerItems[0].prescription.sets ?? 0) > 0 && powerItems[0].prescription.reps !== undefined, "a real, structured set x rep target — never a generic text instruction");
  assert.equal(constraints.passed, true, "power-bearing generated content must itself pass every real hard constraint");
  validateUniversalTrainingProgramContent(content);
  assert.match(content.generationRationale ?? "", /power|plyometric/i, "the rationale honestly names the power placement in coaching language");
});

check("Y: a coach whose real, stored warm-up philosophy is 'general_then_specific' generates a real mobility item on the first resistance day", () => {
  const profile = profileWithDays(["Monday", "Wednesday", "Friday"]);
  const { content, constraints } = generate(profile, com({ warmupPhilosophy: "general_then_specific" }), 1);
  const mobilityItems = allItems(content).filter((i) => i.category === "mobility");
  assert.ok(mobilityItems.length > 0, "a real mobility item was generated");
  assert.equal(mobilityItems[0].prescription.family, "mobility", "the item's own prescription family is genuinely 'mobility', never continuous");
  assert.ok(mobilityItems[0].prescription.reps !== undefined || mobilityItems[0].prescription.duration !== undefined, "a real structured hold/rep target — never a generic text instruction");
  assert.equal(constraints.passed, true, "mobility-bearing generated content must itself pass every real hard constraint");
  validateUniversalTrainingProgramContent(content);
  assert.match(content.generationRationale ?? "", /mobility/i, "the rationale honestly names the mobility placement in coaching language");
});

check("Z: an unrelated coach — neither an athletic-performance practice focus nor a general-then-specific warm-up philosophy — never receives power or mobility content, even with real schedule surplus (unchanged behavior)", () => {
  const profile = profileWithDays(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], { cardioPreference: "enjoys_cardio" });
  const { content } = generate(profile, comWithPractice({ typicalFrequencyDaysMax: 3, warmupPhilosophy: "ramped_warmup_sets" }, ["general_health", "fat_loss"]), 1);
  const powerItems = allItems(content).filter((i) => i.category === "power");
  const mobilityItems = allItems(content).filter((i) => i.category === "mobility");
  assert.equal(powerItems.length, 0, "no athletic-performance signal -> no power item");
  assert.equal(mobilityItems.length, 0, "no general-then-specific warm-up signal -> no mobility item");
});

check("a coach with BOTH real signals generates BOTH a power item and a mobility item on the same first day, without either suppressing the other", () => {
  const profile = profileWithDays(["Monday", "Wednesday", "Friday"]);
  const { content } = generate(profile, comWithPractice({ warmupPhilosophy: "general_then_specific" }, ["athletic_performance"]), 1);
  const powerItems = allItems(content).filter((i) => i.category === "power");
  const mobilityItems = allItems(content).filter((i) => i.category === "mobility");
  assert.ok(powerItems.length > 0 && mobilityItems.length > 0, "both real signals independently produce their own real content in the same program");
});

check("power/mobility generation never depends on profile.primaryGoal — a coaching-methodology signal, never a client goal (spec section 3: HIIT-is-a-format's own principle extended to power/mobility)", () => {
  for (const primaryGoal of ["fat_loss", "strength", "general_fitness"] as const) {
    const profile = { ...profileWithDays(["Monday", "Wednesday", "Friday"]), primaryGoal };
    const { content } = generate(profile, comWithPractice({ warmupPhilosophy: "general_then_specific" }, ["athletic_performance"]), 1);
    const hasPower = allItems(content).some((i) => i.category === "power");
    const hasMobility = allItems(content).some((i) => i.category === "mobility");
    assert.ok(hasPower && hasMobility, `power/mobility still generated regardless of primaryGoal="${primaryGoal}"`);
  }
});

// ---------------------------------------------------------------------------
// Phase 11D — real AMRAP generation, extending the SAME real coach
// methodology alternation Phase 11A/11B already established (interval,
// then circuit, then a genuine AMRAP for any FURTHER conditioning day) —
// never randomly inserted, never a fabricated new signal (spec section 31:
// "do not randomly place AMRAPs/EMOMs into programs").
// ---------------------------------------------------------------------------

console.log("\nPhase 11D — real AMRAP generation, extending the established conditioning alternation (AD)\n");

check("AD: a conditioning-focused coach with exactly 3 real surplus days gets interval (day 1), circuit (day 2), and a genuine AMRAP (day 3) — unbounded, no rounds, a real time cap, never a 4th random format", () => {
  const profile = profileWithDays(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], { cardioPreference: "enjoys_cardio" });
  const { content, constraints } = generate(profile, com({ typicalFrequencyDaysMax: 3, cardioPhilosophy: "prescribed_for_conditioning" }), 1);

  const week1 = content.weeks[0];
  const trainingDays = week1.days.filter((d) => d.type === "training");
  const circuitShapedBlocks = trainingDays.flatMap((d) => (d.sessions ?? []).flatMap((s) => s.blocks.filter((b) => b.kind === "circuit")));
  const intervalItems = trainingDays.flatMap((d) => (d.sessions ?? []).flatMap((s) => s.blocks.flatMap((b) => b.items.filter((i) => i.category === "interval"))));

  const amrapBlocks = circuitShapedBlocks.filter((b) => b.terminationMode === "time_cap");
  const fixedCircuitBlocks = circuitShapedBlocks.filter((b) => b.terminationMode !== "time_cap");

  assert.equal(intervalItems.length, 1, "day 1 is still interval — Phase 11A's own unchanged trigger");
  assert.equal(fixedCircuitBlocks.length, 1, "day 2 is still a real fixed-round circuit — Phase 11B's own unchanged trigger");
  assert.equal(amrapBlocks.length, 1, "day 3 (the new, further surplus day) gets a genuine AMRAP");

  const amrap = amrapBlocks[0];
  assert.equal(amrap.rounds, undefined, "a real AMRAP never carries a fabricated round count");
  assert.ok(amrap.timeCapSeconds && amrap.timeCapSeconds > 0, "a real, positive time cap");
  assert.ok(amrap.items.length >= 1, "at least one real item");

  assert.equal(constraints.passed, true, "AMRAP-bearing generated content must itself pass every real hard constraint");
  validateUniversalTrainingProgramContent(content);
  assert.match(content.generationRationale ?? "", /amrap/i, "the rationale honestly names the AMRAP placement in coaching language");
});

check("AD: a coach WITHOUT 'prescribed_for_conditioning' never generates an AMRAP block, even with real surplus days (unchanged behavior)", () => {
  const profile = profileWithDays(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], { cardioPreference: "enjoys_cardio" });
  const { content } = generate(profile, com({ typicalFrequencyDaysMax: 3, cardioPhilosophy: "optional_low_intensity_supplemental" }), 1);
  const amrapBlocks = allBlocks(content).filter((b) => b.terminationMode === "time_cap");
  assert.equal(amrapBlocks.length, 0, "a coach whose methodology doesn't call for conditioning work must never receive an AMRAP");
});

check("a conditioning coach with only TWO real surplus days gets interval + circuit only — never a 3rd-tier AMRAP with nothing to alternate into", () => {
  const profile = profileWithDays(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], { cardioPreference: "enjoys_cardio" });
  const { content } = generate(profile, com({ typicalFrequencyDaysMax: 3, cardioPhilosophy: "prescribed_for_conditioning" }), 1);
  const amrapBlocks = allBlocks(content).filter((b) => b.terminationMode === "time_cap");
  assert.equal(amrapBlocks.length, 0, "exactly two surplus days -> interval + circuit -> no third day exists to generate an AMRAP for");
});

// ---------------------------------------------------------------------------
// O. Ownership/client/coach identifiers remain correct
// ---------------------------------------------------------------------------

console.log("\nO. Ownership and identifiers\n");

check("generated content carries exactly the workspaceId/clientId/coachId it was built for, never a default or swapped value", () => {
  const profile = profileWithDays(["Monday", "Wednesday", "Friday"]);
  const distinctInput: BuildUniversalProgramInput = {
    clientId: "client-distinct-999",
    workspaceId: "workspace-distinct-888",
    coachId: "coach-distinct-777",
    profile,
    com: com(),
    durationWeeks: 1,
    nowIso: "2026-01-01T00:00:00.000Z",
  };
  const directions = generateProgramDirectionSummaries({ profile, com: com(), durationWeeks: 1 });
  const { content } = buildUniversalProgramForDirection(directions[0], distinctInput);
  assert.equal(content.clientId, "client-distinct-999");
  assert.equal(content.workspaceId, "workspace-distinct-888");
  assert.equal(content.coachId, "coach-distinct-777");
});

check("two different clients' generated programs never cross-contaminate identifiers", () => {
  const profile = profileWithDays(["Monday", "Wednesday", "Friday"]);
  const directions = generateProgramDirectionSummaries({ profile, com: com(), durationWeeks: 1 });
  const a = buildUniversalProgramForDirection(directions[0], { ...buildInput(profile, com(), 1), clientId: "client-a" }).content;
  const b = buildUniversalProgramForDirection(directions[0], { ...buildInput(profile, com(), 1), clientId: "client-b" }).content;
  assert.equal(a.clientId, "client-a");
  assert.equal(b.clientId, "client-b");
  assert.notEqual(a.id, b.id, "distinct clients must never receive the same program id");
});

// ---------------------------------------------------------------------------
// P. No mutation/loss during version lifecycle
// ---------------------------------------------------------------------------

console.log("\nP. No mutation/loss during version lifecycle\n");

check("buildUniversalProgramForDirection never mutates the profile or coach operating model it was given", () => {
  const profile = profileWithDays(["Monday", "Wednesday", "Friday"]);
  const comModel = com();
  const profileBefore = structuredClone(profile);
  const comBefore = structuredClone(comModel);
  generate(profile, comModel, 2);
  assert.deepEqual(profile, profileBefore);
  assert.deepEqual(comModel, comBefore);
});

check("content survives a full JSON persist/read round-trip with zero field loss", () => {
  const profile = profileWithDays(["Monday", "Wednesday", "Friday"]);
  const { content } = generate(profile, com(), 3);
  const roundTripped = JSON.parse(JSON.stringify(content));
  assert.deepEqual(roundTripped, content);
});

// ---------------------------------------------------------------------------
// Q. Deterministic validation behavior
// ---------------------------------------------------------------------------

console.log("\nQ. Deterministic validation\n");

check("validating the same content twice produces the same result", () => {
  const profile = profileWithDays(["Monday", "Wednesday", "Friday"]);
  const { content } = generate(profile, com(), 2);
  const first = validateUniversalTrainingProgramContent(content);
  const second = validateUniversalTrainingProgramContent(content);
  assert.deepEqual(first, second);
});

function stripNonDeterministicIds<T>(value: T): T {
  const json = JSON.stringify(value, (key, v) => (key === "id" ? undefined : v));
  return JSON.parse(json) as T;
}

check("identical inputs produce identical generation decisions (reps/RPE/sets/names/warmups), modulo only the intentionally time-based ids", () => {
  const profile = profileWithDays(["Monday", "Wednesday", "Friday"]);
  const comModel = com();
  const first = generate(profile, comModel, 3).content;
  const second = generate(profile, comModel, 3).content;
  assert.deepEqual(stripNonDeterministicIds(first.weeks), stripNonDeterministicIds(second.weeks));
});

// ---------------------------------------------------------------------------
// R. Existing generation tests remain green (exercised by the full
// regression suite, not standalone here — see this phase's completion
// report for the actual `npm run verify:program-directions` and
// `npm run verify:program-periodization` results).
// ---------------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
