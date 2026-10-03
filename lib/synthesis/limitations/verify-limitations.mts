// Gate 4.0C-2A — structured client constraint bridge: coach words →
// proposal → coach confirmation → ConstraintSet → resistance planner.
// Pure: fake model, real vocabulary/knowledge/planner. No database.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { answerAllRequired } from "../../coach/calibration/fixtures.ts";
import { buildMethodFromCalibration, type ConfirmedCoachMethod } from "../../coach/coach-brain.ts";
import type { HealthReviewRecord, OnboardingProgress } from "../../coach/types.ts";
import { deriveClientState } from "../client-state.ts";
import { deriveConstraintSet } from "../constraints.ts";
import { exerciseEligibility } from "../exercise-eligibility.ts";
import { FOUNDATION_KNOWLEDGE as K } from "../knowledge/registry.ts";
import { BODY_POSITIONS, DEMANDS, EQUIPMENT, LEVELS, MOVEMENT_PATTERNS } from "../knowledge/taxonomy.ts";
import type { PlanSpecification } from "../plan-spec.ts";
import { runPlanner, type PlannerRun } from "../planner.ts";
import { RESISTANCE_PLANNER } from "../planners/resistance/planner.ts";
import { buildSynthesisInput } from "../synthesis-input.ts";
import { buildConfirmation, parseStoredLimitations, type StoredStructuredLimitations } from "./confirm.ts";
import { interpretLimitationText, manualProposal, parseInterpretation, type StructuredJsonModel } from "./interpret.ts";
import { allRestrictionOptions, RESTRICTION_OPTIONS } from "./vocabulary.ts";

let passed = 0;
let failed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
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
const COACH_TEXT = "No squats, or lower body compounds like leg press, RDLs, or single leg pushing motions. No movements that need hard bracing. No ab workouts.";
const r = (min: number, max: number, unit: string) => ({ min, max, unit });
const layer = (base: unknown, extra: Record<string, unknown> = {}) => ({ base, varies: "no", ...extra });

function method(): ConfirmedCoachMethod {
  const built = buildMethodFromCalibration({
    answers: answerAllRequired({ coaching_areas: ["strength"], strength_specialties: ["general_strength"], experience_levels: ["intermediate"], client_modifiers: ["none"], nutrition_scope: "full", practice_goals: ["build_muscle"] }),
    aiAuthority: { level: "advisor", domainOverrides: {} },
    aiAuthorityConfirmed: true,
    coachUserId: "coach-a",
    workspaceId: WS,
    businessName: "OPTIM",
    methodVersion: 5,
    nowIso: NOW,
  });
  const om = structuredClone(built.operatingModel);
  Object.assign(om.calibration!.answers as Record<string, unknown>, {
    t_days: layer(r(3, 5, "days/week")),
    t_session_length: r(45, 90, "min"),
    t_splits: layer(["upper_lower", "full_body"]),
    t_sets: layer(r(2, 4, "sets")),
    t_reps: layer(r(6, 15, "reps")),
    t_effort_metric: ["rir"],
    t_effort_rir: layer(r(1, 3, "reps in reserve")),
    t_progression_method: layer(["double_progression"]),
    t_long_term_structure: layer("undulating"),
    t_deload_approach: "as_needed",
    program_length: layer(r(8, 12, "weeks")),
    t_exercises_avoided: [],
  });
  delete (om.calibration!.answers as Record<string, unknown>).t_effort_plain;
  return { versionId: "mv-5", version: 5, source: "calibration", confirmedAtIso: NOW, operatingModel: om, aiAuthority: built.aiAuthority };
}

