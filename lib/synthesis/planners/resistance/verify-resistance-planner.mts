// Gate 4.0C-2 — resistance planner test matrix (A–L + guards). Pure: real
// Fitness Knowledge, real calibration question bank, real ConstraintSet
// derivation. No database, no model.

import assert from "node:assert/strict";
import { answerAllRequired } from "../../../coach/calibration/fixtures.ts";
import { buildMethodFromCalibration, type ConfirmedCoachMethod } from "../../../coach/coach-brain.ts";
import type { HealthReviewRecord, OnboardingProgress } from "../../../coach/types.ts";
import { deriveClientState } from "../../client-state.ts";
import type { CoachStructuredRestriction, ConstraintTag } from "../../constraints.ts";
import { FOUNDATION_KNOWLEDGE as K } from "../../knowledge/registry.ts";
import type { MovementPatternId } from "../../knowledge/taxonomy.ts";
import type { PlanSpecification } from "../../plan-spec.ts";
import { runPlanner, type PlannerRun } from "../../planner.ts";
import { buildSynthesisInput } from "../../synthesis-input.ts";
import { explainResistancePlan } from "./explain.ts";
import { RESISTANCE_PLANNER } from "./planner.ts";

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

const NOW = "2026-10-02T12:00:00.000Z";
const WS = "ws-1";
const r = (min: number, max: number, unit: string) => ({ min, max, unit });
const layer = (base: unknown, extra: Record<string, unknown> = {}) => ({ base, varies: "no", ...extra });

/** A confirmed v2 method with explicit resistance answers (fixture values, not recommendations). */
function method(over: Record<string, unknown> = {}): ConfirmedCoachMethod {
  const built = buildMethodFromCalibration({
    answers: answerAllRequired({ coaching_areas: ["strength"], strength_specialties: ["general_strength"], experience_levels: ["intermediate"], client_modifiers: ["none"], nutrition_scope: "full", practice_goals: ["get_stronger", "build_muscle"] }),
    aiAuthority: { level: "advisor", domainOverrides: {} },
    aiAuthorityConfirmed: true,
    coachUserId: "coach-a",
    workspaceId: WS,
    businessName: "OPTIM",
    methodVersion: 4,
    nowIso: NOW,
  });
  const om = structuredClone(built.operatingModel);
  const a = om.calibration!.answers as Record<string, unknown>;
  Object.assign(a, {
    t_days: layer(r(3, 5, "days/week")),
    t_session_length: r(45, 75, "min"),
    t_splits: layer(["full_body", "upper_lower", "push_pull_legs"]),
    t_sets: layer(r(2, 4, "sets"), { varies: "exercise_type", exceptions: { main: r(3, 4, "sets"), accessory: r(2, 3, "sets") } }),
    t_reps: layer(r(5, 15, "reps")),
    t_effort_metric: ["rir"],
    t_effort_rir: layer(r(1, 3, "reps in reserve")),
    t_progression_method: layer(["double_progression"]),
    t_long_term_structure: layer("linear_phases"),
    t_deload_approach: "fixed",
    t_deload_every: r(4, 5, "weeks"),
    t_rest_periods: layer(r(1, 3, "min")),
    program_length: layer(r(8, 12, "weeks")),
    t_warmup: "minimal",
    t_exercises_avoided: [],
  });
  delete a.t_effort_plain;
  delete a.t_deload_triggers;
  for (const [k, v] of Object.entries(over)) {
    if (v === undefined) delete a[k];
    else a[k] = v;
  }
  return { versionId: "mv-4", version: 4, source: "calibration", confirmedAtIso: NOW, operatingModel: om, aiAuthority: built.aiAuthority };
}

