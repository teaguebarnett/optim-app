// Gate 4.0C-3 — Fitness Reasoner v1 rails. Scripted models only (no
// provider): each test makes the "model" misbehave in one way and proves
// the deterministic layer catches it.

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { runFitnessReasoner, PROVIDER_FAILED_MESSAGE, type ReasonerResult } from "./reasoner.ts";
import { routeDomains } from "./domains.ts";
import { parseReasonerOutput } from "./contract.ts";
import { coachMethod, fakeModel, layer, NOW, planOutput, range, restrict, scenarioInput, scriptedPlan } from "./eval/fixtures.ts";

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
const run = (input: ReturnType<typeof scenarioInput>, model: Parameters<typeof runFitnessReasoner>[0]["model"]) => runFitnessReasoner({ input, model, nowIso: NOW });
const rejectedWith = (r: ReasonerResult, re: RegExp) => {
  assert.equal(r.status, "REJECTED", `expected REJECTED, got ${r.status}`);
  assert.ok(r.status === "REJECTED" && r.errors.some((e) => re.test(e)), `expected an error matching ${re}: ${r.status === "REJECTED" ? r.errors.join(" | ") : ""}`);
};

console.log("\nGate 4.0C-3 — Fitness Reasoner v1\n");

await check("1. Marathon routes to endurance and never to resistance", async () => {
  for (const input of [
    scenarioInput({ patch: { what_you_want: { primaryGoal: "something_else", primaryGoalOther: "Run my first marathon" } } }),
    scenarioInput({ coachConfirmedGoal: { class: "event_performance", event: { status: "missing", ref: "x" }, eventDateIso: { status: "missing", ref: "x" }, currentBaseline: { status: "missing", ref: "x" } } }),
  ]) {
    const m = fakeModel((ri) => planOutput(scriptedPlan(ri)));
    const r = await run(input, m);
    assert.equal(r.status, "DOMAIN_NOT_YET_SUPPORTED");
    assert.ok(r.status === "DOMAIN_NOT_YET_SUPPORTED" && r.routing.primary === "endurance");
    assert.equal(m.calls, 0, "no model call, so no resistance template can appear");
  }
});

await check("2. Unsupported domains don't fake plans", async () => {
  const cases: Array<[string, string]> = [["lose_fat", "weight_management"], ["body_recomposition", "hybrid"], ["athletic_performance", "sport_performance"]];
  for (const [goal, domain] of cases) {
    const m = fakeModel((ri) => planOutput(scriptedPlan(ri)));
    const r = await run(scenarioInput({ patch: { what_you_want: { primaryGoal: goal } } }), m);
    assert.ok(r.status === "DOMAIN_NOT_YET_SUPPORTED" && r.routing.primary === domain, `${goal} → ${r.status}`);
    assert.equal(m.calls, 0);
  }
  const vague = routeDomains(scenarioInput({ patch: { what_you_want: { primaryGoal: "something_else", primaryGoalOther: "feel better" } } }).goal);
  assert.equal(vague.status, "NEEDS_INPUT", "an unclassifiable written goal asks rather than guesses");
});

await check("3. Model output must conform to the schema", async () => {
  assert.equal(parseReasonerOutput({ status: "PLAN", plan: { domain: "resistance" } }).ok, false);
  assert.equal(parseReasonerOutput({ status: "MAYBE" }).ok, false);
  const m = fakeModel((ri) => {
    const p = scriptedPlan(ri) as unknown as Record<string, unknown>;
    p.frequency = { daysPerWeek: "four" };
    return { status: "PLAN", plan: p };
  });
  const r = await run(scenarioInput(), m);
  rejectedWith(r, /daysPerWeek/);
  assert.equal(m.calls, 2, "one repair attempt, then rejected");
  const repaired = fakeModel((ri, n) => (n === 1 ? { status: "PLAN", plan: { nope: true } } : planOutput(scriptedPlan(ri))));
  const ok = await run(scenarioInput(), repaired);
  assert.ok(ok.status === "PLANNED" && ok.attempts === 2, "a valid repair is accepted");
});

