// Phase 1 — Universal Training Grammar. Pure logic tests for
// lib/production/validation.ts's new universal-grammar validators
// (validateUniversalTrainingProgramContent / validateTrainingProgramVersionContent)
// and for lib/training/types.ts's shape. No DB, no network, no UI.
//
// Section 1 proves the legacy path is byte-for-byte unaffected (zero
// behavior change). Sections 2-5 build one realistic, fully-populated
// UniversalTrainingProgramContent fixture per the Phase 0 audit's
// "four very different coaches" acceptance test (powerlifting/strength,
// fat-loss/general-fitness, endurance, hybrid/athletic) and prove each
// round-trips through the SAME validator with no niche-specific branching.
// Section 6 proves malformed payloads in each of the new validators are
// rejected with InvalidPersistedContentError, never silently cast.
//
// Run with: npm run verify:training-grammar

import assert from "node:assert/strict";
import { InvalidPersistedContentError } from "../production/errors.ts";
import {
  validateClientAssignedProgramContent,
  validateUniversalTrainingProgramContent,
  validateTrainingProgramVersionContent,
} from "../production/validation.ts";
import type { UniversalTrainingProgramContent, UniversalProgramDay, Session } from "./types.ts";

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

const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

/** Builds a 7-day week whose training days carry `sessions` on the given
 * offsets (0 = Monday) and rest days everywhere else. */
function buildWeek(weekNumber: number, sessionsByDayIndex: Record<number, Session[]>): { weekNumber: number; days: UniversalProgramDay[] } {
  return {
    weekNumber,
    days: DAYS_OF_WEEK.map((dayOfWeek, i) =>
      sessionsByDayIndex[i]
        ? { dayOfWeek, type: "training", sessions: sessionsByDayIndex[i] }
        : { dayOfWeek, type: "rest" }
    ),
  };
}

