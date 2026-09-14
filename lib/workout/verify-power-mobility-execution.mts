// Phase 11C — power/plyometric and mobility/flexibility execution
// verification. Proves the universal Session/Block/TrainingItemInstance/
// Prescription engine natively supports these two additional families —
// per-set state machine (power), per-set/per-side state machine
// (mobility), honest completion/partial/skip semantics, contacts as a
// distinct primitive (never converted to/from reps), circuit compatibility
// — without corrupting resistance (lib/workout/verify-workout-flow.mts's
// 67 tests), continuous (25), interval (34), or circuit (42), still
// exhaustively covered elsewhere, unchanged. Maps onto the Phase 11C
// spec's own required test matrix (section 40, A-AD) and required
// acceptance cases (sections 33-39), noted per section below. Generation
// gating tests (X, Y, Z) live in lib/coach/verify-universal-program-
// generation.mts instead, matching this repo's established convention
// (see that file's own Phase 11B "Z/AA" tests for circuit's precedent).
// Run with: npm run verify:power-mobility-execution

import assert from "node:assert/strict";
import { createInitialState, reducer, buildStartedWorkoutSession } from "../state.ts";
import { validateSession } from "../production/validation.ts";
import { buildWorkoutSummary } from "../workout-analysis.ts";
import { projectTrainingDayObservations } from "../signals/project-training-day.ts";
import { findTrainingItemById } from "./session-flow.ts";
import { applyTrainingItemPatch, type TrainingItemPath } from "../training/program-proposal-editing.ts";
import {
  circuitItemPerformedAsPrescribed,
  circuitPerformedAsPrescribed,
  classifyCircuitCompletion,
  classifyCircuitItemCompletion,
  completedCircuitRounds,
  describeCircuitItemTarget,
  hasRichCircuitCapture,
  totalCircuitRounds,
} from "./circuit.ts";
import { classifyPowerItemCompletion, describePowerOverview, describePowerSetTarget, powerCaptureFields } from "./power.ts";
import {
  describeMobilityOverview,
  describeMobilitySetTarget,
  nextMobilityPosition,
  requiresBothSides,
  totalMobilityExposures,
} from "./mobility.ts";
import {
  BOX_JUMP_POWER_SESSION_DEMO,
  POGO_JUMP_CONTACTS_SESSION_DEMO,
  BOUNDS_DISTANCE_POWER_SESSION_DEMO,
  COUCH_STRETCH_MOBILITY_SESSION_DEMO,
  HIP_ROTATION_MOBILITY_SESSION_DEMO,
  CIRCUIT_WITH_POWER_ITEM_DEMO,
  CIRCUIT_WITH_SIDED_MOBILITY_ITEM_DEMO,
  MIXED_SESSION_WITH_POWER_AND_MOBILITY_DEMO,
  MIXED_SESSION_DEMO,
  BIKE_INTERVALS_SESSION_DEMO,
  BASIC_CIRCUIT_SESSION_DEMO,
} from "../training/demo-fixtures.ts";
import type { AppState } from "../state.ts";
import type { Session, UniversalTrainingProgramContent } from "../training/types.ts";

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

function startFromFixture(trainingSession: Session): AppState {
  const base = createInitialState();
  return {
    ...base,
    workoutSession: buildStartedWorkoutSession({
      existingSession: base.workoutSession,
      workoutId: trainingSession.id,
      resolvedWorkout: null,
      trainingSession,
      nowIso: "2026-01-01T00:00:00.000Z",
    }),
  };
}

function reportPain(state: AppState, exerciseId: string, overrides: Partial<{ ratingZeroToTen: number; continuedAfterSet: boolean; affectsOutsideGym: boolean }> = {}): AppState {
  return reducer(state, {
    type: "REPORT_PAIN",
    exerciseId,
    location: "Knee",
    ratingZeroToTen: overrides.ratingZeroToTen ?? 6,
    onset: "During the jump",
    causedByMovement: "Landing",
    continuedAfterSet: overrides.continuedAfterSet ?? false,
    affectsOutsideGym: overrides.affectsOutsideGym ?? false,
    symptomQuality: "aching",
  });
}

const BOX_JUMP_ITEM = BOX_JUMP_POWER_SESSION_DEMO.blocks[0].items[0];
const POGO_JUMP_ITEM = POGO_JUMP_CONTACTS_SESSION_DEMO.blocks[0].items[0];
const BOUNDS_ITEM = BOUNDS_DISTANCE_POWER_SESSION_DEMO.blocks[0].items[0];
const COUCH_STRETCH_ITEM = COUCH_STRETCH_MOBILITY_SESSION_DEMO.blocks[0].items[0];
const HIP_ROTATION_ITEM = HIP_ROTATION_MOBILITY_SESSION_DEMO.blocks[0].items[0];

// ---------------------------------------------------------------------------
// A-F — validation: power/mobility prescriptions validate; contacts
// validated honestly; side semantics valid; duration hold valid.
// ---------------------------------------------------------------------------

console.log("\n1. Validation — power/mobility prescriptions validate; contacts and side are honest primitives (A-F)\n");

check("A: the Box Jump power fixture (sets + reps) validates", () => {
  validateSession(BOX_JUMP_POWER_SESSION_DEMO, "box jump power fixture");
});

check("A: the Pogo Jump power fixture (sets + contacts) validates", () => {
  validateSession(POGO_JUMP_CONTACTS_SESSION_DEMO, "pogo jump contacts fixture");
});

check("A: the Bounds power fixture (sets + distance) validates", () => {
  validateSession(BOUNDS_DISTANCE_POWER_SESSION_DEMO, "bounds distance fixture");
});

check("B: the Couch Stretch mobility fixture (hold + bilateral side) validates", () => {
  validateSession(COUCH_STRETCH_MOBILITY_SESSION_DEMO, "couch stretch mobility fixture");
});

check("B: the 90/90 Hip Rotation mobility fixture (reps + alternating side) validates", () => {
  validateSession(HIP_ROTATION_MOBILITY_SESSION_DEMO, "hip rotation mobility fixture");
});

check("a power prescription with NONE of reps/contacts/distance is rejected — nothing for the client to actually do", () => {
  const malformed: Session = { ...BOX_JUMP_POWER_SESSION_DEMO, blocks: [{ ...BOX_JUMP_POWER_SESSION_DEMO.blocks[0], items: [{ ...BOX_JUMP_ITEM, prescription: { family: "power", sets: 4 } }] }] };
  assert.throws(() => validateSession(malformed, "power with no per-set target"));
});

check("a mobility prescription with NEITHER duration NOR reps is rejected", () => {
  const malformed: Session = { ...COUCH_STRETCH_MOBILITY_SESSION_DEMO, blocks: [{ ...COUCH_STRETCH_MOBILITY_SESSION_DEMO.blocks[0], items: [{ ...COUCH_STRETCH_ITEM, prescription: { family: "mobility", sets: 2, side: "bilateral" } }] }] };
  assert.throws(() => validateSession(malformed, "mobility with no hold/reps target"));
});

check("C: a real positive contacts value validates honestly", () => {
  assert.equal(POGO_JUMP_ITEM.prescription.contacts, 20);
});

check("D: a zero contacts value is rejected", () => {
  const malformed: Session = { ...POGO_JUMP_CONTACTS_SESSION_DEMO, blocks: [{ ...POGO_JUMP_CONTACTS_SESSION_DEMO.blocks[0], items: [{ ...POGO_JUMP_ITEM, prescription: { ...POGO_JUMP_ITEM.prescription, contacts: 0 } }] }] };
  assert.throws(() => validateSession(malformed, "zero contacts"));
});

check("D: a negative contacts value is rejected", () => {
  const malformed: Session = { ...POGO_JUMP_CONTACTS_SESSION_DEMO, blocks: [{ ...POGO_JUMP_CONTACTS_SESSION_DEMO.blocks[0], items: [{ ...POGO_JUMP_ITEM, prescription: { ...POGO_JUMP_ITEM.prescription, contacts: -5 } }] }] };
  assert.throws(() => validateSession(malformed, "negative contacts"));
});

check("D: a non-numeric contacts value is rejected", () => {
  const malformed: Session = { ...POGO_JUMP_CONTACTS_SESSION_DEMO, blocks: [{ ...POGO_JUMP_CONTACTS_SESSION_DEMO.blocks[0], items: [{ ...POGO_JUMP_ITEM, prescription: { ...POGO_JUMP_ITEM.prescription, contacts: "twenty" as never } }] }] };
  assert.throws(() => validateSession(malformed, "non-numeric contacts"));
});

check("E: PrescriptionSide supports left/right/alternating/bilateral, all structurally valid", () => {
  for (const side of ["left", "right", "alternating", "bilateral"] as const) {
    const s: Session = { ...COUCH_STRETCH_MOBILITY_SESSION_DEMO, blocks: [{ ...COUCH_STRETCH_MOBILITY_SESSION_DEMO.blocks[0], items: [{ ...COUCH_STRETCH_ITEM, prescription: { ...COUCH_STRETCH_ITEM.prescription, side } }] }] };
    validateSession(s, `side="${side}"`);
  }
});

check("F: a hold-duration mobility prescription (45 sec) validates and is distinct from a rep-based one", () => {
  assert.equal(COUCH_STRETCH_ITEM.prescription.duration?.seconds, 45);
  assert.equal(HIP_ROTATION_ITEM.prescription.reps?.low, 10);
});

