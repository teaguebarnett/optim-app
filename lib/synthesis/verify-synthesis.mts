// Gate 4.0C-1 — Fitness Intelligence + Synthesis foundation. Pure; runs
// against the real exercise library, calibration question bank and
// onboarding step ids. No database, no model.

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { answerAllRequired } from "../coach/calibration/fixtures.ts";
import { buildMethodFromCalibration, type ConfirmedCoachMethod } from "../coach/coach-brain.ts";
import type { HealthReviewRecord, OnboardingProgress } from "../coach/types.ts";
import type { DayOfWeek } from "../types.ts";
import { canReadSynthesisState, type SynthesisActor } from "./access.ts";
import { deriveClientState, type ClientState } from "./client-state.ts";
import { deriveConstraintSet, effectiveConstraints, hardConstraints } from "./constraints.ts";
import { deriveGoalContract } from "./goal-contract.ts";
import { createKnowledgeRegistry, FOUNDATION_KNOWLEDGE, FOUNDATION_KNOWLEDGE_VERSION } from "./knowledge/registry.ts";
import { validatePlanSpecification, type PlanSpecification } from "./plan-spec.ts";
import { createPlannerRegistry, plannerDomainsForGoal, runPlanner, type DomainPlanner } from "./planner.ts";
import { evaluatePlanningReadiness } from "./readiness.ts";
import { buildSynthesisInput, frequencyBounds, type SynthesisInput } from "./synthesis-input.ts";

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

// --- fixtures --------------------------------------------------------------

function method(daysRange: { min: number; max: number | null }): ConfirmedCoachMethod {
  const built = buildMethodFromCalibration({
    answers: answerAllRequired({ coaching_areas: ["strength"], strength_specialties: ["general_strength"], experience_levels: ["beginner"], client_modifiers: ["none"], nutrition_scope: "full", practice_goals: ["get_stronger"] }),
    aiAuthority: { level: "advisor", domainOverrides: {} },
    aiAuthorityConfirmed: true,
    coachUserId: "coach-a",
    workspaceId: WS,
    businessName: "OPTIM",
    methodVersion: 3,
    nowIso: NOW,
  });
  const operatingModel = structuredClone(built.operatingModel);
  operatingModel.calibration!.answers.t_days = { min: daysRange.min, max: daysRange.max, unit: "days" };
  return { versionId: "mv-3", version: 3, source: "calibration", confirmedAtIso: NOW, operatingModel, aiAuthority: built.aiAuthority };
}

const FULL_ANSWERS = {
  about_you: { age: 34, sex: "female", heightFeet: 5, heightInchesRemainder: 6, weightLb: 160, weightDirection: "stable" },
  your_week: { availableDays: ["sun", "mon", "wed", "fri"], maxSessionLength: "60", trainingEnvironment: ["commercial_gym"], schedulePredictability: "mostly_predictable" },
  starting_point: { trainingExperience: "comfortable_common", recentConsistency: "very_consistent", weeklyFrequency: 3 },
  fuel_recovery: { typicalSleep: "7_8", hasDietaryRestrictions: "none" },
  what_you_want: { primaryGoal: "lose_fat", secondaryGoals: ["get_stronger"], targetWeight: 145, successDefinition: "Fit into old jeans." },
  health_finish: { hasInjuryHistory: false, safetyScreen: ["none"] },
};

function onboarding(clientId: string, answers: Record<string, unknown>, completed = true): OnboardingProgress {
  return { clientId, workspaceId: WS, currentStepIndex: 6, answers: answers as OnboardingProgress["answers"], completedAtIso: completed ? NOW : undefined, updatedAtIso: NOW } as OnboardingProgress;
}

function state(clientId: string, answers: Record<string, unknown> = FULL_ANSWERS, healthReview: HealthReviewRecord | null = null): ClientState {
  return deriveClientState({ clientProfileId: clientId, workspaceId: WS, onboarding: onboarding(clientId, answers), healthReview });
}

function withAnswers(patch: Record<string, Record<string, unknown>>): Record<string, unknown> {
  const out: Record<string, Record<string, unknown>> = structuredClone(FULL_ANSWERS) as never;
  for (const [step, values] of Object.entries(patch)) out[step] = { ...(out[step] ?? {}), ...values };
  return out;
}