const BASE_ANSWERS = {
  about_you: { age: 30, sex: "female", heightFeet: 5, heightInchesRemainder: 6, weightLb: 150, weightDirection: "stable" },
  your_week: { availableDays: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], maxSessionLength: "75", trainingEnvironment: ["commercial_gym"] },
  starting_point: { trainingExperience: "comfortable_common", recentConsistency: "very_consistent", weeklyFrequency: 4 },
  fuel_recovery: { typicalSleep: "7_8", hasDietaryRestrictions: "none" },
  what_you_want: { primaryGoal: "build_muscle", secondaryGoals: [] },
  health_finish: { hasInjuryHistory: false, safetyScreen: ["none"] },
};
type Patch = Record<string, Record<string, unknown>>;
const answers = (patch: Patch = {}) => {
  const out = structuredClone(BASE_ANSWERS) as Record<string, Record<string, unknown>>;
  for (const [s, v] of Object.entries(patch)) out[s] = { ...(out[s] ?? {}), ...v };
  return out;
};
function run(opts: { patch?: Patch; coach?: ConfirmedCoachMethod | null; review?: HealthReviewRecord | null; restrictions?: CoachStructuredRestriction[]; client?: string } = {}): PlannerRun {
  const id = opts.client ?? "client-1";
  const onboarding = { clientId: id, workspaceId: WS, currentStepIndex: 6, answers: answers(opts.patch), completedAtIso: NOW, updatedAtIso: NOW } as unknown as OnboardingProgress;
  const client = deriveClientState({ clientProfileId: id, workspaceId: WS, onboarding, healthReview: opts.review ?? null });
  const input = buildSynthesisInput({ knowledge: K, coachMethod: opts.coach === undefined ? method() : opts.coach, client, coachStructuredRestrictions: opts.restrictions });
  return runPlanner(RESISTANCE_PLANNER, input, { nowIso: NOW });
}
const planned = (x: PlannerRun): PlanSpecification => {
  assert.equal(x.status, "PLANNED", x.status === "NEEDS_INPUT" ? x.missing.map((m) => m.fact).join(", ") : x.status === "INVALID" ? x.errors.join("; ") : "");
  return (x as { spec: PlanSpecification }).spec;
};
const exercisesOf = (s: PlanSpecification) => s.resistance!.value.sessions.flatMap((x) => x.exercises.map((e) => K.getExercise(e.exerciseId)!));
const restrict = (tags: ConstraintTag[], id = "r1"): CoachStructuredRestriction[] => [{ id, interprets: [], description: "test restriction", tags, ref: "test" }];
const avoidPatterns = (...p: MovementPatternId[]): ConstraintTag[] => p.map((pattern) => ({ kind: "avoid_movement_pattern", pattern }));

console.log("\nGate 4.0C-2 — resistance planner\n");

check("A. 7 available days do not become 7 sessions", () => {
  const s = planned(run({ coach: method({ t_days: layer(r(3, 7, "days/week")) }) }));
  assert.ok(s.frequency.value < 7, `chose ${s.frequency.value}`);
  assert.equal(s.frequency.value, 4, "intermediate band 3–4 + current habit 4");
  assert.match(s.frequency.rationale, /ceiling/);
  assert.equal(new Set(s.schedule.value).size, s.frequency.value);
  // Availability alone never raises frequency: same client, 7 vs 5 available days → same count.
  const five = planned(run({ coach: method({ t_days: layer(r(3, 7, "days/week")) }), patch: { your_week: { availableDays: ["mon", "tue", "wed", "thu", "fri"] } } }));
  assert.equal(five.frequency.value, s.frequency.value);
});

check("B. 3 available days → plan fits those 3 days, or NEEDS_INPUT below the coach minimum", () => {
  const s = planned(run({ patch: { your_week: { availableDays: ["mon", "wed", "fri"] } } }));
  assert.equal(s.frequency.value, 3);
  assert.deepEqual(s.schedule.value, ["Monday", "Wednesday", "Friday"]);
  const below = run({ coach: method({ t_days: layer(r(4, 5, "days/week")) }), patch: { your_week: { availableDays: ["mon", "wed", "fri"] } } });
  assert.equal(below.status, "NEEDS_INPUT");
  assert.ok(below.status === "NEEDS_INPUT" && below.missing.some((m) => m.fact === "frequency.coach_minimum_vs_availability" && m.providedBy === "coach"));
});

check("C. Hard avoid-squat → no squat-pattern exercise survives (metadata)", () => {
  const s = planned(run({ restrictions: restrict(avoidPatterns("squat")) }));
  const ex = exercisesOf(s);
  assert.ok(ex.every((e) => !e.patterns.includes("squat")));
  const how = s.constraintsApplied.find((c) => c.constraintId.endsWith(":coach_structured:r1"))!.how;
  assert.match(how, /exercise\.leg_press/, "Leg Press is excluded by pattern although its name has no 'squat'");
});