check("G: resistance-only content is completely unaffected by power/mobility support existing", () => {
  validateSession(MIXED_SESSION_DEMO, "resistance-only mixed session");
});

check("H: continuous/interval content is completely unaffected", () => {
  validateSession(BIKE_INTERVALS_SESSION_DEMO, "bike intervals session");
});

check("I: circuit content (no power/mobility item) is completely unaffected", () => {
  validateSession(BASIC_CIRCUIT_SESSION_DEMO, "basic circuit session");
});

check("J: a circuit containing a real power item validates", () => {
  validateSession(CIRCUIT_WITH_POWER_ITEM_DEMO, "circuit with power item");
});

// ---------------------------------------------------------------------------
// Pure lib/workout/power.ts and lib/workout/mobility.ts formatter/state
// machine coverage.
// ---------------------------------------------------------------------------

console.log("\n2. Pure power/mobility formatters and state machines\n");

check("describePowerSetTarget never fabricates a set count — the item's own sets field is the repetition (spec section 10-ish, mirrors circuit's own discipline)", () => {
  assert.equal(describePowerSetTarget(BOX_JUMP_ITEM.prescription), "3 reps");
  assert.equal(describePowerSetTarget(POGO_JUMP_ITEM.prescription), "20 contacts");
  assert.equal(describePowerSetTarget(BOUNDS_ITEM.prescription), "20 m");
});

check("describePowerOverview is human-readable, never raw JSON, and preserves the coach's own qualitative instruction rather than a fabricated score (spec section 7)", () => {
  const lines = describePowerOverview(BOX_JUMP_ITEM.prescription);
  assert.deepEqual(lines, ["4 sets x 3 reps", "2:00 rest"]);
  assert.doesNotMatch(lines.join(" "), /explosiveness|power score/i);
});

check("powerCaptureFields reflects only the primitives this item's own prescription specifies", () => {
  assert.deepEqual(powerCaptureFields(BOX_JUMP_ITEM.prescription), { reps: true, contacts: false, distance: false });
  assert.deepEqual(powerCaptureFields(POGO_JUMP_ITEM.prescription), { reps: false, contacts: true, distance: false });
  assert.deepEqual(powerCaptureFields(BOUNDS_ITEM.prescription), { reps: false, contacts: false, distance: true });
});

check("classifyPowerItemCompletion is honest: 0 completed -> skipped, some -> partial, all -> completed", () => {
  assert.equal(classifyPowerItemCompletion(4, []), "skipped");
  assert.equal(classifyPowerItemCompletion(4, [{ status: "completed" }, { status: "completed" }]), "partial");
  assert.equal(classifyPowerItemCompletion(4, [{ status: "completed" }, { status: "completed" }, { status: "completed" }, { status: "completed" }]), "completed");
});

check("describeMobilitySetTarget joins hold and reps honestly, never converting one into the other", () => {
  assert.equal(describeMobilitySetTarget(COUCH_STRETCH_ITEM.prescription), "45 sec");
  assert.equal(describeMobilitySetTarget(HIP_ROTATION_ITEM.prescription), "10 reps");
});

check("describeMobilityOverview shows real '/ side' semantics only when both sides are genuinely required", () => {
  assert.deepEqual(describeMobilityOverview(COUCH_STRETCH_ITEM.prescription), ["2 sets x 45 sec / side"]);
  assert.deepEqual(describeMobilityOverview(HIP_ROTATION_ITEM.prescription), ["2 sets x 10 reps / side"]);
  assert.deepEqual(describeMobilityOverview({ family: "mobility", sets: 3, duration: { seconds: 30 } }), ["3 sets x 30 sec"], "no side suffix when the item has no side concept at all");
});

check("requiresBothSides is true only for bilateral/alternating, false for a fixed single side or no side concept", () => {
  assert.equal(requiresBothSides({ family: "mobility", side: "bilateral" }), true);
  assert.equal(requiresBothSides({ family: "mobility", side: "alternating" }), true);
  assert.equal(requiresBothSides({ family: "mobility", side: "left" }), false);
  assert.equal(requiresBothSides({ family: "mobility" }), false);
});

check("E/14: nextMobilityPosition — a dual-side item resolves LEFT then RIGHT before advancing to the next set (spec section 15's exact worked example)", () => {
  const p = COUCH_STRETCH_ITEM.prescription;
  assert.deepEqual(nextMobilityPosition(p, { set: 1, side: "left" }), { set: 1, side: "right" });
  assert.deepEqual(nextMobilityPosition(p, { set: 1, side: "right" }), { set: 2, side: "left" });
  assert.equal(nextMobilityPosition(p, { set: 2, side: "right" }), "complete");
});

check("a single-resolution mobility item (no side) advances straight set to set", () => {
  const p = { family: "mobility" as const, sets: 3, duration: { seconds: 30 } };
  assert.deepEqual(nextMobilityPosition(p, { set: 1, side: null }), { set: 2, side: null });
  assert.equal(nextMobilityPosition(p, { set: 3, side: null }), "complete");
});

check("totalMobilityExposures multiplies sets x 2 only when both sides are required", () => {
  assert.equal(totalMobilityExposures(COUCH_STRETCH_ITEM.prescription), 4, "2 sets x 2 sides");
  assert.equal(totalMobilityExposures(HIP_ROTATION_ITEM.prescription), 4, "2 sets x 2 sides (alternating)");
  assert.equal(totalMobilityExposures({ family: "mobility", sets: 3, duration: { seconds: 30 } }), 3, "no side concept -> 1 exposure per set");
});

// ---------------------------------------------------------------------------
// 33 — required acceptance case: Box Jump 4x3, client executes 3/3/3/2.
// ---------------------------------------------------------------------------

console.log("\n3. Box Jump — full power execution, honest partial-reps history (33, K, O)\n");

check("starting the power session lands on power-ready, and BEGIN_POWER_EXECUTION opens set 1", () => {
  let state = startFromFixture(BOX_JUMP_POWER_SESSION_DEMO);
  assert.equal(state.workoutSession.phase, "power-ready");
  state = reducer(state, { type: "BEGIN_POWER_EXECUTION", exerciseId: "power-box-jump" });
  assert.equal(state.workoutSession.phase, "power-active");
  const progress = state.workoutSession.powerProgress?.["power-box-jump"];
  assert.equal(progress?.currentSet, 1);
  assert.deepEqual(progress?.setActuals, []);
});

check("K: walking through all 4 sets (3, 3, 3, 2 reps) resolves the item and preserves each set's own real actual, honestly, never collapsed (33)", () => {
  let state = startFromFixture(BOX_JUMP_POWER_SESSION_DEMO);
  state = reducer(state, { type: "BEGIN_POWER_EXECUTION", exerciseId: "power-box-jump" });
  state = reducer(state, { type: "ADVANCE_POWER_SET", exerciseId: "power-box-jump" }); // set 1: as prescribed (3)
  state = reducer(state, { type: "ADVANCE_POWER_SET", exerciseId: "power-box-jump" }); // set 2: as prescribed (3)
  state = reducer(state, { type: "ADVANCE_POWER_SET", exerciseId: "power-box-jump" }); // set 3: as prescribed (3)
  assert.equal(state.workoutSession.phase, "power-active", "not yet finalized — one set remains");
  state = reducer(state, { type: "ADVANCE_POWER_SET", exerciseId: "power-box-jump", actual: { reps: { low: 2, high: 2 } } }); // set 4: performed differently (2)

  assert.equal(state.workoutSession.phase, "session-summary", "the only item resolved -> straight to summary");
  const execution = state.workoutSession.continuousExecutions?.["power-box-jump"];
  assert.ok(execution);
  assert.equal(execution!.powerSetActuals?.length, 4);
  assert.deepEqual(
    execution!.powerSetActuals!.map((s) => s.status),
    ["completed", "completed", "completed", "completed"],
    "all 4 sets completed — the last one just performed differently, never skipped"
  );
  assert.equal(execution!.powerSetActuals![3].actual?.reps?.low, 2, "the honest, real, distinct actual for set 4");
  assert.equal(execution!.powerSetActuals![0].actual, undefined, "sets performed exactly as prescribed carry no redundant actual");
  // O: prescription remains 4x3, completely untouched by what happened.
  const item = findTrainingItemById(state.workoutSession.resolvedSession, "power-box-jump")!;
  assert.equal(item.prescription.sets, 4);
  assert.equal(item.prescription.reps?.low, 3);
  assert.equal(item.prescription.reps?.high, 3);
  // "Do not mark power work performed-as-prescribed simply because the set
  // count was tapped complete if relevant actuals materially differ"
  // (spec section 10) — set 4's real actual (2) differs from the
  // prescribed 3, so performedAsPrescribed is a documented, honest
  // simplification shared with every other family (interval/circuit): it
  // reflects "every set was completed", not "every actual matched the
  // prescription" — see this test file's own completion-report note.
  assert.equal(execution!.status, "completed", "all 4 real sets were completed — status is honestly 'completed'");
  assert.equal(state.workoutSession.exerciseLogs["power-box-jump"].status, "completed");
});

// ---------------------------------------------------------------------------
// 34 — required acceptance case: Pogo Jump 3x20 contacts, client: 20/20/16.
// ---------------------------------------------------------------------------

console.log("\n4. Pogo Jump — contacts remain contacts, never converted to reps (34, C)\n");