/** A tiny stand-in planner that exercises the contract (not a real planner). */
function stubPlanner(domain: DomainPlanner["domain"], pick: (input: SynthesisInput) => DayOfWeek[]): DomainPlanner {
  return {
    id: `stub.${domain}`,
    version: "0.0.1-test",
    domain,
    requirements: [],
    plan(input, ctx): PlanSpecification {
      const days = pick(input);
      return {
        clientProfileId: input.client.clientProfileId,
        domain,
        goalClass: input.goal.primary!.class,
        frequency: { value: days.length, rationale: "test", rule: "test.frequency", basis: "planner_rule", inputs: [] },
        schedule: { value: days, rationale: "test", rule: "test.schedule", basis: "planner_rule", inputs: [] },
        weeklyStructure: { value: { name: "test", sessions: days.map((day) => ({ day, purpose: "full_body", domain })) }, rationale: "test", rule: "test.structure", basis: "planner_rule", inputs: [] },
        constraintsApplied: hardConstraints(input.constraints).map((c) => ({ constraintId: c.id, how: "respected" })),
        assumptions: [],
        unresolved: [],
        provenance: {
          knowledge: { version: input.knowledge.version, entries: [] },
          coachBrain: input.coach ? { versionId: input.coach.versionId, version: input.coach.version } : null,
          clientInputs: ["onboarding.your_week.availableDays"],
          goalInputs: ["goal.primary"],
          constraints: hardConstraints(input.constraints).map((c) => ({ id: c.id, confirmation: c.confirmation })),
          rules: ["test.frequency", "test.schedule"],
          planner: { id: `stub.${domain}`, version: "0.0.1-test" },
          generatedAtIso: ctx.nowIso,
          model: null,
        },
      };
    },
  };
}

console.log("\nGate 4.0C-1 — synthesis foundation\n");

// 1 -------------------------------------------------------------------------
check("1. Fitness Knowledge is separate from the Coach Brain", () => {
  const files = ["knowledge/types.ts", "knowledge/registry.ts"].map((f) => readFileSync(new URL(f, import.meta.url), "utf8"));
  for (const src of files) {
    assert.ok(!/coach-brain|operating-model|calibration|method-resolution/.test(src.replace(/^\s*\/\/.*$/gm, "")), "knowledge layer must not import the Coach Brain");
  }
  assert.equal(FOUNDATION_KNOWLEDGE.version, FOUNDATION_KNOWLEDGE_VERSION);
  // Same knowledge regardless of coach: building input for two different methods doesn't change it.
  const a = buildSynthesisInput({ knowledge: FOUNDATION_KNOWLEDGE, coachMethod: method({ min: 2, max: 3 }), client: state("c1") });
  const b = buildSynthesisInput({ knowledge: FOUNDATION_KNOWLEDGE, coachMethod: method({ min: 4, max: 6 }), client: state("c1") });
  assert.equal(a.knowledge, b.knowledge);
  // Entries are versioned, source-aware and immutable.
  const squat = FOUNDATION_KNOWLEDGE.getExercise("exercise.barbell_back_squat");
  assert.ok(squat && squat.version === 1 && squat.evidence.status === "internal_curation");
  assert.ok(FOUNDATION_KNOWLEDGE.sourcesFor(squat.id).some((s) => s.type === "internal_curation"));
  assert.throws(() => ((squat as { name: string }).name = "x"));
  assert.ok(FOUNDATION_KNOWLEDGE.get(`pattern.${squat.patterns[0]}`)?.kind === "movement_pattern");
  // Extensible and validated: a concept can be added; unknown sources are rejected.
  const concept = (sourceId: string) => ({ id: "concept.test", kind: "concept" as const, domain: "resistance_training" as const, version: 1, scope: "coaching" as const, evidence: { status: "sourced" as const, level: "consensus_guideline" as const, sources: [{ sourceId }] }, topic: "test", name: "Test", coachMethodDimension: null, claims: [{ id: "c.def", kind: "definition" as const, statement: "test", evidence: { status: "sourced" as const, level: "consensus_guideline" as const, sources: [{ sourceId }] } }] });
  const ext = createKnowledgeRegistry({ version: "0.2.0-test", sources: [{ id: "src.test", type: "guideline", title: "Test guideline", citation: "Test.", url: "https://example.org" }], entries: [concept("src.test")] });
  assert.equal(ext.byDomain("resistance_training").length, 1);
  assert.throws(() => createKnowledgeRegistry({ version: "x", sources: [], entries: [concept("nope")] }));
});

