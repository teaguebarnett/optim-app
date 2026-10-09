// Cardio Reasoner V1 — rails. Scripted models only (no provider): each test makes the "model" misbehave in one way
// and proves the deterministic layer catches it, plus knowledge, method, routing, safety, eligibility, schedule,
// scenario, isolation and contract checks. Live-model quality is evaluated separately (not yet run).

import assert from "node:assert/strict";
import { CARDIO_KNOWLEDGE, CARDIO_KNOWLEDGE_VERSION } from "../../knowledge/cardio/registry.ts";
import { ALL_CARDIO_SOURCES } from "../../knowledge/cardio/sources.ts";
import { CARDIO_MODALITIES, cardioModality } from "../../knowledge/cardio/modalities.ts";
import { FOUNDATION_KNOWLEDGE_VERSION } from "../../knowledge/registry.ts";
import { NUTRITION_KNOWLEDGE_VERSION } from "../../knowledge/nutrition/registry.ts";
import { readCardioMethod } from "../../cardio/method.ts";
import { routeCardio } from "../../cardio/routing.ts";
import { cardioSafety } from "../../cardio/safety.ts";
import { cardioEquipment, modalityFit, modalityOptions } from "../../cardio/eligibility.ts";
import { scheduleConflicts } from "../../cardio/schedule.ts";
import { planningState } from "../../planning-state.ts";
import { runCardioReasoner, type CardioReasonerResult } from "./reasoner.ts";
import { CARDIO_PROMPT_VERSION, CARDIO_SYSTEM_PROMPT, parseCardioOutput } from "./contract.ts";
import type { CardioReasoningInput } from "./input.ts";
import { cardioCoach, enduranceCoach, fakeModel, NOW, resistanceProgram, restrict, scenarioInput, scriptedCardio, UPPER_LOWER, type WireCardio } from "./eval/fixtures.ts";
import { CARDIO_SCENARIOS, scenarioHard } from "./eval/scenarios.ts";

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

const S = (id: string) => CARDIO_SCENARIOS.find((s) => s.id === id)!;
const run = (id: string, tweak?: (p: WireCardio["plan"], ri: CardioReasoningInput) => void, maxAttempts = 1) => {
  const s = S(id);
  const m = fakeModel((ri) => scriptedCardio(ri as never, tweak ? (p) => tweak(p, ri as never) : undefined));
  return runCardioReasoner({ input: s.input(), model: m, nowIso: NOW, resistance: s.resistance ?? null, runId: id, maxAttempts }).then((r) => ({ r, m }));
};
const rejectedWith = (r: CardioReasonerResult, re: RegExp) => {
  assert.equal(r.status, "REJECTED", `expected REJECTED, got ${r.status}`);
  assert.ok(r.status === "REJECTED" && r.errors.some((e) => re.test(e)), `expected an error matching ${re}: ${r.status === "REJECTED" ? r.errors.join(" | ") : ""}`);
};
const planned = (r: CardioReasonerResult) => {
  assert.equal(r.status, "PLANNED", r.status === "REJECTED" ? r.errors.join(" | ") : r.status);
  return r as Extract<CardioReasonerResult, { status: "PLANNED" }>;
};
const rail = (name: string, id: string, re: RegExp, tweak: (p: WireCardio["plan"], ri: CardioReasoningInput) => void) =>
  check(name, async () => {
    const { r } = await run(id, tweak);
    rejectedWith(r, re);
  });
/** Keep the progression consistent with a changed week 1 so a rail test fails only for its own reason. */
const resync = (p: WireCardio["plan"]) => {
  const total = (p.sessions as Array<{ minutes: number }>).reduce((t, s) => t + s.minutes, 0);
  const hard = (p.sessions as Array<{ type: string; intensity: string }>).filter((s) => s.type === "intervals" || s.intensity === "vigorous").length;
  p.progression = [1, 2, 3, 4].map((week) => ({ week, minutes: total, hardSessions: hard, change: "Hold." }));
};

console.log("\nCardio Reasoner V1\n");

