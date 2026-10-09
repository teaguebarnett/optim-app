// Cardio Reasoner V1.1 — rails. Scripted models only (no provider): each test makes the "model" misbehave in one way
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
/** Keep the progression consistent with a changed week 1 (hold it for weeks 2–4) so a rail test fails only for its
 * own reason; and keep the dose statement consistent with week 1's minutes. */
const resync = (p: WireCardio["plan"], ri?: CardioReasoningInput) => {
  const compact = (p.sessions as Array<Record<string, unknown>>).map((x) => ({ day: x.day, type: x.type, modality: x.modality, minutes: x.minutes, intensity: x.intensity, placement: x.placement, optional: x.optional }));
  p.progression = [2, 3, 4].map((week) => ({ week, sessions: compact.map((x) => ({ ...x })), deload: false, gate: "none", change: "Hold." }));
  if (ri) {
    const total = compact.reduce((t, x) => t + (x.minutes as number), 0);
    const range = ri.bounds.minutesByRole[p.role];
    p.dose.vsCoachRange = !range ? "no_coach_range" : total < range[0] ? "below" : "within";
  }
};

console.log("\nCardio Reasoner V1.1\n");

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
  assert.deepEqual(w.days.map((d) => `${d.day}:${d.focus}:${d.lowerBody}`), ["Monday:lower:true", "Tuesday:upper:false", "Thursday:lower:true", "Friday:upper:false"]);
  // V1.1: a full-body day with one major lower-body lift loads the legs (V1 called it an upper-body day).
  const fb = resistanceProgram([{ day: "Monday", exercises: ["Leg Press", "Lat Pulldown", "Dumbbell Shoulder Press"] }, { day: "Thursday", exercises: ["Leg Curl", "Seated Cable Row", "Barbell Bench Press"] }]);
  assert.deepEqual(fb.days.map((d) => `${d.day}:${d.focus}:${d.lowerBody}`), ["Monday:full_body:true", "Thursday:full_body:false"]);
  const i = scenarioInput({ patch: { your_week: { availableDays: ["mon", "tue", "wed", "thu"], maxSessionLength: "60" } }, coach: cardioCoach() });
  const c = scheduleConflicts(i.client, w);
  assert.ok(c.some((x) => x.id === "resistance_on_unavailable_day" && x.days.includes("Friday")) && c.some((x) => x.id === "resistance_over_session_cap"), c.map((x) => x.text).join(" | "));
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
await rail("18. hard sessions for a client whose sleep/stress limits recovery", "C03", /limit for this client is 0 \(sleep or stress/, (p, ri) => {
  p.sessions[0] = { ...p.sessions[0], type: "intervals", intensity: "vigorous", effort: [7, 8], talk: undefined, intervals: { rounds: 6, workSeconds: 60, recoverySeconds: 90, workEffort: [7, 8], recoveryEffort: [2, 3] } };
  resync(p, ri);
});
await rail("19. hard work in week 1 for a new client", "C02", /new or returning to training/, (p, ri) => {
  p.sessions[0] = { ...p.sessions[0], intensity: "vigorous", effort: [7, 8], talk: "few_words" };
  resync(p, ri);
});
await rail("20. vigorous work despite a reported medication/condition", "C07E", /until the coach confirms the reported medication/, (p, ri) => {
  p.sessions[0] = { ...p.sessions[0], intensity: "vigorous", effort: [7, 8], talk: undefined };
  resync(p, ri);
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
await rail("24. hard running the day before a lower-body strength day", "C01", /day before a lower-body strength day/, (p, ri) => {
  p.sessions[0] = { day: "Sunday", type: "intervals", modality: "cardio.running", minutes: 25, intensity: "vigorous", effort: [7, 8], intervals: { rounds: 6, workSeconds: 60, recoverySeconds: 90, workEffort: [7, 8], recoveryEffort: [2, 3] }, placement: "separate_day", optional: false, purpose: "Intervals." };
  resync(p, ri);
});
await rail("25. hard rowing on a lower-body strength day", "C05", /on a lower-body strength day interferes/, (p, ri) => {
  p.sessions[0] = { day: "Monday", type: "intervals", modality: "cardio.rowing", minutes: 20, intensity: "vigorous", effort: [7, 8], intervals: { rounds: 6, workSeconds: 60, recoverySeconds: 90, workEffort: [7, 8], recoveryEffort: [2, 3] }, placement: "separate_session", optional: false, purpose: "Intervals." };
  resync(p, ri);
});
await rail("26. 'separate_day' placement on a resistance day", "C01", /is a resistance day/, (p) => {
  p.sessions[0].day = "Tuesday";
  p.sessions[0].placement = "separate_day";
});
await rail("27. same-visit cardio that pushes past the client's session cap", "C08", /exceeds the client's 60-min cap/, (p, ri) => {
  p.sessions[0] = { ...p.sessions[0], day: "Wednesday", placement: "after_resistance", minutes: 20 };
  resync(p, ri);
});
await rail("28. weekly minutes above the coach's range", "C07A", /above the coach's 120–250 min\/week/, (p, ri) => {
  for (const s of p.sessions) s.minutes = 100;
  resync(p, ri);
});
await rail("29. progression that jumps faster than the weekly cap (OPTIM's own totals)", "C04", /\d+% above the established baseline \(week 1, \d+ min\) — the limit is 10%/, (p) => {
  for (const x of p.progression[0].sessions) x.minutes = Math.round(x.minutes * 1.3);
});
await rail("30. a progression week on a day the client isn't available", "C02", /week 3 Tuesday: Tuesday isn't one of the client's available days/, (p) => {
  p.progression[1].sessions[0].day = "Tuesday";
});
await rail("31. progression weeks out of order / too short", "C02", /progression weeks must run|covers 3 weeks/, (p) => {
  p.progression = [p.progression[0], { ...p.progression[1], week: 4 }];
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
  const base = { status: "PLAN", plan: { warranted: false, role: "none", dose: { vsCoachRange: "none", why: "x" }, objective: { summary: "x", why: "x" }, intensityMethod: { primary: "rpe", why: "x" }, sessions: [], progression: [], placementWhy: "x", monitoring: { measures: [], reviewAfterWeeks: 4 }, assumptions: [], decisions: [{ topic: "warranted", decision: "x", because: "x", coach: [], client: [], evidence: [] }] } };
  assert.ok(parseCardioOutput(base).ok);
  const withSessions = structuredClone(base) as unknown as { plan: { warranted: boolean; sessions: unknown[] } };
  withSessions.plan.sessions = [{ day: "Monday", type: "steady", modality: "cardio.walking", minutes: 30, intensity: "easy", effort: [2, 3], placement: "separate_day", optional: false, purpose: "Walk." }];
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
  const m = fakeModel(() => ({ status: "PLAN", plan: { warranted: false, role: "none", recoveryStrategy: "no_additional_cardio", dose: { vsCoachRange: "none", why: "Recovery is the limiter." }, objective: { summary: "No added cardio for now.", why: "Sleep and stress already limit recovery; five lifting days." }, intensityMethod: { primary: "talk_test", why: "n/a" }, sessions: [], progression: [], placementWhy: "n/a", monitoring: { measures: ["recovery_rating"], reviewAfterWeeks: 4 }, assumptions: [], uncertainties: [{ about: "Sleep", impact: "Revisit when sleep improves." }], decisions: (["warranted", "dose", "recovery"] as const).map((topic) => ({ topic, decision: "No cardio yet", because: "Recovery is the limiter.", coach: [], client: [], evidence: [] })) } }));
  const r = planned(await runCardioReasoner({ input: S("C03").input(), model: m, nowIso: NOW, resistance: S("C03").resistance }));
  assert.equal(r.plan.sessions.length, 0);
  assert.equal(r.review.workload.weeklyMinutes.total, 0);
  assert.ok(/No additional cardio proposed/.test(r.review.workload.statement));
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
  assert.ok(/never approve or publish/.test(CARDIO_SYSTEM_PROMPT) && /AUTHORITY/.test(CARDIO_SYSTEM_PROMPT) && /warranted:false \("no additional cardio for now"/.test(CARDIO_SYSTEM_PROMPT) && /not a mandatory week-1 amount/.test(CARDIO_SYSTEM_PROMPT) && /never shorten, move or replace lifting/.test(CARDIO_SYSTEM_PROMPT));
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


console.log("\n  V1.1 — dose, inputs, workload, coherence\n");
await check("51. dose: starting below the coach's range is allowed when stated and explained (deconditioned beginner)", async () => {
  const p = planned((await run("C02")).r);
  assert.equal(p.plan.dose.vsCoachRange, "below");
  assert.ok(p.review.workload.weeklyMinutes.total < 120);
});
await rail("52. dose statement that contradicts week 1 (claims 'within' when below)", "C02", /dose.vsCoachRange is "within" but week 1 is \d+ min against the coach's 120–250 — that's "below"/, (p) => {
  p.dose.vsCoachRange = "within";
});
await rail("53. a below-range dose without a 'dose' decision", "C02", /explain the dose decision/, (p) => {
  p.decisions = p.decisions.filter((d: { topic: string }) => d.topic !== "dose");
});
await rail("54. limited recovery without a 'recovery' decision", "C03", /explain the recovery decision/, (p) => {
  p.decisions = p.decisions.filter((d: { topic: string }) => d.topic !== "recovery");
});
await check("55. optional cardio stays optional: the role is the coach's 'optional_low_intensity', no other role's minutes are offered", async () => {
  const { r, m } = await run("C13");
  const p = planned(r);
  const ri = m.lastInput as unknown as CardioReasoningInput;
  assert.equal(p.plan.role, "optional_low_intensity");
  assert.deepEqual(ri.coach.allowedRoles, ["optional_low_intensity"]);
  assert.deepEqual(ri.bounds.minutesByRole, {}, "no fat-loss/health budget leaks into an optional-only method");
  assert.ok(!ri.coach.rules.some((x) => /minutes/.test(x[0])), "minute rules of unused roles aren't offered");
  assert.ok(ri.coach.roles[0].meaning.includes("never a required program"));
});
await rail("56. optional cardio turned into a required session", "C13", /optional, low-intensity extra — every session optional:true and easy/, (p) => {
  p.sessions[0].optional = false;
});
await rail("57. optional low-intensity cardio at moderate intensity (in a later week)", "C13", /week 3 \w+: this coach's cardio is an optional, low-intensity extra/, (p) => {
  p.progression[1].sessions[0].intensity = "moderate";
});
await rail("58. the V1 live C06 progression (150 min/week from 4 days with a 30-min cap) is rejected", "C06", /week 4 \w+: \d+ min exceeds the client's 30-min session cap/, (p) => {
  p.progression[2].sessions = ["Monday", "Wednesday", "Friday", "Saturday"].map((day, k) => ({ day, type: "steady", modality: "cardio.walking", minutes: k < 2 ? 40 : 35, intensity: "moderate", placement: "separate_day", optional: false }));
});
await rail("59. a later-week session longer than the client's session cap", "C06", /week 4 \w+: 40 min exceeds the client's 30-min session cap/, (p) => {
  p.progression[2].sessions[0].minutes = 40;
});
await rail("60. a later week that stacks cardio onto approved lifting past the cap (V1 live C01 week 4)", "C01", /week 4 Tuesday: lifting \(~60 min, approved — not changed\) \+ 25 min cardio exceeds the client's 75-min cap \(room for 15 min\)/, (p) => {
  p.progression[2].sessions.push({ day: "Tuesday", type: "intervals", modality: "cardio.cycling_stationary", minutes: 25, intensity: "vigorous", placement: "after_resistance", optional: false });
});
await rail("61. hard leg-dominant cardio before a lower-body day in a LATER week", "C01", /week 3 Sunday: hard running the day before a lower-body strength day/, (p) => {
  p.progression[1].sessions.push({ day: "Sunday", type: "intervals", modality: "cardio.running", minutes: 20, intensity: "vigorous", placement: "separate_day", optional: false });
});
await check("62. full-body lifting days count as lower-body loading: hard rowing the day before one is rejected for a muscle goal", async () => {
  const fullBody = resistanceProgram([{ day: "Monday", exercises: ["Leg Press", "Lat Pulldown", "Dumbbell Shoulder Press"] }, { day: "Thursday", exercises: ["Romanian Deadlift", "Seated Cable Row", "Barbell Bench Press"] }]);
  const m = fakeModel((ri) => scriptedCardio(ri as never, (p) => {
    p.progression[1].sessions = [...p.progression[1].sessions.filter((x: { day: string }) => x.day !== "Wednesday"), { day: "Wednesday", type: "intervals", modality: "cardio.rowing", minutes: 20, intensity: "vigorous", placement: "separate_day", optional: false }];
  }));
  const r = await runCardioReasoner({ input: scenarioInput({ patch: { what_you_want: { primaryGoal: "build_muscle" } }, coach: cardioCoach() }), model: m, nowIso: NOW, resistance: fullBody, maxAttempts: 1 });
  rejectedWith(r, /week 3 Wednesday: hard rowing machine the day before a lower-body strength day \(Thursday\)/);
});
await rail("63. a schedule conflict without a prepared coach decision", "C08", /Conflict "resistance_on_unavailable_day" .* needs a prepared coach decision/, (p) => {
  p.coachDecisions = p.coachDecisions.filter((d: { about: string }) => d.about !== "resistance_on_unavailable_day");
});
await rail("64. a 'conflict' OPTIM didn't detect (invented)", "C01", /coachDecisions is about "client_hates_mondays", which OPTIM didn't detect/, (p) => {
  p.coachDecisions = [{ about: "client_hates_mondays", question: "?", options: ["a", "b"], recommended: 0, why: "x" }];
});
await check("65. prepared coach decisions reach the review with their recommendation (never applied to the program)", async () => {
  const p = planned((await run("C08")).r);
  assert.equal(p.review.coachDecisions.length, 2);
  for (const d of p.review.coachDecisions) assert.ok(d.recommended && d.options.length >= 2, d.about);
  assert.deepEqual(p.run.snapshots.resistance, S("C08").resistance, "approved program snapshot unchanged");
});
await check("66. endurance method read from REAL calibration answers (layered days/volume/quality sessions), sports passed through", () => {
  const e = readCardioMethod(enduranceCoach());
  assert.ok(e.ok && e.method.endurance);
  const en = e.method.endurance!;
  assert.deepEqual([en.days?.keys[0], en.weeklyHours?.keys[0], en.hardSessions?.keys[0]], ["e_days.base", "e_weekly_volume.base", "e_quality_sessions.base"]);
  assert.deepEqual(en.sports?.value, ["running"]);
  assert.deepEqual(en.longSession?.value, { maxPercent: 40 });
  assert.deepEqual(en.downEvery?.value, { min: 3, max: 4 });
});
await check("67. the client's discipline: one coached sport → known; several → unknown (never assumed)", async () => {
  const one = (await run("C04")).m.lastInput as unknown as CardioReasoningInput;
  assert.equal(one.endurance?.discipline, "running");
  assert.ok(one.endurance?.disciplineModalities.includes("cardio.running"));
  const s = S("C04");
  const m = fakeModel((ri) => scriptedCardio(ri as never));
  await runCardioReasoner({ input: scenarioInput({ patch: {}, coach: enduranceCoach({ endurance_sports: ["running", "cycling"] }), coachConfirmedGoal: s.input().goal.primary as never }), model: m, nowIso: NOW });
  const many = m.lastInput as unknown as CardioReasoningInput;
  assert.equal(many.endurance?.discipline, null);
  assert.deepEqual(many.endurance?.disciplineModalities, []);
});
await rail("68. a long session over the coach's long-session share", "C04", /the longest session \(\d+ min\) is \d+% of the week — the coach caps it at 40%/, (p) => {
  p.progression[0].sessions[0].minutes = 90;
  for (const x of p.progression[0].sessions.slice(1)) x.minutes = 20;
});
await rail("69. no down week on the coach's cadence", "C04", /down week every 3–4 weeks/, (p) => {
  p.progression = p.progression.map((w: { week: number; sessions: unknown[] }) => ({ ...w, deload: false, gate: "none", sessions: structuredClone(p.progression[0].sessions) }));
});
await check("70. 'no additional cardio' with the coach's step target is a coherent plan", async () => {
  const m = fakeModel(() => ({ status: "PLAN", plan: { warranted: false, role: "none", dose: { vsCoachRange: "none", why: "Steps only for now." }, objective: { summary: "No added sessions; steps.", why: "x" }, intensityMethod: { primary: "talk_test", why: "n/a" }, sessions: [], steps: { target: [7000, 9000], why: "Coach's target." }, progression: [], placementWhy: "n/a", monitoring: { measures: ["steps"], reviewAfterWeeks: 4 }, assumptions: [], decisions: (["warranted", "dose"] as const).map((topic) => ({ topic, decision: "x", because: "x", coach: [], client: [], evidence: [] })) } }));
  const r = planned(await runCardioReasoner({ input: S("C13").input(), model: m, nowIso: NOW }));
  assert.ok(!r.plan.warranted && r.plan.steps);
});