// 2 -------------------------------------------------------------------------
check("2. ClientState derives from canonical data", () => {
  const review: HealthReviewRecord = { clientId: "c1", workspaceId: WS, status: "proceed_with_limitations", reasons: ["x"], createdAtIso: NOW, updatedAtIso: NOW, documentedLimitations: "No overhead pressing." } as HealthReviewRecord;
  const s = state("c1", FULL_ANSWERS, review);
  assert.equal(s.onboarding, "complete");
  assert.deepEqual(s.schedule.availableDays.status === "known" && s.schedule.availableDays.value, ["Monday", "Wednesday", "Friday", "Sunday"], "sorted by the week, not tap order");
  assert.ok(s.body.heightInches.status === "known" && s.body.heightInches.value === 66);
  assert.ok(s.body.weightLb.status === "known" && s.body.weightLb.basis === "client_reported" && s.body.weightLb.source.ref === "onboarding.about_you.weightLb");
  assert.ok(s.equipment.available.status === "known" && s.equipment.available.basis === "derived" && s.equipment.available.value.length > 0);
  assert.ok(s.schedule.maxSessionLength.status === "known" && s.schedule.maxSessionLength.value.minutes === 60);
  assert.equal(s.health.review.status, "resolved");
  assert.ok(s.health.review.coachDocumentedLimitation.status === "known" && s.health.review.coachDocumentedLimitation.basis === "coach_confirmed");
});

// 3 -------------------------------------------------------------------------
check("3. Missing fields stay missing", () => {
  const s = state("c1", { your_week: { availableDays: ["mon"] } });
  for (const f of [s.body.age, s.body.weightLb, s.body.heightInches, s.schedule.maxSessionLength, s.equipment.available, s.goals.primary, s.goals.targetWeightLb, s.training.experience, s.nutrition.dietaryRestrictions]) {
    assert.equal(f.status, "missing");
  }
  // Partial height is missing, not half-known.
  assert.equal(state("c1", withAnswers({ about_you: { heightInchesRemainder: undefined } })).body.heightInches.status, "missing");
  // No onboarding at all → not_started, everything missing.
  const none = deriveClientState({ clientProfileId: "c1", workspaceId: WS, onboarding: null, healthReview: null });
  assert.equal(none.onboarding, "not_started");
  assert.equal(none.schedule.availableDays.status, "missing");
  // Goal side: timeline and rate are never invented.
  const g = deriveGoalContract(state("c1"));
  assert.ok(g.primary?.class === "fat_loss");
  assert.equal(g.primary.timeline.status, "missing");
  assert.equal(g.primary.ratePercentPerWeek.status, "missing");
});