await check("1. Cardio Knowledge V1: validated by the shared registry, every external source PubMed-verified, numbers only on sourced claims", () => {
  assert.equal(CARDIO_KNOWLEDGE.version, CARDIO_KNOWLEDGE_VERSION);
  assert.equal(FOUNDATION_KNOWLEDGE_VERSION, "0.5.0", "Fitness Knowledge (and resistance planning state) untouched");
  assert.equal(NUTRITION_KNOWLEDGE_VERSION, "nutrition-0.2.0", "Nutrition Knowledge untouched");
  for (const s of ALL_CARDIO_SOURCES) if (s.type !== "internal_curation") assert.ok(s.citation && s.pmid && s.doi && s.verifiedVia?.includes("E-utilities"), s.id);
  for (const t of ["dose", "intensity", "interval_training", "concurrent_training", "progression", "weight_management", "screening"]) assert.ok(CARDIO_KNOWLEDGE.concept(t), t);
  for (const c of CARDIO_KNOWLEDGE.concepts()) for (const cl of c.claims) if (cl.parameters) assert.equal(cl.evidence.status, "sourced", `${c.id}#${cl.id}`);
  const needed = CARDIO_KNOWLEDGE.sourceNeeded().map((x) => x.claimId);
  for (const h of ["intensity.rpe_scale", "progression.cap", "concurrent.placement", "intensity.hr_estimate"]) assert.ok(needed.includes(h), `OPTIM heuristic ${h} is labelled, not dressed as evidence`);
  assert.equal(CARDIO_KNOWLEDGE.get("population.cardio.cardiovascular_symptoms")?.scope, "requires_clinical_judgment");
});

await check("2. Modality catalog: same restriction vocabulary as Fitness Knowledge; running interferes more than cycling (Wilson 2012); no energy values", () => {
  assert.ok(CARDIO_MODALITIES.length >= 10);
  for (const m of CARDIO_MODALITIES) assert.ok(m.equipmentAnyOf.length && m.loads.length && m.supports.length && !("met" in m) && !("kcal" in m), m.id);
  assert.equal(cardioModality("cardio.running")!.lowerBodyInterference, "high");
  assert.equal(cardioModality("cardio.cycling_stationary")!.lowerBodyInterference, "low");
  assert.ok(cardioModality("cardio.walking")!.equipmentAnyOf.includes("none"));
});

await check("3. Coach method: read from canonical calibration keys only — 'none' → not coached, missing roles → incomplete, endurance in distance units → incomplete (no unit conversion invented)", () => {
  const g = readCardioMethod(cardioCoach());
  assert.ok(g.ok && g.method.kind === "general" && g.method.minutesByRole.fat_loss?.value.max === 250 && g.method.intensityMethods?.value.join() === "talk_test,rpe");
  const none = readCardioMethod(cardioCoach({ t_cardio_roles: ["none"] }));
  assert.ok(!none.ok && none.reason === "not_coached");
  const missing = readCardioMethod(cardioCoach({ t_cardio_roles: undefined }));
  assert.ok(!missing.ok && missing.reason === "incomplete" && missing.missing[0].key === "t_cardio_roles");
  const e = readCardioMethod(enduranceCoach());
  assert.ok(e.ok && e.method.kind === "endurance" && e.method.endurance?.weeklyHours?.value.max === 4 && e.method.endurance.weeklyIncreasePct?.value.max === 10);
  const km = readCardioMethod(enduranceCoach({ e_volume_unit: "distance" }));
  assert.ok(!km.ok && km.reason === "incomplete" && km.missing.some((m) => m.key === "e_volume_unit"));
});

