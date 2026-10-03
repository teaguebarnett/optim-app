// Gate 4.0C-3 / 3A — Fitness Reasoner rails. Scripted models only (no
// provider): each test makes the "model" misbehave in one way and proves
// the deterministic layer catches it.

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { HealthReviewRecord } from "../../coach/types.ts";
import { FOUNDATION_KNOWLEDGE } from "../knowledge/registry.ts";
import { buildConfirmation } from "../limitations/confirm.ts";
import { runFitnessReasoner, replayRun, PROVIDER_FAILED_MESSAGE, type ReasonerResult } from "./reasoner.ts";
import { routeDomains } from "./domains.ts";
import { parseReasonerOutput } from "./contract.ts";
import { reasonerReviewView } from "./view.ts";
import { canonicalJson, parseRun, runHash, serializeRun } from "./run.ts";
import { coachMethod, fakeModel, layer, NOW, range, restrict, scenarioInput, scriptedOutput } from "./eval/fixtures.ts";

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
const run = (input: ReturnType<typeof scenarioInput>, model: Parameters<typeof runFitnessReasoner>[0]["model"]) => runFitnessReasoner({ input, model, nowIso: NOW, runId: "run-test" });
const rejectedWith = (r: ReasonerResult, re: RegExp) => {
  assert.equal(r.status, "REJECTED", `expected REJECTED, got ${r.status}`);
  assert.ok(r.status === "REJECTED" && r.errors.some((e) => re.test(e)), `expected an error matching ${re}: ${r.status === "REJECTED" ? r.errors.join(" | ") : ""}`);
};
const ok = (tweak?: Parameters<typeof scriptedOutput>[1]) => fakeModel((ri) => scriptedOutput(ri, tweak));

// A real-world-shaped limitation: raw coach wording + a confirmed structure that is deliberately narrower.
const RAW = "No squats. No movements that involve bracing like high effort lat pull downs or tricep push downs. no ab workouts.";
function confirmedReview(): HealthReviewRecord {
  const conf = buildConfirmation({ sourceText: RAW, proposal: null, selectedOptionIds: ["avoid_squat", "avoid_bracing_moderate", "avoid_direct_trunk"], clarificationAnswers: {}, noExerciseRestrictions: false, coachUserId: "coach-eval", nowIso: NOW }, FOUNDATION_KNOWLEDGE);
  assert.ok(conf.ok);
  return { clientId: "client-eval", workspaceId: "ws-eval", status: "proceed_with_limitations", reasons: ["x"], createdAtIso: NOW, updatedAtIso: NOW, documentedLimitations: RAW, decisionEscalationId: "esc", structuredLimitations: conf.ok ? conf.record : null } as HealthReviewRecord;
}
const limitedInput = () => scenarioInput({ healthReview: confirmedReview(), patch: { health_finish: { hasInjuryHistory: true, injuryBodyAreas: ["other"], injuryBodyAreaOther: "abdomen", injuryRestrictions: "Squats and deadlifts.", injuryAggravatingFactors: "Heavy compounds or anything that needs core bracing", safetyScreen: ["none"] } } });

console.log("\nGate 4.0C-3 / 3A — Fitness Reasoner v1.1\n");

await check("1. Confirmed structured constraints are the boundary; raw wording never reaches the model", async () => {
  const m = ok();
  const r = await run(limitedInput(), m);
  assert.equal(r.status, "PLANNED", r.status === "REJECTED" ? r.errors.join("; ") : "");
  const sent = m.lastUserMessage;
  for (const raw of ["lat pull downs", "tricep push downs", "Squats and deadlifts", "core bracing", "abdomen"]) assert.ok(!sent.includes(raw), `raw wording "${raw}" was sent`);
  const enforced = m.lastInput!.constraints;
  assert.equal(enforced.length, 1, "only the confirmed structure is enforced");
  assert.deepEqual(enforced[0].rules.sort(), ["no anti extension pattern", "no anti lateral flexion pattern", "no anti rotation pattern", "no bracing demand at moderate or above", "no squat pattern", "no trunk flexion pattern", "no trunk rotation pattern"].sort());
  // Lat pulldown / triceps pushdown are LOW bracing → eligible under the confirmed structure.
  const ids = m.lastInput!.exercises.map((x) => x.split("|")[0]);
  assert.ok(ids.includes("exercise.lat_pulldown") && ids.includes("exercise.cable_triceps_pushdown"), "the raw text can't silently ban what the coach didn't confirm");
  // Context-only constraints are accounted for deterministically.
  if (r.status === "PLANNED") {
    const applied = r.spec.constraintsApplied.map((c) => c.constraintId);
    assert.ok(applied.includes("client-eval:coach_documented_limitation") && applied.includes("client-eval:client_reported_limitation"));
    assert.ok(r.spec.constraintsApplied.find((c) => c.constraintId === "client-eval:coach_documented_limitation")!.how.includes("history only"));
  }
});

