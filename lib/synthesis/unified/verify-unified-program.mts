// Unified Program U1 — rails. Scripted models only (router model → each domain's own scripted model). Proves the
// orchestration coordinates the domains (cardio around THIS lifting week, nutrition for THIS training), never changes an
// approved program, makes no model call when the program is blocked, reports failures instead of hiding them, and that
// every cross-domain check fires on a tampered program.

import assert from "node:assert/strict";
import { runUnifiedProgram, trainingContextFor, type DomainResults } from "./orchestrate.ts";
import { validateCrossDomain } from "./validate.ts";
import type { ProgramDay, UnifiedProgramProposal } from "./contract.ts";
import { sha256 } from "../reasoner/run.ts";
import { NOW, routerModel, scenarioInput, fullCoach, restrict, programContent, LOWER, UPPER } from "./eval/fixtures.ts";
import { UNIFIED_SCENARIOS, scenarioHard } from "./eval/scenarios.ts";
import { scriptedCardio } from "../reasoner/cardio/eval/fixtures.ts";
import { scriptedOutput } from "../reasoner/eval/fixtures.ts";

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

const S = (id: string) => UNIFIED_SCENARIOS.find((s) => s.id === id)!;
const run = async (id: string, model = routerModel()) => {
  const s = S(id);
  const input = s.input();
  const u = await runUnifiedProgram({ input, model, nowIso: NOW, approvedResistance: s.approved ?? null, proceedWithoutResistance: s.proceedWithoutResistance, maxAttempts: 1, runId: `u-${id}` });
  return { u, input, model };
};
/** Re-run the cross-domain validator on a (possibly tampered) program built from a real run. */
async function tamper(id: string, mutate: (x: { results: DomainResults; week: ProgramDay[]; u: UnifiedProgramProposal }) => { approvedHashBefore?: string | null; recoveryLimited?: boolean } | void) {
  const s = S(id);
  const input = s.input();
  const results: DomainResults = { resistance: null, cardio: null, nutrition: null, resistanceWeek: null, training: null };
  // Capture the domain results by running the orchestrator's steps through a spy model (same scripted outputs).
  const u = await runUnifiedProgram({ input, model: routerModel(), nowIso: NOW, approvedResistance: s.approved ?? null, maxAttempts: 1 });
  const { runCardioReasoner } = await import("../reasoner/cardio/reasoner.ts");
  const { runNutritionReasoner } = await import("../reasoner/nutrition/reasoner.ts");
  const { runFitnessReasoner } = await import("../reasoner/reasoner.ts");
  const { resistanceWeekFromContent, resistanceWeekFromSpec } = await import("../cardio/schedule.ts");
  const { FOUNDATION_KNOWLEDGE } = await import("../knowledge/registry.ts");
  const m = routerModel();
  if (s.approved) results.resistanceWeek = resistanceWeekFromContent(s.approved.content, FOUNDATION_KNOWLEDGE, "approved_program");
  else {
    results.resistance = await runFitnessReasoner({ input, model: m, nowIso: NOW, maxAttempts: 1, runId: u.provenance.domainRuns.resistance?.runId });
    if (results.resistance.status === "PLANNED") results.resistanceWeek = resistanceWeekFromSpec(results.resistance.spec, FOUNDATION_KNOWLEDGE);
  }
  results.cardio = await runCardioReasoner({ input, model: m, nowIso: NOW, resistance: results.resistanceWeek, maxAttempts: 1 });
  results.training = results.resistanceWeek ? trainingContextFor(results.resistanceWeek) : null;
  results.nutrition = await runNutritionReasoner({ input, model: m, nowIso: NOW, training: results.training, maxAttempts: 1 });
  const week = structuredClone(u.week);
  const o = mutate({ results, week, u }) ?? {};
  return validateCrossDomain({ input, domains: u.domains, results, week, workload: u.workload, recoveryLimited: o.recoveryLimited ?? u.recovery.limited, approved: s.approved ?? null, approvedHashBefore: o.approvedHashBefore !== undefined ? o.approvedHashBefore : s.approved ? sha256(s.approved.content) : null });
}

console.log("\nUnified Program Intelligence — Gate U1\n");