await check("4. Routing: race/event and sport conditioning UNSUPPORTED (never resistance-routed); 'PR my deadlift' isn't a race; hybrid recognized", () => {
  const g = (patch: Record<string, unknown>) => scenarioInput({ patch: { what_you_want: patch }, coach: cardioCoach() }).goal;
  assert.equal(routeCardio(g({ primaryGoal: "get_stronger", successDefinition: "Run a sub-25 5k" })).status, "UNSUPPORTED");
  assert.equal(routeCardio(g({ primaryGoal: "athletic_performance" })).status, "UNSUPPORTED");
  const pr = routeCardio(g({ primaryGoal: "get_stronger", successDefinition: "PR my deadlift and personal best squat" }));
  assert.ok(pr.status === "ROUTED" && pr.purpose === "resistance_support" && !pr.hybrid);
  const hy = routeCardio(g({ primaryGoal: "get_stronger", successDefinition: "Lift heavy and build my running endurance" }));
  assert.ok(hy.status === "ROUTED" && hy.hybrid && hy.purpose === "aerobic_base");
  const fl = routeCardio(g({ primaryGoal: "lose_fat" }));
  assert.ok(fl.status === "ROUTED" && fl.purpose === "fat_loss_support");
});

await check("5. Safety gate: screen symptoms, pregnancy, heart conditions and minors with weight goals escalate; medication → no vigorous, no heart rate; beta-blocker text → no heart rate", () => {
  const s = (patch: Record<string, Record<string, unknown>>) => {
    const i = scenarioInput({ patch, coach: cardioCoach() });
    return cardioSafety(i.client, i.goal);
  };
  for (const k of ["cardiovascular", "chest_dizziness", "blood_pressure", "advised_limit"]) assert.ok(s({ health_finish: { safetyScreen: [k] } }).escalations.some((e) => e.code === `screen_${k}`), k);
  assert.ok(s({ health_finish: { hasInjuryHistory: true, injuryRestrictions: "I'm pregnant, 20 weeks" } }).escalations.length);
  assert.ok(s({ what_you_want: { primaryGoal: "lose_fat", successDefinition: "get fit after my heart attack" } }).escalations.length);
  assert.ok(s({ about_you: { age: 15 }, what_you_want: { primaryGoal: "lose_fat" } }).escalations.some((e) => e.code === "minor_weight_goal"));
  const minorStrength = s({ about_you: { age: 16 }, what_you_want: { primaryGoal: "get_stronger" } });
  assert.ok(!minorStrength.escalations.length && minorStrength.minor);
  const med = s({ health_finish: { safetyScreen: ["medication_condition"] } });
  assert.ok(!med.escalations.length && med.noVigorous && med.noHeartRate);
  const bb = s({ health_finish: { hasInjuryHistory: true, injuryRestrictions: "on metoprolol for migraines" } });
  assert.ok(!bb.escalations.length && bb.noHeartRate && !bb.noVigorous);
});

await check("6. Eligibility: confirmed tags only; impact excludes running, both-knee excludes leg modalities, one-side knee → uncertain (withheld, coach decides), seated restriction excludes cycling", () => {
  const set = (tags: Parameters<typeof restrict>[0]) => scenarioInput({ coach: cardioCoach(), restrictions: restrict(tags) }).constraints;
  const run = cardioModality("cardio.running")!;
  const bike = cardioModality("cardio.cycling_stationary")!;
  assert.equal(modalityFit(run, set([{ kind: "avoid_demand", demand: "impact", atOrAbove: "moderate" }])).state, "incompatible");
  assert.equal(modalityFit(bike, set([{ kind: "avoid_demand", demand: "impact", atOrAbove: "moderate" }])).state, "compatible");
  assert.equal(modalityFit(bike, set([{ kind: "avoid_limb_loading", region: "knee", side: "both" }])).state, "incompatible");
  assert.equal(modalityFit(bike, set([{ kind: "avoid_limb_loading", region: "knee", side: "left" }])).state, "uncertain");
  assert.equal(modalityFit(bike, set([{ kind: "avoid_position", position: "seated" }])).state, "incompatible");
  assert.equal(modalityFit(cardioModality("cardio.swimming")!, set([{ kind: "avoid_limb_loading", region: "shoulder", side: "both" }])).state, "incompatible");
  assert.equal(modalityFit(cardioModality("cardio.walking")!, set([{ kind: "avoid_limb_loading", region: "shoulder", side: "both" }])).state, "compatible");
  // A client's own unconfirmed wording never excludes (it blocks via NEEDS_INPUT instead — scenario C07C).
  const unconfirmed = scenarioInput({ patch: { health_finish: { hasInjuryHistory: true, injuryRestrictions: "no running" } }, coach: cardioCoach() });
  assert.equal(modalityOptions(unconfirmed.client, unconfirmed.constraints).find((o) => o.modality.id === "cardio.running")!.fit.state, "compatible");
});

