// Gate U3B — offline checks of the review rules (lib/synthesis/unified/review.ts) and the nutrition edit rules
// (lib/production/unified-review.ts applyNutritionEdit). Scripted domain models; no database, no model calls.
//
//   node --experimental-strip-types lib/synthesis/unified/verify-unified-review.mts

import assert from "node:assert/strict";
import { runUnifiedProgram, type DomainResults } from "./orchestrate.ts";
import { fullCoach, routerModel, scenarioInput, NOW } from "./eval/fixtures.ts";
import { applyEffortLimitEverywhere, approvalBlockers, decisionKey, effortLimitedExercises, effortLimitViolations, EFFORT_LIMIT_MIN_RIR, excludedExercises, exerciseLocations, removeExerciseEverywhere, reviewDecisions, revalidateDrafts, syncCardioSession, type Revalidation } from "./review.ts";
import { buildUnifiedTrainingContent, type UnifiedArtifacts } from "../../production/unified-drafts.ts";
import { applyNutritionEdit } from "../../production/unified-review.ts";
import { toAssignedNutritionPlanDraft } from "../reasoner/nutrition/to-plan.ts";
import { applyTrainingItemPatch } from "../../training/program-proposal-editing.ts";
import { FOUNDATION_KNOWLEDGE } from "../knowledge/registry.ts";
import { universalProgramToClientAssignedProgram, universalProgramToTodayProgram } from "../../training/legacy-adapter.ts";
import { cardioCountsToday } from "../../calculations.ts";
import { createInitialState } from "../../state.ts";
import type { AssignedNutritionPlan } from "../../types.ts";
import type { UniversalTrainingProgramContent } from "../../training/types.ts";
import type { UnifiedProgramProposal } from "./contract.ts";
import type { SynthesisInput } from "../synthesis-input.ts";

let passed = 0;
let failed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`  ok  - ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL  - ${name}\n        ${(err as Error).message}`);
    failed++;
  }
}

const week = { availableDays: ["mon", "tue", "wed", "thu", "fri", "sat"], maxSessionLength: "75", trainingEnvironment: ["commercial_gym"], preferredTrainingTime: ["evening", "morning"] };
async function program(over: Record<string, unknown> = {}, goal = "get_stronger") {
  const coach = fullCoach(over);
  const input = scenarioInput({ clientId: "client-1", coach, patch: { what_you_want: { primaryGoal: goal }, your_week: week } });
  let results: DomainResults | null = null;
  const proposal = await runUnifiedProgram({ input, model: routerModel(), nowIso: NOW, maxAttempts: 1, onResults: (r) => (results = r) });
  const r = results as unknown as DomainResults;
  const artifacts: UnifiedArtifacts = { resistance: r.resistance?.status === "PLANNED" ? { source: "proposed_program", result: r.resistance, generationInputs: { version: 1, recordedAtIso: NOW, coachMethod: { methodVersionId: "mv", playbookVersion: 1, operatingModelVersion: 1, confirmedAtIso: NOW, summary: [] }, clientIntake: { source: "client_onboarding", completedAtIso: NOW, healthReview: "not_required", summary: [], assumptions: [] } } } : { source: "none" }, cardio: r.cardio ?? null, nutrition: r.nutrition ?? null };
  const training = buildUnifiedTrainingContent({ rowId: "row-1", artifacts, proposal, knowledge: FOUNDATION_KNOWLEDGE, workspaceId: "ws-1", clientProfileId: "client-1", coachId: "coach-1", title: "Unified", nowIso: NOW });
  const n = r.nutrition && (r.nutrition.status === "PLANNED" || r.nutrition.status === "NEEDS_COACH_REVIEW") ? toAssignedNutritionPlanDraft(r.nutrition.plan) : null;
  const nutrition = n && n.ok ? ({ id: "n-1", ...n.content, approvedAtIso: "" } as AssignedNutritionPlan) : null;
  return { input, proposal, artifacts, training, nutrition };
}
type P = Awaited<ReturnType<typeof program>>;
const reval = (p: P, current: { training?: UniversalTrainingProgramContent | null; nutrition?: AssignedNutritionPlan | null }, over: { input?: SynthesisInput; resistanceSource?: "approved_program" | "proposed_program"; proposal?: UnifiedProgramProposal; excluded?: string[]; effortLimited?: string[] } = {}): Revalidation =>
  revalidateDrafts({ excluded: over.excluded, effortLimited: over.effortLimited, input: over.input ?? p.input, knowledge: FOUNDATION_KNOWLEDGE, proposal: over.proposal ?? p.proposal, resistanceSource: over.resistanceSource ?? "proposed_program", cardio: p.artifacts.cardio, nutrition: p.artifacts.nutrition, original: { training: p.training, nutrition: p.nutrition }, current: { training: current.training === undefined ? p.training : current.training, nutrition: current.nutrition === undefined ? p.nutrition : current.nutrition }, versions: { training: "t", nutrition: "n" } });
