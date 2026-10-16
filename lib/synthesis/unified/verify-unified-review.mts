// Gate U3B — offline checks of the review rules (lib/synthesis/unified/review.ts) and the nutrition edit rules
// (lib/production/unified-review.ts applyNutritionEdit). Scripted domain models; no database, no model calls.
//
//   node --experimental-strip-types lib/synthesis/unified/verify-unified-review.mts

import assert from "node:assert/strict";
import { runUnifiedProgram, type DomainResults } from "./orchestrate.ts";
import { fullCoach, programContent, routerModel, scenarioInput, NOW } from "./eval/fixtures.ts";
import { documentedEffortRule, resistanceContentFit } from "./safety.ts";
import { isKnown } from "../facts.ts";
import { applyEffortLimitEverywhere, approvalBlockers, type RecordedAnswer, decisionKey, effortLimitedExercises, effortLimitViolations, EFFORT_LIMIT_MIN_RIR, excludedExercises, exerciseLocations, removeExerciseEverywhere, reviewDecisions, revalidateDrafts, syncCardioSession, type Revalidation } from "./review.ts";
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

// --- The first real client (read-only production evidence, 2026-10-13) ---------------------------------------------
// Epigastric hernia; the coach's documented limitation, its six confirmed restrictions and the real 12-week program's
// lifting (names, sets, reps, RPE — every week the same layout). The pushdown is already limited by the coach.
const REAL_DOC = "No valsalva, bracing, like no squats or deadlifts. Some movements like tricep push down that require core stability or lat pull down can be performed only with low RPE or some form of trunk stability to compensate for lack of bracing.";
const opt = (optionId: string, label: string, tags: unknown[], origin: string) => ({ optionId, label, tags, origin });
const REAL_RECORD = {
  schema: 1, sourceText: REAL_DOC, noExerciseRestrictions: false, confirmedAtIso: "2026-10-13T03:39:41.996Z", confirmedBy: "coach-1",
  interpretation: { interpreter: { kind: "model", modelId: "eval" }, proposedOptionIds: ["avoid_squat", "avoid_hinge"], removedOptionIds: [], addedOptionIds: [], clarifications: [] },
  restrictions: [
    opt("avoid_squat", "Avoid squat-pattern exercises", [{ kind: "avoid_movement_pattern", pattern: "squat" }], "proposed"),
    opt("avoid_hinge", "Avoid hinge / deadlift-pattern exercises", [{ kind: "avoid_movement_pattern", pattern: "hinge" }], "proposed"),
    opt("avoid_spinal_loading_moderate", "Avoid moderate or heavy spinal loading", [{ kind: "avoid_demand", demand: "spinal_loading", atOrAbove: "moderate" }], "clarified"),
    opt("avoid_bracing_moderate", "Avoid exercises that need moderate or hard bracing", [{ kind: "avoid_demand", demand: "bracing", atOrAbove: "moderate" }], "clarified"),
    opt("avoid_vertical_push", "Avoid overhead pressing", [{ kind: "avoid_movement_pattern", pattern: "vertical_push" }], "clarified"),
    opt("avoid_carries", "Avoid loaded carries", [{ kind: "avoid_movement_pattern", pattern: "carry" }], "clarified"),
  ],
};
const REAL_DAYS: Array<[string, Array<[string, number, number, number, number]>]> = [
  ["Monday", [["Dumbbell Bench Press", 3, 7, 8, 8], ["Incline Dumbbell Press", 3, 9, 10, 7], ["Cable Chest Fly", 3, 11, 12, 9], ["Cable Triceps Pushdown", 3, 10, 12, 7], ["Cable Lateral Raise", 3, 11, 12, 9]]],
  ["Tuesday", [["Chest-Supported Row", 3, 7, 8, 9], ["Chest-Supported Machine Low Row", 3, 10, 12, 8], ["Straight-Arm Cable Pulldown", 3, 11, 12, 9], ["Face Pull", 3, 11, 12, 9], ["Cable Curl", 3, 10, 12, 9]]],
  ["Wednesday", [["Hip Thrust Machine", 3, 9, 10, 8], ["Leg Extension", 4, 11, 12, 9], ["Leg Curl", 4, 11, 12, 9], ["Seated Calf Raise", 4, 11, 12, 9], ["Cable Crunch", 3, 11, 12, 8]]],
  ["Thursday", [["Machine Chest Press", 3, 9, 10, 8], ["Pec Deck", 3, 11, 12, 9], ["Machine Lateral Raise", 4, 11, 12, 9], ["Dumbbell Lying Triceps Extension", 3, 10, 12, 8], ["Overhead Cable Triceps Extension", 3, 11, 12, 8]]],
  ["Friday", [["Chest-Supported Machine High Row", 3, 8, 10, 9], ["Incline Chest-Supported Dumbbell Row", 3, 10, 12, 8], ["Machine Pullover", 3, 11, 12, 9], ["Reverse Pec Deck", 3, 11, 12, 9], ["Incline Dumbbell Curl", 3, 10, 12, 9]]],
  ["Saturday", [["Reverse Lunge", 3, 10, 12, 8], ["Leg Curl", 3, 10, 12, 9], ["Leg Extension", 3, 11, 12, 9], ["Cable Glute Kickback", 3, 11, 12, 9], ["Hip Abduction Machine", 3, 11, 12, 8], ["Single-Leg Calf Raise", 3, 11, 12, 9]]],
];
function realProgram(): UniversalTrainingProgramContent {
  const c = programContent(REAL_DAYS.map(([day, ex]) => ({ day: day as never, exercises: ex.map((e) => e[0]) })), 12);
  for (const w of c.weeks) for (const d of w.days) for (const s of d.sessions ?? []) for (const b of s.blocks) for (const i of b.items) {
    const [, sets, low, high, rpe] = REAL_DAYS.find(([day]) => day === d.dayOfWeek)![1].find((e) => e[0] === i.name)!;
    i.prescription = { family: "resistance", sets, reps: { low, high }, rpe } as never;
  }
  return c;
}
const realInput = scenarioInput({
  clientId: "client-1", coach: fullCoach(),
  patch: { what_you_want: { primaryGoal: "get_stronger" }, your_week: week, health_finish: { safetyScreen: ["none"], injuryBodyAreas: ["other"], hasInjuryHistory: true, injuryRestrictions: REAL_DOC, injuryBodyAreaOther: "Core/abs (epigastric hernia)", injuryAggravatingFactors: "Bracing", injuryWorkingWithProfessional: true } },
  healthReview: { clientId: "client-1", workspaceId: "ws-1", status: "proceed_with_limitations", reasons: ["Reported a current pain, injury, or physical limitation"], createdAtIso: NOW, updatedAtIso: NOW, documentedLimitations: REAL_DOC, structuredLimitations: REAL_RECORD } as never,
});
// The coach's real recorded decision (production key and question).
const PUSHDOWN_KEY = "resistance:documented_limitation_exercise_review:e74f735bf1";
const pushdownAnswer = { answer: "Keep them with an effort limit (e.g. stay well short of failure)", question: "These exercises fit the confirmed restrictions but are named in the documented limitations: Cable Triceps Pushdown (“tricep pushdown”). Keep them, limit them, or exclude them for this client?", decidedBy: "coach-1", decidedAtIso: NOW, limitsEffort: ["Cable Triceps Pushdown"] };
const realReval = (t: UniversalTrainingProgramContent, answers: Record<string, RecordedAnswer>) => reval({ ...base, training: t }, { training: t }, { input: realInput, excluded: excludedExercises(answers), effortLimited: effortLimitedExercises(answers) });
const restrictionDecisions = (r: Revalidation, answers: Record<string, RecordedAnswer>) => reviewDecisions(base.proposal, r, answers).filter((d) => d.source === "resistance");