const ANSWERS = {
  about_you: { age: 20, sex: "male", heightFeet: 5, heightInchesRemainder: 8, weightLb: 195, weightDirection: "stable" },
  your_week: { availableDays: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], maxSessionLength: "90", trainingEnvironment: ["commercial_gym"] },
  starting_point: { trainingExperience: "comfortable_common", recentConsistency: "very_consistent", weeklyFrequency: 4 },
  fuel_recovery: { typicalSleep: "7_8", hasDietaryRestrictions: "none" },
  what_you_want: { primaryGoal: "build_muscle", secondaryGoals: [] },
  health_finish: { hasInjuryHistory: true, injuryBodyAreas: ["other"], injuryBodyAreaOther: "abdomen", injuryRestrictions: "Squats and deadlifts.", safetyScreen: ["none"] },
};
const review = (extra: Partial<HealthReviewRecord> = {}): HealthReviewRecord => ({ clientId: "client-a", workspaceId: WS, status: "proceed_with_limitations", reasons: ["x"], createdAtIso: NOW, updatedAtIso: NOW, documentedLimitations: COACH_TEXT, decisionEscalationId: "esc-1", ...extra }) as HealthReviewRecord;
const UNINJURED = { ...ANSWERS, health_finish: { hasInjuryHistory: false, safetyScreen: ["none"] } };
const state = (id: string, rv: HealthReviewRecord | null) =>
  deriveClientState({ clientProfileId: id, workspaceId: WS, onboarding: { clientId: id, workspaceId: WS, currentStepIndex: 6, answers: rv ? ANSWERS : UNINJURED, completedAtIso: NOW, updatedAtIso: NOW } as unknown as OnboardingProgress, healthReview: rv });
const plan = (id: string, rv: HealthReviewRecord | null, coach = method()): PlannerRun => runPlanner(RESISTANCE_PLANNER, buildSynthesisInput({ knowledge: K, coachMethod: coach, client: state(id, rv) }), { nowIso: NOW });
const spec = (x: PlannerRun): PlanSpecification => {
  assert.equal(x.status, "PLANNED", x.status === "NEEDS_INPUT" ? x.missing.map((m) => m.fact).join(", ") : x.status === "INVALID" ? x.errors.join("; ") : "");
  return (x as { spec: PlanSpecification }).spec;
};

const fakeModel = (output: unknown): StructuredJsonModel => ({ modelId: "fake-model", generateJson: async () => output });
const GOOD_OUTPUT = {
  restrictions: [
    { optionId: "avoid_squat", quote: "No squats" },
    { optionId: "avoid_lower_compounds", quote: "lower body compounds like leg press, RDLs" },
    { optionId: "avoid_single_leg", quote: "single leg pushing motions" },
    { optionId: "avoid_bracing_high", quote: "No movements that need hard bracing" },
    { optionId: "avoid_direct_trunk", quote: "No ab workouts" },
  ],
  clarifications: [],
  unsupported: [],
};

/** What a coach confirms after reviewing the proposal (accepting it as proposed). */
async function confirmedRecord(text = COACH_TEXT, output: unknown = GOOD_OUTPUT): Promise<StoredStructuredLimitations> {
  const proposal = await interpretLimitationText({ sourceText: text, knowledge: K, model: fakeModel(output) });
  const answers = Object.fromEntries(proposal.clarifications.map((c) => [c.quote, c.choices[0]]));
  const res = buildConfirmation({ sourceText: text, proposal, selectedOptionIds: proposal.restrictions.map((x) => x.optionId), clarificationAnswers: answers, noExerciseRestrictions: false, coachUserId: "coach-a", nowIso: NOW }, K);
  assert.ok(res.ok, res.ok ? "" : res.errors.join("; "));
  return (res as { record: StoredStructuredLimitations }).record;
}

console.log("\nGate 4.0C-2A — structured constraint bridge\n");

await check("1. Raw coach limitation remains preserved", async () => {
  const rec = await confirmedRecord();
  assert.equal(rec.sourceText, COACH_TEXT);
  const s = state("client-a", review({ structuredLimitations: rec }));
  assert.ok(s.health.review.coachDocumentedLimitation.status === "known" && s.health.review.coachDocumentedLimitation.value === COACH_TEXT);
  const raw = deriveConstraintSet(s).constraints.find((c) => c.id === "client-a:coach_documented_limitation")!;
  assert.ok(raw.tags.some((t) => t.kind === "free_text" && t.text === COACH_TEXT), "raw text kept on the record");
  assert.equal(raw.interpretedBy, "client-a:coach_structured:health_review");
});