const find = (c: UniversalTrainingProgramContent, fam: string) => {
  for (const w of c.weeks) for (const d of w.days) for (const [si, s] of (d.sessions ?? []).entries()) for (const b of s.blocks) for (const i of b.items) if (i.prescription.family === fam) return { path: { weekNumber: w.weekNumber, dayOfWeek: d.dayOfWeek, sessionIndex: si, blockId: b.id, itemId: i.id }, item: i };
  return null;
};

console.log("\nGate U3B — unified review rules (offline)\n");
const base = await program();

await check("1. the untouched drafts revalidate clean and reproduce the proposal's own week and workload", () => {
  const r = reval(base, {});
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.workload, base.proposal.workload);
  assert.ok(!r.domains.resistance.edited && !r.domains.cardio.edited && !r.domains.nutrition.edited);
});

await check("2. a cardio edit changes only cardio: minutes and CR10 label follow the edited prescription", () => {
  const c = find(base.training!, "continuous")!;
  const t = applyTrainingItemPatch(base.training!, c.path, { durationSeconds: c.item.prescription.duration!.seconds + 900, effortLow: 7, effortHigh: 8 });
  const r = reval(base, { training: t });
  assert.equal(r.workload.cardioMinutes.total, base.proposal.workload.cardioMinutes.total + 15);
  assert.ok(r.week.some((d) => d.cardio?.intensity === "vigorous"));
  assert.ok(r.domains.cardio.edited && !r.domains.resistance.edited);
});