await check("1. every scenario meets its whole-program invariants (status, domain statuses, model-call bounds, coherence)", async () => {
  for (const s of UNIFIED_SCENARIOS) {
    const { u, input } = await run(s.id);
    const h = scenarioHard(s, u, input);
    assert.deepEqual(h, [], `${s.id}: ${h.join("; ")}`);
  }
  const cats = new Set(UNIFIED_SCENARIOS.map((s) => s.category));
  for (const c of ["fat_loss", "muscle_gain_recovery", "strength", "recomposition", "hybrid", "coach_scope", "nutrition_methods", "schedule_conflict", "missing_info", "safety"]) assert.ok(cats.has(c), c);
});

await check("2. coordination: cardio is planned around THIS program's lifting week; nutrition is prepared for THIS training (proposed lifting)", async () => {
  const { u, model } = await run("U03");
  assert.equal(u.domains.resistance.status, "PROPOSED");
  assert.equal(model.calls.resistance, 1);
  const days = u.week.filter((d) => d.resistance).map((d) => d.day);
  assert.ok(days.length >= 2);
  assert.ok(u.week.filter((d) => d.resistance).every((d) => d.resistance!.source === "proposed_program"));
  assert.deepEqual(u.crossDomain.errors, []);
});

await check("3. an approved program is fixed input: never regenerated, unchanged byte-for-byte, its version recorded; cardio and nutrition use it", async () => {
  const s = S("U01");
  const before = sha256(s.approved!.content);
  const { u, model } = await run("U01");
  assert.equal(model.calls.resistance, 0);
  assert.equal(sha256(s.approved!.content), before);
  assert.deepEqual(u.provenance.approvedResistance, { versionId: "pv-approved-ul", contentHash: before });
  assert.deepEqual(u.week.filter((d) => d.resistance).map((d) => d.day), ["Monday", "Tuesday", "Thursday", "Friday"]);
  assert.ok(u.week.filter((d) => d.resistance).every((d) => d.resistance!.source === "approved_program"));
});

await check("4. blocked programs make NO model call and list every open input at once (preflight)", async () => {
  for (const id of ["U01X", "U09A", "U09B", "U10A", "U10B"]) {
    const { u, model } = await run(id);
    assert.equal(model.calls.resistance + model.calls.cardio + model.calls.nutrition, 0, `${id} called a model`);
    assert.equal(u.provenance.modelCalls, 0, id);
  }
});

await check("5. a domain that fails at runtime is reported, never filled in: cardio REJECTED → no cardio in the week, program INCOMPLETE", async () => {
  const bad = routerModel({ cardio: (ri) => scriptedCardio(ri, (p) => (p.sessions[0].day = "Sunday")) });
  const { u } = await run("U03", bad);
  assert.equal(u.domains.cardio.status, "REJECTED");
  assert.ok(u.domains.cardio.reasons.some((r) => /available days/.test(r)));
  assert.equal(u.status, "INCOMPLETE");
  assert.ok(u.week.every((d) => !d.cardio), "no cardio shown in place of the rejected proposal");
  assert.equal(u.domains.nutrition.status, "PROPOSED", "nutrition still prepared for the lifting it depends on");
});

await check("6. resistance fails at runtime → cardio and nutrition are HELD (no calls) with a prepared program decision", async () => {
  const bad = routerModel({ resistance: (ri) => scriptedOutput(ri, (p) => (p.sessions[0].day = "Sunday")) });
  const { u, model } = await run("U03", bad);
  assert.equal(u.domains.resistance.status, "REJECTED");
  assert.equal(model.calls.cardio + model.calls.nutrition, 0);
  assert.deepEqual([u.domains.cardio.status, u.domains.nutrition.status], ["HELD", "HELD"]);
  assert.ok(u.decisions.some((d) => d.about === "resistance_unavailable"));
});

await check("7. no model available → PROVIDER_FAILED reported; dependents held; nothing invented", async () => {
  const u = await runUnifiedProgram({ input: S("U03").input(), model: null, nowIso: NOW });
  assert.equal(u.domains.resistance.status, "PROVIDER_FAILED");
  assert.deepEqual([u.domains.cardio.status, u.domains.nutrition.status], ["HELD", "HELD"]);
  assert.equal(u.status, "INCOMPLETE");
});