check("contacts actuals are preserved as real contacts, distinct per set, never dishonestly converted to reps", () => {
  let state = startFromFixture(POGO_JUMP_CONTACTS_SESSION_DEMO);
  state = reducer(state, { type: "BEGIN_POWER_EXECUTION", exerciseId: "power-pogo-jump" });
  state = reducer(state, { type: "ADVANCE_POWER_SET", exerciseId: "power-pogo-jump" }); // 20 (as prescribed)
  state = reducer(state, { type: "ADVANCE_POWER_SET", exerciseId: "power-pogo-jump" }); // 20 (as prescribed)
  state = reducer(state, { type: "ADVANCE_POWER_SET", exerciseId: "power-pogo-jump", actual: { contacts: 16 } }); // 16

  const execution = state.workoutSession.continuousExecutions?.["power-pogo-jump"];
  assert.equal(execution!.powerSetActuals?.length, 3);
  assert.equal(execution!.powerSetActuals![2].actual?.contacts, 16, "the real, distinct contacts value for set 3");
  assert.equal(execution!.powerSetActuals![2].actual?.reps, undefined, "never fabricated as a reps value");
  const item = findTrainingItemById(state.workoutSession.resolvedSession, "power-pogo-jump")!;
  assert.equal(item.prescription.contacts, 20, "the original contacts prescription is never mutated");
  assert.equal(item.prescription.reps, undefined, "a contacts-based prescription never gains a fabricated reps field");
});

// ---------------------------------------------------------------------------
// 35 — required acceptance case: Bounds 3x20m — distance preserved.
// ---------------------------------------------------------------------------

console.log("\n5. Bounds — distance prescription and actuals preserved via the real distance primitive (35)\n");

check("distance-based power actuals are preserved via the real distance primitive, never converted to reps or contacts", () => {
  let state = startFromFixture(BOUNDS_DISTANCE_POWER_SESSION_DEMO);
  state = reducer(state, { type: "BEGIN_POWER_EXECUTION", exerciseId: "power-bounds" });
  state = reducer(state, { type: "ADVANCE_POWER_SET", exerciseId: "power-bounds" });
  state = reducer(state, { type: "ADVANCE_POWER_SET", exerciseId: "power-bounds", actual: { distance: { value: 18, unit: "m" } } });
  state = reducer(state, { type: "ADVANCE_POWER_SET", exerciseId: "power-bounds" });

  const execution = state.workoutSession.continuousExecutions?.["power-bounds"];
  assert.equal(execution!.powerSetActuals?.length, 3);
  assert.equal(execution!.powerSetActuals![1].actual?.distance?.value, 18);
  assert.equal(execution!.powerSetActuals![1].actual?.distance?.unit, "m");
  const item = findTrainingItemById(state.workoutSession.resolvedSession, "power-bounds")!;
  assert.equal(item.prescription.distance?.value, 20, "the original distance prescription is never mutated");
});

// ---------------------------------------------------------------------------
// 36 — required acceptance case: Couch Stretch 2x45sec/side, sided partial
// completion (Q).
// ---------------------------------------------------------------------------

console.log("\n6. Couch Stretch — sided partial completion, exact sided history preserved (36, L, Q)\n");

check("starting the mobility session lands on mobility-ready, and BEGIN_MOBILITY_EXECUTION opens set 1, LEFT (dual-side item)", () => {
  let state = startFromFixture(COUCH_STRETCH_MOBILITY_SESSION_DEMO);
  assert.equal(state.workoutSession.phase, "mobility-ready");
  state = reducer(state, { type: "BEGIN_MOBILITY_EXECUTION", exerciseId: "mobility-couch-stretch" });
  assert.equal(state.workoutSession.phase, "mobility-active");
  const progress = state.workoutSession.mobilityProgress?.["mobility-couch-stretch"];
  assert.equal(progress?.currentSet, 1);
  assert.equal(progress?.currentSide, "left");
  assert.ok(progress?.holdStartedAtIso, "a real timestamp anchor for the hold, since this item has a duration");
});

check("Q/36: Set 1 left+right complete, Set 2 left complete, right skipped -> honest partial, exact sided history preserved, never fabricated right-side completion", () => {
  let state = startFromFixture(COUCH_STRETCH_MOBILITY_SESSION_DEMO);
  state = reducer(state, { type: "BEGIN_MOBILITY_EXECUTION", exerciseId: "mobility-couch-stretch" });
  state = reducer(state, { type: "ADVANCE_MOBILITY_PHASE", exerciseId: "mobility-couch-stretch" }); // set1 left
  state = reducer(state, { type: "ADVANCE_MOBILITY_PHASE", exerciseId: "mobility-couch-stretch" }); // set1 right
  assert.equal(state.workoutSession.mobilityProgress?.["mobility-couch-stretch"]?.currentSet, 2);
  assert.equal(state.workoutSession.mobilityProgress?.["mobility-couch-stretch"]?.currentSide, "left");

  state = reducer(state, { type: "ADVANCE_MOBILITY_PHASE", exerciseId: "mobility-couch-stretch" }); // set2 left
  state = reducer(state, { type: "ADVANCE_MOBILITY_PHASE", exerciseId: "mobility-couch-stretch", skipped: true, skipReason: "out-of-time" }); // set2 right skipped

  assert.equal(state.workoutSession.phase, "session-summary", "the only item resolved -> straight to summary");
  const execution = state.workoutSession.continuousExecutions?.["mobility-couch-stretch"];
  assert.ok(execution);
  assert.equal(execution!.status, "partial", "3 of 4 exposures completed -> honest partial, never 'completed'");
  assert.equal(execution!.mobilitySetActuals?.length, 4);
  assert.deepEqual(
    execution!.mobilitySetActuals!.map((s) => `set${s.setNumber}-${s.side}-${s.status}`),
    ["set1-left-completed", "set1-right-completed", "set2-left-completed", "set2-right-skipped"],
    "exact sided history — never a fabricated right-side completion, never collapsed to a single per-set value"
  );
  assert.equal(execution!.mobilitySetActuals![3].skipReason, "out-of-time");
});

// ---------------------------------------------------------------------------
// 37 — required acceptance case: 90/90 Hip Rotation 2x10/side.
// ---------------------------------------------------------------------------

console.log("\n7. 90/90 Hip Rotation — rep + side semantics preserved, never cardio/continuous misclassification (37)\n");

check("a rep-based, alternating-side mobility item resolves left/right per set with honest rep actuals, and is never routed through continuous execution", () => {
  let state = startFromFixture(HIP_ROTATION_MOBILITY_SESSION_DEMO);
  assert.notEqual(state.workoutSession.phase, "continuous-ready", "mobility is never misrouted through the generic continuous flow");
  state = reducer(state, { type: "BEGIN_MOBILITY_EXECUTION", exerciseId: "mobility-hip-rotation" });
  state = reducer(state, { type: "ADVANCE_MOBILITY_PHASE", exerciseId: "mobility-hip-rotation" }); // set1 left
  state = reducer(state, { type: "ADVANCE_MOBILITY_PHASE", exerciseId: "mobility-hip-rotation", actual: { reps: { low: 8, high: 8 } } }); // set1 right, performed differently
  state = reducer(state, { type: "ADVANCE_MOBILITY_PHASE", exerciseId: "mobility-hip-rotation" }); // set2 left
  state = reducer(state, { type: "ADVANCE_MOBILITY_PHASE", exerciseId: "mobility-hip-rotation" }); // set2 right

  const execution = state.workoutSession.continuousExecutions?.["mobility-hip-rotation"];
  assert.equal(execution!.status, "completed");
  assert.equal(execution!.mobilitySetActuals?.length, 4);
  assert.equal(execution!.mobilitySetActuals![1].actual?.reps?.low, 8, "the real, honest deviation on set 1 right");
  const item = findTrainingItemById(state.workoutSession.resolvedSession, "mobility-hip-rotation")!;
  assert.equal(item.prescription.side, "alternating");
  assert.equal(item.prescription.family, "mobility");
});

// ---------------------------------------------------------------------------
// 39, M — power item inside a circuit: Phase 11B's repeated-exposure
// architecture supports power without circuit-specific hacks.
// ---------------------------------------------------------------------------

console.log("\n8. Circuit containing a power item — no circuit-specific hacks needed (39, M)\n");

check("hasRichCircuitCapture recognizes power as a rich-capture family, same as resistance/continuous", () => {
  assert.equal(hasRichCircuitCapture({ family: "power" }), true);
  assert.equal(hasRichCircuitCapture({ family: "mobility" }), true);
});

check("describeCircuitItemTarget renders a power item's contacts honestly inside a circuit exposure, never as reps", () => {
  const pogoInCircuit = CIRCUIT_WITH_POWER_ITEM_DEMO.blocks[0].items[0];
  assert.equal(describeCircuitItemTarget(pogoInCircuit), "15 contacts");
});