check("D. High-bracing restriction → high-bracing exercises excluded", () => {
  const s = planned(run({ restrictions: restrict([{ kind: "avoid_demand", demand: "bracing", atOrAbove: "high" }]) }));
  assert.ok(exercisesOf(s).every((e) => e.demands.bracing !== "high"));
  const unrestricted = planned(run({ patch: { what_you_want: { primaryGoal: "get_stronger" } } }));
  assert.ok(exercisesOf(unrestricted).some((e) => e.demands.bracing === "high"), "control: unrestricted strength plan does use high-bracing lifts");
});

check("E. Limited equipment → only compatible exercises", () => {
  const x = run({ patch: { your_week: { trainingEnvironment: ["limited_equipment"] } } });
  if (x.status === "PLANNED") {
    assert.ok(exercisesOf(x.spec).every((e) => ["bodyweight", "bands"].includes(e.equipment) && e.apparatus.length === 0));
  } else {
    assert.equal(x.status, "NEEDS_INPUT");
  }
  const home = planned(run({ patch: { your_week: { trainingEnvironment: ["home_gym"] } } }));
  assert.ok(exercisesOf(home).every((e) => ["dumbbell", "bodyweight", "bands", "kettlebell"].includes(e.equipment)));
});

check("F. Unknown critical apparatus → no silent assumption", () => {
  const home = planned(run({ patch: { your_week: { trainingEnvironment: ["home_gym"] } } }));
  assert.ok(exercisesOf(home).every((e) => e.apparatus.length === 0), "home gym: bench/bar unknown → not used");
  assert.ok(home.unresolved.some((u) => u.fact === "client.apparatus.bench"));
  // When only apparatus exercises could fill a session, the planner asks instead of assuming.
  const x = run({ coach: method({ t_splits: layer(["push_pull_legs"]) }), patch: { your_week: { trainingEnvironment: ["limited_equipment"], availableDays: ["mon", "wed", "fri"] } } });
  assert.equal(x.status, "NEEDS_INPUT");
  assert.ok(x.status === "NEEDS_INPUT" && x.missing.some((m) => m.fact === "client.apparatus.pull_up_bar" && m.providedBy === "client"));
  // A full gym's baseline is recorded as an assumption, never silent.
  const gym = planned(run());
  assert.ok(gym.assumptions.some((a) => /bench is assumed available/.test(a.statement)));
});

const hyp = () => planned(run({ patch: { what_you_want: { primaryGoal: "build_muscle", secondaryGoals: [] } } }));
const str = () => planned(run({ patch: { what_you_want: { primaryGoal: "get_stronger", secondaryGoals: [] } } }));

check("G. Hypertrophy goal → architecture reflects hypertrophy", () => {
  const s = hyp();
  const r1 = s.resistance!.value;
  assert.equal(r1.emphasis.primary, "hypertrophy");
  assert.ok(r1.sessions.every((x) => x.exercises.filter((e) => e.role === "main").length <= 1), "one main lift per session");
  const acc = r1.weeks[0].sessions.flat().filter((_, i) => r1.sessions.flatMap((x) => x.exercises)[i].role === "accessory");
  assert.ok(acc.every((p) => p.sets === 3), "accessories at the top of the coach's 2–3 range");
  assert.match(s.weeklyStructure.rationale, /≥2×\/week/, "split chosen for per-muscle frequency");
  assert.ok(s.intensity!.inputs.includes("knowledge:concept.resistance.repetition_range#reps.acsm_hypertrophy"));
});

check("H. Strength goal → architecture materially differs", () => {
  const h = hyp().resistance!.value;
  const s = str().resistance!.value;
  assert.equal(s.emphasis.primary, "strength");
  const mains = (x: typeof s) => x.sessions.map((q) => q.exercises.filter((e) => e.role === "main").length);
  assert.ok(Math.max(...mains(s)) === 2 && Math.max(...mains(h)) === 1, "strength gets two main lifts per session");
  const mainReps = (x: typeof s) => x.weeks[0].sessions.flatMap((ps, si) => ps.filter((_, xi) => x.sessions[si].exercises[xi].role === "main").map((p) => p.reps.max));
  assert.ok(mainReps(s).every((m) => m <= 6), "strength main lifts in the heavy zone (coach 5–15 ∩ 1–6)");
  assert.ok(mainReps(h).every((m) => m > 6), "hypertrophy main lifts in the 6–12 zone");
  const ids = (x: typeof s) => x.sessions.flatMap((q) => q.exercises.map((e) => e.exerciseId)).join();
  assert.notEqual(ids(s), ids(h), "exercise selection differs");
});