// 4 -------------------------------------------------------------------------
check("4. GoalContract handles multiple domains", () => {
  const expect: Record<string, string> = { build_muscle: "hypertrophy", get_stronger: "strength", lose_fat: "fat_loss", body_recomposition: "recomposition", athletic_performance: "sport_performance", health_consistency: "general_fitness", something_else: "other" };
  for (const [intake, cls] of Object.entries(expect)) {
    const g = deriveGoalContract(state("c1", withAnswers({ what_you_want: { primaryGoal: intake, primaryGoalOther: "Climb Kilimanjaro" } })));
    assert.equal(g.primary?.class, cls, intake);
  }
  const fat = deriveGoalContract(state("c1"));
  assert.ok(fat.primary?.class === "fat_loss" && fat.primary.targetWeightLb.status === "known" && fat.primary.targetWeightLb.value === 145);
  assert.ok(fat.primary.baselineWeightLb.status === "known" && fat.primary.baselineWeightLb.value === 160);
  assert.deepEqual(fat.secondary.map((s) => s.class), ["strength"]);
  const other = deriveGoalContract(state("c1", withAnswers({ what_you_want: { primaryGoal: "something_else", primaryGoalOther: "Climb Kilimanjaro" } })));
  assert.ok(other.primary?.class === "other" && other.primary.description.status === "known");
  const strength = deriveGoalContract(state("c1", withAnswers({ what_you_want: { primaryGoal: "get_stronger" } })));
  assert.ok(strength.primary?.class === "strength" && !("targetWeightLb" in strength.primary), "target weight only on weight-change goals");
  assert.deepEqual(plannerDomainsForGoal("fat_loss"), ["resistance", "nutrition"]);
  assert.deepEqual(plannerDomainsForGoal("endurance"), ["endurance"]);
  assert.equal(deriveGoalContract(state("c1", withAnswers({ what_you_want: { primaryGoal: undefined } }))).primary, null);
});

// 5 -------------------------------------------------------------------------
check("5. Recomposition has no target-weight structure", () => {
  const g = deriveGoalContract(state("c1", withAnswers({ what_you_want: { primaryGoal: "body_recomposition", targetWeight: 150 } })));
  assert.equal(g.primary?.class, "recomposition");
  assert.deepEqual(Object.keys(g.primary!).sort(), ["basis", "class", "emphasis", "source"]);
  assert.ok(!JSON.stringify(g.primary).includes("150"), "a stated target weight isn't attached to recomposition");
});

// 6 -------------------------------------------------------------------------
check("6. Constraints are isolated per client", () => {
  const injured = withAnswers({ health_finish: { hasInjuryHistory: true, injuryBodyAreas: ["lower_back"], injuryRestrictions: "No deadlifts", safetyScreen: ["none"] } });
  const a = deriveConstraintSet(state("client-a", injured));
  const b = deriveConstraintSet(state("client-b"));
  assert.ok(a.constraints.every((c) => c.clientProfileId === "client-a" && c.id.startsWith("client-a:")));
  assert.ok(b.constraints.every((c) => c.clientProfileId === "client-b"));
  assert.ok(a.constraints.some((c) => c.category === "injury_or_pain"));
  assert.ok(!b.constraints.some((c) => c.category === "injury_or_pain" || c.category === "movement_restriction"));
  // Building a client's input never touches the coach's method.
  const m = method({ min: 3, max: 4 });
  const before = JSON.stringify(m);
  const input = buildSynthesisInput({ knowledge: FOUNDATION_KNOWLEDGE, coachMethod: m, client: state("client-a", injured) });
  assert.equal(JSON.stringify(m), before);
  assert.throws(() => ((input.coach!.method.operatingModel as { version: number }).version = 99), "coach method is frozen inside a synthesis input");
});

// 7 -------------------------------------------------------------------------
check("7. Coach-confirmed constraints outrank client-reported", () => {
  const answers = withAnswers({ health_finish: { hasInjuryHistory: true, injuryBodyAreas: ["shoulder"], injuryRestrictions: "Can't do bench press or overhead press", safetyScreen: ["none"] } });
  const review = { clientId: "c1", workspaceId: WS, status: "proceed_with_limitations", reasons: ["x"], createdAtIso: NOW, updatedAtIso: NOW, documentedLimitations: "Bench press is fine; avoid overhead press." } as HealthReviewRecord;
  const set = deriveConstraintSet(state("c1", answers, review));
  const literal = set.constraints.find((c) => c.id === "c1:client_restriction_terms")!;
  assert.equal(literal.confirmation, "unconfirmed_interpretation");
  assert.equal(literal.supersededBy, "c1:coach_documented_limitation");
  const eff = effectiveConstraints(set);
  assert.ok(!eff.some((c) => c.id === literal.id), "superseded interpretation isn't effective");
  assert.equal(eff[0].confirmation, "coach_confirmed", "highest authority first");
  // Without a coach decision, the literal reading stays in force (hard).
  const open = deriveConstraintSet(state("c1", answers, { ...review, status: "review_needed", documentedLimitations: undefined } as HealthReviewRecord));
  assert.ok(hardConstraints(open).some((c) => c.id === "c1:client_restriction_terms"));
});