await check("7. Equipment: commercial gym → standard machines ASSUMED (recorded); home/limited/mixed → unknown; walking/running need nothing", () => {
  const eq = (env: string[]) => cardioEquipment(scenarioInput({ patch: { your_week: { trainingEnvironment: env } }, coach: cardioCoach() }).client);
  const gym = eq(["commercial_gym"]);
  assert.ok(gym.treadmill === "assumed" && gym.stationary_bike === "assumed" && gym.pool === "unknown" && gym.none === "available");
  for (const env of [["home_gym"], ["limited_equipment"], ["commercial_gym", "home_gym"], ["private_gym"]]) assert.ok(eq(env).treadmill === "unknown", env.join());
});

await check("8. Resistance week from program content (universal grammar): lower-body days detected; schedule conflicts surfaced", () => {
  const w = UPPER_LOWER(70);
  assert.deepEqual(w.days.map((d) => `${d.day}:${d.lowerBody}`), ["Monday:true", "Tuesday:false", "Thursday:true", "Friday:false"]);
  const i = scenarioInput({ patch: { your_week: { availableDays: ["mon", "tue", "wed", "thu"], maxSessionLength: "60" } }, coach: cardioCoach() });
  const c = scheduleConflicts(i.client, w);
  assert.ok(c.some((x) => /Friday/.test(x) && /available/.test(x)) && c.some((x) => /cap/.test(x)), c.join(" | "));
  assert.equal(scheduleConflicts(i.client, null).length, 0);
});

await check("9. Every scenario meets its hard invariants with a rail-respecting model; gated scenarios make NO model call", async () => {
  for (const s of CARDIO_SCENARIOS) {
    const m = fakeModel((ri) => scriptedCardio(ri as never));
    const i = s.input();
    const r = await runCardioReasoner({ input: i, model: m, nowIso: NOW, resistance: s.resistance ?? null, maxAttempts: 1 });
    const h = scenarioHard(s, r, i);
    assert.deepEqual(h, [], `${s.id}: ${h.join("; ")}`);
    if (!s.expectsModel) assert.equal(m.calls, 0, `${s.id} called the model`);
  }
  const categories = new Set(CARDIO_SCENARIOS.map((s) => s.category));
  for (const c of ["strength_athlete", "fat_loss_low_capacity", "hypertrophy_limited_recovery", "endurance_base", "hybrid", "beginner_limited_equipment", "restrictions", "insufficient_information", "schedule_conflict"]) assert.ok(categories.has(c), c);
});

await check("10. Evidence given to the model: sourced claims only (OPTIM heuristics never retrieved as evidence); bounds computed by OPTIM", async () => {
  const { m } = await run("C01");
  const ri = m.lastInput as unknown as CardioReasoningInput;
  assert.ok(ri.evidence.length >= 10);
  assert.ok(!ri.evidence.some((e) => /rpe_scale|progression\.cap|concurrent\.placement|hr_estimate/.test(e.ref)), "source_needed not retrieved");
  assert.ok(ri.evidence.some((e) => e.ref.includes("concurrent.modality_dose")));
  assert.equal(ri.bounds.maxHardSessions, 2);
  assert.deepEqual(ri.bounds.minutesByRole.conditioning, [60, 120]);
  assert.equal(ri.zones, null, "coach uses talk test / RPE — no heart-rate zones offered");
  assert.ok(ri.resistance?.days.length === 4);
});