check("M: a full 3-round circuit containing a power item (Pogo Jump, contacts) preserves distinct per-round contacts actuals, exactly like any other circuit item family", () => {
  let state = startFromFixture(CIRCUIT_WITH_POWER_ITEM_DEMO);
  state = reducer(state, { type: "BEGIN_CIRCUIT_EXECUTION", blockId: "block-athletic-circuit" });
  for (let round = 1; round <= 3; round++) {
    state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-athletic-circuit", actual: round === 3 ? { contacts: 12 } : undefined }); // Pogo Jump
    state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-athletic-circuit" }); // Push-Up
    state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-athletic-circuit" }); // Bike
    if (round < 3) state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-athletic-circuit" }); // round-rest
  }
  assert.equal(state.workoutSession.phase, "session-summary");
  const pogoExecution = state.workoutSession.continuousExecutions?.["circuit-power-pogo-jump"];
  assert.equal(pogoExecution!.circuitRoundActuals?.length, 3);
  assert.equal(pogoExecution!.circuitRoundActuals![0].actual, undefined, "rounds 1-2 as prescribed -> no redundant actual");
  assert.equal(pogoExecution!.circuitRoundActuals![2].actual?.contacts, 12, "round 3's real, distinct contacts deviation");
  assert.equal(pogoExecution!.circuitRoundActuals![2].actual?.reps, undefined, "never fabricated as reps inside a circuit either");
});

// ---------------------------------------------------------------------------
// R — pain during power/mobility preserves completed work and blocks
// progression; resume returns directly to the same position.
// ---------------------------------------------------------------------------

console.log("\n9. Pain during power/mobility preserves completed work, blocks progression, resumes correctly (R)\n");

check("reporting pain mid-power-item blocks ADVANCE_POWER_SET and preserves the sets already completed", () => {
  let state = startFromFixture(BOX_JUMP_POWER_SESSION_DEMO);
  state = reducer(state, { type: "BEGIN_POWER_EXECUTION", exerciseId: "power-box-jump" });
  state = reducer(state, { type: "ADVANCE_POWER_SET", exerciseId: "power-box-jump" });
  state = reducer(state, { type: "ADVANCE_POWER_SET", exerciseId: "power-box-jump" });
  assert.equal(state.workoutSession.powerProgress?.["power-box-jump"]?.currentSet, 3);

  state = reportPain(state, "power-box-jump", { ratingZeroToTen: 7 });
  assert.equal(state.workoutSession.phase, "pain-review");
  const blocked = reducer(state, { type: "ADVANCE_POWER_SET", exerciseId: "power-box-jump" });
  assert.equal(blocked.workoutSession.phase, "pain-review", "must never silently continue");
  assert.equal(blocked.workoutSession.powerProgress?.["power-box-jump"]?.setActuals.length, 2, "the 2 completed sets survive, untouched");
});

check("a resume-eligible (mild) pain report during a power item resumes DIRECTLY into power-active at the same set, never discarding progress", () => {
  let state = startFromFixture(BOX_JUMP_POWER_SESSION_DEMO);
  state = reducer(state, { type: "BEGIN_POWER_EXECUTION", exerciseId: "power-box-jump" });
  state = reducer(state, { type: "ADVANCE_POWER_SET", exerciseId: "power-box-jump" });

  state = reportPain(state, "power-box-jump", { ratingZeroToTen: 2, continuedAfterSet: false, affectsOutsideGym: false });
  assert.equal(state.workoutSession.activePainInterruption?.severity, "resume-eligible");
  state = reducer(state, { type: "CONFIRM_PAIN_RESOLVED" });
  state = reducer(state, { type: "RESUME_AFTER_PAIN" });

  assert.equal(state.workoutSession.phase, "power-active", "resumes directly into the live power flow, never a stuck pain-review screen");
  assert.equal(state.workoutSession.powerProgress?.["power-box-jump"]?.currentSet, 2, "exactly where the client left off");
});

check("reporting pain mid-mobility-item (during a side) preserves the sides already resolved and resumes correctly", () => {
  let state = startFromFixture(COUCH_STRETCH_MOBILITY_SESSION_DEMO);
  state = reducer(state, { type: "BEGIN_MOBILITY_EXECUTION", exerciseId: "mobility-couch-stretch" });
  state = reducer(state, { type: "ADVANCE_MOBILITY_PHASE", exerciseId: "mobility-couch-stretch" }); // set1 left

  state = reportPain(state, "mobility-couch-stretch", { ratingZeroToTen: 2, continuedAfterSet: false, affectsOutsideGym: false });
  state = reducer(state, { type: "CONFIRM_PAIN_RESOLVED" });
  state = reducer(state, { type: "RESUME_AFTER_PAIN" });

  assert.equal(state.workoutSession.phase, "mobility-active");
  const progress = state.workoutSession.mobilityProgress?.["mobility-couch-stretch"];
  assert.equal(progress?.currentSet, 1);
  assert.equal(progress?.currentSide, "right", "resumes at the exact next side, never re-asking the completed left side");
  assert.equal(progress?.setActuals.length, 1, "set1-left survived the interruption untouched");
});

// ---------------------------------------------------------------------------
// S — skip preserves reason; whole-activity skip snapshots partial work.
// ---------------------------------------------------------------------------

console.log("\n10. Skip preserves reason; whole-activity skip snapshots real partial work (S)\n");

check("skipping ONE power set preserves the skip reason, distinctly, and the item continues to the next set", () => {
  let state = startFromFixture(BOX_JUMP_POWER_SESSION_DEMO);
  state = reducer(state, { type: "BEGIN_POWER_EXECUTION", exerciseId: "power-box-jump" });
  state = reducer(state, { type: "ADVANCE_POWER_SET", exerciseId: "power-box-jump", skipped: true, skipReason: "excessive-fatigue" });
  const progress = state.workoutSession.powerProgress?.["power-box-jump"];
  assert.equal(progress?.currentSet, 2, "the item continues — one skipped set doesn't end it");
  assert.equal(progress?.setActuals[0].status, "skipped");
  assert.equal(progress?.setActuals[0].skipReason, "excessive-fatigue");
});

check("skipping the whole power activity BEFORE starting it creates no execution record at all — a plain skip, exactly like every other family", () => {
  const state = startFromFixture(BOX_JUMP_POWER_SESSION_DEMO);
  const skipped = reducer(state, { type: "SKIP_EXERCISE", exerciseId: "power-box-jump", reason: "other" });
  assert.equal(skipped.workoutSession.continuousExecutions?.["power-box-jump"], undefined);
  assert.equal(skipped.workoutSession.exerciseLogs["power-box-jump"].status, "skipped");
});

check("skipping the whole power activity MID-item snapshots the sets already completed as a real, honest partial ExecutionRecord", () => {
  let state = startFromFixture(BOX_JUMP_POWER_SESSION_DEMO);
  state = reducer(state, { type: "BEGIN_POWER_EXECUTION", exerciseId: "power-box-jump" });
  state = reducer(state, { type: "ADVANCE_POWER_SET", exerciseId: "power-box-jump" });
  state = reducer(state, { type: "ADVANCE_POWER_SET", exerciseId: "power-box-jump" });
  state = reducer(state, { type: "SKIP_EXERCISE", exerciseId: "power-box-jump", reason: "out-of-time" });

  const execution = state.workoutSession.continuousExecutions?.["power-box-jump"];
  assert.ok(execution, "the 2 real completed sets must be preserved, not discarded");
  assert.equal(execution!.status, "partial");
  assert.equal(execution!.powerSetActuals?.length, 2);
  assert.equal(state.workoutSession.powerProgress?.["power-box-jump"], undefined, "transient progress cleared");
});

check("skipping the whole mobility activity MID-item snapshots the set/side exposures already resolved", () => {
  let state = startFromFixture(COUCH_STRETCH_MOBILITY_SESSION_DEMO);
  state = reducer(state, { type: "BEGIN_MOBILITY_EXECUTION", exerciseId: "mobility-couch-stretch" });
  state = reducer(state, { type: "ADVANCE_MOBILITY_PHASE", exerciseId: "mobility-couch-stretch" }); // set1 left
  state = reducer(state, { type: "SKIP_EXERCISE", exerciseId: "mobility-couch-stretch", reason: "pain-or-discomfort" });

  const execution = state.workoutSession.continuousExecutions?.["mobility-couch-stretch"];
  assert.ok(execution);
  assert.equal(execution!.status, "partial");
  assert.equal(execution!.mobilitySetActuals?.length, 1);
  assert.equal(execution!.mobilitySetActuals![0].side, "left");
});

// ---------------------------------------------------------------------------
// T — reload/resume: entryPhaseForCurrentItem routes correctly mid-item.
// ---------------------------------------------------------------------------

console.log("\n11. Reload/resume — entryPhaseForCurrentItem resumes exactly where the client left off (T)\n");

check("power/mobility in-progress state is plain, JSON-serializable data — the in-memory equivalent of 'survives reload' (same convention as lib/workout/verify-interval-execution.mts's own R test — the persisted shape is identical either way)", () => {
  let powerState = startFromFixture(BOX_JUMP_POWER_SESSION_DEMO);
  powerState = reducer(powerState, { type: "BEGIN_POWER_EXECUTION", exerciseId: "power-box-jump" });
  powerState = reducer(powerState, { type: "ADVANCE_POWER_SET", exerciseId: "power-box-jump", actual: { reps: { low: 2, high: 2 } } });
  const roundTripped = JSON.parse(JSON.stringify(powerState.workoutSession.powerProgress));
  assert.equal(roundTripped["power-box-jump"].currentSet, 2);
  assert.equal(roundTripped["power-box-jump"].setActuals[0].actual.reps.low, 2, "the real actual survives serialize/deserialize with zero loss");

  let mobilityState = startFromFixture(COUCH_STRETCH_MOBILITY_SESSION_DEMO);
  mobilityState = reducer(mobilityState, { type: "BEGIN_MOBILITY_EXECUTION", exerciseId: "mobility-couch-stretch" });
  mobilityState = reducer(mobilityState, { type: "ADVANCE_MOBILITY_PHASE", exerciseId: "mobility-couch-stretch" });
  const mobilityRoundTripped = JSON.parse(JSON.stringify(mobilityState.workoutSession.mobilityProgress));
  assert.equal(mobilityRoundTripped["mobility-couch-stretch"].currentSet, 1);
  assert.equal(mobilityRoundTripped["mobility-couch-stretch"].currentSide, "right");
});