await check("18. real client: the six confirmed restrictions allow every prescribed exercise — the gap is what the documented limitation says beyond them", () => {
  assert.ok(isKnown(realInput.client.health.review.coachStructuredLimitations), "the confirmed record applies");
  assert.deepEqual(resistanceContentFit(realProgram(), realInput, FOUNDATION_KNOWLEDGE), [], "no exercise is incompatible or uncertain under the confirmed record");
  assert.equal(documentedEffortRule(REAL_DOC), "Some movements like tricep push down that require core stability or lat pull down can be performed only with low RPE or some form of trunk stability to compensate for lack of bracing.");
});

await check("19. real client: the saved pushdown decision is kept (same key, answered); the documented rule's lunge, crunch, unsupported-trunk and submaximal-only exercises each need an explicit coach decision — never a clean pass", () => {
  const t = realProgram();
  const answers = { [PUSHDOWN_KEY]: pushdownAnswer };
  const r = realReval(t, answers);
  const ds = restrictionDecisions(r, answers);
  const pushdown = ds.find((d) => d.key === PUSHDOWN_KEY);
  assert.ok(pushdown && pushdown.answer?.limitsEffort?.[0] === "Cable Triceps Pushdown", "the coach's saved decision still matches and stays answered");
  const by = (about: string) => ds.find((d) => d.about === about)?.exercises ?? [];
  assert.deepEqual(by("documented_limitation_family:squat_family"), ["Reverse Lunge"]);
  assert.deepEqual(by("documented_limitation_family:direct_trunk"), ["Cable Crunch"]);
  assert.deepEqual(by("documented_effort_rule:unsupported_trunk").sort(), ["Cable Chest Fly", "Cable Curl", "Cable Glute Kickback", "Cable Lateral Raise", "Face Pull", "Overhead Cable Triceps Extension", "Single-Leg Calf Raise", "Straight-Arm Cable Pulldown"]);
  assert.deepEqual(by("documented_effort_rule:load_sensitive").sort(), ["Dumbbell Bench Press", "Hip Thrust Machine", "Incline Dumbbell Press", "Machine Chest Press"]);
  assert.ok(ds.filter((d) => d.about.startsWith("documented_")).every((d) => d.recommended === null && d.excludeOption && d.effortLimitOption), "OPTIM recommends nothing; the coach decides");
  assert.ok(!ds.some((d) => d.key !== PUSHDOWN_KEY && d.exercises?.includes("Cable Triceps Pushdown")), "the pushdown isn't asked again");
  assert.deepEqual(r.errors.filter((e) => e.area === "resistance"), [], "nothing is removed or changed automatically");
  const blockers = approvalBlockers({ approvalState: "proposed", status: "draft_ready", hasDrafts: true, revalidation: r, decisions: ds, staleReasons: [], escalations: 0 });
  assert.ok(blockers.some((b) => /4 coach decisions still need an answer/.test(b)), blockers.join(" | "));
});

