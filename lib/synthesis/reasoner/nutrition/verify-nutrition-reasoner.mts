// Nutrition Reasoner V1 — rails. Scripted models only (no provider): each test makes the "model" misbehave in one
// way and proves the deterministic layer catches it, plus knowledge, method, energy, safety, scenario and contract
// checks. Live-model quality is evaluated separately (eval/run-eval.mts --live, capped).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NUTRITION_KNOWLEDGE, NUTRITION_KNOWLEDGE_VERSION } from "../../knowledge/nutrition/registry.ts";
import { FOUNDATION_KNOWLEDGE_VERSION } from "../../knowledge/registry.ts";
import { ALL_NUTRITION_SOURCES } from "../../knowledge/nutrition/sources.ts";
import { FOODS, restrictionTags } from "../../knowledge/nutrition/foods.ts";
import { readNutritionMethod } from "../../nutrition/method.ts";
import { estimateEnergy } from "../../nutrition/energy.ts";
import { nutritionSafety } from "../../nutrition/safety.ts";
import { runNutritionReasoner, type NutritionReasonerResult } from "./reasoner.ts";
import { NUTRITION_SYSTEM_PROMPT } from "./contract.ts";
import { toAssignedNutritionPlanDraft } from "./to-plan.ts";
import { fakeModel, NOW, nutritionCoach, scenarioInput, scriptedNutrition, type WireNutrition } from "./eval/fixtures.ts";
import { NUTRITION_SCENARIOS } from "./eval/scenarios.ts";
import type { NutritionReasoningInput } from "./input.ts";

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

const S = (id: string) => NUTRITION_SCENARIOS.find((s) => s.id === id)!;
const run = (id: string, tweak?: (p: WireNutrition["plan"], ri: NutritionReasoningInput) => void, maxAttempts = 1) => {
  const s = S(id);
  const m = fakeModel((ri) => scriptedNutrition(ri as never, tweak ? (p) => tweak(p, ri as never) : undefined));
  return runNutritionReasoner({ input: s.input(), model: m, nowIso: NOW, training: s.training ?? null, runId: id, maxAttempts }).then((r) => ({ r, m }));
};
const rejectedWith = (r: NutritionReasonerResult, re: RegExp) => {
  assert.equal(r.status, "REJECTED", `expected REJECTED, got ${r.status}`);
  assert.ok(r.status === "REJECTED" && r.errors.some((e) => re.test(e)), `expected an error matching ${re}: ${r.status === "REJECTED" ? r.errors.join(" | ") : ""}`);
};
const planned = (r: NutritionReasonerResult) => {
  assert.equal(r.status, "PLANNED", r.status === "REJECTED" ? r.errors.join(" | ") : r.status);
  return r as Extract<NutritionReasonerResult, { status: "PLANNED" }>;
};

console.log("\nNutrition Reasoner V1\n");

await check("1. Nutrition Knowledge V1: validated by the shared registry, every external source verified, numbers only on sourced claims", () => {
  assert.equal(NUTRITION_KNOWLEDGE.version, NUTRITION_KNOWLEDGE_VERSION);
  assert.equal(FOUNDATION_KNOWLEDGE_VERSION, "0.5.0", "Fitness Knowledge (and resistance planning state) untouched");
  for (const s of ALL_NUTRITION_SOURCES) if (s.type !== "internal_curation") assert.ok(s.pmid && s.doi && s.citation && s.verifiedVia?.includes("E-utilities"), s.id);
  const topics = ["energy_requirements", "rate_of_loss", "rate_of_gain", "protein", "protein_distribution", "carbohydrate", "dietary_fat", "recomposition", "diet_quality", "hydration", "adherence", "supplements", "energy_availability"];
  for (const t of topics) assert.ok(NUTRITION_KNOWLEDGE.concept(t), t);
  for (const c of NUTRITION_KNOWLEDGE.concepts()) for (const cl of c.claims) if (cl.parameters) assert.equal(cl.evidence.status, "sourced", `${c.id}#${cl.id}`);
  const needed = NUTRITION_KNOWLEDGE.sourceNeeded().map((x) => x.claimId);
  assert.ok(needed.includes("energy.activity_multipliers") && needed.includes("energy.energy_per_kg"), "OPTIM's heuristics are labelled, not dressed as evidence");
  for (const p of ["population.nutrition.minor", "population.nutrition.pregnancy_lactation", "population.nutrition.disordered_eating", "population.nutrition.medical"]) assert.equal(NUTRITION_KNOWLEDGE.get(p)?.scope, "requires_clinical_judgment", p);
  assert.ok(FOODS.length >= 35 && FOODS.every((f) => !("kcal" in f) && !("protein" in f)), "foods carry roles/tags/portions — never invented nutrient values");
});