await check("2. An unconfirmed interpretation does not affect planning", async () => {
  const proposal = await interpretLimitationText({ sourceText: COACH_TEXT, knowledge: K, model: fakeModel(GOOD_OUTPUT) });
  assert.ok(proposal.restrictions.length > 0);
  // The proposal exists, but nothing confirmed is stored → planner still asks.
  const x = plan("client-a", review());
  assert.ok(x.status === "NEEDS_INPUT" && x.missing.some((m) => /coach_documented_limitation\.structured_restriction/.test(m.fact)));
  // A record missing its confirmation fields is not a confirmation.
  const rec = await confirmedRecord();
  const unconfirmed = { ...rec, confirmedBy: undefined };
  assert.equal(parseStoredLimitations(unconfirmed, K), null);
  assert.equal(plan("client-a", review({ structuredLimitations: unconfirmed })).status, "NEEDS_INPUT");
});

await check("3. Proposed interpretation uses valid taxonomy ids only", async () => {
  for (const o of RESTRICTION_OPTIONS) {
    for (const t of o.tags) {
      if (t.kind === "avoid_movement_pattern") assert.ok(t.pattern in MOVEMENT_PATTERNS, o.id);
      else if (t.kind === "avoid_demand") assert.ok((DEMANDS as readonly string[]).includes(t.demand) && (LEVELS as readonly string[]).includes(t.atOrAbove), o.id);
      else if (t.kind === "avoid_position") assert.ok((BODY_POSITIONS as readonly string[]).includes(t.position), o.id);
      else if (t.kind === "avoid_equipment") assert.ok((EQUIPMENT as readonly string[]).includes(t.equipment), o.id);
      else assert.fail(`${o.id}: unexpected tag ${t.kind}`);
    }
  }
  assert.ok(allRestrictionOptions(K).filter((o) => o.group === "exercises").every((o) => o.tags.length === 1 && o.tags[0].kind === "avoid_exercise" && K.getExercise(o.tags[0].exerciseId)));
  assert.equal(parseInterpretation({ restrictions: [{ optionId: "avoid_hernia_stuff", quote: "No squats" }] }, COACH_TEXT, K, "m").ok, false, "unknown id rejected");
  assert.equal(parseInterpretation({ restrictions: [{ optionId: "avoid_squat", quote: "no lunges ever" }] }, COACH_TEXT, K, "m").ok, false, "invented quote rejected");
  assert.equal(parseInterpretation({ restrictions: [{ optionId: "exercise.leg_press", quote: "leg press" }] }, COACH_TEXT, K, "m").ok, false, "malformed exercise id rejected");
  assert.equal(parseInterpretation({ restrictions: [{ optionId: "exercise:exercise.leg_press", quote: "leg press" }] }, COACH_TEXT, K, "m").ok, true);
  const rejected = await interpretLimitationText({ sourceText: COACH_TEXT, knowledge: K, model: fakeModel({ restrictions: [{ optionId: "ban_everything", quote: "No squats" }] }) });
  assert.equal(rejected.interpreter.kind, "manual", "invalid model output → manual editor");
  assert.equal(rejected.restrictions.length, 0);
  const down = await interpretLimitationText({ sourceText: COACH_TEXT, knowledge: K, model: { modelId: "m", generateJson: async () => { throw new Error("timeout"); } } });
  assert.equal(down.interpreter.kind, "manual", "unavailable model → manual editor");
  const off = await interpretLimitationText({ sourceText: COACH_TEXT, knowledge: K, model: null, unavailableReason: "off" });
  assert.ok(off.interpreter.kind === "manual" && off.interpreter.reason === "off");
});

await check("4. Coach can remove an incorrect proposed constraint", async () => {
  const proposal = await interpretLimitationText({ sourceText: COACH_TEXT, knowledge: K, model: fakeModel(GOOD_OUTPUT) });
  const keep = proposal.restrictions.map((x) => x.optionId).filter((id) => id !== "avoid_single_leg");
  const res = buildConfirmation({ sourceText: COACH_TEXT, proposal, selectedOptionIds: keep, clarificationAnswers: {}, noExerciseRestrictions: false, coachUserId: "coach-a", nowIso: NOW }, K);
  assert.ok(res.ok);
  const rec = (res as { record: StoredStructuredLimitations }).record;
  assert.ok(!rec.restrictions.some((x) => x.optionId === "avoid_single_leg"));
  assert.deepEqual(rec.interpretation.removedOptionIds, ["avoid_single_leg"]);
});