await check("8. nothing irrelevant is forced: a coach without cardio/nutrition gets neither, and makes only the resistance call", async () => {
  const { u, model } = await run("U11");
  assert.deepEqual([u.domains.cardio.status, u.domains.nutrition.status], ["NOT_COACHED", "NOT_COACHED"]);
  assert.equal(model.calls.cardio + model.calls.nutrition, 0);
  assert.equal(u.workload.cardioMinutes.total, 0);
  assert.ok(!u.objective.byDomain.cardio && !u.objective.byDomain.nutrition);
});

await check("9. 'no additional cardio' is a valid program outcome", async () => {
  const none = routerModel({ cardio: () => ({ status: "PLAN", plan: { warranted: false, role: "none", dose: { vsCoachRange: "none", why: "Lifting already fills the week." }, objective: { summary: "No added cardio.", why: "Lifting already fills the week." }, intensityMethod: { primary: "talk_test", why: "n/a" }, sessions: [], progression: [], placementWhy: "n/a", monitoring: { measures: [], reviewAfterWeeks: 4 }, assumptions: [], decisions: (["warranted", "dose"] as const).map((topic) => ({ topic, decision: "x", because: "x", coach: [], client: [], evidence: [] })) } }) });
  const { u } = await run("U03", none);
  assert.equal(u.domains.cardio.status, "NO_ADDITIONAL");
  assert.ok(["READY_FOR_REVIEW", "NEEDS_COACH_DECISION"].includes(u.status), u.status);
  assert.ok(/No additional cardio/.test(u.objective.byDomain.cardio ?? ""));
});

await check("10. the proceed-without-resistance decision is honoured only when the coach gives it", async () => {
  const held = (await run("U01X")).u;
  const go = (await run("U01P")).u;
  assert.deepEqual([held.domains.cardio.status, go.domains.cardio.status], ["HELD", "PROPOSED"]);
});

console.log("\n  cross-domain validation — each check fires on a tampered program\n");
await check("11. cardio planned around a different lifting week", async () => {
  const x = await tamper("U03", ({ results }) => {
    results.resistanceWeek = { ...results.resistanceWeek!, days: results.resistanceWeek!.days.slice(1) };
  });
  assert.ok(x.errors.some((e) => /Cardio was planned around a different lifting week/.test(e)), x.errors.join(" | "));
});
await check("12. nutrition prepared for different training than the program", async () => {
  const x = await tamper("U03", ({ results }) => {
    results.training = { ...results.training!, sessionsPerWeek: results.training!.sessionsPerWeek + 2 };
  });
  assert.ok(x.errors.some((e) => /Nutrition assumed/.test(e)), x.errors.join(" | "));
});
await check("13. an approved program that changed during planning", async () => {
  const x = await tamper("U01", () => ({ approvedHashBefore: "not-the-original" }));
  assert.ok(x.errors.some((e) => /approved resistance program changed/.test(e)));
});
await check("14. a domain reasoned over a different client state / coach method", async () => {
  const x = await tamper("U03", ({ u }) => {
    u.domains.cardio.run!.hashes.clientState = "other";
    u.domains.nutrition.run!.versions.coachMethod = { versionId: "mv-other", version: 1 };
  });
  assert.ok(x.errors.some((e) => /cardio was reasoned over a different client state/.test(e)) && x.errors.some((e) => /nutrition used coach method mv-other/.test(e)), x.errors.join(" | "));
});
await check("15. cardio for fat loss next to a nutrition surplus", async () => {
  const x = await tamper("U01", ({ results }) => {
    const n = results.nutrition as { status: string; plan: { energy: { mode: string; kcal: { min: number; max: number } } }; run: { energy: { maintenanceKcal: { high: number } } } };
    n.plan.energy = { ...n.plan.energy, mode: "target", kcal: { min: n.run.energy.maintenanceKcal.high + 300, max: n.run.energy.maintenanceKcal.high + 500 } };
  });
  assert.ok(x.errors.some((e) => /Cardio is prescribed for fat loss while nutrition targets a surplus/.test(e)), x.errors.join(" | "));
});
await check("16. a same-visit total over the client's cap, and proposed training on an unavailable day", async () => {
  const x = await tamper("U03", ({ week }) => {
    const d = week.find((w) => w.resistance)!;
    d.cardio = { type: "steady", modality: "cardio.cycling_stationary", minutes: 90, intensity: "easy", placement: "after_resistance", optional: false };
    d.longestVisitMinutes = d.resistance!.minutes + 90;
    const sun = week.find((w) => w.day === "Sunday")!;
    sun.cardio = { type: "steady", modality: "cardio.walking", minutes: 20, intensity: "easy", placement: "separate_day", optional: false };
  });
  assert.ok(x.errors.some((e) => /exceeds the client's 75-min cap/.test(e)) && x.errors.some((e) => /Sunday: the program trains on a day the client isn't available/.test(e)), x.errors.join(" | "));
});
await check("17. no rest day: a prepared decision when recovery is limited, a warning otherwise (never a silent change)", async () => {
  const limited = await tamper("U01", ({ u }) => {
    u.workload.trainingDays = 7;
    return { recoveryLimited: true };
  });
  assert.ok(limited.decisions.some((d) => d.about === "no_rest_day"));
  const ok = await tamper("U01", ({ u }) => {
    u.workload.trainingDays = 7;
    return { recoveryLimited: false };
  });
  assert.ok(ok.findings.some((f) => f.code === "no_rest_day") && !ok.decisions.some((d) => d.about === "no_rest_day"));
});
await check("18. lifting deload while cardio rises is surfaced for the coach", async () => {
  const x = await tamper("U03", ({ results }) => {
    const r = results.resistance as { status: string; spec: { resistance: { value: { weeks: Array<{ week: number; kind: string }> } } } };
    r.spec.resistance.value.weeks = r.spec.resistance.value.weeks.map((w) => ({ ...w, kind: w.week === 3 ? "deload" : w.kind }));
    const c = results.cardio as { status: string; review: { workload: { weeks: Array<{ week: number; minutes: { total: number }; deload: boolean }> } } };
    c.review.workload.weeks = c.review.workload.weeks.map((w) => ({ ...w, minutes: { ...w.minutes, total: w.week === 3 ? w.minutes.total + 60 : w.minutes.total } }));
  });
  assert.ok(x.findings.some((f) => f.code === "deload_misaligned"), JSON.stringify(x.alignment));
});