await check("2. Evidence given to the model: sourced claims only, filtered by goal; open questions never retrieved", async () => {
  const { m } = await run("N01");
  const ev = m.lastInput as unknown as NutritionReasoningInput;
  assert.ok(ev.evidence.length >= 10);
  assert.ok(!ev.evidence.some((e) => /activity_multipliers|energy_per_kg|quality\.fiber|recomp\.who/.test(e.ref)), "source_needed not retrieved");
  assert.ok(!ev.evidence.some((e) => e.ref.includes("gain.offseason_rate")), "gain-only claims filtered for a fat-loss goal");
  assert.ok(ev.evidence.some((e) => e.ref.includes("loss.muscle_retention_rate")));
});

await check("3. Coach method: read from Brain keys with provenance; goal exception wins; scope none / incomplete never defaulted", () => {
  const coach = nutritionCoach({ n_protein_amount: { base: { min: 1.6, max: 2.0, unit: "g/kg" }, varies: "goal", exceptions: { lose_fat: { min: 2.2, max: 2.6, unit: "g/kg" } } } });
  const r = readNutritionMethod(coach, "fat_loss");
  assert.ok(r.ok);
  if (r.ok) {
    assert.deepEqual([r.method.protein!.value.range.min, r.method.protein!.value.range.max, r.method.protein!.keys[0]], [2.2, 2.6, "n_protein_amount.exceptions.lose_fat"]);
    assert.deepEqual([r.method.rate!.value.min, r.method.rate!.value.max, r.method.rate!.keys[0]], [0.5, 1, "w_rate_of_loss"]);
    assert.deepEqual(r.method.levers!.value, ["calories", "steps", "cardio"]);
  }
  const gain = readNutritionMethod(coach, "hypertrophy");
  assert.ok(gain.ok && gain.method.protein!.value.range.min === 1.6, "base range for other goals");
  const none = readNutritionMethod(nutritionCoach({ nutrition_scope: "none" }), "fat_loss");
  assert.ok(!none.ok && none.reason === "not_coached");
  const inc = readNutritionMethod(nutritionCoach({ n_calorie_method: undefined, n_measurements: undefined }), "fat_loss");
  assert.ok(!inc.ok && inc.reason === "incomplete" && inc.missing.map((x) => x.key).join(",") === "n_calorie_method,n_measurements");
  const guide = readNutritionMethod(nutritionCoach({ nutrition_scope: "guidance", n_approach: undefined, n_calorie_method: undefined }), "hypertrophy");
  assert.ok(guide.ok && guide.method.approaches.value.every((a) => a === "habit_based" || a === "portion_guides") && !guide.method.calorieMethod, "guidance coaches don't set calorie targets");
});