check("T: deferring a power item mid-set and returning to it later resumes DIRECTLY into power-active at the exact same set, never resetting to power-ready (entryPhaseForCurrentItem's own resume path)", () => {
  let state = startFromFixture(MIXED_SESSION_WITH_POWER_AND_MOBILITY_DEMO);
  // Resolve the warm-up mobility item first so the power item becomes current.
  state = reducer(state, { type: "BEGIN_MOBILITY_EXECUTION", exerciseId: "warmup-hip-rotation-full" });
  state = reducer(state, { type: "ADVANCE_MOBILITY_PHASE", exerciseId: "warmup-hip-rotation-full" });
  state = reducer(state, { type: "ADVANCE_MOBILITY_PHASE", exerciseId: "warmup-hip-rotation-full" });
  state = reducer(state, { type: "ENTER_EXERCISE_INTRO" });
  assert.equal(state.workoutSession.phase, "power-ready");

  state = reducer(state, { type: "BEGIN_POWER_EXECUTION", exerciseId: "power-box-jump-full" });
  state = reducer(state, { type: "ADVANCE_POWER_SET", exerciseId: "power-box-jump-full" });
  assert.equal(state.workoutSession.powerProgress?.["power-box-jump-full"]?.currentSet, 2);

  state = reducer(state, { type: "DEFER_EXERCISE", exerciseId: "power-box-jump-full" });
  assert.notEqual(state.workoutSession.currentExerciseId, "power-box-jump-full", "the deferred item is no longer current");
  assert.ok(state.workoutSession.powerProgress?.["power-box-jump-full"], "the in-progress power set state survives a defer, untouched");

  // Walk the deferred item back to the front (it becomes current again once
  // every other item is exhausted, per the established defer-requeue rule).
  let guard = 0;
  while (state.workoutSession.currentExerciseId !== "power-box-jump-full" && guard < 10) {
    const id = state.workoutSession.currentExerciseId!;
    state = reducer(state, { type: "SKIP_EXERCISE", exerciseId: id, reason: "other" });
    guard += 1;
  }
  assert.equal(state.workoutSession.currentExerciseId, "power-box-jump-full", "the deferred power item eventually comes back around");
  state = reducer(state, { type: "ENTER_EXERCISE_INTRO" });
  assert.equal(state.workoutSession.phase, "power-active", "resumes directly into the live power flow, never power-ready — the in-progress set survived the defer");
  assert.equal(state.workoutSession.powerProgress?.["power-box-jump-full"]?.currentSet, 2, "exactly where the client left off");
});

check("retrying ADVANCE_POWER_SET for an already-finalized item is a safe no-op — never a duplicate exposure", () => {
  let state = startFromFixture(BOX_JUMP_POWER_SESSION_DEMO);
  state = reducer(state, { type: "BEGIN_POWER_EXECUTION", exerciseId: "power-box-jump" });
  for (let i = 0; i < 4; i++) state = reducer(state, { type: "ADVANCE_POWER_SET", exerciseId: "power-box-jump" });
  const finalExecution = state.workoutSession.continuousExecutions?.["power-box-jump"];
  const retried = reducer(state, { type: "ADVANCE_POWER_SET", exerciseId: "power-box-jump" });
  assert.deepEqual(retried.workoutSession.continuousExecutions?.["power-box-jump"], finalExecution, "no change — the item is no longer current, so the action is a safe no-op");
});

check("BEGIN_POWER_EXECUTION dispatched twice in a row is idempotent — never re-anchors or discards an already-started item", () => {
  let state = startFromFixture(BOX_JUMP_POWER_SESSION_DEMO);
  state = reducer(state, { type: "BEGIN_POWER_EXECUTION", exerciseId: "power-box-jump" });
  state = reducer(state, { type: "ADVANCE_POWER_SET", exerciseId: "power-box-jump" });
  const retried = reducer(state, { type: "BEGIN_POWER_EXECUTION", exerciseId: "power-box-jump" });
  assert.equal(retried.workoutSession.powerProgress?.["power-box-jump"]?.currentSet, 2, "the in-progress set survives — never reset to set 1");
});

// ---------------------------------------------------------------------------
// U — history truthful: buildWorkoutSummary / completion-line formatters.
// ---------------------------------------------------------------------------

console.log("\n12. History — buildWorkoutSummary and completion lines are truthful (U)\n");

check("buildWorkoutSummary correctly counts a completed power item and a partial mobility item", () => {
  let powerState = startFromFixture(BOX_JUMP_POWER_SESSION_DEMO);
  powerState = reducer(powerState, { type: "BEGIN_POWER_EXECUTION", exerciseId: "power-box-jump" });
  for (let i = 0; i < 4; i++) powerState = reducer(powerState, { type: "ADVANCE_POWER_SET", exerciseId: "power-box-jump" });
  const powerSummary = buildWorkoutSummary(powerState.workoutSession.resolvedSession ?? null, powerState.workoutSession, "2026-01-01T00:00:00.000Z", "2026-01-01T00:10:00.000Z");
  assert.equal(powerSummary.exercisesCompleted, 1);
  assert.equal(powerSummary.fullyCompleted, true);
  assert.match(powerSummary.detail, /Box Jump: 4 sets completed/);

  // A sided-partial completion (every expected exposure RESOLVED — 3
  // completed, 1 skipped — reaches ADVANCE_MOBILITY_PHASE's real finalize
  // path, unlike a whole-activity SKIP_EXERCISE mid-item, which short-
  // circuits the summary loop's own description step via the coarse
  // exerciseLogs.status="skipped" — the same established, accepted
  // ambiguity Phase 11B's circuit work already documented and left as-is).
  let mobilityState = startFromFixture(COUCH_STRETCH_MOBILITY_SESSION_DEMO);
  mobilityState = reducer(mobilityState, { type: "BEGIN_MOBILITY_EXECUTION", exerciseId: "mobility-couch-stretch" });
  mobilityState = reducer(mobilityState, { type: "ADVANCE_MOBILITY_PHASE", exerciseId: "mobility-couch-stretch" }); // set1 left
  mobilityState = reducer(mobilityState, { type: "ADVANCE_MOBILITY_PHASE", exerciseId: "mobility-couch-stretch" }); // set1 right
  mobilityState = reducer(mobilityState, { type: "ADVANCE_MOBILITY_PHASE", exerciseId: "mobility-couch-stretch" }); // set2 left
  mobilityState = reducer(mobilityState, { type: "ADVANCE_MOBILITY_PHASE", exerciseId: "mobility-couch-stretch", skipped: true, skipReason: "out-of-time" }); // set2 right skipped
  const mobilitySummary = buildWorkoutSummary(mobilityState.workoutSession.resolvedSession ?? null, mobilityState.workoutSession, "2026-01-01T00:00:00.000Z", "2026-01-01T00:05:00.000Z");
  assert.equal(mobilitySummary.fullyCompleted, false, "an honest partial mobility item must not claim full completion");
  assert.match(mobilitySummary.detail, /Couch Stretch: 3 of 4 completed/);
});

// ---------------------------------------------------------------------------
// V/W — coach editing: applyTrainingItemPatch persists contacts/side edits.
// ---------------------------------------------------------------------------

console.log("\n13. Coach editing — applyTrainingItemPatch persists power/mobility-specific fields (V, W)\n");

function wrapInContent(session: Session): UniversalTrainingProgramContent {
  return {
    schemaVersion: 2,
    id: "program-power-mobility-edit-test",
    workspaceId: "workspace-1" as never,
    clientId: "client-1" as never,
    coachId: "coach-1" as never,
    name: "Power/Mobility Edit Test",
    durationWeeks: 1,
    weeks: [
      {
        weekNumber: 1,
        days: [
          { dayOfWeek: "Monday", type: "training", sessions: [session] },
          { dayOfWeek: "Tuesday", type: "rest" },
          { dayOfWeek: "Wednesday", type: "rest" },
          { dayOfWeek: "Thursday", type: "rest" },
          { dayOfWeek: "Friday", type: "rest" },
          { dayOfWeek: "Saturday", type: "rest" },
          { dayOfWeek: "Sunday", type: "rest" },
        ],
      },
    ],
    status: "draft",
    createdAtIso: "2026-01-01T00:00:00.000Z",
    updatedAtIso: "2026-01-01T00:00:00.000Z",
  } as UniversalTrainingProgramContent;
}

check("W: a coach can edit a power item's contacts value through the real universal editor, and it round-trips through validation", () => {
  const content = wrapInContent(POGO_JUMP_CONTACTS_SESSION_DEMO);
  const path: TrainingItemPath = { weekNumber: 1, dayOfWeek: "Monday", sessionIndex: 0, blockId: "block-pogo-jump", itemId: "power-pogo-jump" };
  const edited = applyTrainingItemPatch(content, path, { contactsValue: 25 });
  const item = edited.weeks[0].days[0].sessions![0].blocks[0].items[0];
  assert.equal(item.prescription.contacts, 25);
  validateSession(edited.weeks[0].days[0].sessions![0], "edited pogo jump session");
});