await check("5. Coach can add a structured constraint", async () => {
  const proposal = await interpretLimitationText({ sourceText: COACH_TEXT, knowledge: K, model: fakeModel(GOOD_OUTPUT) });
  const ids = [...proposal.restrictions.map((x) => x.optionId), "avoid_vertical_pull", "exercise:exercise.cable_triceps_pushdown"];
  const res = buildConfirmation({ sourceText: COACH_TEXT, proposal, selectedOptionIds: ids, clarificationAnswers: {}, noExerciseRestrictions: false, coachUserId: "coach-a", nowIso: NOW }, K);
  assert.ok(res.ok);
  const rec = (res as { record: StoredStructuredLimitations }).record;
  assert.equal(rec.restrictions.find((x) => x.optionId === "avoid_vertical_pull")!.origin, "coach_added");
  assert.deepEqual(rec.restrictions.find((x) => x.optionId === "exercise:exercise.cable_triceps_pushdown")!.tags, [{ kind: "avoid_exercise", exerciseId: "exercise.cable_triceps_pushdown" }]);
  const s = spec(plan("client-a", review({ structuredLimitations: rec })));
  const ids2 = s.resistance!.value.sessions.flatMap((q) => q.exercises.map((e) => e.exerciseId));
  assert.ok(!ids2.includes("exercise.cable_triceps_pushdown") && !ids2.includes("exercise.lat_pulldown"), "added restrictions are enforced");
});

await check("6. Confirmation activates constraints only for that client", async () => {
  const rec = await confirmedRecord();
  const a = deriveConstraintSet(state("client-a", review({ structuredLimitations: rec })));
  const b = deriveConstraintSet(state("client-b", null));
  assert.ok(a.constraints.some((c) => c.id === "client-a:coach_structured:health_review" && c.confirmation === "coach_confirmed"));
  assert.ok(a.constraints.every((c) => c.clientProfileId === "client-a"));
  assert.ok(!b.constraints.some((c) => c.category === "movement_restriction"));
});

await check("7. One client's constraint never affects another client", async () => {
  const rec = await confirmedRecord();
  const a = spec(plan("client-a", review({ structuredLimitations: rec })));
  const b = spec(plan("client-b", null));
  const ex = (s: PlanSpecification) => s.resistance!.value.sessions.flatMap((q) => q.exercises.map((e) => K.getExercise(e.exerciseId)!));
  assert.ok(ex(a).every((e) => !e.patterns.includes("squat")));
  assert.ok(ex(b).some((e) => e.patterns.includes("squat") || e.patterns.includes("hinge")), "client B keeps full exercise access");
});

await check("8. Ambiguous free text produces a clarification, not a silent restriction", async () => {
  const text = "No heavy stuff.";
  const p = await interpretLimitationText({ sourceText: text, knowledge: K, model: fakeModel({ restrictions: [{ optionId: "avoid_bracing_high", quote: "heavy stuff" }], clarifications: [], unsupported: [] }) });
  assert.equal(p.restrictions.length, 0, "vague-only support is withdrawn");
  assert.equal(p.clarifications.length, 1);
  assert.match(p.clarifications[0].why, /load, effort, bracing/);
  assert.ok(p.clarifications[0].choices.includes("avoid_bracing_high"));
  const unanswered = buildConfirmation({ sourceText: text, proposal: p, selectedOptionIds: [], clarificationAnswers: {}, noExerciseRestrictions: false, coachUserId: "c", nowIso: NOW }, K);
  assert.ok(!unanswered.ok && unanswered.errors.some((e) => /clarification/.test(e)));
  const answered = buildConfirmation({ sourceText: text, proposal: p, selectedOptionIds: [], clarificationAnswers: { [p.clarifications[0].quote]: "avoid_spinal_loading_high" }, noExerciseRestrictions: false, coachUserId: "c", nowIso: NOW }, K);
  assert.ok(answered.ok && answered.record.restrictions[0].optionId === "avoid_spinal_loading_high" && answered.record.restrictions[0].origin === "clarified");
  // Manual path flags it too.
  assert.equal(manualProposal(text, "off").clarifications.length, 1);
});