console.log("\n  rails — each makes the model misbehave in one way\n");
await rail("11. session on a day the client isn't available", "C08", /isn't one of the client's available days/, (p) => {
  p.sessions[0].day = "Saturday";
});
await rail("12. a modality the confirmed restriction rules out (running with no-impact)", "C07A", /doesn't fit the client's confirmed restrictions/, (p) => {
  p.sessions[0].modality = "cardio.running";
});
await rail("13. an unknown modality", "C01", /isn't a known modality/, (p) => {
  p.sessions[0].modality = "cardio.trampoline";
});
await rail("14. effort that doesn't match the intensity label", "C02", /doesn't match "moderate"/, (p) => {
  p.sessions[0].effort = [7, 8];
});
await rail("15. talk-test level inconsistent with intensity", "C02", /with the talk test, "moderate" means short sentences/, (p) => {
  p.sessions[0].talk = "full_conversation";
});
await rail("16. talk test used to anchor intervals", "C01", /talk test isn't practical for intervals/, (p) => {
  const s = p.sessions.find((x: { type: string }) => x.type === "intervals");
  s.talk = "few_words";
});
await rail("17. intervals that don't fit the session", "C01", /doesn't fit in/, (p) => {
  const s = p.sessions.find((x: { type: string }) => x.type === "intervals");
  s.intervals.rounds = 20;
});
await rail("18. hard sessions for a client whose sleep/stress limits recovery", "C03", /limit for this client is 0 \(sleep or stress/, (p) => {
  p.sessions[0] = { ...p.sessions[0], type: "intervals", intensity: "vigorous", effort: [7, 8], talk: undefined, intervals: { rounds: 6, workSeconds: 60, recoverySeconds: 90, workEffort: [7, 8], recoveryEffort: [2, 3] } };
  resync(p);
});
await rail("19. hard work in week 1 for a new client", "C02", /new or returning to training/, (p) => {
  p.sessions[0] = { ...p.sessions[0], intensity: "vigorous", effort: [7, 8], talk: "few_words" };
  resync(p);
});
await rail("20. vigorous work despite a reported medication/condition", "C07E", /until the coach confirms the reported medication/, (p) => {
  p.sessions[0] = { ...p.sessions[0], intensity: "vigorous", effort: [7, 8], talk: undefined };
  resync(p);
});
await rail("21. heart-rate targets when OPTIM offered no zones (coach uses talk test / RPE)", "C01", /no heart-rate zones were offered/, (p) => {
  p.sessions[0].hrPct = [60, 70];
});
await rail("22. heart-rate targets for a client on a medication that may alter heart rate", "C07E", /No heart-rate targets for this client/, (p) => {
  p.intensityMethod.primary = "heart_rate";
});
await rail("23. heart-rate band that doesn't match the label (endurance coach)", "C04", /% HRmax doesn't match "moderate"/, (p) => {
  const s = p.sessions.find((x: { type: string }) => x.type === "steady");
  s.hrPct = [85, 92];
});
await rail("24. hard running the day before a lower-body strength day", "C01", /day before a lower-body strength day/, (p) => {
  p.sessions[0] = { day: "Sunday", type: "intervals", modality: "cardio.running", minutes: 25, intensity: "vigorous", effort: [7, 8], intervals: { rounds: 6, workSeconds: 60, recoverySeconds: 90, workEffort: [7, 8], recoveryEffort: [2, 3] }, placement: "separate_day", purpose: "Intervals." };
  resync(p);
});
await rail("25. hard rowing on a lower-body strength day", "C05", /on a lower-body strength day interferes/, (p) => {
  p.sessions[0] = { day: "Monday", type: "intervals", modality: "cardio.rowing", minutes: 20, intensity: "vigorous", effort: [7, 8], intervals: { rounds: 6, workSeconds: 60, recoverySeconds: 90, workEffort: [7, 8], recoveryEffort: [2, 3] }, placement: "separate_session", purpose: "Intervals." };
  resync(p);
});
await rail("26. 'separate_day' placement on a resistance day", "C01", /is a resistance day/, (p) => {
  p.sessions[0].day = "Tuesday";
  p.sessions[0].placement = "separate_day";
});
await rail("27. same-visit cardio that pushes past the client's session cap", "C08", /exceeds the client's 60-min cap/, (p) => {
  p.sessions[0] = { ...p.sessions[0], day: "Wednesday", placement: "after_resistance", minutes: 20 };
  resync(p);
});
await rail("28. weekly minutes above the coach's range", "C07A", /above the coach's 120–250 min\/week/, (p) => {
  for (const s of p.sessions) s.minutes = 100;
  resync(p);
});
await rail("29. progression that jumps faster than the weekly cap", "C04", /raises minutes \d+% — the limit is 10%/, (p) => {
  p.progression[1].minutes = Math.round(p.progression[0].minutes * 1.3);
});
await rail("30. progression week 1 that doesn't match the sessions", "C02", /progression week 1 says/, (p) => {
  p.progression[0].minutes += 30;
});
await rail("31. progression weeks out of order / too short", "C02", /progression weeks must run|covers 2 weeks/, (p) => {
  p.progression = [p.progression[0], { ...p.progression[1], week: 3 }];
});
await rail("32. a step target the coach never set", "C01", /The coach sets no step target/, (p) => {
  p.steps = { target: [8000, 10000], why: "More steps." };
});
await rail("33. a step target outside the coach's", "C13", /outside the coach's 7000–10000/, (p) => {
  p.steps.target = [12000, 14000];
});
await rail("34. a fabricated evidence citation", "C01", /Cites knowledge .* which wasn't retrieved/, (p) => {
  p.decisions[0].evidence = ["concept.cardio.dose#dose.made_up"];
});
await rail("35. a fabricated coach rule citation", "C01", /coach/, (p) => {
  p.decisions[0].coach = ["t_cardio_magic"];
});
await rail("36. no interference decision when there is a resistance program", "C01", /explain the interference decision/, (p) => {
  p.decisions = p.decisions.filter((d: { topic: string }) => d.topic !== "interference");
});
await rail("37. a role the coach's method doesn't allow (fat-loss cardio from an optional-low-intensity coach)", "C13", /role "fat_loss" isn't one this coach's method allows/, (p) => {
  p.role = "fat_loss";
});
await rail("38. an intensity method the coach doesn't use", "C01", /intensityMethod "simple_words" isn't one this coach uses/, (p) => {
  p.intensityMethod.primary = "simple_words";
});
await rail("39. a monitoring measure OPTIM doesn't track", "C02", /isn't one OPTIM tracks/, (p) => {
  p.monitoring.measures = ["vo2max_lab_test"];
});