// 8 -------------------------------------------------------------------------
check("8. Seven available days do not create a seven-day prescription", () => {
  const seven = state("c1", withAnswers({ your_week: { availableDays: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] } }));
  const b = frequencyBounds(seven, method({ min: 3, max: 4 }));
  assert.deepEqual([b.min, b.max], [3, 4]);
  assert.ok(b.limitedBy.includes("coach_method_max"));
  const input = buildSynthesisInput({ knowledge: FOUNDATION_KNOWLEDGE, coachMethod: method({ min: 3, max: 4 }), client: seven });
  const greedy = stubPlanner("resistance", (i) => (i.client.schedule.availableDays.status === "known" ? i.client.schedule.availableDays.value : []));
  const run = runPlanner(greedy, input, { nowIso: NOW });
  assert.equal(run.status, "INVALID", "a planner that schedules every available day is rejected");
  assert.ok(run.status === "INVALID" && run.errors.some((e) => /outside 3–4/.test(e)));
  // Availability is described as a ceiling, never a target.
  assert.match(deriveConstraintSet(seven).constraints.find((c) => c.category === "availability")!.description, /not a target/);
});

// 9 -------------------------------------------------------------------------
check("9. Missing critical data → NEEDS_INPUT", () => {
  const input = buildSynthesisInput({ knowledge: FOUNDATION_KNOWLEDGE, coachMethod: null, client: state("c1", withAnswers({ your_week: { availableDays: undefined }, what_you_want: { primaryGoal: undefined } })) });
  const r = evaluatePlanningReadiness(input, []);
  assert.equal(r.status, "NEEDS_INPUT");
  const missing = r.status === "NEEDS_INPUT" ? r.missing : [];
  const by = Object.fromEntries(missing.map((m) => [m.fact, m]));
  assert.equal(by["coach_brain.confirmed_method"]?.providedBy, "coach");
  assert.equal(by["onboarding.what_you_want.primaryGoal"]?.providedBy, "client");
  assert.equal(by["onboarding.your_week.availableDays"]?.providedBy, "client");
  for (const m of missing) assert.ok(m.why && m.blockedDecision, `${m.fact} explains itself`);
  // An open health review blocks, provided by the coach.
  const injured = withAnswers({ health_finish: { hasInjuryHistory: true, injuryBodyAreas: ["knee"], safetyScreen: ["none"] } });
  const review = { clientId: "c1", workspaceId: WS, status: "review_needed", reasons: ["x"], createdAtIso: NOW, updatedAtIso: NOW } as HealthReviewRecord;
  const blocked = evaluatePlanningReadiness(buildSynthesisInput({ knowledge: FOUNDATION_KNOWLEDGE, coachMethod: method({ min: 3, max: 4 }), client: state("c1", injured, review) }), []);
  assert.ok(blocked.status === "NEEDS_INPUT" && blocked.missing.some((m) => m.fact === "health_review.decision" && m.providedBy === "coach"));
  // Availability below the coach's minimum is a coach decision, not a silent clamp.
  const twoDays = buildSynthesisInput({ knowledge: FOUNDATION_KNOWLEDGE, coachMethod: method({ min: 3, max: 4 }), client: state("c1", withAnswers({ your_week: { availableDays: ["mon", "thu"] } })) });
  const conflict = evaluatePlanningReadiness(twoDays, []);
  assert.ok(conflict.status === "NEEDS_INPUT" && conflict.missing.some((m) => m.fact === "frequency.coach_minimum_vs_availability"));
  // Everything present → READY.
  assert.equal(evaluatePlanningReadiness(buildSynthesisInput({ knowledge: FOUNDATION_KNOWLEDGE, coachMethod: method({ min: 3, max: 4 }), client: state("c1") }), []).status, "READY_TO_PLAN");
});