check("I. Repeated exercises need a reason; no library-order repeats", () => {
  for (const s of [hyp(), str(), planned(run({ coach: method({ t_days: layer(r(5, 6, "days/week")) }), patch: { starting_point: { weeklyFrequency: 6, trainingExperience: "experienced_consistent" } } }))]) {
    const seen = new Map<string, number>();
    for (const sess of s.resistance!.value.sessions) {
      for (const x of sess.exercises) {
        if (seen.has(x.exerciseId)) assert.match(x.selection.repeatedReason ?? "", /practised in two|every eligible exercise/, `${x.exerciseId} repeated without a planning reason: ${x.selection.repeatedReason ?? "none"}`);
        seen.set(x.exerciseId, (seen.get(x.exerciseId) ?? 0) + 1);
      }
    }
    assert.ok((seen.get("exercise.dumbbell_bicep_curl") ?? 0) <= 1, "Dumbbell Bicep Curl isn't the default curl every session");
  }
});

check("J. Progression follows the coach's method, not blind cloning", () => {
  const s = hyp();
  const w = s.resistance!.value.weeks;
  assert.equal(w.length, s.durationWeeks!.value);
  const build = w.filter((x) => x.kind === "build");
  assert.notDeepEqual(build[0].sessions, build[build.length - 1].sessions, "linear phases: zones move across the program");
  assert.ok(build[0].sessions[0][0].reps.min > build[build.length - 1].sessions[0][0].reps.min, "foundation (higher reps) → peak (lower reps)");
  const deloads = w.filter((x) => x.kind === "deload");
  assert.ok(deloads.length > 0 && deloads.every((d) => d.week % 4 === 0 || d.week % 5 === 0), "coach's fixed 4–5 week deloads");
  assert.ok(deloads.every((d) => d.sessions.flat().every((p) => p.effort.target === 3)), "deload at the easiest end of the coach's RIR");
  assert.ok(s.unresolved.some((u) => u.fact === "coach_brain.deload_magnitude"), "deload size isn't invented");
  // A load-progression coach with no phase structure: identical targets are explicit, not silent.
  const flat = planned(run({ coach: method({ t_long_term_structure: undefined, t_progression_method: layer(["add_load_when_reps_hit"]), t_deload_approach: "as_needed", t_deload_every: undefined }) }));
  assert.ok(flat.quality!.some((q) => q.code === "weeks_identical_by_design" && /Add load once every set/.test(q.message)));
  assert.ok(flat.resistance!.value.weeks.every((x) => x.kind === "build"), "as-needed deloads aren't scheduled");
  // Undulating coach: consecutive weeks differ.
  const und = planned(run({ coach: method({ t_long_term_structure: layer("undulating") }) })).resistance!.value.weeks;
  assert.notDeepEqual(und[0].sessions, und[1].sessions);
});

check("K. Impossible constraints / schedule → NEEDS_INPUT, not a degraded plan", () => {
  const lowerGone = avoidPatterns("squat", "hinge", "single_leg", "hip_thrust", "knee_extension", "knee_flexion", "calf_raise", "hip_abduction", "hip_adduction", "jump", "carry", "trunk_flexion", "trunk_rotation", "anti_extension", "anti_rotation", "anti_lateral_flexion");
  const x = run({ coach: method({ t_splits: layer(["upper_lower", "push_pull_legs"]) }), restrictions: restrict(lowerGone) });
  assert.equal(x.status, "NEEDS_INPUT");
  assert.ok(x.status === "NEEDS_INPUT" && x.missing.some((m) => m.fact === "coach_decision.split_for_constraints" && m.providedBy === "coach"));
  const tooShort = run({ patch: { your_week: { maxSessionLength: "30" } } });
  assert.ok(tooShort.status === "NEEDS_INPUT" && tooShort.missing.some((m) => m.fact === "coach_decision.session_length_below_minimum"));
});