await check("4. Energy: Mifflin–St Jeor exactly, uncertainty as ranges, training load counts, floor and minors respected", () => {
  const i = S("N01").input();
  const method = readNutritionMethod(nutritionCoach(), "fat_loss");
  assert.ok(method.ok);
  if (!method.ok) return;
  const e = estimateEnergy({ client: i.client, goal: "fat_loss", method: method.method, training: null, minor: false });
  assert.ok(e.ok);
  if (!e.ok) return;
  const kg = 185 * 0.45359237, cm = 66 * 2.54;
  const ree = 10 * kg + 6.25 * cm - 5 * 34 - 161;
  assert.equal(e.estimate.restingKcal.low, Math.round((ree * 0.9) / 50) * 50);
  assert.ok(e.estimate.maintenanceKcal.high > e.estimate.maintenanceKcal.low && e.estimate.targetBand!.high < (e.estimate.maintenanceKcal.low + e.estimate.maintenanceKcal.high) / 2, "deficit relative to central maintenance");
  assert.ok(e.estimate.targetBand!.low >= e.estimate.floorKcal, "never below predicted resting expenditure");
  const trained = estimateEnergy({ client: i.client, goal: "fat_loss", method: method.method, training: { sessionsPerWeek: 6, minutesPerSession: 90, kind: "endurance", source: "approved_program" }, minor: false });
  assert.ok(trained.ok && trained.estimate.maintenanceKcal.high > e.estimate.maintenanceKcal.high, "training load raises maintenance");
  const minor = estimateEnergy({ client: i.client, goal: "fat_loss", method: method.method, training: null, minor: true });
  assert.ok(minor.ok && minor.estimate.targetBand!.low >= Math.round((minor.estimate.maintenanceKcal.low + minor.estimate.maintenanceKcal.high) / 2 * 0.95 / 50) * 50 - 50, "no deficit for a minor");
  const unknownSex = scenarioInput({ patch: { about_you: { age: 34, sex: "prefer_not_to_say", heightFeet: 5, heightInchesRemainder: 6, weightLb: 185 } }, coach: nutritionCoach() });
  const u = estimateEnergy({ client: unknownSex.client, goal: "maintenance", method: method.method, training: null, minor: false });
  assert.ok(u.ok && u.estimate.restingKcal.high - u.estimate.restingKcal.low > e.estimate.restingKcal.high - e.estimate.restingKcal.low, "unknown sex spans both equations");
  assert.ok(e.estimate.heuristics.some((h) => /internal heuristic/.test(h)), "heuristics disclosed");
});

await check("5. Safety gate: every escalation stops before any model call; screening confirmations always present", async () => {
  for (const id of ["N15", "N16", "N17", "N18", "N19"]) {
    const { r, m } = await run(id);
    assert.equal(r.status, "ESCALATE", id);
    assert.equal(m.calls, 0, `${id}: no model call`);
    assert.ok(r.status === "ESCALATE" && r.escalations.every((e) => e.why.length > 40 && NUTRITION_KNOWLEDGE.get(e.population)), id);
  }
  const s = nutritionSafety(S("N01").input().client, S("N01").input().goal);
  assert.equal(s.escalations.length, 0);
  assert.ok(s.screening.some((x) => /pregnan/.test(x)) && s.screening.some((x) => /disordered eating/.test(x)) && s.screening.some((x) => /medical condition/.test(x)));
  assert.deepEqual(restrictionTags("No pork (halal), lactose intolerant").tags.sort(), ["lactose", "pork"]);
  assert.equal(restrictionTags("I don't like mushrooms").understood, false, "unrecognized wording becomes a coach question, never a guess");
});

await check("6. Every scenario reaches its expected outcome and passes its hard checks (scripted model)", async () => {
  const fails: string[] = [];
  for (const s of NUTRITION_SCENARIOS) {
    const i = s.input();
    const m = fakeModel((ri) => scriptedNutrition(ri as never));
    const r = await runNutritionReasoner({ input: i, model: m, nowIso: NOW, training: s.training ?? null, runId: s.id });
    if (!s.expected.includes(r.status)) fails.push(`${s.id}: ${r.status}${r.status === "REJECTED" ? ` (${r.errors.join("; ")})` : ""}`);
    for (const h of s.hard?.(r, i) ?? []) fails.push(`${s.id}: ${h}`);
    if (!s.expectsModel && m.calls) fails.push(`${s.id}: unexpected model call`);
  }
  assert.deepEqual(fails, []);
  assert.ok(new Set(NUTRITION_SCENARIOS.map((s) => s.category)).size >= 9);
});