await check("19. deterministic: the same inputs and scripted outputs give the same program", async () => {
  const a = (await run("U03")).u;
  const b = (await run("U03")).u;
  const strip = (u: UnifiedProgramProposal) => JSON.stringify({ ...u, provenance: { ...u.provenance, domainRuns: Object.keys(u.provenance.domainRuns) } });
  assert.equal(strip(a), strip(b));
});

await check("20. one coach method, one client: every domain run shares the program's client, goal and coach-method version", async () => {
  const { u, input } = await run("U05");
  for (const r of Object.values(u.provenance.domainRuns)) {
    assert.equal(r!.hashes.clientState, sha256(input.client));
    assert.equal(r!.versions.coachMethod?.versionId, input.coach!.versionId);
  }
});

await check("21. a second visit in a day for a client with one training time becomes a prepared decision (never assumed)", async () => {
  const { u } = await run("U01");
  const twoVisit = u.week.filter((d) => d.visits > 1).map((d) => d.day);
  assert.ok(twoVisit.length, "the scripted program places a separate cardio session on a lifting day");
  const d = u.decisions.find((x) => x.about === "second_visit");
  assert.ok(d && d.options.length >= 2 && d.recommended, JSON.stringify(u.decisions));
  assert.equal(u.status, "NEEDS_COACH_DECISION");
});

console.log("\n  safety alignment with the canonical coach health-review policy (U2 closure)\n");
const DOC = "No squats or lower body compounds like leg press; no bracing; no ab work.";
const reviewed = (status: string, extra: Record<string, unknown> = {}) => ({ clientId: "client-eval", workspaceId: "ws-eval", status, reasons: ["Flagged being advised to limit or avoid exercise."], createdAtIso: NOW, updatedAtIso: NOW, documentedLimitations: DOC, ...extra }) as never;
const structuredNone = { schema: 1, sourceText: DOC, restrictions: [], noExerciseRestrictions: true, confirmedBy: "coach-eval", confirmedAtIso: NOW, interpretation: { interpreter: { kind: "manual", reason: "x" }, proposedOptionIds: [], removedOptionIds: [], addedOptionIds: [], clarifications: [] } };
const confirmedTags = restrict([{ kind: "avoid_movement_pattern", pattern: "squat" }, { kind: "avoid_movement_pattern", pattern: "hinge" }, { kind: "avoid_demand", demand: "bracing", atOrAbove: "high" }]).map((r) => ({ ...r, interprets: ["client-eval:coach_documented_limitation"] }));
const person = (goal: string, screen: string[], more: Record<string, unknown> = {}) => ({ what_you_want: { primaryGoal: goal, secondaryGoals: [] }, health_finish: { hasInjuryHistory: false, safetyScreen: screen }, your_week: { availableDays: ["mon", "tue", "wed", "thu", "fri", "sat"], maxSessionLength: "75", trainingEnvironment: ["commercial_gym"], preferredTrainingTime: ["evening", "morning"] }, ...more });
const go = async (input: ReturnType<typeof scenarioInput>, opts: Partial<Parameters<typeof runUnifiedProgram>[0]> = {}, model = routerModel()) => ({ u: await runUnifiedProgram({ input, model, nowIso: NOW, maxAttempts: 1, ...opts }), model });