await check("4. Invalid exercise ids fail validation", async () => {
  const r = await run(scenarioInput(), fakeModel((ri) => planOutput(scriptedPlan(ri, (p) => (p.sessions[0].exercises[0].exerciseId = "exercise.made_up_press")))));
  rejectedWith(r, /made_up_press wasn't among the eligible candidates/);
});

await check("5. Hard constraints cannot be violated", async () => {
  const input = scenarioInput({ restrictions: restrict([{ kind: "avoid_movement_pattern", pattern: "squat" }]) });
  const r = await run(input, fakeModel((ri) => planOutput(scriptedPlan(ri, (p) => (p.sessions[0].exercises[0].exerciseId = "exercise.leg_press")))));
  rejectedWith(r, /leg_press (wasn't among the eligible candidates|violates a hard constraint)/);
  const missingApplied = await run(input, fakeModel((ri) => planOutput(scriptedPlan(ri, (p) => (p.constraintsApplied = [])))));
  rejectedWith(missingApplied, /Hard constraint not accounted for/);
  const m = fakeModel((ri) => planOutput(scriptedPlan(ri)));
  await run(input, m);
  assert.ok(!m.lastInput!.evidence.exercises.some((e) => e.patterns.includes("squat")), "restricted exercises are never even offered as candidates");
});

await check("6. Coach Brain hard rules cannot be silently ignored", async () => {
  const sets = await run(scenarioInput(), fakeModel((ri) => planOutput(scriptedPlan(ri, (p) => (p.sessions[0].exercises[1].sets = 6)))));
  rejectedWith(sets, /sets outside the coach's/);
  const split = await run(scenarioInput(), fakeModel((ri) => planOutput(scriptedPlan(ri, (p) => (p.architecture.split = "body_part_split")))));
  rejectedWith(split, /isn't one the coach allows/);
  const asNeeded = scenarioInput({ coach: coachMethod({ t_deload_approach: "as_needed", t_deload_every: undefined }) });
  const deload = await run(asNeeded, fakeModel((ri) => planOutput(scriptedPlan(ri, (p) => (p.progression.weeks[3].kind = "deload")))));
  rejectedWith(deload, /doesn't schedule deloads/);
  const length = await run(scenarioInput(), fakeModel((ri) => planOutput(scriptedPlan(ri, (p) => { p.durationWeeks = 20; p.progression.weeks = Array.from({ length: 20 }, (_, i) => ({ week: i + 1, kind: "build", repZone: "as_prescribed", setsDelta: 0, note: "x" })); }))));
  rejectedWith(length, /outside the coach's 8–12/);
  // A tension the model reports is surfaced, not hidden.
  const conflict = await run(scenarioInput(), fakeModel((ri) => planOutput(scriptedPlan(ri, (p) => (p.conflicts = [{ coachRuleKey: "t_sets.exceptions.main", issue: "Main-lift set cap limits volume." }])))));
  assert.ok(conflict.status === "PLANNED" && conflict.quality.some((q) => q.code === "coach_method_conflict"));
});

await check("7. Unavailable equipment cannot be used", async () => {
  const home = scenarioInput({ patch: { your_week: { trainingEnvironment: ["home_gym"] } } });
  const r = await run(home, fakeModel((ri) => planOutput(scriptedPlan(ri, (p) => (p.sessions[0].exercises[0].exerciseId = "exercise.barbell_back_squat")))));
  rejectedWith(r, /barbell_back_squat (wasn't among the eligible candidates|needs unavailable equipment)/);
  const m = fakeModel((ri) => planOutput(scriptedPlan(ri)));
  await run(home, m);
  assert.ok(m.lastInput!.evidence.exercises.every((e) => ["dumbbell", "bodyweight", "bands", "kettlebell"].includes(e.equipment)));
  assert.ok(m.lastInput!.equipment.apparatusUnknown.includes("bench"), "unknown apparatus is stated, not assumed");
});

await check("8. Missing critical data returns NEEDS_INPUT (before or from the model)", async () => {
  const m = fakeModel((ri) => planOutput(scriptedPlan(ri)));
  const r = await run(scenarioInput({ patch: { starting_point: { trainingExperience: undefined } } }), m);
  assert.ok(r.status === "NEEDS_INPUT" && r.missing.some((x) => /trainingExperience/.test(x.fact)));
  assert.equal(m.calls, 0);
  const fromModel = await run(scenarioInput(), fakeModel(() => ({ status: "NEEDS_INPUT", needsInput: [{ fact: "goal.timeline", why: "Rate depends on it.", blockedDecision: "Progression rate.", providedBy: "coach" }], summary: "Needs a timeline." })));
  assert.ok(fromModel.status === "NEEDS_INPUT" && fromModel.source === "model" && fromModel.missing[0].fact === "goal.timeline");
});

await check("9. Retrieved knowledge references are recorded", async () => {
  const r = await run(scenarioInput(), fakeModel((ri) => planOutput(scriptedPlan(ri))));
  assert.equal(r.status, "PLANNED");
  if (r.status !== "PLANNED") return;
  assert.ok(r.evidence.retrievedRefs.length > 10 && r.evidence.claims.length > 5);
  assert.ok(r.evidence.claims.length < 60 && r.evidence.exercises.length <= 71, "bounded packet, not the corpus");
  assert.ok(r.spec.provenance.knowledge.entries.some((e) => e.entryId.startsWith("concept.resistance.")), "cited concepts in provenance");
  assert.ok(r.spec.provenance.model && r.spec.provenance.model.modelId === "scripted-model" && r.spec.provenance.model.promptVersion.startsWith("reasoner-resistance-"));
  // Strength-only claims aren't retrieved for a hypertrophy-only goal.
  assert.ok(!r.evidence.claims.some((c) => c.ref.endsWith("#reps.acsm_strength")));
});

await check("10. The model cannot cite knowledge that wasn't provided", async () => {
  const unretrieved = await run(scenarioInput(), fakeModel((ri) => planOutput(scriptedPlan(ri, (p) => (p.decisions[0].knowledgeRefs = ["concept.resistance.repetition_range#reps.acsm_strength"])))));
  rejectedWith(unretrieved, /wasn't retrieved for this plan/);
  const invented = await run(scenarioInput(), fakeModel((ri) => planOutput(scriptedPlan(ri, (p) => (p.decisions[0].coachRuleKeys = ["t_secret_rule"])))));
  rejectedWith(invented, /coach rule "t_secret_rule", which wasn't provided/);
});

await check("11. Provider failure falls back safely", async () => {
  const fail = { modelId: "m", generateJson: async () => { throw Object.assign(new Error("sk-ant-api03-SECRETSECRETSECRETSECRET leaked"), { name: "AiProviderUnavailableError" }); } };
  const r = await run(scenarioInput(), fail);
  assert.equal(r.status, "PROVIDER_FAILED");
  assert.ok(r.status === "PROVIDER_FAILED" && r.message === PROVIDER_FAILED_MESSAGE && !/sk-ant|SECRET/.test(JSON.stringify(r)));
  const none = await run(scenarioInput(), null);
  assert.equal(none.status, "PROVIDER_FAILED");
});

const files = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? files(join(d, f)) : /\.ts$/.test(f) ? [join(d, f)] : []));
await check("12. No plan is published automatically", () => {
  const dir = new URL(".", import.meta.url).pathname;
  for (const f of [...files(dir), new URL("../../production/fitness-reasoner.ts", import.meta.url).pathname]) {
    const src = readFileSync(f, "utf8");
    assert.ok(!/\.insert\(|\.update\(|\.upsert\(|\.delete\(|createDraftProgramVersion|assign_active_program_version|\bpublish[A-Z]\w*\(|\.publish\(|approveProgram/.test(src.replace(/^\s*(\/\/|\*).*$/gm, "")), `${f} must not write or publish`);
  }
});

await check("13. Legacy generator and deterministic planner are unchanged by the reasoner", () => {
  const legacy = readFileSync(new URL("../../../app/actions/production-programs.ts", import.meta.url), "utf8");
  assert.ok(!/reasoner/i.test(legacy), "Generate Proposal doesn't call the reasoner");
  const planner = readFileSync(new URL("../planners/resistance/planner.ts", import.meta.url), "utf8");
  assert.ok(!/reasoner/i.test(planner), "the deterministic planner doesn't depend on the reasoner");
  assert.ok(/model: null,/.test(planner), "deterministic plans still record no model");
});

await check("14. 7 available days: frequency outside bounds or availability is rejected", async () => {
  const input = scenarioInput({ coach: coachMethod({ t_days: layer(range(3, 5, "days/week")) }) });
  const seven = await run(input, fakeModel((ri) => planOutput(scriptedPlan(ri, (p) => {
    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
    p.frequency.daysPerWeek = 7;
    p.schedule.days = [...days];
    p.sessions = days.map((day, i) => ({ ...p.sessions[i % p.sessions.length], day, title: `S${i}` }));
  }))));
  rejectedWith(seven, /Frequency 7 is outside 3–5/);
  const offDay = await run(scenarioInput({ patch: { your_week: { availableDays: ["mon", "wed", "fri"] } } }), fakeModel((ri) => planOutput(scriptedPlan(ri, (p) => (p.schedule.days = ["Monday", "Tuesday", "Friday"]) && (p.sessions[1].day = "Tuesday")))));
  rejectedWith(offDay, /Tuesday/);
});

await check("15. Only normalized synthesis data reaches the model (no raw rows, no other clients)", async () => {
  const m = fakeModel((ri) => planOutput(scriptedPlan(ri)));
  await run(scenarioInput({ clientId: "client-x" }), m);
  const sent = JSON.stringify(m.lastInput);
  assert.ok(!/client_profile_id|workspace_id|created_at|answers"|onboarding_progress/.test(sent), "no raw database fields");
  assert.ok(!/client-y|@example/.test(sent));
  assert.ok(m.lastInput!.client.facts.every((f) => f.ref.startsWith("onboarding.") || f.ref.startsWith("equipment.")));
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