await check("9. Unresolved material restriction keeps the planner at NEEDS_INPUT", async () => {
  assert.equal(plan("client-a", review()).status, "NEEDS_INPUT");
  // Confirmed against older words → stale → asks again.
  const old = await confirmedRecord("No squats.", { restrictions: [{ optionId: "avoid_squat", quote: "No squats" }] });
  const s = state("client-a", review({ structuredLimitations: old }));
  assert.equal(s.health.review.structuredStatus, "stale");
  const x = plan("client-a", review({ structuredLimitations: old }));
  assert.ok(x.status === "NEEDS_INPUT" && x.missing.some((m) => /structured_restriction/.test(m.fact)));
});

await check("10. Confirmed structured restrictions let the planner proceed", async () => {
  const s = spec(plan("client-a", review({ structuredLimitations: await confirmedRecord() })));
  assert.ok(s.frequency.value < 7, "7 available days don't become 7 sessions");
});

await check("11. Hard constraints eliminate incompatible exercises by metadata", async () => {
  const rec = await confirmedRecord();
  const s = spec(plan("client-a", review({ structuredLimitations: rec })));
  const ex = s.resistance!.value.sessions.flatMap((q) => q.exercises.map((e) => K.getExercise(e.exerciseId)!));
  const banned = ["squat", "hinge", "single_leg", "hip_thrust", "trunk_flexion", "trunk_rotation", "anti_extension", "anti_rotation", "anti_lateral_flexion"];
  assert.ok(ex.every((e) => !e.patterns.some((p) => banned.includes(p)) && e.demands.bracing !== "high"));
  const constraints = buildSynthesisInput({ knowledge: K, coachMethod: method(), client: state("client-a", review({ structuredLimitations: rec })) }).constraints;
  const legPress = exerciseEligibility(K.getExercise("exercise.leg_press")!, constraints);
  assert.ok(!legPress.eligible && legPress.violations.every((v) => v.basis === "metadata"), "Leg Press excluded by pattern, not name");
  // The literal name terms from the client's/coach's words never act once a coach structure exists.
  assert.ok(K.exercises().every((e) => exerciseEligibility(e, constraints).violations.every((v) => v.basis === "metadata")));
  // Missing exposure caused by the restrictions is surfaced.
  assert.ok(s.quality!.some((q) => q.code === "target_excluded" && /abdominals/.test(q.message)));
});

await check("12. Substitutions cannot reintroduce blocked exercises", async () => {
  const rec = await confirmedRecord();
  const input = buildSynthesisInput({ knowledge: K, coachMethod: method(), client: state("client-a", review({ structuredLimitations: rec })) });
  for (const blocked of ["exercise.barbell_back_squat", "exercise.romanian_deadlift", "exercise.bulgarian_split_squat"]) {
    const safe = K.substitutesFor(blocked).filter((c) => exerciseEligibility(c.exercise, input.constraints).eligible);
    assert.ok(safe.every((c) => !c.exercise.patterns.some((p) => ["squat", "hinge", "single_leg"].includes(p))), `${blocked}: eligible substitutes never share the blocked pattern`);
  }
  // A plan edited to swap in a blocked exercise fails validation.
  const s = spec(runPlanner(RESISTANCE_PLANNER, input, { nowIso: NOW }));
  const tampered = structuredClone(s);
  tampered.resistance!.value.sessions[0].exercises[0].exerciseId = "exercise.leg_press";
  const v = RESISTANCE_PLANNER.validate!(tampered, input);
  assert.ok(!v.ok && v.errors.some((e) => /leg_press violates a hard constraint/.test(e)));
});

