// Unified Program U1 — rails. Scripted models only (router model → each domain's own scripted model). Proves the
// orchestration coordinates the domains (cardio around THIS lifting week, nutrition for THIS training), never changes an
// approved program, makes no model call when the program is blocked, reports failures instead of hiding them, and that
// every cross-domain check fires on a tampered program.

import assert from "node:assert/strict";
import { runUnifiedProgram, trainingContextFor, type DomainResults } from "./orchestrate.ts";
import { validateCrossDomain } from "./validate.ts";
import type { ProgramDay, UnifiedProgramProposal } from "./contract.ts";
import { sha256 } from "../reasoner/run.ts";
import { NOW, routerModel } from "./eval/fixtures.ts";
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

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