await check("3. a same-visit cardio edit that breaks the client's session cap is a cross-domain ERROR (U1's own rule)", () => {
  // Put the steady session after Monday's lifting (same visit) in the proposal week and the drafts, then lengthen it.
  const monday = base.proposal.week.find((d) => d.day === "Monday" && d.resistance)!;
  const steadyDay = base.proposal.week.find((d) => d.cardio?.type === "steady")!;
  const proposal = structuredClone(base.proposal);
  const pm = proposal.week.find((d) => d.day === "Monday")!;
  pm.cardio = { ...steadyDay.cardio!, placement: "after_resistance" };
  const withMondayCardio = (c: UniversalTrainingProgramContent) => {
    const out = structuredClone(c);
    const w1 = out.weeks.find((w) => w.weekNumber === 1)!;
    const src = w1.days.find((d) => d.dayOfWeek === steadyDay.day)!.sessions!.find((s) => s.blocks.every((b) => b.items.every((i) => i.prescription.family === "continuous")))!;
    w1.days.find((d) => d.dayOfWeek === "Monday")!.sessions!.push(structuredClone(src));
    return out;
  };
  const original = withMondayCardio(base.training!);
  const p2 = { ...base, proposal, training: original };
  assert.deepEqual(reval(p2, {}, { proposal }).errors, [], "as proposed it fits");
  const mon = original.weeks[0].days.find((d) => d.dayOfWeek === "Monday")!;
  const si = mon.sessions!.length - 1;
  const it = mon.sessions![si].blocks[0].items[0];
  const edited = applyTrainingItemPatch(original, { weekNumber: 1, dayOfWeek: "Monday", sessionIndex: si, blockId: mon.sessions![si].blocks[0].id, itemId: it.id }, { durationSeconds: 70 * 60 });
  const r = reval(p2, { training: edited }, { proposal });
  assert.ok(monday.resistance!.minutes + 70 > 75);
  assert.ok(r.errors.some((e) => e.area === "program" && /exceeds the client's 75-min cap/.test(e.message)), JSON.stringify(r.errors));
});

await check("4. lifting edits on an APPROVED program are an error; on a proposed program they're fine", () => {
  const l = find(base.training!, "resistance")!;
  const t = applyTrainingItemPatch(base.training!, l.path, { sets: (l.item.prescription.sets ?? 3) + 1 });
  assert.ok(reval(base, { training: t }, { resistanceSource: "approved_program" }).errors.some((e) => /approved program/.test(e.message)));
  assert.deepEqual(reval(base, { training: t }).errors, []);
});

await check("5. a nutrition plan can't appear when nutrition wasn't proposed (no forced domain)", () => {
  const proposal = { ...base.proposal, domains: { ...base.proposal.domains, nutrition: { ...base.proposal.domains.nutrition, status: "NOT_COACHED" as const } } };
  assert.ok(reval(base, {}, { proposal }).errors.some((e) => e.area === "nutrition" && /can't be added/.test(e.message)));
});

await check("6. nutrition edits: only prescribed targets change; a calories+protein plan never gains carbs/fat", async () => {
  const cp = await program({ n_approach: ["calories_protein"] });
  const plan = cp.nutrition!;
  assert.equal(plan.method?.approach, "calories_protein");
  assert.throws(() => applyNutritionEdit(plan, { targets: { carbsG: 250 } }), /doesn't prescribe a carbs target/);
  const edited = applyNutritionEdit(plan, { targets: { proteinG: plan.method!.prescribed.proteinG! + 10 } });
  assert.equal(edited.targets, null);
  assert.equal(edited.method!.prescribed.carbsG, null);
  assert.deepEqual(reval(cp, { nutrition: edited }).errors, []);
  // A forged content change that adds a target is caught by revalidation too.
  const forged = structuredClone(plan);
  forged.method!.prescribed.carbsG = 200;
  assert.ok(reval(cp, { nutrition: forged }).errors.length > 0);
});

await check("7. protein outside the coach's own range is a FINDING (the coach's call, shown), never silently accepted or blocked", async () => {
  const p = base.nutrition!;
  const protein = p.method?.prescribed.proteinG ?? p.targets!.proteinG;
  const r = reval(base, { nutrition: applyNutritionEdit(p, { targets: { proteinG: protein + 300 } }) });
  assert.ok(r.findings.some((f) => f.code === "protein_outside_method_range"));
  assert.deepEqual(r.errors, []);
});

await check("8. changing the lifting volume asks the coach whether nutrition still fits (prepared decision, no recommendation)", () => {
  let t = base.training!;
  for (const w of t.weeks) for (const d of w.days) for (const s of d.sessions ?? []) if (s.blocks.some((b) => b.items.some((i) => i.prescription.family === "resistance")) && w.weekNumber === 1) s.estimatedDurationMin += 30;
  t = structuredClone(t);
  const r = reval(base, { training: t });
  const d = r.decisions.find((x) => x.about === "nutrition_training_basis");
  assert.ok(d && d.recommended === null);
});

await check("9. decision keys are stable for the same question; a changed question needs a new answer", () => {
  const d = { source: "program" as const, about: "second_visit", question: "Q1?", options: ["a"], recommended: null, why: "w" };
  assert.equal(decisionKey(d), decisionKey({ ...d }));
  assert.notEqual(decisionKey(d), decisionKey({ ...d, question: "Q2?" }));
  const r = reval(base, {});
  const ds = reviewDecisions(base.proposal, r, {});
  assert.equal(new Set(ds.map((x) => x.key)).size, ds.length, "no duplicate decisions");
  const answered = reviewDecisions(base.proposal, r, Object.fromEntries(ds.map((x) => [x.key, { answer: "ok", question: x.question, decidedBy: "c", decidedAtIso: NOW }])));
  assert.ok(answered.every((x) => x.answer));
});

await check("10. approval gate: errors, open decisions, stale inputs, wrong status or a decided proposal each block approval", () => {
  const r = reval(base, {});
  const ds = reviewDecisions(base.proposal, r, {});
  const ok = { approvalState: "proposed", status: "draft_ready", hasDrafts: true, revalidation: r, decisions: ds.map((d) => ({ ...d, answer: { answer: "x", question: d.question, decidedBy: "c", decidedAtIso: NOW } })), staleReasons: [], escalations: 0 };
  assert.deepEqual(approvalBlockers(ok), []);
  assert.ok(approvalBlockers({ ...ok, decisions: ds }).length > 0 || ds.length === 0);
  assert.ok(approvalBlockers({ ...ok, staleReasons: ["stale"] }).includes("stale"));
  assert.ok(approvalBlockers({ ...ok, status: "incomplete" }).some((b) => /incomplete/.test(b)));
  assert.ok(approvalBlockers({ ...ok, approvalState: "approved" }).some((b) => /already approved/.test(b)));
  assert.ok(approvalBlockers({ ...ok, revalidation: { ...r, errors: [{ area: "resistance", message: "conflict" }] } }).includes("conflict"));
  assert.ok(approvalBlockers({ ...ok, hasDrafts: false }).some((b) => /nothing to approve/.test(b)));
});

await check("11. a cardio edit keeps its session honest: name intensity and estimated minutes follow the prescription; lifting untouched", () => {
  const c = find(base.training!, "continuous")!;
  const edited = syncCardioSession(applyTrainingItemPatch(base.training!, c.path, { durationSeconds: 45 * 60, effortLow: 2, effortHigh: 3 }), c.path);
  const s = edited.weeks.find((w) => w.weekNumber === c.path.weekNumber)!.days.find((d) => d.dayOfWeek === c.path.dayOfWeek)!.sessions![c.path.sessionIndex];
  assert.equal(s.estimatedDurationMin, 45);
  assert.match(s.name, / — easy$/);
  const l = find(base.training!, "resistance")!;
  const lifted = applyTrainingItemPatch(base.training!, l.path, { sets: 5 });
  assert.deepEqual(syncCardioSession(lifted, l.path), lifted);
});

await check("12. Gate U3C — Today's view of a published program: RIR-only Reasoner lifting is shown on the RPE scale (2 RIR = RPE 8); multi-session / cardio-only days stay unrepresentable", async () => {
  const lift = await program({ t_cardio_roles: ["fat_loss"] }, "build_muscle");
  assert.equal(universalProgramToClientAssignedProgram(lift.training!), null, "strict conversion refuses RIR (lossless rule unchanged)");
  const today = universalProgramToTodayProgram(lift.training!);
  assert.ok(today, "Today can show it");
  const src = find(lift.training!, "resistance")!;
  const shown = today!.weeks.find((w) => w.weekNumber === src.path.weekNumber)!.days.find((d) => d.dayOfWeek === src.path.dayOfWeek)!.workout!.exercises[0];
  assert.equal(shown.targetRpe, 10 - (src.item.prescription.rir ?? 0));
  assert.equal(universalProgramToTodayProgram(base.training!), null, "lifting + separate cardio days: still not representable (held at publication)");
});

await check("13. Gate U3C — a real client's Today has a cardio task only when their prescription assigns it; demo clients unchanged", () => {
  const demo = createInitialState();
  assert.equal(cardioCountsToday(demo), true);
  const real = { ...demo, clientId: "real-client" as never, assignedUniversalProgram: base.training! };
  assert.equal(cardioCountsToday(real), false);
});

// --- Exercise exclusions (U3C closure) ----------------------------------------------------------------------------
const DOC = "no squats, or lower body compounds like leg press, RDLs, or single leg pushing motions. No movements that involve bracing like high effort lat pull downs or tricep push downs. no ab workouts.";
const docInput = (p: P) => ({ ...p.input, client: { ...p.input.client, health: { ...p.input.client.health, review: { ...p.input.client.health.review, coachDocumentedLimitation: { status: "known", value: DOC, source: "eval" } } } } }) as unknown as SynthesisInput;
/** The program with two exercises (every instance) renamed to the real client's flagged ones. */
function withFlagged(c: UniversalTrainingProgramContent): UniversalTrainingProgramContent {
  const names = [...new Set(c.weeks.flatMap((w) => w.days.flatMap((d) => (d.sessions ?? []).flatMap((s) => s.blocks.flatMap((b) => b.items.filter((i) => i.prescription.family === "resistance").map((i) => i.name))))))];
  const map = new Map([[names[1], "Cable Triceps Pushdown"], [names[2], "Single-Leg Calf Raise"]]);
  const out = structuredClone(c);
  for (const w of out.weeks) for (const d of w.days) for (const s of d.sessions ?? []) for (const b of s.blocks) for (const i of b.items) if (map.has(i.name)) i.name = map.get(i.name)!;
  return out;
}

await check("14. the documented-limitation decision names Cable Triceps Pushdown and Single-Leg Calf Raise, has no recommendation, and nothing is removed automatically", () => {
  const t = withFlagged(base.training!);
  const p2 = { ...base, training: t };
  const r = reval(p2, { training: t }, { input: docInput(base) });
  const d = r.decisions.find((x) => x.about === "documented_limitation_exercise_review")!;
  assert.ok(d && d.recommended === null && d.excludeOption && ["Cable Triceps Pushdown", "Single-Leg Calf Raise"].every((n) => d.exercises!.includes(n)), JSON.stringify(d));
  assert.ok(Object.keys(exerciseLocations(t, ["Cable Triceps Pushdown", "Single-Leg Calf Raise"])).length === 2, "both still in the program until the coach acts");
  assert.deepEqual(r.errors, []);
});

await check("15. 'Exclude' is binding: each excluded exercise still in the draft is an error (blocks approval) and isn't asked about again; 'Keep' leaves them", () => {
  const t = withFlagged(base.training!);
  const p2 = { ...base, training: t };
  const answers = { k: { answer: "Exclude them for this client (exercise decision)", question: "q", decidedBy: "c", decidedAtIso: NOW, excludes: ["Cable Triceps Pushdown", "Single-Leg Calf Raise"] } };
  const r = reval(p2, { training: t }, { input: docInput(base), excluded: excludedExercises(answers) });
  assert.ok(["Cable Triceps Pushdown", "Single-Leg Calf Raise"].every((n) => r.errors.some((e) => e.area === "resistance" && e.message.startsWith(`${n} is excluded by your decision but is still in the program`))), JSON.stringify(r.errors));
  assert.ok(!r.decisions.some((x) => x.about === "documented_limitation_exercise_review" && x.exercises?.some((n) => /Pushdown|Calf/.test(n))), "excluded exercises aren't re-asked");
  const blockers = approvalBlockers({ approvalState: "proposed", status: "draft_ready", hasDrafts: true, revalidation: r, decisions: [], staleReasons: [], escalations: 0 });
  assert.ok(blockers.some((b) => /Cable Triceps Pushdown is excluded/.test(b)));
  const keep = reval(p2, { training: t }, { input: docInput(base), excluded: excludedExercises({ k: { answer: "Keep them as prescribed", question: "q", decidedBy: "c", decidedAtIso: NOW } }) });
  assert.ok(!keep.errors.some((e) => /excluded by your decision/.test(e.message)), "keeping them is the coach's call");
});

await check("16. the coach's 'remove from program' removes every instance (all weeks) and the program revalidates clean; it refuses to empty a session", () => {
  const t = withFlagged(base.training!);
  const before = exerciseLocations(t, ["Cable Triceps Pushdown"])["Cable Triceps Pushdown"].length;
  let cleaned = removeExerciseEverywhere(t, "Cable Triceps Pushdown");
  cleaned = removeExerciseEverywhere(cleaned, "Single-Leg Calf Raise");
  assert.ok(before > 1 && Object.keys(exerciseLocations(cleaned, ["Cable Triceps Pushdown", "Single-Leg Calf Raise"])).length === 0);
  const r = reval({ ...base, training: t }, { training: cleaned }, { input: docInput(base), excluded: ["Cable Triceps Pushdown", "Single-Leg Calf Raise"] });
  assert.ok(!r.errors.some((e) => /excluded by your decision/.test(e.message)), JSON.stringify(r.errors));
  const one = structuredClone(t);
  const s0 = one.weeks[0].days.find((d) => d.sessions?.length)!.sessions![0];
  s0.blocks = [{ ...s0.blocks[0], items: [{ ...s0.blocks[0].items[0], name: "Solo Exercise" }] }];
  assert.throws(() => removeExerciseEverywhere(one, "Solo Exercise"), /only exercise in .* replace it/);
});

await check("17. 'Keep them with an effort limit' is binding: a limited exercise prescribed closer to failure blocks approval until the coach applies the limit everywhere", () => {
  const t = withFlagged(base.training!);
  // Make every Cable Triceps Pushdown 1 rep from failure, so the limit is clearly violated.
  for (const w of t.weeks) for (const d of w.days) for (const s of d.sessions ?? []) for (const b of s.blocks) for (const i of b.items) if (i.name === "Cable Triceps Pushdown" && i.prescription.family === "resistance") { delete (i.prescription as { rpe?: number }).rpe; (i.prescription as { rir?: number }).rir = 1; }
  const answers = { k: { answer: "Keep them with an effort limit (e.g. stay well short of failure)", question: "q", decidedBy: "c", decidedAtIso: NOW, limitsEffort: ["Cable Triceps Pushdown"] } };
  const r = reval({ ...base, training: t }, { training: t }, { input: docInput(base), effortLimited: effortLimitedExercises(answers) });
  assert.ok(r.errors.some((e) => e.area === "resistance" && e.message.startsWith("Cable Triceps Pushdown is limited by your decision")), JSON.stringify(r.errors));
  assert.ok(approvalBlockers({ approvalState: "proposed", status: "draft_ready", hasDrafts: true, revalidation: r, decisions: [], staleReasons: [], escalations: 0 }).some((b) => /limited by your decision/.test(b)));
  const limited = applyEffortLimitEverywhere(t, "Cable Triceps Pushdown");
  assert.deepEqual(effortLimitViolations(limited, ["Cable Triceps Pushdown"]), {});
  const after = reval({ ...base, training: t }, { training: limited }, { input: docInput(base), effortLimited: ["Cable Triceps Pushdown"] });
  assert.ok(!after.errors.some((e) => /limited by your decision/.test(e.message)), JSON.stringify(after.errors));
  // Never harder: an exercise already easier than the limit is left alone; other exercises are untouched.
  const easy = structuredClone(t);
  for (const w of easy.weeks) for (const d of w.days) for (const s of d.sessions ?? []) for (const b of s.blocks) for (const i of b.items) if (i.name === "Cable Triceps Pushdown" && i.prescription.family === "resistance") (i.prescription as { rir?: number }).rir = 4;
  const kept = applyEffortLimitEverywhere(easy, "Cable Triceps Pushdown");
  const rirs = kept.weeks.flatMap((w) => w.days.flatMap((d) => (d.sessions ?? []).flatMap((s) => s.blocks.flatMap((b) => b.items.filter((i) => i.name === "Cable Triceps Pushdown").map((i) => (i.prescription as { rir?: number }).rir)))));
  assert.ok(rirs.length > 0 && rirs.every((x) => x === 4) && EFFORT_LIMIT_MIN_RIR === 3);
  assert.equal(JSON.stringify(limited.weeks.map((w) => w.days.map((d) => (d.sessions ?? []).map((s) => s.blocks.map((b) => b.items.filter((i) => i.name !== "Cable Triceps Pushdown")))))), JSON.stringify(t.weeks.map((w) => w.days.map((d) => (d.sessions ?? []).map((s) => s.blocks.map((b) => b.items.filter((i) => i.name !== "Cable Triceps Pushdown")))))), "other exercises unchanged");
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