// 10 ------------------------------------------------------------------------
check("10. PlanSpecification records provenance", () => {
  const input = buildSynthesisInput({ knowledge: FOUNDATION_KNOWLEDGE, coachMethod: method({ min: 3, max: 4 }), client: state("c1") });
  const run = runPlanner(stubPlanner("resistance", () => ["Monday", "Wednesday", "Friday"]), input, { nowIso: NOW });
  assert.equal(run.status, "PLANNED", run.status === "INVALID" ? run.errors.join("; ") : "");
  const p = run.status === "PLANNED" ? run.spec.provenance : null!;
  assert.equal(p.knowledge.version, FOUNDATION_KNOWLEDGE_VERSION);
  assert.deepEqual(p.coachBrain, { versionId: "mv-3", version: 3 });
  assert.ok(p.rules.length > 0 && p.clientInputs.length > 0 && p.goalInputs.length > 0);
  assert.equal(p.model, null);
  assert.deepEqual(p.planner, { id: "stub.resistance", version: "0.0.1-test" });
  // Wrong provenance, a skipped hard constraint, or an unavailable day is rejected.
  const spec = run.status === "PLANNED" ? run.spec : null!;
  const bad = validatePlanSpecification({ ...spec, provenance: { ...spec.provenance, coachBrain: { versionId: "mv-2", version: 2 } }, constraintsApplied: [], schedule: { ...spec.schedule, value: ["Monday", "Tuesday", "Friday"] } }, input);
  assert.ok(!bad.ok);
  assert.ok(!bad.ok && bad.errors.some((e) => /Coach Brain version/.test(e)));
  assert.ok(!bad.ok && bad.errors.some((e) => /Hard constraint not accounted for/.test(e)));
  assert.ok(!bad.ok && bad.errors.some((e) => /Tuesday/.test(e)));
});

// 11 ------------------------------------------------------------------------
check("11. Planners consume a shared synthesis input", () => {
  const input = buildSynthesisInput({ knowledge: FOUNDATION_KNOWLEDGE, coachMethod: method({ min: 3, max: 4 }), client: state("c1") });
  const seen: SynthesisInput[] = [];
  const spy = (d: DomainPlanner["domain"]): DomainPlanner => {
    const inner = stubPlanner(d, () => ["Monday", "Wednesday", "Friday"]);
    return { ...inner, plan: (i, c) => (seen.push(i), inner.plan(i, c)) };
  };
  const registry = createPlannerRegistry([spy("resistance"), spy("nutrition")]);
  const { planners, unsupported } = registry.forInput(input);
  assert.deepEqual(planners.map((p) => p.domain), ["resistance", "nutrition"]);
  assert.deepEqual(unsupported, []);
  for (const p of planners) assert.equal(runPlanner(p, input, { nowIso: NOW }).status, "PLANNED");
  assert.equal(seen.length, 2);
  assert.ok(seen.every((i) => i === input), "the same input object, not per-planner copies");
  assert.throws(() => createPlannerRegistry([spy("resistance"), spy("resistance")]), "one planner per domain");
  // A domain with no planner is reported, not faked.
  const endurance = buildSynthesisInput({ knowledge: FOUNDATION_KNOWLEDGE, coachMethod: null, client: state("c1", withAnswers({ what_you_want: { primaryGoal: "health_consistency" } })) });
  assert.deepEqual(registry.forInput(endurance).unsupported, ["general_fitness"]);
});

// 12 ------------------------------------------------------------------------
check("12. No client can access another client's synthesis state", () => {
  const client: SynthesisActor = { userId: "u-a", memberships: [{ workspaceId: WS, role: "client" }], ownClientProfileId: "client-a", assignedClientProfileIds: [] };
  assert.equal(canReadSynthesisState(client, { clientProfileId: "client-a", workspaceId: WS }), true);
  assert.equal(canReadSynthesisState(client, { clientProfileId: "client-b", workspaceId: WS }), false);
  assert.equal(canReadSynthesisState(client, { clientProfileId: "client-a", workspaceId: "ws-other" }), false);
  const coach: SynthesisActor = { userId: "u-c", memberships: [{ workspaceId: WS, role: "coach" }], ownClientProfileId: null, assignedClientProfileIds: ["client-a"] };
  assert.equal(canReadSynthesisState(coach, { clientProfileId: "client-a", workspaceId: WS }), true);
  assert.equal(canReadSynthesisState(coach, { clientProfileId: "client-b", workspaceId: WS }), false, "unassigned coach");
  const owner: SynthesisActor = { userId: "u-o", memberships: [{ workspaceId: WS, role: "workspace_owner" }], ownClientProfileId: null, assignedClientProfileIds: [] };
  assert.equal(canReadSynthesisState(owner, { clientProfileId: "client-b", workspaceId: WS }), true);
  assert.equal(canReadSynthesisState(owner, { clientProfileId: "client-x", workspaceId: "ws-other" }), false, "other workspace");
  // The server adapter authorizes before loading anything.
  const adapter = readFileSync(new URL("../production/synthesis.ts", import.meta.url), "utf8");
  assert.ok(adapter.indexOf("canReadSynthesisState(actor") < adapter.indexOf("getOnboardingProgressForClient(clientProfileId)"));
});