console.log("\n  contract, repair, artifact, isolation\n");
await check("40. strict contract: warranted:false with sessions, unknown enums, out-of-range minutes are schema errors (nothing coerced)", () => {
  const base = { status: "PLAN", plan: { warranted: false, role: "none", objective: { summary: "x", why: "x" }, intensityMethod: { primary: "rpe", why: "x" }, sessions: [], progression: [], placementWhy: "x", monitoring: { measures: [], reviewAfterWeeks: 4 }, assumptions: [], decisions: [{ topic: "warranted", decision: "x", because: "x", coach: [], client: [], evidence: [] }] } };
  assert.ok(parseCardioOutput(base).ok);
  const withSessions = structuredClone(base) as unknown as { plan: { warranted: boolean; sessions: unknown[] } };
  withSessions.plan.sessions = [{ day: "Monday", type: "steady", modality: "cardio.walking", minutes: 30, intensity: "easy", effort: [2, 3], placement: "separate_day", purpose: "Walk." }];
  assert.ok(!parseCardioOutput(withSessions).ok);
  const badEnum = structuredClone(withSessions);
  badEnum.plan.warranted = true as never;
  (badEnum.plan.sessions[0] as Record<string, unknown>).intensity = "zone2";
  assert.ok(!parseCardioOutput(badEnum).ok);
  const tooLong = structuredClone(withSessions);
  tooLong.plan.warranted = true as never;
  (tooLong.plan.sessions[0] as Record<string, unknown>).minutes = 400;
  assert.ok(!parseCardioOutput(tooLong).ok);
});