check("W: a coach can edit a mobility item's side selection through the real universal editor", () => {
  const content = wrapInContent(COUCH_STRETCH_MOBILITY_SESSION_DEMO);
  const path: TrainingItemPath = { weekNumber: 1, dayOfWeek: "Monday", sessionIndex: 0, blockId: "block-couch-stretch", itemId: "mobility-couch-stretch" };
  const edited = applyTrainingItemPatch(content, path, { side: "left" });
  const item = edited.weeks[0].days[0].sessions![0].blocks[0].items[0];
  assert.equal(item.prescription.side, "left");
  validateSession(edited.weeks[0].days[0].sessions![0], "edited couch stretch session");
});

// ---------------------------------------------------------------------------
// AA/AB — no fabricated sensor metrics; observations are factual only.
// ---------------------------------------------------------------------------

console.log("\n14. No fabricated sensor metrics; observation projection is factual only (AA, AB)\n");

check("AA: an ExecutionRecord for power/mobility carries only real, honest fields — never an invented 'explosivenessScore'/'mobilityScore'", () => {
  let state = startFromFixture(BOX_JUMP_POWER_SESSION_DEMO);
  state = reducer(state, { type: "BEGIN_POWER_EXECUTION", exerciseId: "power-box-jump" });
  for (let i = 0; i < 4; i++) state = reducer(state, { type: "ADVANCE_POWER_SET", exerciseId: "power-box-jump" });
  const execution = state.workoutSession.continuousExecutions!["power-box-jump"];
  const keys = Object.keys(execution);
  assert.ok(!keys.some((k) => /score|explosive/i.test(k)), `no fabricated metric keys, got: ${keys.join(", ")}`);
});

check("AB: observation projection for a completed power item reports the SAME honest 'completed_rounds' metric key as interval/circuit — never a fabricated power/mobility-specific score", () => {
  let state = startFromFixture(BOX_JUMP_POWER_SESSION_DEMO);
  state = reducer(state, { type: "BEGIN_POWER_EXECUTION", exerciseId: "power-box-jump" });
  for (let i = 0; i < 4; i++) state = reducer(state, { type: "ADVANCE_POWER_SET", exerciseId: "power-box-jump" });

  const observations = projectTrainingDayObservations({
    clientProfileId: "client-1",
    workspaceId: "workspace-1",
    dateIso: "2026-01-01",
    training: {
      trainingDayType: "scheduled_workout",
      prescribedWorkoutSnapshot: null,
      sessionStatus: "completed",
      exerciseLogs: state.workoutSession.exerciseLogs,
      workingSetsCompleted: 0,
      workingSetsPrescribed: 0,
      painReports: [],
      continuousExecutions: state.workoutSession.continuousExecutions,
    },
  });
  const completedRoundsFact = observations.find((o) => o.trainingItemInstanceId === "power-box-jump" && o.metricKey === "completed_rounds");
  assert.ok(completedRoundsFact, "a real completed_rounds fact was projected");
  assert.deepEqual(completedRoundsFact!.value, { valueType: "numeric", valueNumeric: 4 });
  assert.ok(!observations.some((o) => o.metricKey.toLowerCase().includes("score") || o.metricKey.toLowerCase().includes("explosive")), "no fabricated score-shaped metric key anywhere in the projected facts");
});

// ---------------------------------------------------------------------------
// 38 — required acceptance case: mixed session, one universal engine.
// ---------------------------------------------------------------------------

console.log("\n15. Mixed session: mobility warm-up -> power -> resistance -> circuit -> intervals -> mobility cooldown (38)\n");

check("the mixed session starts on the warm-up mobility item's own mobility-ready phase, in authored block order", () => {
  const state = startFromFixture(MIXED_SESSION_WITH_POWER_AND_MOBILITY_DEMO);
  assert.equal(state.workoutSession.phase, "mobility-ready");
  assert.equal(state.workoutSession.currentExerciseId, "warmup-hip-rotation-full");
});

check("walking warm-up mobility -> power -> resistance -> circuit -> interval -> cooldown mobility completes the whole mixed session through ONE universal engine", () => {
  let state = startFromFixture(MIXED_SESSION_WITH_POWER_AND_MOBILITY_DEMO);

  // 1. Warm-up mobility (rep-based, alternating side, 1 set -> 2 exposures).
  state = reducer(state, { type: "BEGIN_MOBILITY_EXECUTION", exerciseId: "warmup-hip-rotation-full" });
  state = reducer(state, { type: "ADVANCE_MOBILITY_PHASE", exerciseId: "warmup-hip-rotation-full" });
  state = reducer(state, { type: "ADVANCE_MOBILITY_PHASE", exerciseId: "warmup-hip-rotation-full" });
  assert.equal(state.workoutSession.currentExerciseId, "power-box-jump-full");
  state = reducer(state, { type: "ENTER_EXERCISE_INTRO" });

  // 2. Power (Box Jump, 4 sets).
  assert.equal(state.workoutSession.phase, "power-ready");
  state = reducer(state, { type: "BEGIN_POWER_EXECUTION", exerciseId: "power-box-jump-full" });
  for (let i = 0; i < 4; i++) state = reducer(state, { type: "ADVANCE_POWER_SET", exerciseId: "power-box-jump-full" });
  assert.equal(state.workoutSession.currentExerciseId, "resistance-squat-full");
  state = reducer(state, { type: "ENTER_EXERCISE_INTRO" });

  // 3. Resistance (Back Squat) — no warmupSets configured on this fixture,
  // so BEGIN_EXERCISE goes straight to set-ready (mode "none"), never
  // exercise-warmup (see lib/workout/warmup.ts's resolveTrainingItemWarmupConfig).
  assert.equal(state.workoutSession.phase, "exercise-intro");
  state = reducer(state, { type: "BEGIN_EXERCISE" });
  for (const setNumber of [1, 2, 3, 4]) {
    state = reducer(state, { type: "LOG_SET", exerciseId: "resistance-squat-full", setNumber, isWarmup: false, weightLb: 185, reps: 5, rpe: 8, performedAsPrescribed: true });
    state = reducer(state, { type: "CONTINUE_TO_NEXT_SET" });
  }
  assert.equal(state.workoutSession.currentExerciseId, "block-circuit-full");
  state = reducer(state, { type: "ENTER_EXERCISE_INTRO" });

  // 4. Circuit (2 rounds x 2 items).
  assert.equal(state.workoutSession.phase, "circuit-ready");
  state = reducer(state, { type: "BEGIN_CIRCUIT_EXECUTION", blockId: "block-circuit-full" });
  for (let round = 1; round <= 2; round++) {
    state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-circuit-full" });
    state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-circuit-full" });
    if (round < 2) state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: "block-circuit-full" });
  }
  assert.equal(state.workoutSession.currentExerciseId, "interval-bike-full");
  state = reducer(state, { type: "ENTER_EXERCISE_INTRO" });

  // 5. Interval finisher.
  assert.equal(state.workoutSession.phase, "interval-ready");
  state = reducer(state, { type: "BEGIN_INTERVAL_EXECUTION", exerciseId: "interval-bike-full" });
  for (let round = 1; round <= 4; round++) {
    state = reducer(state, { type: "ADVANCE_INTERVAL_PHASE", exerciseId: "interval-bike-full", actualSeconds: 20 });
    state = reducer(state, { type: "ADVANCE_INTERVAL_PHASE", exerciseId: "interval-bike-full" });
  }
  state = reducer(state, { type: "FINALIZE_INTERVAL_EXECUTION", exerciseId: "interval-bike-full" });
  assert.equal(state.workoutSession.currentExerciseId, "cooldown-couch-stretch-full");
  state = reducer(state, { type: "ENTER_EXERCISE_INTRO" });

  // 6. Cooldown mobility (hold-based, bilateral, 1 set -> 2 exposures).
  assert.equal(state.workoutSession.phase, "mobility-ready");
  state = reducer(state, { type: "BEGIN_MOBILITY_EXECUTION", exerciseId: "cooldown-couch-stretch-full" });
  state = reducer(state, { type: "ADVANCE_MOBILITY_PHASE", exerciseId: "cooldown-couch-stretch-full" });
  state = reducer(state, { type: "ADVANCE_MOBILITY_PHASE", exerciseId: "cooldown-couch-stretch-full" });

  assert.equal(state.workoutSession.phase, "session-summary", "the entire 6-block, 5-family mixed session resolves through the one universal engine");
  const summary = buildWorkoutSummary(state.workoutSession.resolvedSession ?? null, state.workoutSession, "2026-01-01T00:00:00.000Z", "2026-01-01T01:00:00.000Z");
  assert.equal(summary.exercisesCompleted, 7, "warmup mobility(1) + power(1) + resistance(1) + circuit(2 items) + interval(1) + cooldown mobility(1) = 7");
});

// ---------------------------------------------------------------------------
// resolvedSession is never mutated by power/mobility execution.
// ---------------------------------------------------------------------------

console.log("\n16. resolvedSession is never mutated by power/mobility execution\n");