await check("13. Coach Brain remains unchanged", async () => {
  const m = method();
  const before = JSON.stringify(m);
  spec(runPlanner(RESISTANCE_PLANNER, buildSynthesisInput({ knowledge: K, coachMethod: m, client: state("client-a", review({ structuredLimitations: await confirmedRecord() })) }), { nowIso: NOW }));
  assert.equal(JSON.stringify(m), before);
  const server = readFileSync(new URL("../../production/structured-limitations.ts", import.meta.url), "utf8");
  assert.ok(!/coach_brains|coach_method_versions|confirm_coach_method/.test(server), "the bridge never touches Coach Brain storage");
});

await check("14. Fitness Knowledge remains unchanged", async () => {
  const before = JSON.stringify(K.exercises());
  await confirmedRecord();
  spec(plan("client-a", review({ structuredLimitations: await confirmedRecord() })));
  assert.equal(JSON.stringify(K.exercises()), before);
  for (const f of ["../knowledge/registry.ts", "../knowledge/types.ts", "../knowledge/taxonomy.ts"]) assert.ok(!/limitations\//.test(readFileSync(new URL(f, import.meta.url), "utf8")), `${f} doesn't depend on the bridge`);
  // A stored record can't smuggle its own tags in: tags must match the canonical vocabulary.
  const rec = await confirmedRecord();
  const forged = { ...rec, restrictions: [{ ...rec.restrictions[0], tags: [] }] };
  assert.equal(parseStoredLimitations(forged, K), null);
});

await check("15. Planner provenance records the applied constraint ids", async () => {
  const s = spec(plan("client-a", review({ structuredLimitations: await confirmedRecord() })));
  assert.ok(s.provenance.constraints.some((c) => c.id === "client-a:coach_structured:health_review" && c.confirmation === "coach_confirmed"));
  const applied = s.constraintsApplied.find((c) => c.constraintId === "client-a:coach_structured:health_review")!;
  assert.match(applied.how, /excluded before selection by metadata/);
  assert.ok(s.constraintsApplied.some((c) => c.constraintId === "client-a:coach_documented_limitation" && /expressed by client-a:coach_structured:health_review/.test(c.how)));
});

await check("16. Legacy invitation/onboarding paths are untouched by the bridge", () => {
  for (const f of ["../../production/structured-limitations.ts", "../../../app/actions/structured-limitations.ts", "../../../components/coach/structured-limitations-card.tsx"]) {
    const src = readFileSync(new URL(f, import.meta.url), "utf8");
    assert.ok(!/onboarding_progress|invitation|actions\/onboarding/.test(src), `${f} must not touch onboarding/invitations`);
  }
  const migration = readFileSync(new URL("../../../supabase/migrations/20261002000030_structured_limitations.sql", import.meta.url), "utf8").replace(/^--.*$/gm, "");
  assert.ok(/alter table public\.escalations/.test(migration) && !/client_onboarding_progress|invitations|coach_brains/.test(migration), "the migration only extends the health-review row");
});

await check("17. Tenancy/security: every entry point authorizes; the write is client-scoped", () => {
  const src = readFileSync(new URL("../../production/structured-limitations.ts", import.meta.url), "utf8");
  for (const fn of ["getLimitationsState", "confirmStructuredLimitations", "previewResistancePlan"]) {
    const body = src.slice(src.indexOf(`export async function ${fn}`));
    const firstAwait = body.indexOf("await ");
    assert.ok(body.slice(firstAwait, firstAwait + 60).includes("requireClientCoachAuthority"), `${fn} authorizes first`);
  }
  const propose = src.slice(src.indexOf("export async function proposeStructuredLimitations"));
  assert.ok(propose.indexOf("getLimitationsState(params)") < propose.indexOf("interpretLimitationText"), "propose authorizes (via getLimitationsState) before calling the model");
  assert.ok(/\.eq\("workspace_id", input\.workspaceId\)\s*\.eq\("client_profile_id", input\.clientProfileId\)\s*\.eq\("reason_category", "pain_or_safety"\)/.test(src), "update scoped to this client's health-review row");
  assert.ok(/state\.documentedText !== input\.sourceText\.trim\(\)/.test(src), "confirmation must match the current text");
  assert.ok(!/client_profile_id|clientProfileId|displayName/.test(src.slice(src.indexOf("interpretLimitationText({"), src.indexOf("interpretLimitationText({") + 200)), "only the limitation text goes to the model");
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