check("L. Every major decision names its real inputs", () => {
  const s = hyp();
  for (const k of ["frequency", "schedule", "weeklyStructure", "durationWeeks", "volume", "intensity", "progression", "recovery"] as const) {
    const d = s[k]!;
    assert.ok(d.rule && d.rationale && d.inputs.length > 0, `${k} provenance`);
  }
  assert.ok(s.frequency.inputs.includes("coach:t_days.base") && s.frequency.inputs.includes("client:onboarding.your_week.availableDays"));
  assert.ok(s.frequency.inputs.includes("knowledge:concept.resistance.training_frequency#frequency.acsm_by_status"));
  assert.ok(s.weeklyStructure.inputs.some((i) => i.startsWith("coach:t_splits")));
  assert.ok(s.volume!.inputs.includes("coach:t_sets.exceptions.main") && s.volume!.inputs.includes("coach:t_sets.exceptions.accessory"));
  assert.ok(s.progression!.inputs.includes("coach:t_progression_method.base"));
  assert.deepEqual(s.provenance.coachBrain, { versionId: "mv-4", version: 4 });
  assert.equal(s.provenance.model, null);
  for (const x of s.resistance!.value.sessions.flatMap((q) => q.exercises)) {
    assert.ok(x.selection.factors.length > 0, `${x.exerciseId} selection factors`);
    assert.ok(s.provenance.knowledge.entries.some((e) => e.entryId === x.exerciseId), `${x.exerciseId} in knowledge provenance`);
  }
  const why = explainResistancePlan(s, K);
  assert.ok(why.coachRules.length >= 6 && why.clientFacts.length >= 3);
  assert.ok(!/closest alignment|best match|optimal/i.test(JSON.stringify(why)), "no ranking language");
});

check("Guard: coach free-text limitation without structure → NEEDS_INPUT (no name matching)", () => {
  const review = { clientId: "client-1", workspaceId: WS, status: "proceed_with_limitations", reasons: ["x"], createdAtIso: NOW, updatedAtIso: NOW, documentedLimitations: "No squats or deadlifts." } as HealthReviewRecord;
  const injured = { health_finish: { hasInjuryHistory: true, injuryBodyAreas: ["lower_back"], injuryRestrictions: "Squats.", safetyScreen: ["none"] } };
  const x = run({ patch: injured, review });
  assert.ok(x.status === "NEEDS_INPUT" && x.missing.some((m) => /coach_documented_limitation\.structured_restriction/.test(m.fact) && m.providedBy === "coach"));
  // The coach's structured translation unblocks it, and drives selection by metadata.
  const s = planned(run({ patch: injured, review, restrictions: [{ id: "t", interprets: ["client-1:coach_documented_limitation"], description: "no squat/hinge", tags: avoidPatterns("squat", "hinge"), ref: "coach" }] }));
  assert.ok(exercisesOf(s).every((e) => !e.patterns.includes("squat") && !e.patterns.includes("hinge")));
  assert.ok(s.constraintsApplied.some((c) => /expressed by client-1:coach_structured:t/.test(c.how)));
});

check("Guard: v1-only coach method and no method → NEEDS_INPUT", () => {
  const v1 = method();
  delete (v1.operatingModel as { calibration?: unknown }).calibration;
  const x = run({ coach: v1 });
  assert.ok(x.status === "NEEDS_INPUT" && x.missing.some((m) => m.fact.startsWith("coach_brain.calibration.schema")));
  const none = run({ coach: null });
  assert.ok(none.status === "NEEDS_INPUT" && none.missing.some((m) => m.fact === "coach_brain.confirmed_method"));
});

check("Guard: coach-avoided exercises resolve by exact name/alias only", () => {
  const s = planned(run({ coach: method({ t_exercises_avoided: ["Leg Press"] }), patch: { what_you_want: { primaryGoal: "get_stronger" } } }));
  assert.ok(!exercisesOf(s).some((e) => e.id === "exercise.leg_press"));
});

check("Guard: deterministic", () => {
  assert.equal(JSON.stringify(hyp()), JSON.stringify(hyp()));
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