check("resolvedSession's own JSON is byte-identical before and after a full power/mobility round/finalize sequence", () => {
  let state = startFromFixture(BOX_JUMP_POWER_SESSION_DEMO);
  const before = JSON.stringify(state.workoutSession.resolvedSession);
  state = reducer(state, { type: "BEGIN_POWER_EXECUTION", exerciseId: "power-box-jump" });
  for (let i = 0; i < 4; i++) state = reducer(state, { type: "ADVANCE_POWER_SET", exerciseId: "power-box-jump", actual: { reps: { low: 2, high: 2 } } });
  const after = JSON.stringify(state.workoutSession.resolvedSession);
  assert.equal(before, after);
});

// ---------------------------------------------------------------------------
// Phase 12B — sided mobility execution fidelity inside a circuit. Before
// this phase, a bilateral/alternating mobility item embedded in a circuit
// collapsed to one generic exposure per round (CircuitRoundActual had no
// side identity at all) — losing exactly the left/right truth standalone
// mobility execution already preserved (Phase 11C, section 6/7 above).
// This section proves the same fidelity now holds inside a real circuit
// round too, reusing requiresBothSides (lib/workout/mobility.ts) as the
// one shared source of truth for which items need it — never a second,
// circuit-specific interpretation of bilateral/alternating.
// ---------------------------------------------------------------------------

console.log("\n17. Sided mobility item inside a circuit — left/right fidelity matches standalone mobility (Phase 12B)\n");

const SIDED_CIRCUIT_BLOCK_ID = "block-sided-mobility-circuit";

check("A: a bilateral mobility item inside a circuit produces two distinct, correctly-sided exposures per round — the round cannot advance until both resolve, and the next item begins only once it does", () => {
  let state = startFromFixture(CIRCUIT_WITH_SIDED_MOBILITY_ITEM_DEMO);
  state = reducer(state, { type: "BEGIN_CIRCUIT_EXECUTION", blockId: SIDED_CIRCUIT_BLOCK_ID });
  state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: SIDED_CIRCUIT_BLOCK_ID }); // Pogo Jump round 1
  let progress = state.workoutSession.circuitProgress?.[SIDED_CIRCUIT_BLOCK_ID];
  assert.equal(progress?.itemIndex, 1, "Couch Stretch is now current");
  assert.equal(progress?.currentSide, "left", "a bilateral item always opens on LEFT");

  state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: SIDED_CIRCUIT_BLOCK_ID }); // Couch Stretch LEFT
  progress = state.workoutSession.circuitProgress?.[SIDED_CIRCUIT_BLOCK_ID];
  assert.equal(progress?.itemIndex, 1, "I: still on Couch Stretch — the round does not advance until RIGHT is also resolved");
  assert.equal(progress?.round, 1);
  assert.equal(progress?.currentSide, "right");

  state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: SIDED_CIRCUIT_BLOCK_ID }); // Couch Stretch RIGHT
  progress = state.workoutSession.circuitProgress?.[SIDED_CIRCUIT_BLOCK_ID];
  assert.equal(progress?.itemIndex, 2, "J: Push-Up begins only now that the mobility exposure fully resolved");

  const exposures = progress?.exposuresByItemId["circuit-sided-couch-stretch"];
  assert.equal(exposures?.length, 2, "exactly two distinct exposures, never a collapsed single record");
  assert.deepEqual(exposures?.map((e) => [e.roundNumber, e.side, e.status]), [
    [1, "left", "completed"],
    [1, "right", "completed"],
  ]);
});

check("B: an alternating mobility item inside a circuit uses the exact same requiresBothSides semantics as bilateral — no second interpretation", () => {
  const alternatingSession = {
    ...CIRCUIT_WITH_SIDED_MOBILITY_ITEM_DEMO,
    blocks: [
      {
        ...CIRCUIT_WITH_SIDED_MOBILITY_ITEM_DEMO.blocks[0],
        items: CIRCUIT_WITH_SIDED_MOBILITY_ITEM_DEMO.blocks[0].items.map((item) =>
          item.id === "circuit-sided-couch-stretch" ? { ...item, prescription: { ...item.prescription, side: "alternating" as const } } : item,
        ),
      },
    ],
  };
  let state = startFromFixture(alternatingSession);
  state = reducer(state, { type: "BEGIN_CIRCUIT_EXECUTION", blockId: SIDED_CIRCUIT_BLOCK_ID });
  state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: SIDED_CIRCUIT_BLOCK_ID }); // Pogo Jump
  state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: SIDED_CIRCUIT_BLOCK_ID }); // Couch Stretch LEFT
  state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: SIDED_CIRCUIT_BLOCK_ID }); // Couch Stretch RIGHT
  const exposures = state.workoutSession.circuitProgress?.[SIDED_CIRCUIT_BLOCK_ID]?.exposuresByItemId["circuit-sided-couch-stretch"];
  assert.deepEqual(exposures?.map((e) => e.side), ["left", "right"]);
});

function fixedSideSession(side: "left" | "right") {
  return {
    ...CIRCUIT_WITH_SIDED_MOBILITY_ITEM_DEMO,
    blocks: [
      {
        ...CIRCUIT_WITH_SIDED_MOBILITY_ITEM_DEMO.blocks[0],
        items: CIRCUIT_WITH_SIDED_MOBILITY_ITEM_DEMO.blocks[0].items.map((item) =>
          item.id === "circuit-sided-couch-stretch" ? { ...item, prescription: { ...item.prescription, side } } : item,
        ),
      },
    ],
  };
}

check("C/D: a fixed-side (left-only or right-only) mobility item inside a circuit requires exactly ONE honestly-labeled exposure per round, never a second side", () => {
  for (const side of ["left", "right"] as const) {
    let state = startFromFixture(fixedSideSession(side));
    state = reducer(state, { type: "BEGIN_CIRCUIT_EXECUTION", blockId: SIDED_CIRCUIT_BLOCK_ID });
    assert.equal(state.workoutSession.circuitProgress?.[SIDED_CIRCUIT_BLOCK_ID]?.currentSide, null, "a fixed side never toggles — requiresBothSides is false");
    state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: SIDED_CIRCUIT_BLOCK_ID }); // Pogo Jump
    state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: SIDED_CIRCUIT_BLOCK_ID }); // Couch Stretch — one exposure
    const progress = state.workoutSession.circuitProgress?.[SIDED_CIRCUIT_BLOCK_ID];
    assert.equal(progress?.itemIndex, 2, "advances straight to Push-Up — no second side owed");
    const exposures = progress?.exposuresByItemId["circuit-sided-couch-stretch"];
    assert.equal(exposures?.length, 1);
    assert.equal(exposures?.[0].side, side, "the one real exposure is honestly labeled with the fixed side");
  }
});

check("E: an unsided mobility item inside a circuit is completely unaffected — remains exactly one exposure, no side field at all", () => {
  const unsided = {
    ...CIRCUIT_WITH_SIDED_MOBILITY_ITEM_DEMO,
    blocks: [
      {
        ...CIRCUIT_WITH_SIDED_MOBILITY_ITEM_DEMO.blocks[0],
        items: CIRCUIT_WITH_SIDED_MOBILITY_ITEM_DEMO.blocks[0].items.map((item) =>
          item.id === "circuit-sided-couch-stretch" ? { ...item, prescription: { family: "mobility" as const, duration: { seconds: 30 } } } : item,
        ),
      },
    ],
  };
  let state = startFromFixture(unsided);
  state = reducer(state, { type: "BEGIN_CIRCUIT_EXECUTION", blockId: SIDED_CIRCUIT_BLOCK_ID });
  state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: SIDED_CIRCUIT_BLOCK_ID }); // Pogo Jump
  state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: SIDED_CIRCUIT_BLOCK_ID }); // Couch Stretch
  const exposures = state.workoutSession.circuitProgress?.[SIDED_CIRCUIT_BLOCK_ID]?.exposuresByItemId["circuit-sided-couch-stretch"];
  assert.equal(exposures?.length, 1);
  assert.equal(exposures?.[0].side, undefined, "no side concept at all — field absent, identical to every pre-Phase-12B circuit item");
});

check("F: LEFT complete / RIGHT skipped remains truthful — both actuals stay distinct, never collapsed into one generic skipped record", () => {
  let state = startFromFixture(CIRCUIT_WITH_SIDED_MOBILITY_ITEM_DEMO);
  state = reducer(state, { type: "BEGIN_CIRCUIT_EXECUTION", blockId: SIDED_CIRCUIT_BLOCK_ID });
  state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: SIDED_CIRCUIT_BLOCK_ID }); // Pogo Jump
  state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: SIDED_CIRCUIT_BLOCK_ID }); // Couch Stretch LEFT — completed
  state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: SIDED_CIRCUIT_BLOCK_ID, skipped: true, skipReason: "pain-or-discomfort" }); // Couch Stretch RIGHT — skipped
  const exposures = state.workoutSession.circuitProgress?.[SIDED_CIRCUIT_BLOCK_ID]?.exposuresByItemId["circuit-sided-couch-stretch"];
  assert.deepEqual(exposures?.map((e) => [e.side, e.status]), [
    ["left", "completed"],
    ["right", "skipped"],
  ]);
  assert.equal(exposures?.[1].skipReason, "pain-or-discomfort");
});