await check("20. real client: once answered, the decisions bind every week — limits apply to all 12 weeks, exclusions must leave the program, and the restriction decisions are then all settled", () => {
  let t = realProgram();
  const answers: Record<string, RecordedAnswer> = { [PUSHDOWN_KEY]: pushdownAnswer };
  const ds = restrictionDecisions(realReval(t, answers), answers);
  const answer = (about: string, option: "limit" | "exclude" | "keep") => {
    const d = ds.find((x) => x.about === about)!;
    const a = option === "limit" ? d.effortLimitOption! : option === "exclude" ? d.excludeOption! : d.options[0];
    answers[d.key] = { answer: a, question: d.question, decidedBy: "coach-1", decidedAtIso: NOW, ...(option === "limit" ? { limitsEffort: d.exercises } : {}), ...(option === "exclude" ? { excludes: d.exercises } : {}) };
  };
  answer("documented_limitation_family:squat_family", "exclude");
  answer("documented_limitation_family:direct_trunk", "exclude");
  answer("documented_effort_rule:unsupported_trunk", "limit");
  answer("documented_effort_rule:load_sensitive", "keep");
  let r = realReval(t, answers);
  for (const n of ["Reverse Lunge", "Cable Crunch"]) assert.ok(r.errors.some((e) => e.message.startsWith(`${n} is excluded by your decision`)), n);
  for (const n of ["Straight-Arm Cable Pulldown", "Cable Glute Kickback"]) assert.ok(r.errors.some((e) => e.message.startsWith(`${n} is limited by your decision`) && /and \d+ more/.test(e.message)), `${n} limited in every week`);
  // The coach applies them (the review's own edits).
  for (const n of ["Reverse Lunge", "Cable Crunch"]) t = removeExerciseEverywhere(t, n);
  for (const n of effortLimitedExercises(answers)) t = applyEffortLimitEverywhere(t, n);
  r = realReval(t, answers);
  assert.deepEqual(r.errors.filter((e) => e.area === "resistance"), []);
  assert.ok(restrictionDecisions(r, answers).every((d) => d.answer), "no restriction decision left open");
  assert.deepEqual(effortLimitViolations(t, effortLimitedExercises(answers)), {}, "every limited exercise at ≥3 reps in reserve, all 12 weeks");
  assert.equal(t.weeks.flatMap((w) => w.days.flatMap((d) => (d.sessions ?? []).flatMap((s) => s.blocks.flatMap((b) => b.items)))).filter((i) => i.name === "Straight-Arm Cable Pulldown" && (i.prescription as { rpe?: number }).rpe === 7).length, 12);
});