console.log("\n  V1.2 — deload baseline, recovery-limited structure, optional-cardio authority\n");
type WeekWire = { week: number; sessions: Array<{ minutes: number }>; deload: boolean; gate: string };
const scale = (w: WeekWire, from: WeekWire, f: number) => {
  w.sessions = structuredClone(from.sessions).map((x) => ({ ...x, minutes: Math.round(x.minutes * f) }));
};
await check("71. returning to (and modestly above) the established baseline after a deload is accepted — not measured from the deload", async () => {
  const { r } = await run("C04", (p) => {
    const [, w3, , w5] = p.progression as WeekWire[]; // weeks 3, 4 (deload), 5
    scale(w5, w3, 1.08);
  });
  const p = planned(r);
  const w = p.review.workload.weeks;
  assert.ok(w[3].deload && w[4].minutes.total / w[3].minutes.total > 1.2, "the rebound is > 20% over the deload week itself");
});
await rail("72. post-deload growth genuinely above the baseline + cap is still rejected", "C04", /week 5: \d+ min is \d+% above the established baseline \(week 3, \d+ min\) — the limit is 10%/, (p) => {
  const [, w3, , w5] = p.progression as WeekWire[];
  scale(w5, w3, 1.3);
});
await rail("73. a 'deload' that isn't lighter than the baseline", "C04", /week 4: marked as a deload but isn't lighter than the baseline/, (p) => {
  const [, w3, w4] = p.progression as WeekWire[];
  scale(w4, w3, 1);
});
await rail("74. the coach's down-week cadence needs a MARKED deload", "C04", /mark one of weeks 3–4 as a deload/, (p) => {
  for (const w of p.progression as WeekWire[]) w.deload = false;
});
await rail("75. recovery-limited: a new training day without a coach decision", "C03", /Cardio on Wednesday adds training day\(s\) for a recovery-limited client/, (p) => {
  p.sessions.push({ day: "Wednesday", type: "steady", modality: "cardio.walking", minutes: 30, intensity: "easy", effort: [2, 3], talk: "full_conversation", placement: "separate_day", optional: false, purpose: "Walk." });
});
await check("76. recovery-limited: a new training day WITH a prepared 'added_training_day' decision is reviewable", async () => {
  const { r } = await run("C03", (p) => {
    p.sessions.push({ day: "Wednesday", type: "steady", modality: "cardio.walking", minutes: 20, intensity: "easy", effort: [2, 3], talk: "full_conversation", placement: "separate_day", optional: false, purpose: "Walk." });
    for (const w of p.progression as Array<{ sessions: unknown[] }>) w.sessions.push({ day: "Wednesday", type: "steady", modality: "cardio.walking", minutes: 20, intensity: "easy", placement: "separate_day", optional: false });
    p.recoveryStrategy = "coach_decision";
    p.coachDecisions = [{ about: "added_training_day", question: "Add an easy Wednesday walk despite short sleep?", options: ["Yes, 20 min easy", "No — finishers only"], recommended: 1, why: "Recovery is the limiter." }];
  });
  const p = planned(r);
  assert.ok(p.review.coachDecisions.some((d) => d.about === "added_training_day" && d.recommended === "No — finishers only"));
});
await rail("77. recovery-limited: growth that isn't gated on recovery improving", "C03", /grows above week 1 .* for a recovery-limited client — gate it on "recovery_improved"/, (p) => {
  const w = (p.progression as WeekWire[])[1];
  w.sessions[0].minutes += 5;
  w.gate = "none";
});
await rail("78. recovery-limited: no recovery strategy", "C03", /Recovery is limited — state "recoveryStrategy"/, (p) => {
  delete p.recoveryStrategy;
});
await rail("79. recovery-limited: 'reduced_dose' that sits inside the coach's range", "C03", /"reduced_dose" but week 1 sits inside the coach's range/, (p) => {
  p.recoveryStrategy = "reduced_dose";
  p.dose.vsCoachRange = "within";
});
await check("80. recovery-limited with NO known resistance program: any cardio day may be new → needs the coach decision", async () => {
  const m = fakeModel((ri) => scriptedCardio(ri as never, (p) => (p.recoveryStrategy = "reduced_dose")));
  const r = await runCardioReasoner({ input: S("C03").input(), model: m, nowIso: NOW, resistance: null, maxAttempts: 1 });
  rejectedWith(r, /no resistance program is known, so every cardio day may be new/);
});
await rail("81. optional cardio the coach never sized grows without coach confirmation", "C13", /optional cardio grows .* the coach never set an amount — keep it flat or gate it on "coach_confirmed"/, (p) => {
  (p.progression as WeekWire[])[1].sessions[0].minutes += 10;
});
await rail("82. optional growth gated on the coach but with no prepared 'optional_dose' decision", "C13", /growing optional cardio needs a prepared "optional_dose" coach decision/, (p) => {
  const w = (p.progression as WeekWire[])[1];
  w.sessions[0].minutes += 10;
  w.gate = "coach_confirmed";
  p.coachDecisions = [{ about: "added_training_day", question: "?", options: ["a", "b"], recommended: 0, why: "x" }];
});
await check("83. optional growth gated on a prepared 'optional_dose' decision is reviewable — the coach sets the amount", async () => {
  const { r } = await run("C13", (p) => {
    for (const w of (p.progression as WeekWire[]).slice(1)) {
      w.sessions[0].minutes += 10;
      w.gate = "coach_confirmed";
    }
    p.coachDecisions = [{ about: "optional_dose", question: "How much optional easy cardio do you want this client offered?", options: ["Keep it at the week-1 offer", "Grow it by 10 min/week to ~80 min"], recommended: 0, why: "Your method sets no amount for optional cardio." }];
  });
  const p = planned(r);
  assert.ok(p.review.coachDecisions.some((d) => d.about === "optional_dose") && p.review.progression.some((x) => /only once the coach confirms/.test(x)));
});
await rail("84. an optional dose sized from fat-loss minute guidance (another role's volume)", "C13", /optional cardio dose cites weekly-minute guidance \(concept\.cardio\.weight_management#fatloss\.dose\)/, (p) => {
  p.decisions.find((d: { topic: string }) => d.topic === "dose").evidence = ["concept.cardio.weight_management#fatloss.dose"];
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