await check("2. Raw free text cannot add active restrictions after confirmation", async () => {
  // The model may not list or invent a constraint that wasn't provided…
  const invented = await run(limitedInput(), ok((p) => p.constraintsApplied.push({ id: "client-eval:coach_documented_limitation", how: "banned all pulldowns" })));
  rejectedWith(invented, /Lists constraint "client-eval:coach_documented_limitation", which wasn't provided/);
  // Client identifiers never reach the model: enforced constraints are aliased (C1…) and mapped back.
  const m = ok();
  const aliased = await run(limitedInput(), m);
  assert.ok(m.lastInput!.constraints.every((c) => /^C\d+$/.test(c.id)) && !m.lastUserMessage.includes("client-eval"));
  assert.ok(aliased.status === "PLANNED" && aliased.spec.constraintsApplied.some((c) => c.constraintId === "client-eval:coach_structured:health_review"));
  // …and every enforced constraint must be accounted for.
  const skipped = await run(limitedInput(), ok((p) => (p.constraintsApplied = [])));
  rejectedWith(skipped, /Doesn't say how constraint/);
});

await check("3. Hard constraints cannot be violated", async () => {
  const input = scenarioInput({ restrictions: restrict([{ kind: "avoid_movement_pattern", pattern: "squat" }]) });
  const r = await run(input, ok((p) => (p.sessions[0].exercises[0].id = "exercise.leg_press")));
  rejectedWith(r, /leg_press (wasn't among the eligible candidates|violates a hard constraint)/);
  const m = ok();
  await run(input, m);
  assert.ok(!m.lastInput!.exercises.some((x) => x.split("|")[2].split(",").includes("squat")), "restricted exercises are never offered");
});

await check("4. Unsupported domains never fall back into resistance (marathon → endurance)", async () => {
  for (const input of [
    scenarioInput({ patch: { what_you_want: { primaryGoal: "something_else", primaryGoalOther: "Run my first marathon" } } }),
    scenarioInput({ coachConfirmedGoal: { class: "event_performance", event: { status: "missing", ref: "x" }, eventDateIso: { status: "missing", ref: "x" }, currentBaseline: { status: "missing", ref: "x" } } }),
    scenarioInput({ patch: { what_you_want: { primaryGoal: "lose_fat" } } }),
    scenarioInput({ patch: { what_you_want: { primaryGoal: "body_recomposition" } } }),
    scenarioInput({ patch: { what_you_want: { primaryGoal: "athletic_performance" } } }),
  ]) {
    const m = ok();
    const r = await run(input, m);
    assert.equal(r.status, "DOMAIN_NOT_YET_SUPPORTED");
    assert.equal(m.calls, 0);
  }
  assert.ok((await run(scenarioInput({ patch: { what_you_want: { primaryGoal: "something_else", primaryGoalOther: "Run my first marathon" } } }), ok())).status === "DOMAIN_NOT_YET_SUPPORTED");
  assert.equal(routeDomains(scenarioInput({ patch: { what_you_want: { primaryGoal: "something_else", primaryGoalOther: "feel better" } } }).goal).status, "NEEDS_INPUT");
});

await check("5. Missing critical information returns NEEDS_INPUT", async () => {
  const m = ok();
  const r = await run(scenarioInput({ patch: { starting_point: { trainingExperience: undefined } } }), m);
  assert.ok(r.status === "NEEDS_INPUT" && r.missing.some((x) => /trainingExperience/.test(x.fact)));
  assert.equal(m.calls, 0);
  const short = await run(scenarioInput({ patch: { your_week: { maxSessionLength: "30" } } }), ok());
  assert.ok(short.status === "NEEDS_INPUT" && short.missing.some((x) => x.fact === "coach_decision.session_length_below_minimum"));
  const fromModel = await run(scenarioInput(), fakeModel(() => ({ status: "NEEDS_INPUT", needsInput: [{ fact: "goal.timeline", why: "Rate depends on it.", blockedDecision: "Progression rate.", providedBy: "coach" }], summary: "Needs a timeline." })));
  assert.ok(fromModel.status === "NEEDS_INPUT" && fromModel.source === "model");
});

await check("6. Coach Brain hard rules are enforced", async () => {
  rejectedWith(await run(scenarioInput(), ok((p) => (p.sessions[0].exercises[1].sets = 6))), /sets outside the coach's/);
  rejectedWith(await run(scenarioInput(), ok((p) => (p.architecture.split = "body_part_split"))), /isn't one the coach allows/);
  rejectedWith(await run(scenarioInput({ coach: coachMethod({ t_deload_approach: "as_needed", t_deload_every: undefined }) }), ok((p) => (p.progression.deloadWeeks = [4]))), /doesn't schedule deloads/);
  rejectedWith(await run(scenarioInput(), ok((p) => (p.weeks = 20))), /outside the coach's 8–12/);
  rejectedWith(await run(scenarioInput(), ok((p) => (p.sessions[0].exercises[1].rir = [0, 0]))), /effort outside the coach's RIR/);
  rejectedWith(await run(scenarioInput(), ok((p) => (p.sessions[0].exercises[1].rest = [10, 20]))), /rest outside the coach's/);
  const conflict = await run(scenarioInput(), ok((p) => (p.conflicts = [{ rule: "t_sets.exceptions.main", issue: "Main-lift set cap limits volume." }])));
  assert.ok(conflict.status === "PLANNED" && conflict.quality.some((q) => q.code === "coach_method_conflict"));
});

await check("7. Knowledge that wasn't retrieved can't be cited (nor invented coach rules / facts)", async () => {
  rejectedWith(await run(scenarioInput(), ok((p) => (p.decisions[0].evidence = ["concept.resistance.repetition_range#reps.acsm_strength"]))), /wasn't retrieved for this plan/);
  rejectedWith(await run(scenarioInput(), ok((p) => (p.decisions[0].coach = ["t_secret_rule"]))), /coach rule "t_secret_rule", which wasn't provided/);
  rejectedWith(await run(scenarioInput(), ok((p) => (p.decisions[0].client = ["onboarding.secret.fact"]))), /client fact "onboarding.secret.fact", which wasn't provided/);
});

await check("8. Invalid exercises can't enter the plan; schema is strict", async () => {
  rejectedWith(await run(scenarioInput(), ok((p) => (p.sessions[0].exercises[0].id = "exercise.made_up_press"))), /made_up_press wasn't among the eligible candidates/);
  assert.equal(parseReasonerOutput({ status: "PLAN", plan: { domain: "resistance" } }).ok, false);
  const bad = fakeModel(() => ({ status: "PLAN", plan: { frequency: { days: "four" } } }));
  const r = await run(scenarioInput(), bad);
  assert.equal(r.status, "REJECTED");
  assert.equal(bad.calls, 2, "one repair attempt, then rejected");
  const repaired = fakeModel((ri, n) => (n === 1 ? { status: "PLAN", plan: {} } : scriptedOutput(ri)));
  const fixed = await run(scenarioInput(), repaired);
  assert.ok(fixed.status === "PLANNED" && fixed.attempts === 2 && fixed.run.attempts[0].parseErrors.length > 0);
});

await check("9. A saved ReasonerRun replays and renders without another model call", async () => {
  const m = ok();
  const r = await run(scenarioInput(), m);
  assert.equal(r.status, "PLANNED");
  const saved = serializeRun(r.run);
  const callsBefore = m.calls;
  const restored = parseRun(saved);
  assert.equal(runHash(restored), runHash(r.run), "stable hash across serialization");
  const live = reasonerReviewView(r, FOUNDATION_KNOWLEDGE);
  const replayed = reasonerReviewView(replayRun(restored), FOUNDATION_KNOWLEDGE);
  assert.equal(canonicalJson(replayed), canonicalJson(live), "replay renders exactly what was reviewed");
  assert.equal(m.calls, callsBefore, "no model call on replay");
  const run1 = r.run;
  assert.ok(run1.hashes.clientState && run1.hashes.goalContract && run1.hashes.constraintSet && run1.hashes.input && run1.hashes.systemPrompt);
  assert.ok(run1.retrievedKnowledge.length > 10 && run1.attempts[0].requestId === "req_scripted_1" && run1.totals.calls === 1 && run1.totals.inputTokens > 0);
  assert.ok(run1.input && run1.attempts[0].raw && run1.result.spec && run1.versions.prompt.startsWith("reasoner-resistance-v2"));
  // Same inputs → same input hash (deterministic normalization).
  const again = await run(scenarioInput(), ok());
  assert.equal(again.run.hashes.input, run1.hashes.input);
  // NEEDS_INPUT and unsupported runs replay too.
  const unsupported = await run(scenarioInput({ patch: { what_you_want: { primaryGoal: "lose_fat" } } }), ok());
  assert.equal(replayRun(parseRun(serializeRun(unsupported.run))).status, "DOMAIN_NOT_YET_SUPPORTED");
  assert.throws(() => parseRun(JSON.stringify({ schema: "other" })));
});

await check("10. Provider failure remains safe; no secrets surface (results or artifacts)", async () => {
  const fail = { provider: "anthropic", modelId: "m", generate: async () => { throw Object.assign(new Error("sk-ant-api03-SECRETSECRETSECRETSECRET leaked"), { name: "AiProviderUnavailableError" }); } };
  const r = await run(scenarioInput(), fail);
  assert.equal(r.status, "PROVIDER_FAILED");
  assert.ok(r.status === "PROVIDER_FAILED" && r.message === PROVIDER_FAILED_MESSAGE);
  const all = serializeRun(r.run) + JSON.stringify(reasonerReviewView(r, FOUNDATION_KNOWLEDGE));
  assert.ok(!/sk-ant|SECRET/.test(all), "nothing secret in the result or the saved run");
  assert.equal(r.run.attempts[0].providerError, "AiProviderUnavailableError");
  assert.equal((await run(scenarioInput(), null)).status, "PROVIDER_FAILED");
});

const files = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? files(join(d, f)) : /\.ts$/.test(f) ? [join(d, f)] : []));
await check("11. No plan is published automatically", () => {
  const dir = new URL(".", import.meta.url).pathname;
  for (const f of [...files(dir), new URL("../../production/fitness-reasoner.ts", import.meta.url).pathname]) {
    const src = readFileSync(f, "utf8").replace(/^\s*(\/\/|\*).*$/gm, "");
    assert.ok(!/\.from\([^)]*\)[\s\S]{0,120}?\.(insert|update|upsert|delete)\(|\.rpc\(|createDraftProgramVersion|assign_active_program_version|\bpublish[A-Z]\w*\(|\.publish\(|approveProgram/.test(src), `${f} must not write or publish`);
  }
});

await check("12. Legacy Generate Proposal unchanged; deterministic planner still available", async () => {
  assert.ok(!/reasoner/i.test(readFileSync(new URL("../../../app/actions/production-programs.ts", import.meta.url), "utf8")));
  const planner = readFileSync(new URL("../planners/resistance/planner.ts", import.meta.url), "utf8");
  assert.ok(!/reasoner/i.test(planner) && /model: null,/.test(planner));
  const { runPlanner } = await import("../planner.ts");
  const { RESISTANCE_PLANNER } = await import("../planners/resistance/planner.ts");
  assert.equal(runPlanner(RESISTANCE_PLANNER, scenarioInput(), { nowIso: NOW }).status, "PLANNED");
});

await check("13. Frequency outside bounds / availability is rejected (7 available days)", async () => {
  const input = scenarioInput({ coach: coachMethod({ t_days: layer(range(3, 5, "days/week")) }) });
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  rejectedWith(await run(input, ok((p) => { p.frequency.days = 7; p.schedule.days = days; p.sessions = days.map((day, i) => ({ ...p.sessions[i % p.sessions.length], day, title: `S${i}` })); })), /Frequency 7 is outside 3–5/);
  rejectedWith(await run(scenarioInput({ patch: { your_week: { availableDays: ["mon", "wed", "fri"] } } }), ok((p) => { p.schedule.days = ["Monday", "Tuesday", "Friday"]; p.sessions[1].day = "Tuesday"; })), /Tuesday/);
});

await check("14. Only normalized synthesis data reaches the model; output defaults come from the coach", async () => {
  const m = ok();
  const r = await run(scenarioInput({ clientId: "client-x" }), m);
  assert.ok(!/client_profile_id|workspace_id|created_at|answers"|onboarding_progress|client-x/.test(m.lastUserMessage), "no raw rows or ids");
  assert.ok(!m.lastUserMessage.includes("retrievedRefs"), "no duplicated reference list");
  assert.equal(r.status, "PLANNED");
  if (r.status === "PLANNED") {
    // The scripted output omits rir/rest → the coach's ranges are applied deterministically.
    const p = r.spec.resistance!.value.weeks[0].sessions[0][1];
    assert.ok(p.restMinutes && p.restMinutes.min === 1 && p.restMinutes.max === 3, "coach rest range by default");
    assert.ok(p.effort.metric === "rir" && p.effort.target === 1, "coach RIR range by default (hard end)");
  }
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