function buildProgram(overrides: Partial<UniversalTrainingProgramContent> & { weeks: UniversalTrainingProgramContent["weeks"] }): UniversalTrainingProgramContent {
  return {
    schemaVersion: 2,
    id: "program-1",
    workspaceId: "ws-1",
    clientId: "client-1",
    coachId: "coach-1",
    name: "Program",
    durationWeeks: 1,
    status: "assigned",
    createdAtIso: "2026-01-01T00:00:00.000Z",
    updatedAtIso: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Zero behavior change — the legacy (no schemaVersion) path is untouched
// ---------------------------------------------------------------------------

console.log("\n1. Legacy ClientAssignedProgram content is completely unaffected\n");

const LEGACY_WORKOUT = {
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

const LEGACY_PROGRAM = {
  id: "p1",
  workspaceId: "ws1",
  clientId: "c1",
  coachId: "coach1",
  name: "Legacy Program",
  durationWeeks: 1,
  weeks: [
    {
      weekNumber: 1,
      days: DAYS_OF_WEEK.map((dayOfWeek) =>
        dayOfWeek === "Monday" ? { dayOfWeek, type: "training", workout: LEGACY_WORKOUT } : { dayOfWeek, type: "rest" }
      ),
    },
  ],
  status: "assigned",
  createdAtIso: "2026-01-01T00:00:00.000Z",
  updatedAtIso: "2026-01-01T00:00:00.000Z",
};

check("a legacy payload with no schemaVersion still validates via validateClientAssignedProgramContent directly", () => {
  const result = validateClientAssignedProgramContent(LEGACY_PROGRAM);
  assert.equal(result.weeks[0].days[0].workout?.exercises[0].name, "Bench");
});

check("validateTrainingProgramVersionContent dispatches a schemaVersion-less payload to the legacy validator", () => {
  const result = validateTrainingProgramVersionContent(LEGACY_PROGRAM);
  assert.ok(!("schemaVersion" in result));
  assert.equal((result as typeof LEGACY_PROGRAM).id, "p1");
});

check("validateTrainingProgramVersionContent still rejects a genuinely broken legacy payload", () => {
  const { durationWeeks, ...broken } = LEGACY_PROGRAM;
  void durationWeeks;
  assert.throws(() => validateTrainingProgramVersionContent(broken), InvalidPersistedContentError);
});

// ---------------------------------------------------------------------------
// 2. CASE 1 — Powerlifting / strength (resistance family)
// ---------------------------------------------------------------------------

console.log("\n2. Acceptance case 1 — powerlifting/strength (resistance family)\n");

const STRENGTH_SESSION: Session = {
  id: "session-squat-day",
  name: "Squat Day",
  focus: "Max strength",
  estimatedDurationMin: 75,
  coachNote: "Top set, then back-offs.",
  blocks: [
    {
      id: "block-squat",
      kind: "straight",
      order: 1,
      items: [
        {
          id: "item-back-squat",
          order: 1,
          name: "Back Squat",
          category: "resistance",
          coachCue: "Brace before descent.",
          prescription: {
            family: "resistance",
            sets: 5,
            reps: { low: 5, high: 5 },
            load: { value: 315, unit: "lb", percent1rm: 0.85 },
            rpe: 8,
            restSeconds: 180,
          },
        },
      ],
    },
  ],
};

const STRENGTH_PROGRAM = buildProgram({
  id: "program-strength",
  name: "12-Week Strength Block",
  weeks: [buildWeek(1, { 0: [STRENGTH_SESSION] })],
});

check("a real powerlifting session (resistance: sets/reps/load/RPE/rest) validates cleanly", () => {
  const result = validateUniversalTrainingProgramContent(STRENGTH_PROGRAM);
  const item = result.weeks[0].days[0].sessions?.[0].blocks[0].items[0];
  assert.equal(item?.prescription.load?.value, 315);
  assert.equal(item?.prescription.rpe, 8);
});

// ---------------------------------------------------------------------------
// 3. CASE 2 — Fat-loss / general fitness (resistance + continuous mixed
//    across the week, never a special-cased "cardio" type)
// ---------------------------------------------------------------------------

console.log("\n3. Acceptance case 2 — fat-loss/general-fitness (resistance + continuous)\n");

const FULL_BODY_SESSION: Session = {
  id: "session-full-body",
  name: "Full Body",
  focus: "General strength",
  estimatedDurationMin: 50,
  blocks: [
    {
      id: "block-full-body",
      kind: "straight",
      order: 1,
      items: [
        {
          id: "item-goblet-squat",
          order: 1,
          name: "Goblet Squat",
          category: "resistance",
          prescription: { family: "resistance", sets: 3, reps: { low: 10, high: 12 }, load: { value: 35, unit: "lb" }, rpe: 7, restSeconds: 90 },
        },
      ],
    },
  ],
};

const ZONE2_SESSION: Session = {
  id: "session-zone2",
  name: "Zone 2 Walk",
  focus: "Conditioning",
  estimatedDurationMin: 30,
  blocks: [
    {
      id: "block-zone2",
      kind: "straight",
      order: 1,
      items: [
        {
          id: "item-zone2-walk",
          order: 1,
          name: "Incline Walk",
          category: "continuous",
          prescription: { family: "continuous", duration: { seconds: 1800 }, heartRate: { low: 120, high: 140, zoneLabel: "Zone 2" } },
        },
      ],
    },
  ],
};

const GENERAL_FITNESS_PROGRAM = buildProgram({
  id: "program-general-fitness",
  name: "Body Composition + General Fitness",
  weeks: [buildWeek(1, { 0: [FULL_BODY_SESSION], 1: [ZONE2_SESSION], 3: [FULL_BODY_SESSION], 4: [ZONE2_SESSION] })],
});

check("resistance and continuous sessions coexist in the same program with no special-cased cardio type", () => {
  const result = validateUniversalTrainingProgramContent(GENERAL_FITNESS_PROGRAM);
  const cardioItem = result.weeks[0].days[1].sessions?.[0].blocks[0].items[0];
  assert.equal(cardioItem?.category, "continuous");
  assert.equal(cardioItem?.prescription.heartRate?.low, 120);
  assert.equal(cardioItem?.prescription.duration?.seconds, 1800);
});

// ---------------------------------------------------------------------------
// 4. CASE 3 — Endurance coach (continuous + interval families)
// ---------------------------------------------------------------------------

console.log("\n4. Acceptance case 3 — endurance coach (continuous + interval)\n");

const EASY_RUN_SESSION: Session = {
  id: "session-easy-run",
  name: "Easy Run",
  focus: "Aerobic base",
  estimatedDurationMin: 30,
  blocks: [
    {
      id: "block-easy-run",
      kind: "straight",
      order: 1,
      items: [
        {
          id: "item-easy-run",
          order: 1,
          name: "Easy Run",
          category: "continuous",
          prescription: { family: "continuous", duration: { seconds: 1800 }, heartRate: { low: 135, high: 150 } },
        },
      ],
    },
  ],
};

const INTERVAL_SESSION: Session = {
  id: "session-intervals",
  name: "400m Repeats",
  focus: "VO2max",
  estimatedDurationMin: 40,
  blocks: [
    {
      id: "block-intervals",
      kind: "interval",
      order: 1,
      rounds: 6,
      restBetweenRoundsSeconds: 90,
      items: [
        {
          id: "item-400m",
          order: 1,
          name: "400m",
          category: "interval",
          prescription: {
            family: "interval",
            // Phase 11A — rounds lives on the Prescription itself (the real,
            // now-executed design: see lib/workout/interval.ts and spec
            // section 4's "a prescription should be capable of representing
            // round count"), not only the Block's own separate `rounds`
            // field above (block.rounds is unrelated pre-existing Phase 1
            // grammar, potentially meaningful for a future multi-item
            // circuit block repeated as a whole — not what the real
            // interval execution engine reads for a single interval item).
            rounds: 6,
            distance: { value: 400, unit: "m" },
            pace: { value: 1.6, unit: "min_per_mi" },
            workInterval: { seconds: 95 },
            recoveryInterval: { seconds: 90 },
          },
        },
      ],
    },
  ],
};

const ENDURANCE_PROGRAM = buildProgram({
  id: "program-endurance",
  name: "5K Build",
  weeks: [buildWeek(1, { 0: [EASY_RUN_SESSION], 2: [INTERVAL_SESSION] })],
});

check("a 30-minute Zone 2-style continuous run validates with duration + heart-rate range, no reps/load anywhere", () => {
  const result = validateUniversalTrainingProgramContent(ENDURANCE_PROGRAM);
  const item = result.weeks[0].days[0].sessions?.[0].blocks[0].items[0];
  assert.equal(item?.prescription.duration?.seconds, 1800);
  assert.equal(item?.prescription.reps, undefined);
});

check("6x400m intervals validate with the real round count/pace/distance/work-recovery on the Prescription itself", () => {
  const result = validateUniversalTrainingProgramContent(ENDURANCE_PROGRAM);
  const block = result.weeks[0].days[2].sessions?.[0].blocks[0];
  assert.equal(block?.items[0].prescription.rounds, 6);
  assert.equal(block?.items[0].prescription.distance?.value, 400);
  assert.equal(block?.items[0].prescription.workInterval?.seconds, 95);
});

// ---------------------------------------------------------------------------
// 5. CASE 4 — Hybrid/athletic coach: one session, five different blocks,
//    five different families, in the coach's programmed order.
// ---------------------------------------------------------------------------

console.log("\n5. Acceptance case 4 — hybrid/athletic (one session, five modalities)\n");

const HYBRID_SESSION: Session = {
  id: "session-hybrid",
  name: "Athletic Performance",
  focus: "Power + conditioning",
  estimatedDurationMin: 90,
  blocks: [
    {
      id: "block-warmup",
      kind: "warmup",
      order: 1,
      items: [
        {
          id: "item-dynamic-warmup",
          order: 1,
          name: "Dynamic Warm-up Flow",
          category: "quality",
          prescription: { family: "quality", duration: { seconds: 480 }, completionTarget: "Full flow, both sides" },
        },
      ],
    },
    {
      id: "block-plyo",
      kind: "straight",
      order: 2,
      items: [
        {
          id: "item-box-jump",
          order: 1,
          name: "Box Jump",
          category: "quality",
          prescription: { family: "quality", sets: 4, reps: { low: 3, high: 3 }, completionTarget: "Land silently" },
        },
      ],
    },
    {
      id: "block-strength",
      kind: "straight",
      order: 3,
      items: [
        {
          id: "item-trap-bar-deadlift",
          order: 1,
          name: "Trap Bar Deadlift",
          category: "resistance",
          prescription: { family: "resistance", sets: 4, reps: { low: 3, high: 3 }, load: { value: 275, unit: "lb" }, rpe: 8, restSeconds: 150 },
        },
      ],
    },
    {
      id: "block-conditioning",
      kind: "circuit",
      order: 4,
      rounds: 5,
      restBetweenRoundsSeconds: 60,
      timeCapSeconds: 1200,
      items: [
        {
          id: "item-kb-swing",
          order: 1,
          name: "Kettlebell Swing",
          category: "circuit",
          prescription: { family: "circuit", reps: { low: 15, high: 15 } },
        },
        {
          id: "item-assault-bike",
          order: 2,
          name: "Assault Bike",
          category: "circuit",
          prescription: { family: "circuit", workInterval: { seconds: 30 } },
        },
      ],
    },
    {
      id: "block-mobility",
      kind: "cooldown",
      order: 5,
      items: [
        {
          id: "item-couch-stretch",
          order: 1,
          name: "Couch Stretch",
          category: "quality",
          prescription: { family: "quality", duration: { seconds: 60 }, side: "alternating" },
        },
      ],
    },
  ],
};

const HYBRID_PROGRAM = buildProgram({
  id: "program-hybrid",
  name: "Hybrid Athletic Performance",
  weeks: [buildWeek(1, { 0: [HYBRID_SESSION] })],
});

check("one hybrid session carries warmup -> plyo -> strength -> circuit -> mobility as five ordered, differently-shaped blocks", () => {
  const result = validateUniversalTrainingProgramContent(HYBRID_PROGRAM);
  const blocks = result.weeks[0].days[0].sessions?.[0].blocks ?? [];
  assert.deepEqual(
    blocks.map((b) => b.kind),
    ["warmup", "straight", "straight", "circuit", "cooldown"]
  );
  assert.equal(blocks[3].items.length, 2, "the circuit block carries two distinct items sharing one round structure");
  assert.equal(blocks[3].rounds, 5);
});

check("the same validator handled all four coach personas with no niche-specific branch (round-trip identity)", () => {
  for (const program of [STRENGTH_PROGRAM, GENERAL_FITNESS_PROGRAM, ENDURANCE_PROGRAM, HYBRID_PROGRAM]) {
    const result = validateUniversalTrainingProgramContent(program);
    assert.equal(result.schemaVersion, 2);
  }
});

// ---------------------------------------------------------------------------
// 6. Rejections — malformed payloads throw InvalidPersistedContentError,
//    never silently cast (mirrors the existing production-validation suite's
//    own discipline for the legacy shape).
// ---------------------------------------------------------------------------

console.log("\n6. Malformed universal-grammar payloads are rejected, never cast\n");

check("rejects a payload with the wrong schemaVersion", () => {
  const broken = { ...STRENGTH_PROGRAM, schemaVersion: 1 };
  assert.throws(() => validateUniversalTrainingProgramContent(broken), InvalidPersistedContentError);
});

check("rejects a prescription with an unknown family", () => {
  const broken = structuredClone(STRENGTH_PROGRAM);
  // @ts-expect-error deliberately invalid for the test
  broken.weeks[0].days[0].sessions[0].blocks[0].items[0].prescription.family = "not-a-real-family";
  assert.throws(() => validateUniversalTrainingProgramContent(broken), InvalidPersistedContentError);
});

check("rejects a training day with an empty sessions array", () => {
  const broken = structuredClone(STRENGTH_PROGRAM);
  broken.weeks[0].days[0].sessions = [];
  assert.throws(() => validateUniversalTrainingProgramContent(broken), InvalidPersistedContentError);
});

check("rejects a week with fewer than 7 days", () => {
  const broken = { ...STRENGTH_PROGRAM, weeks: [{ weekNumber: 1, days: [{ dayOfWeek: "Monday", type: "rest" }] }] };
  assert.throws(() => validateUniversalTrainingProgramContent(broken), InvalidPersistedContentError);
});

check("rejects a block with zero items", () => {
  const broken = structuredClone(STRENGTH_PROGRAM);
  broken.weeks[0].days[0].sessions![0].blocks[0].items = [];
  assert.throws(() => validateUniversalTrainingProgramContent(broken), InvalidPersistedContentError);
});

check("rejects a load with an unrecognized unit", () => {
  const broken = structuredClone(STRENGTH_PROGRAM);
  // @ts-expect-error deliberately invalid for the test
  broken.weeks[0].days[0].sessions[0].blocks[0].items[0].prescription.load.unit = "stone";
  assert.throws(() => validateUniversalTrainingProgramContent(broken), InvalidPersistedContentError);
});

check("rejects a session with no blocks", () => {
  const broken = structuredClone(STRENGTH_PROGRAM);
  broken.weeks[0].days[0].sessions![0].blocks = [];
  assert.throws(() => validateUniversalTrainingProgramContent(broken), InvalidPersistedContentError);
});

check("rejects a top-level payload that isn't an object", () => {
  assert.throws(() => validateUniversalTrainingProgramContent("not an object"), InvalidPersistedContentError);
});

check("validateTrainingProgramVersionContent dispatches schemaVersion: 2 to the universal validator and still rejects malformed content", () => {
  const broken = { ...STRENGTH_PROGRAM, weeks: [] };
  const result = validateTrainingProgramVersionContent(STRENGTH_PROGRAM);
  assert.equal((result as UniversalTrainingProgramContent).schemaVersion, 2);
  // an empty weeks array is structurally valid (no week-count invariant on
  // the top level) — assert the dispatcher still reaches the family-level
  // rejection instead, proving it's really running the universal validator
  // and not silently falling through to the legacy one.
  void broken;
  const brokenFamily = structuredClone(STRENGTH_PROGRAM);
  // @ts-expect-error deliberately invalid for the test
  brokenFamily.weeks[0].days[0].sessions[0].blocks[0].items[0].prescription.family = "invalid";
  assert.throws(() => validateTrainingProgramVersionContent(brokenFamily), InvalidPersistedContentError);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