await check("41. 'no cardio now' is a valid, reviewable answer (limited recovery)", async () => {
  const m = fakeModel(() => ({ status: "PLAN", plan: { warranted: false, role: "none", objective: { summary: "No added cardio for now.", why: "Sleep and stress already limit recovery; five lifting days." }, intensityMethod: { primary: "talk_test", why: "n/a" }, sessions: [], progression: [], placementWhy: "n/a", monitoring: { measures: ["recovery_rating"], reviewAfterWeeks: 4 }, assumptions: [], uncertainties: [{ about: "Sleep", impact: "Revisit when sleep improves." }], decisions: [{ topic: "warranted", decision: "No cardio yet", because: "Recovery is the limiter.", coach: [], client: [], evidence: [] }] } }));
  const r = planned(await runCardioReasoner({ input: S("C03").input(), model: m, nowIso: NOW, resistance: S("C03").resistance }));
  assert.equal(r.plan.sessions.length, 0);
  assert.equal(r.review.workload.weeklyMinutes.total, 0);
});

await check("42. one bounded repair: validator errors are fed back once; a corrected second attempt is PLANNED, a repeated failure REJECTED", async () => {
  const m = fakeModel((ri, n) => scriptedCardio(ri as never, n === 1 ? (p) => (p.sessions[0].day = "Sunday") : undefined));
  const r = planned(await runCardioReasoner({ input: S("C08").input(), model: m, nowIso: NOW, resistance: S("C08").resistance }));
  assert.equal(r.attempts, 2);
  assert.ok(/available days/.test(m.lastUserMessage) && /rejected by OPTIM's validators/.test(m.lastUserMessage));
  const bad = fakeModel((ri) => scriptedCardio(ri as never, (p) => (p.sessions[0].day = "Sunday")));
  const r2 = await runCardioReasoner({ input: S("C08").input(), model: bad, nowIso: NOW, resistance: S("C08").resistance });
  assert.equal(r2.status, "REJECTED");
  assert.equal(bad.calls, 2, "exactly one repair");
});

await check("43. provider failure and no model: PROVIDER_FAILED; nothing changes; input still built for replay", async () => {
  const boom = { provider: "scripted", modelId: "x", async generate(): Promise<never> { throw new Error("network"); } };
  const r = await runCardioReasoner({ input: S("C01").input(), model: boom as never, nowIso: NOW, resistance: S("C01").resistance });
  assert.equal(r.status, "PROVIDER_FAILED");
  const n = await runCardioReasoner({ input: S("C01").input(), model: null, nowIso: NOW, resistance: S("C01").resistance });
  assert.ok(n.status === "PROVIDER_FAILED" && n.attempts === 0 && n.run.input && n.run.hashes.input);
});

await check("44. run artifact: versions, hashes, client/goal/resistance snapshots, attempts — replayable without a model call", async () => {
  const { r } = await run("C01");
  const p = planned(r);
  assert.equal(p.run.versions.prompt, CARDIO_PROMPT_VERSION);
  assert.equal(p.run.versions.knowledge, CARDIO_KNOWLEDGE_VERSION);
  assert.deepEqual(p.run.versions.coachMethod, { versionId: "mv-eval-7", version: 7 });
  assert.ok(p.run.hashes.clientState && p.run.hashes.goalContract && p.run.hashes.resistance && p.run.hashes.input && p.run.hashes.systemPrompt);
  assert.equal(p.run.snapshots.resistance?.days.length, 4);
  assert.equal(p.run.attempts.length, 1);
  const replay = JSON.parse(JSON.stringify(p.run));
  assert.equal(replay.result.plan.sessions.length, p.plan.sessions.length);
  assert.ok(p.review.workload.statement.includes("approved program"));
  assert.ok(p.review.basis.some((b) => /internal heuristic|OPTIM default/.test(b)), "heuristic bounds labelled in the coach's basis");
});

await check("45. withheld modalities and uncertain fits are reported to the coach, never offered to the model", async () => {
  const i = scenarioInput({ patch: { what_you_want: { primaryGoal: "lose_fat" } }, coach: cardioCoach(), restrictions: restrict([{ kind: "avoid_limb_loading", region: "shoulder", side: "left" }]) });
  const m = fakeModel((ri) => scriptedCardio(ri as never));
  const r = planned(await runCardioReasoner({ input: i, model: m, nowIso: NOW }));
  const offered = (m.lastInput as unknown as CardioReasoningInput).modalities.map((x) => x.split("|")[0]);
  assert.ok(!offered.includes("cardio.rowing") && !offered.includes("cardio.swimming") && offered.includes("cardio.walking"));
  assert.ok(r.review.withheld.some((w) => w.modality === "Rowing machine" && /left side is restricted/.test(w.why)));
});

await check("46. isolation: cardio preference and the cardio reasoner don't change resistance planning state; nutrition/resistance knowledge untouched", () => {
  const a = scenarioInput({ coach: cardioCoach() });
  const b = scenarioInput({ coach: cardioCoach(), patch: { fuel_recovery: { cardioPreference: "avoids_cardio" } } });
  const ps = (i: typeof a) => planningState({ client: i.client, goal: i.goal, constraints: i.constraints, coachMethodVersionId: "v", knowledgeVersion: "k" }).key;
  assert.equal(ps(a), ps(b));
  assert.ok(b.client.training.cardioPreference.status === "known");
});

await check("47. prompt: coach authority, safety first, no publication; cardio prompt separate from resistance and nutrition", async () => {
  assert.ok(/never approve or publish/.test(CARDIO_SYSTEM_PROMPT) && /AUTHORITY/.test(CARDIO_SYSTEM_PROMPT) && /warranted:false is a valid answer/.test(CARDIO_SYSTEM_PROMPT));
  const { REASONER_SYSTEM_PROMPT: SYSTEM_PROMPT } = await import("../contract.ts");
  const { NUTRITION_SYSTEM_PROMPT } = await import("../nutrition/contract.ts");
  assert.notEqual(CARDIO_SYSTEM_PROMPT, SYSTEM_PROMPT);
  assert.notEqual(CARDIO_SYSTEM_PROMPT, NUTRITION_SYSTEM_PROMPT);
});

await check("48. workload accounting across modalities is OPTIM's: minutes by intensity, moderate-equivalent (2× vigorous), training days incl. resistance", async () => {
  const p = planned((await run("C01")).r);
  const w = p.review.workload;
  assert.equal(w.weeklyMinutes.total, w.weeklyMinutes.easy + w.weeklyMinutes.moderate + w.weeklyMinutes.vigorous);
  assert.equal(w.moderateEquivalent, w.weeklyMinutes.easy + w.weeklyMinutes.moderate + 2 * w.weeklyMinutes.vigorous);
  assert.ok(w.trainingDays >= 4);
});

await check("49. endurance coach's own rules govern base work: weekly hours → minutes, hard sessions, weekly increase, HR zones (Tanaka) only because the coach uses heart rate", async () => {
  const { m } = await run("C04");
  const ri = m.lastInput as unknown as CardioReasoningInput;
  assert.deepEqual(ri.bounds.minutesByRole.aerobic_base, [120, 240]);
  assert.equal(ri.bounds.maxHardSessions, 2);
  assert.equal(ri.bounds.maxWeeklyIncreasePct, 10);
  assert.equal(ri.zones?.hrMaxEstimate, Math.round(208 - 0.7 * 41));
  assert.ok(ri.coach.rules.some((r) => r[0] === "e_intensity_mix" && r[2] === "polarized"));
});

await check("50. a proposed (not yet approved) resistance program is labelled as such", async () => {
  const w = resistanceProgram([{ day: "Monday", exercises: ["Leg Press", "Romanian Deadlift"] }], "proposed_program");
  const m = fakeModel((ri) => scriptedCardio(ri as never));
  const r = planned(await runCardioReasoner({ input: S("C01").input(), model: m, nowIso: NOW, resistance: w }));
  assert.ok(/proposed program/.test(r.review.workload.statement));
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