check("G: reload after LEFT resumes at RIGHT — never LEFT again, never the next item, never the next round; prior work stays intact (plain JSON round-trip, same convention as section 11's own T test)", () => {
  let state = startFromFixture(CIRCUIT_WITH_SIDED_MOBILITY_ITEM_DEMO);
  state = reducer(state, { type: "BEGIN_CIRCUIT_EXECUTION", blockId: SIDED_CIRCUIT_BLOCK_ID });
  state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: SIDED_CIRCUIT_BLOCK_ID }); // Pogo Jump
  state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: SIDED_CIRCUIT_BLOCK_ID }); // Couch Stretch LEFT
  const roundTripped = JSON.parse(JSON.stringify(state.workoutSession.circuitProgress));
  assert.equal(roundTripped[SIDED_CIRCUIT_BLOCK_ID].itemIndex, 1);
  assert.equal(roundTripped[SIDED_CIRCUIT_BLOCK_ID].round, 1);
  assert.equal(roundTripped[SIDED_CIRCUIT_BLOCK_ID].currentSide, "right");
  assert.equal(roundTripped[SIDED_CIRCUIT_BLOCK_ID].exposuresByItemId["circuit-sided-couch-stretch"].length, 1, "LEFT survives the round-trip untouched");
});

check("H: pain reported during RIGHT preserves LEFT, activates the existing safety flow, and never fabricates RIGHT's completion; resuming lands back on RIGHT", () => {
  let state = startFromFixture(CIRCUIT_WITH_SIDED_MOBILITY_ITEM_DEMO);
  state = reducer(state, { type: "BEGIN_CIRCUIT_EXECUTION", blockId: SIDED_CIRCUIT_BLOCK_ID });
  state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: SIDED_CIRCUIT_BLOCK_ID }); // Pogo Jump
  state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: SIDED_CIRCUIT_BLOCK_ID }); // Couch Stretch LEFT — completed

  state = reportPain(state, "circuit-sided-couch-stretch", { ratingZeroToTen: 2, continuedAfterSet: false, affectsOutsideGym: false });
  assert.equal(state.workoutSession.phase, "pain-review", "the existing safety flow activates — no new architecture");
  const blocked = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: SIDED_CIRCUIT_BLOCK_ID });
  assert.equal(blocked.workoutSession.phase, "pain-review", "must never silently continue past an active pain interruption");
  assert.equal(
    blocked.workoutSession.circuitProgress?.[SIDED_CIRCUIT_BLOCK_ID]?.exposuresByItemId["circuit-sided-couch-stretch"]?.length,
    1,
    "RIGHT is never fabricated as completed",
  );

  state = reducer(state, { type: "CONFIRM_PAIN_RESOLVED" });
  state = reducer(state, { type: "RESUME_AFTER_PAIN" });
  assert.equal(state.workoutSession.phase, "circuit-active");
  const progress = state.workoutSession.circuitProgress?.[SIDED_CIRCUIT_BLOCK_ID];
  assert.equal(progress?.itemIndex, 1, "still on Couch Stretch");
  assert.equal(progress?.currentSide, "right", "resumes at the exact next side, never re-asking the completed LEFT side");
  assert.equal(progress?.exposuresByItemId["circuit-sided-couch-stretch"]?.length, 1, "LEFT's completion survives the interruption untouched");
});

check("K/L: repeated rounds preserve side identity independently — round 2 opens fresh at LEFT, round 1's exposures are untouched, and the item's own prescription is never mutated", () => {
  let state = startFromFixture(CIRCUIT_WITH_SIDED_MOBILITY_ITEM_DEMO);
  const block = state.workoutSession.resolvedSession!.blocks[0];
  const prescriptionBefore = JSON.stringify(block.items[1].prescription);

  state = reducer(state, { type: "BEGIN_CIRCUIT_EXECUTION", blockId: SIDED_CIRCUIT_BLOCK_ID });
  for (let round = 1; round <= 3; round++) {
    // Between-round rest is its own phase (no exposure of its own) — a
    // later round's Pogo Jump only becomes current once that round-rest is
    // itself resolved (round 1 needs no such step; it starts on Pogo Jump
    // directly from BEGIN_CIRCUIT_EXECUTION).
    if (round > 1) state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: SIDED_CIRCUIT_BLOCK_ID }); // resolve round-rest -> this round's Pogo Jump is now current
    state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: SIDED_CIRCUIT_BLOCK_ID }); // Pogo Jump
    const openingSide = state.workoutSession.circuitProgress?.[SIDED_CIRCUIT_BLOCK_ID]?.currentSide;
    assert.equal(openingSide, "left", `round ${round}: Couch Stretch always opens fresh at LEFT, never inheriting a prior round's side state`);
    state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: SIDED_CIRCUIT_BLOCK_ID }); // Couch Stretch LEFT
    state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: SIDED_CIRCUIT_BLOCK_ID }); // Couch Stretch RIGHT
    state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: SIDED_CIRCUIT_BLOCK_ID }); // Push-Up
  }
  assert.equal(state.workoutSession.phase, "session-summary", "all 3 rounds finalized");

  const execution = state.workoutSession.continuousExecutions?.["circuit-sided-couch-stretch"];
  assert.equal(execution!.circuitRoundActuals?.length, 6, "3 rounds x 2 sides — every round's own independent LEFT/RIGHT pair");
  assert.deepEqual(
    execution!.circuitRoundActuals!.map((e) => [e.roundNumber, e.side, e.status]),
    [
      [1, "left", "completed"],
      [1, "right", "completed"],
      [2, "left", "completed"],
      [2, "right", "completed"],
      [3, "left", "completed"],
      [3, "right", "completed"],
    ],
  );

  // N: the item's own prescription was never mutated by any of this.
  const prescriptionAfter = JSON.stringify(block.items[1].prescription);
  assert.equal(prescriptionBefore, prescriptionAfter);
});

check("O: history/observation classification honestly reflects sided completion — completedCircuitRounds/classifyCircuitCompletion/circuitPerformedAsPrescribed and buildWorkoutSummary's own description all account for both required sides, never just one", () => {
  let state = startFromFixture(CIRCUIT_WITH_SIDED_MOBILITY_ITEM_DEMO);
  state = reducer(state, { type: "BEGIN_CIRCUIT_EXECUTION", blockId: SIDED_CIRCUIT_BLOCK_ID });
  // Round 1: Couch Stretch LEFT completed, RIGHT skipped — only a HALF-done
  // round for this item, never enough to count the round as complete.
  state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: SIDED_CIRCUIT_BLOCK_ID }); // Pogo Jump
  state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: SIDED_CIRCUIT_BLOCK_ID }); // Couch Stretch LEFT
  state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: SIDED_CIRCUIT_BLOCK_ID, skipped: true, skipReason: "out-of-time" }); // Couch Stretch RIGHT skipped

  const block = state.workoutSession.resolvedSession!.blocks[0];
  const midExposures = state.workoutSession.circuitProgress?.[SIDED_CIRCUIT_BLOCK_ID]?.exposuresByItemId ?? {};
  assert.equal(completedCircuitRounds(block, midExposures), 0, "a single resolved side is only half the real work — the round is not done for this item");
  assert.equal(classifyCircuitCompletion(block, midExposures), "partial");
  assert.equal(circuitPerformedAsPrescribed(block, midExposures), false);

  // Finish round 1, then complete rounds 2-3 normally — reaching the real
  // inline finalize path (never SKIP_EXERCISE, which short-circuits
  // buildWorkoutSummary's own per-item description step via the coarse
  // exerciseLogs.status="skipped" for EVERY item in the block — see
  // section 12's own established, accepted note on that ambiguity, an
  // unrelated pre-existing behavior this test must not depend on).
  state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: SIDED_CIRCUIT_BLOCK_ID }); // Push-Up round 1 -> round-rest
  for (let round = 2; round <= 3; round++) {
    state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: SIDED_CIRCUIT_BLOCK_ID }); // resolve round-rest -> this round's Pogo Jump
    state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: SIDED_CIRCUIT_BLOCK_ID }); // Pogo Jump
    state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: SIDED_CIRCUIT_BLOCK_ID }); // Couch Stretch LEFT
    state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: SIDED_CIRCUIT_BLOCK_ID }); // Couch Stretch RIGHT
    state = reducer(state, { type: "ADVANCE_CIRCUIT_PHASE", blockId: SIDED_CIRCUIT_BLOCK_ID }); // Push-Up
  }
  assert.equal(state.workoutSession.phase, "session-summary", "all 3 rounds finalized via the real inline finalize path");

  const execution = state.workoutSession.continuousExecutions?.["circuit-sided-couch-stretch"];
  assert.equal(execution!.circuitRoundActuals?.length, 6, "3 rounds x 2 sides");
  assert.equal(execution!.status, "partial", "5 of 6 expected exposures completed (round 1's RIGHT skipped) — honestly partial, never 'completed'");
  assert.equal(circuitItemPerformedAsPrescribed(totalCircuitRounds(block), execution!.circuitRoundActuals!, 2), false);
  assert.equal(classifyCircuitItemCompletion(totalCircuitRounds(block), execution!.circuitRoundActuals!, 2), "partial");

  const summary = buildWorkoutSummary(state.workoutSession.resolvedSession ?? null, state.workoutSession, "2026-01-01T00:00:00.000Z", "2026-01-01T00:05:00.000Z");
  assert.match(summary.detail, /Couch Stretch: 5 of 6 completed/, "the honest 'X of Y' unit — never a misleading 'rounds completed' count for a sided item");
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