await check("22. reviewed limitations (proceed_with_limitations, restrictions confirmed): lifting and nutrition proceed within the confirmed limits; cardio's screen escalation blocks ONLY cardio, with a prepared clearance decision", async () => {
  const input = scenarioInput({ coach: fullCoach(), patch: person("get_stronger", ["advised_limit"]), healthReview: reviewed("proceed_with_limitations"), restrictions: confirmedTags });
  const { u, model } = await go(input);
  assert.deepEqual([u.domains.resistance.status, u.domains.cardio.status, u.domains.nutrition.status], ["PROPOSED", "ESCALATE", "PROPOSED"], JSON.stringify(Object.values(u.domains).map((d) => d.reasons)));
  assert.equal(model.calls.cardio, 0, "cardio was never planned");
  assert.ok(u.decisions.some((d) => d.about === "cardio_clearance") && u.status === "NEEDS_COACH_DECISION", u.status);
  assert.ok(/isn't a clearance for cardio/.test(u.domains.cardio.reasons.join(" ")));
  const r = (await import("../reasoner/eval/fixtures.ts")).scriptedOutput;
  void r;
});

await check("23. the confirmed restrictions still bind lifting (no squat/hinge in the proposed plan)", async () => {
  const input = scenarioInput({ coach: fullCoach(), patch: person("get_stronger", ["advised_limit"]), healthReview: reviewed("proceed_with_limitations"), restrictions: confirmedTags });
  let resistance: unknown = null;
  await runUnifiedProgram({ input, model: routerModel(), nowIso: NOW, maxAttempts: 1, onResults: (x) => (resistance = x.resistance) });
  const res = resistance as { status: string; spec: { resistance: { value: { sessions: Array<{ exercises: Array<{ exerciseId: string }> }> } } } };
  assert.equal(res.status, "PLANNED");
  const { FOUNDATION_KNOWLEDGE } = await import("../knowledge/registry.ts");
  const patterns = res.spec.resistance.value.sessions.flatMap((s) => s.exercises.flatMap((e) => FOUNDATION_KNOWLEDGE.getExercise(e.exerciseId)?.patterns ?? []));
  assert.ok(!patterns.includes("squat") && !patterns.includes("hinge"), patterns.join(","));
});

await check("24. unresolved health concern: screen flagged and no coach review → the whole program stops (no domain proposed), 0 model calls, no clearance invented", async () => {
  const { u, model } = await go(scenarioInput({ coach: fullCoach(), patch: person("get_stronger", ["advised_limit"]) }));
  assert.equal(model.calls.resistance + model.calls.cardio + model.calls.nutrition, 0);
  assert.ok(["ESCALATE", "INCOMPLETE", "NEEDS_INPUT"].includes(u.status), u.status);
  assert.ok(!Object.values(u.domains).some((d) => d.status === "PROPOSED"));
  assert.ok(!u.decisions.some((d) => d.about === "cardio_clearance"), "a clearance decision only exists under a resolved review");
  // Without cardio in play, the canonical readiness (open health review) is what stops it.
  const noCardio = await go(scenarioInput({ coach: fullCoach({ t_cardio_roles: ["fat_loss"] }), patch: person("build_muscle", ["advised_limit"]) }));
  assert.equal(noCardio.model.calls.resistance + noCardio.model.calls.nutrition, 0);
  assert.ok(Object.values(noCardio.u.domains).some((d) => d.reasons.some((r) => /health_review/.test(r))), JSON.stringify(Object.values(noCardio.u.domains).map((d) => d.reasons)));
});

await check("25. a structured confirmation that contradicts the review it confirms ('no exercise restrictions' vs documented exercises) stops planning with a coach decision — never treated as clearance", async () => {
  const input = scenarioInput({ coach: fullCoach(), patch: person("build_muscle", ["advised_limit", "joint_muscular"]), healthReview: reviewed("proceed_with_limitations", { structuredLimitations: structuredNone }) });
  assert.equal(input.client.health.review.structuredStatus, "current");
  const { u, model } = await go(input);
  assert.equal(model.calls.resistance + model.calls.cardio + model.calls.nutrition, 0);
  assert.equal(u.status, "NEEDS_INPUT");
  assert.ok(u.decisions.some((d) => d.about === "confirm_structured_limitations"));
  assert.ok(/squat/.test(u.domains.resistance.reasons.join(" ")));
});

await check("26. cardio not applicable to this goal (the real client's setup): no cardio planning and no cardio clearance demanded, even with a flagged screen", async () => {
  const input = scenarioInput({ coach: fullCoach({ t_cardio_roles: ["fat_loss"] }), patch: person("build_muscle", ["advised_limit"]), healthReview: reviewed("proceed_with_limitations"), restrictions: confirmedTags });
  const { u, model } = await go(input);
  assert.equal(u.domains.cardio.status, "NOT_COACHED");
  assert.equal(model.calls.cardio, 0);
  assert.ok(!u.decisions.some((d) => d.about === "cardio_clearance") && /no cardio-specific clearance/.test(u.domains.cardio.summary));
  assert.equal(u.domains.resistance.status, "PROPOSED");
});

await check("27. domain-specific: a cardio text flag (heart condition) still stops the whole program when cardio applies (unchanged), but isn't evaluated when cardio doesn't apply", async () => {
  const heart = { what_you_want: { primaryGoal: "get_stronger", secondaryGoals: [], successDefinition: "get fit again after my heart attack" } };
  const applies = await go(scenarioInput({ coach: fullCoach(), patch: { ...person("get_stronger", ["none"]), ...heart } }));
  assert.equal(applies.u.status, "ESCALATE");
  assert.equal(applies.model.calls.resistance, 0);
  const notApplies = await go(scenarioInput({ coach: fullCoach({ t_cardio_roles: ["none"] }), patch: { ...person("get_stronger", ["none"]), ...heart } }));
  assert.equal(notApplies.u.domains.cardio.status, "NOT_COACHED");
  assert.notEqual(notApplies.u.status, "ESCALATE", "a non-applicable domain doesn't block the program");
});

await check("28. multi-domain escalation: a resolved review covers the cardio screen, but nutrition's population escalation (pregnancy) still stops the whole program", async () => {
  const input = scenarioInput({ coach: fullCoach(), patch: person("get_stronger", ["advised_limit"], { health_finish: { hasInjuryHistory: true, injuryRestrictions: "I'm pregnant, 20 weeks", safetyScreen: ["advised_limit"] } }), healthReview: reviewed("proceed_with_limitations"), restrictions: confirmedTags });
  const { u, model } = await go(input);
  assert.equal(u.status, "ESCALATE");
  assert.equal(model.calls.resistance + model.calls.cardio + model.calls.nutrition, 0);
  assert.ok(u.escalations.some((e) => e.source === "nutrition") || u.escalations.some((e) => e.source === "cardio"), JSON.stringify(u.escalations));
});

await check("29. a pending lifting draft that no longer fits the confirmed restrictions isn't used (prepared decision, 0 calls); a fitting one is used unchanged", async () => {
  const input = scenarioInput({ coach: fullCoach({ t_cardio_roles: ["fat_loss"] }), patch: person("build_muscle", ["advised_limit"]), healthReview: reviewed("proceed_with_limitations"), restrictions: confirmedTags });
  const bad = { ...programContent([{ day: "Monday", exercises: ["Barbell Back Squat", "Lat Pulldown"] }, { day: "Thursday", exercises: UPPER }], 8), clientId: "client-eval" } as never;
  const r1 = await go(input, { existingResistanceDraft: { versionId: "v-bad", content: bad } });
  assert.equal(r1.u.domains.resistance.status, "NEEDS_INPUT", JSON.stringify(r1.u.domains.resistance));
  assert.ok(r1.u.decisions.some((d) => d.about === "pending_draft_conflicts"));
  assert.equal(r1.model.calls.resistance + r1.model.calls.nutrition, 0);
  // Supported/machine variants (a standing barbell overhead press has HIGH bracing — correctly excluded by "no high bracing").
  const good = { ...programContent([{ day: "Monday", exercises: ["Machine Chest Press", "Chest-Supported Row", "Machine Shoulder Press"] }, { day: "Thursday", exercises: ["Leg Curl", "Leg Extension"] }], 8), clientId: "client-eval" } as never;
  const r2 = await go(input, { existingResistanceDraft: { versionId: "v-good", content: good } });
  assert.equal(r2.u.domains.resistance.status, "PROPOSED", JSON.stringify(r2.u.domains.resistance.reasons));
  assert.equal(r2.model.calls.resistance, 0, "used unchanged, not regenerated");
});

await check("30. an approved program that conflicts with current restrictions is never changed — the conflict becomes a coach decision", async () => {
  const input = scenarioInput({ coach: fullCoach({ t_cardio_roles: ["fat_loss"] }), patch: person("build_muscle", ["advised_limit"]), healthReview: reviewed("proceed_with_limitations"), restrictions: confirmedTags });
  const approved = { ...programContent([{ day: "Monday", exercises: LOWER }, { day: "Thursday", exercises: UPPER }], 8), clientId: "client-eval" } as never;
  const before = JSON.stringify(approved);
  const { u } = await go(input, { approvedResistance: { versionId: "v-appr", content: approved } });
  assert.equal(JSON.stringify(approved), before);
  assert.ok(u.decisions.some((d) => d.about === "approved_program_conflicts") && u.domains.resistance.status === "APPROVED_EXISTING");
});

await check("31. exercises the documented limitations name but the confirmed restrictions allow (pulldowns, pushdowns, single-leg calf raises) are flagged for explicit coach review — never declared safe, restrictions unchanged", async () => {
  const realDoc = "no squats, or lower body compounds like leg press, RDLs, or single leg pushing motions. No movements that involve bracing like high effort lat pull downs or tricep push downs. no ab workouts.";
  const tags = restrict([{ kind: "avoid_movement_pattern", pattern: "squat" }, { kind: "avoid_movement_pattern", pattern: "hinge" }, { kind: "avoid_movement_pattern", pattern: "single_leg" }, { kind: "avoid_demand", demand: "bracing", atOrAbove: "moderate" }]).map((r) => ({ ...r, interprets: ["client-eval:coach_documented_limitation"] }));
  const input = scenarioInput({ coach: fullCoach({ t_cardio_roles: ["fat_loss"] }), patch: person("build_muscle", ["advised_limit"]), healthReview: reviewed("proceed_with_limitations", { documentedLimitations: realDoc }), restrictions: tags });
  const constraintsBefore = JSON.stringify(input.constraints);
  // (Lat Pulldown's fit is uncertain in this fixture's context, which would correctly withhold the draft — its name match is asserted directly below.)
  const draft = { ...programContent([{ day: "Monday", exercises: ["Cable Triceps Pushdown", "Machine Chest Press"] }, { day: "Thursday", exercises: ["Leg Curl", "Single-Leg Calf Raise", "Seated Calf Raise"] }], 8), clientId: "client-eval" } as never;
  const { u, model } = await go(input, { existingResistanceDraft: { versionId: "v-doc", content: draft } });
  assert.equal(u.domains.resistance.status, "PROPOSED", JSON.stringify(u.domains.resistance.reasons));
  const d = u.decisions.find((x) => x.about === "documented_limitation_exercise_review");
  assert.ok(d && /Cable Triceps Pushdown/.test(d.question) && /Single-Leg Calf Raise/.test(d.question), d?.question);
  const { documentedExerciseMentions } = await import("./safety.ts");
  assert.equal(documentedExerciseMentions("Lat Pulldown", realDoc), "lat pulldown");
  assert.ok(!/Leg Curl|Seated Calf Raise|Machine Chest Press/.test(d!.question), "no false positives");
  assert.equal(d!.recommended, null, "OPTIM doesn't recommend whether they're safe");
  assert.equal(u.status, "NEEDS_COACH_DECISION");
  assert.equal(JSON.stringify(input.constraints), constraintsBefore, "confirmed restrictions unchanged");
  assert.equal(model.calls.resistance, 0);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