// 13 ------------------------------------------------------------------------
check("13. Coach Brain behavior is unchanged", () => {
  // The synthesis layer only reads the method; nothing in lib/synthesis writes or re-exports Coach Brain functions.
  const dir = new URL(".", import.meta.url).pathname;
  const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
  for (const f of walk(dir).filter((f) => f.endsWith(".ts"))) {
    const src = readFileSync(f, "utf8");
    assert.ok(!/confirmOwn|saveOwn|confirm_coach_method|\.from\([^)]*\)[\s\S]{0,120}?\.(insert|update|upsert|delete)\(|\.rpc\(/.test(src), `${f} must not write`);
  }
  // Same method in, same frequency bounds out — and the method object is untouched.
  const m = method({ min: 2, max: 5 });
  const snapshot = structuredClone(m);
  buildSynthesisInput({ knowledge: FOUNDATION_KNOWLEDGE, coachMethod: m, client: state("c1") });
  assert.deepEqual(m, snapshot);
});

// 14 ------------------------------------------------------------------------
check("14. Invite/onboarding flow is unchanged", () => {
  // Only the coach-side review integration (Gate 4.0C-2A) may import the
  // synthesis layer — never onboarding, invitations, auth or the client app.
  const root = new URL("../../", import.meta.url).pathname;
  const walk = (d: string): string[] =>
    readdirSync(d).flatMap((f) => {
      const p = join(d, f);
      if (["node_modules", ".next", ".git", "synthesis"].includes(f)) return [];
      return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx|mts)$/.test(f) ? [p] : [];
    });
  const ALLOWED = ["lib/production/synthesis.ts", "lib/production/structured-limitations.ts", "app/actions/structured-limitations.ts", "components/coach/live-client-workspace.tsx", "components/coach/resistance-planner-preview.tsx", "components/coach/structured-limitations-card.tsx", "lib/production/fitness-reasoner.ts", "components/coach/reasoner-preview-panel.tsx",
    // Gate 4.0C-4 — coach-side Reasoner proposals (flag-gated); still never onboarding/auth/client app.
    "app/actions/production-programs.ts", "lib/production/reasoner-proposals.ts", "components/coach/reasoner-proposal-panel.tsx",
    // Gate 4.0C-4 dogfood fix — the coach review card renders the Reasoner review model (coach-side only).
    "components/coach/program-proposal-review.tsx"];
  const importers = [...walk(join(root, "app")), ...walk(join(root, "lib")), ...walk(join(root, "components"))].filter((f) => !/verify-[^/]*\.mts$/.test(f) && /from ["'][^"']*\/synthesis\//.test(readFileSync(f, "utf8")));
  const unexpected = importers.filter((f) => !ALLOWED.some((a) => f.endsWith(a)));
  assert.deepEqual(unexpected, [], `unexpected importers: ${unexpected.join(", ")}`);
  assert.ok(!importers.some((f) => /onboarding|invit|auth|\(client\)/.test(f)), "onboarding / invitation / auth / client app never import synthesis");
  const adapter = readFileSync(new URL("../production/synthesis.ts", import.meta.url), "utf8");
  assert.ok(!/redirect|onboarding_progress"\)\.(insert|update|upsert)/.test(adapter));
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