await check("7. Energy rails: outside OPTIM's bounds, too wide, below the floor, or numbers the coach's method doesn't use", async () => {
  rejectedWith((await run("N01", (p, ri) => (p.energy.kcal = [ri.bounds.energyKcal![1] + 200, ri.bounds.energyKcal![1] + 400]))).r, /outside OPTIM's bounds/);
  rejectedWith((await run("N02", (p, ri) => (p.energy.kcal = [ri.bounds.energyKcal![0], ri.bounds.energyKcal![0] + 350]))).r, /wider than 300 kcal/);
  rejectedWith((await run("N01", (p, ri) => (p.energy.kcal = [ri.bounds.floorKcal! - 300, ri.bounds.floorKcal! - 100]))).r, /below predicted resting expenditure|outside OPTIM's bounds/);
  rejectedWith((await run("N08", (p) => { p.energy = { mode: "target", kcal: [1800, 2000], why: "x" }; })).r, /doesn't use calorie numbers|doesn't set calorie targets/);
  rejectedWith((await run("N09", (p) => { p.energy = { mode: "target", kcal: [2000, 2200], why: "x" }; })).r, /current intake.*baseline_first/);
  rejectedWith((await run("N01", (p) => { p.energy = { mode: "none", why: "x" }; p.adjustments = []; })).r, /give energy.mode "target"/);
});

await check("8. Macro rails: protein inside the coach's range, arithmetic consistent, fat not below the evidence, no grams for habit coaches", async () => {
  rejectedWith((await run("N02", (p, ri) => (p.protein.g = [ri.bounds.proteinG![1] + 20, ri.bounds.proteinG![1] + 40]))).r, /outside the coach's .* g\/day/);
  rejectedWith((await run("N02", (p) => (p.carbohydrate.g = [50, 60]))).r, /Macros add up to .* inconsistent/);
  rejectedWith((await run("N01", (p) => (p.fat.g = [15, 20]))).r, /below 15% of energy/);
  rejectedWith((await run("N08", (p) => (p.protein.g = [100, 120]))).r, /doesn't use gram targets/);
  rejectedWith((await run("N02", (p) => (p.fat.g = null))).r, /Full macro targets need/);
});

await check("9. Coach-method rails: approach, training/rest strategy, meal range, measures, threshold, levers, supplements, won't-advise", async () => {
  rejectedWith((await run("N01", (p) => (p.approach.id = "meal_plan"))).r, /isn't one this coach uses/);
  rejectedWith((await run("N01", (p) => (p.dayVariation = { strategy: "higher_on_training_days", trainingDayKcal: p.energy.kcal, restDayKcal: p.energy.kcal }))).r, /isn't the coach's \(same_calories_shift_carbs\)/);
  rejectedWith((await run("N01", (p) => { p.meals.perDay = 6; p.meals.slots = [...p.meals.slots, p.meals.slots[0], p.meals.slots[1]]; })).r, /outside the coach's 3–5/);
  rejectedWith((await run("N01", (p) => (p.meals.perDay = 3))).r, /lists 4 meals but perDay is 3/);
  rejectedWith((await run("N01", (p) => (p.monitoring.measures = ["body_fat_scale"]))).r, /isn't one this coach uses/);
  rejectedWith((await run("N01", (p) => (p.monitoring.reviewAfterWeeks = 1))).r, /outside the coach's 2–3 weeks/);
  rejectedWith((await run("N01", (p) => (p.adjustments[0].lever = "carb_cycling"))).r, /isn't one of the coach's levers/);
  rejectedWith((await run("N01", (p) => (p.adjustments[0].afterWeeks = 1))).r, /at least 2 weeks of data/);
  rejectedWith((await run("N01", (p) => (p.supplements = [{ name: "Fat burner", why: "x" }]))).r, /isn't a basic/);
  rejectedWith((await run("N10", (p) => (p.supplements = [{ name: "Creatine", why: "x" }]))).r, /outside this coach's scope/);
  rejectedWith((await run("N10", (p) => p.habits.push("Try a keto week to compare."))).r, /Mentions "keto"/);
});

await check("10. Restriction and food rails: excluded foods, unknown foods, unlike-for-like substitutions", async () => {
  rejectedWith((await run("N06", (p) => p.meals.slots[0].foods.push("food.chicken_breast"))).r, /food.chicken_breast, which the client's restrictions exclude/);
  rejectedWith((await run("N01", (p) => p.foods.emphasize.push("food.cheeseburger"))).r, /isn't in the food list/);
  rejectedWith((await run("N01", (p) => (p.foods.substitutions = [{ for: "food.chicken_breast", use: ["food.olive_oil"], why: "x" }]))).r, /doesn't play the same role/);
  const { m } = await run("N06");
  const rows = (m.lastInput as unknown as NutritionReasoningInput).foods;
  assert.ok(!rows.some((r) => /chicken|egg|yogurt|salmon|whey/i.test(r)) && rows.some((r) => r.startsWith("food.tofu|")), "the model never sees excluded foods");
});

await check("11. Safety-language rails: punitive compensation, detox/crash tactics, skipped meals, moralized food, minor deficits", async () => {
  rejectedWith((await run("N01", (p) => p.habits.push("Burn it off with extra cardio after a big meal."))).r, /punitive or compensatory/);
  rejectedWith((await run("N01", (p) => p.habits.push("Start with a 3-day juice cleanse."))).r, /crash, detox or starvation/);
  rejectedWith((await run("N01", (p) => p.habits.push("Skip breakfast to save calories."))).r, /skipping meals/);
  rejectedWith((await run("N01", (p) => p.habits.push("One cheat meal a week."))).r, /moralized food language/);
  rejectedWith((await run("N20", (p) => (p.adjustments = [{ signal: "weight rises", afterWeeks: 2, lever: "calories", change: "Reduce calories by 200 kcal." }]))).r, /reduces intake for a minor/);
});

await check("12. Structure and provenance rails: Meal Intent, no invented clock times, objective follows the goal, namespaced citations, required decisions", async () => {
  rejectedWith((await run("N01", (p) => (p.meals.slots[0].intent = "Eggs"))).r, /must say WHY the meal exists/);
  rejectedWith((await run("N01", (p) => (p.meals.slots[0].timing = "7:00 am"))).r, /clock time OPTIM doesn't know/);
  rejectedWith((await run("N01", (p) => (p.objective.focus = "muscle_gain"))).r, /doesn't match the client's fat loss goal/);
  rejectedWith((await run("N01", (p, ri) => (p.decisions[0].coach = [Object.keys(ri.client.facts)[0]]))).r, /in "coach", which takes only coach rules — list it in "client"/);
  rejectedWith((await run("N01", (p) => (p.decisions[0].evidence = ["concept.nutrition.energy_requirements#energy.activity_multipliers"]))).r, /wasn't retrieved/);
  rejectedWith((await run("N01", (p) => (p.decisions = p.decisions.filter((d: { topic: string }) => d.topic !== "monitoring")))).r, /explain the monitoring decision/);
});

await check("13. Repair path: one validator-guided repair (no loops); provider failure safe; truncated output repaired once", async () => {
  const s = S("N01");
  const m = fakeModel((ri, attempt) => scriptedNutrition(ri as never, attempt === 1 ? (p) => (p.monitoring.measures = ["bmi"]) : undefined));
  const r = await runNutritionReasoner({ input: s.input(), model: m, nowIso: NOW, runId: "repair" });
  planned(r);
  assert.equal(m.calls, 2);
  assert.ok(m.lastUserMessage.includes('Measure "bmi" isn\'t one this coach uses'), "the repair is told exactly what to fix");
  assert.deepEqual(r.run.attempts.map((a) => a.validationErrors.length > 0), [true, false]);
  const failing = { provider: "anthropic", modelId: "x", generate: async () => { throw Object.assign(new Error("401 sk-ant-secret"), { name: "AiProviderUnavailableError" }); } };
  const pf = await runNutritionReasoner({ input: s.input(), model: failing, nowIso: NOW });
  assert.equal(pf.status, "PROVIDER_FAILED");
  assert.ok(!JSON.stringify(pf).includes("sk-ant"), "no provider text or secrets in the result or run");
  let n = 0;
  const trunc = { provider: "anthropic", modelId: "x", generate: async (req: { userMessage: string }) => { n++; if (n === 1) throw Object.assign(new Error("cut"), { name: "AiProviderInvalidOutputError", truncated: true, usage: { inputTokens: 100, outputTokens: 12000 } }); return { json: scriptedNutrition(JSON.parse(req.userMessage.split("\n\nYour previous output")[0])), usage: { inputTokens: 100, outputTokens: 900 } }; } };
  const tr = await runNutritionReasoner({ input: s.input(), model: trunc, nowIso: NOW });
  planned(tr);
  assert.equal(tr.run.totals.outputTokens, 12900, "consumed tokens of the truncated call recorded");
  const rejected = await runNutritionReasoner({ input: s.input(), model: fakeModel((ri) => scriptedNutrition(ri as never, (p) => (p.monitoring.measures = ["bmi"]))), nowIso: NOW });
  assert.ok(rejected.status === "REJECTED" && rejected.attempts === 2, "exactly two attempts, then stop");
});

await check("14. Proposal is reviewable and replayable: deterministic review items, run artifact, quality findings", async () => {
  const { r } = await run("N01");
  const p = planned(r);
  assert.ok(p.review.screening.length >= 2 && p.review.basis.some((b) => /Mifflin/.test(b)) && p.review.basis.some((b) => /internal heuristic/.test(b)));
  const round = JSON.parse(JSON.stringify(p.run));
  assert.deepEqual(round.result.plan, p.plan, "run serializes losslessly (replay without a model call)");
  assert.equal(p.run.schema, "optim.nutrition-reasoner-run.v1");
  assert.deepEqual([p.run.versions.knowledge, p.run.versions.prompt], [NUTRITION_KNOWLEDGE_VERSION, "reasoner-nutrition-v1.0.0"]);
  assert.ok(p.run.hashes.input && p.run.hashes.systemPrompt && p.run.energy && p.run.safety);
  const unclear = await runNutritionReasoner({ input: scenarioInput({ patch: { fuel_recovery: { typicalSleep: "7_8", hasDietaryRestrictions: "yes", dietaryRestrictionsDetail: "No nightshades" } }, coach: nutritionCoach() }), model: fakeModel((ri) => scriptedNutrition(ri as never)), nowIso: NOW });
  assert.ok(planned(unclear).review.questions.some((q) => /couldn't map the client's restriction/.test(q)), "an uninterpreted restriction is a coach question");
  const lowP = await runNutritionReasoner({ input: S("N02").input(), model: fakeModel((ri) => scriptedNutrition(ri as never)), nowIso: NOW });
  assert.ok(planned(lowP).review.quality.every((q) => q.severity === "warning" || q.severity === "info"));
});

await check("15. Proposed ≠ approved: maps onto the existing nutrition contract only when it can; nothing is persisted or published", async () => {
  const full = planned((await run("N02")).r);
  const d = toAssignedNutritionPlanDraft(full.plan);
  assert.ok(d.ok);
  if (d.ok) {
    assert.ok(!("approvedAtIso" in d.content) && !("id" in d.content), "a draft carries no approval");
    assert.equal(d.content.targets.calories, Math.round((full.plan.energy.kcal!.min + full.plan.energy.kcal!.max) / 2));
    assert.ok(d.content.mealStructureDescription.includes(full.plan.meals.slots[0].intent), "Meal Intent carried into the existing contract");
    assert.equal(d.content.hydrationOzPerDay, 0, "words are never turned into invented numbers");
  }
  const habit = toAssignedNutritionPlanDraft(planned((await run("N08")).r).plan);
  assert.ok(!habit.ok && /can't be stored as an assigned plan yet/.test(habit.reason));
  for (const f of ["reasoner.ts", "input.ts", "validate.ts", "to-plan.ts", "contract.ts"]) {
    const src = readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
    assert.ok(!/supabase|production\/|revalidatePath|publish\w*\(/i.test(src), `${f}: no persistence or publication`);
  }
});

await check("16. One reasoning infrastructure: both domains run the shared core loop; the prompt states the authority order", () => {
  for (const f of ["../reasoner.ts", "./reasoner.ts"]) assert.ok(/runModelAttempts(<[^>]+>)?\(/.test(readFileSync(new URL(f, import.meta.url), "utf8")), f);
  assert.ok(NUTRITION_SYSTEM_PROMPT.indexOf("Safety") < NUTRITION_SYSTEM_PROMPT.indexOf('"coach": this coach') && NUTRITION_SYSTEM_PROMPT.indexOf('"coach": this coach') < NUTRITION_SYSTEM_PROMPT.indexOf('"client" facts'));
  assert.match(NUTRITION_SYSTEM_PROMPT, /Never state grams, calories or macros for an individual food/);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