await check("21. real client: an edit can't take a submaximal-only exercise past the minimums its confirmed fit depends on, and a new unsupported exercise re-opens the effort question", () => {
  const answers: Record<string, RecordedAnswer> = { [PUSHDOWN_KEY]: pushdownAnswer };
  const t = realProgram();
  const hard = structuredClone(t);
  const hip = hard.weeks[6].days.find((d) => d.dayOfWeek === "Wednesday")!.sessions![0].blocks[0].items.find((i) => i.name === "Hip Thrust Machine")!;
  (hip.prescription as { rpe?: number }).rpe = 10;
  assert.ok(realReval(hard, answers).errors.some((e) => /^Hip Thrust Machine fits the confirmed restrictions only at 6\+ reps and 2\+ reps in reserve, but is prescribed harder \(week 7 Wednesday\)/.test(e.message)));
  const heavy = structuredClone(t);
  const db = heavy.weeks[0].days.find((d) => d.dayOfWeek === "Monday")!.sessions![0].blocks[0].items.find((i) => i.name === "Dumbbell Bench Press")!;
  (db.prescription as { reps: { low: number } }).reps.low = 4;
  assert.ok(realReval(heavy, answers).errors.some((e) => e.message.startsWith("Dumbbell Bench Press fits the confirmed restrictions only at 6+ reps")));
  // The coach keeps the unsupported group as prescribed, then swaps in another unsupported exercise: asked again.
  const ds = restrictionDecisions(realReval(t, answers), answers);
  const g = ds.find((d) => d.about === "documented_effort_rule:unsupported_trunk")!;
  answers[g.key] = { answer: g.options[0], question: g.question, decidedBy: "coach-1", decidedAtIso: NOW };
  const swapped = structuredClone(t);
  for (const w of swapped.weeks) for (const d of w.days) for (const s of d.sessions ?? []) for (const b of s.blocks) for (const i of b.items) if (i.name === "Incline Dumbbell Curl") i.name = "Hammer Curl";
  const again = restrictionDecisions(realReval(swapped, answers), answers).find((d) => d.about === "documented_effort_rule:unsupported_trunk");
  assert.ok(again && !again.answer && again.exercises!.includes("Hammer Curl"), "a changed question needs a new answer");
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
