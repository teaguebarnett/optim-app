// Gate 3.2 — Settings as the Coach Brain editor: the edit model over the
// SAME canonical calibration answers (diff, needs-input after a structural
// change, validation, provenance carry-over, versioned build). Pure; runs
// against the real question bank.

import assert from "node:assert/strict";
import { ALL_CALIBRATION_ITEMS, CALIBRATION_QUESTIONS } from "./calibration/questions.ts";
import { applicableCalibrationChapters, pruneCalibrationAnswers, requiredCalibrationKeys } from "./calibration/engine.ts";
import { answerAllRequired } from "./calibration/fixtures.ts";
import { carryOverUnchangedProvenance, diffCalibrationAnswers, editorChapters, editorQuestions, methodEditState } from "./calibration/settings-editor.ts";
import { validateCalibrationAnswers } from "./calibration/validate.ts";
import { buildMethodFromCalibration } from "./coach-brain.ts";
import { SAFETY_MINIMUM_STATEMENTS } from "./safety-policy.ts";
import type { CalibrationAnswers } from "./calibration/types.ts";

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

const T0 = "2026-10-01T12:00:00.000Z";
const T1 = "2026-10-02T12:00:00.000Z";
const STRENGTH: CalibrationAnswers = { coaching_areas: ["strength", "sport_performance"], strength_specialties: ["powerlifting"], sport_performance_sports: ["soccer"], experience_levels: ["intermediate"], client_modifiers: ["none"], nutrition_scope: "full", practice_goals: ["get_stronger", "athletic_performance"] };
/** An active, confirmed v2 method's answers (as stored: validated + pruned). */
function confirmed(seed: CalibrationAnswers): CalibrationAnswers {
  const v = validateCalibrationAnswers(answerAllRequired(seed));
  assert.ok(v.ok, v.ok ? "" : v.message);
  const out = { ...v.answers };
  delete out.__schema;
  return out;
}
const build = (answers: CalibrationAnswers, nowIso: string, version: number) =>
  buildMethodFromCalibration({ answers, aiAuthority: { level: "advisor", domainOverrides: {} }, aiAuthorityConfirmed: true, coachUserId: "coach-a", workspaceId: "ws", businessName: "OPTIM", methodVersion: version, nowIso });

console.log("\n1. Categories come from the same applicability rules as calibration\n");

check("Settings categories = the chapters calibration would ask (minus Review; authority has its own control)", () => {
  const a = confirmed(STRENGTH);
  assert.deepEqual(editorChapters(a), applicableCalibrationChapters(a).filter((c) => c !== "review" && c !== "ai_authority"));
  assert.ok(editorChapters(a).includes("strength") && editorChapters(a).includes("sport_performance") && editorChapters(a).includes("nutrition"));
});

check("irrelevant modules stay absent", () => {
  const chapters = editorChapters(confirmed(STRENGTH));
  for (const c of ["physique", "endurance", "integration", "general_fitness", "weight_management", "client_groups"] as const) assert.ok(!chapters.includes(c), c);
});

check("a category edits exactly the questions that apply, in interview order", () => {
  const a = confirmed(STRENGTH);
  const ids = editorQuestions("nutrition", a).map((q) => q.id);
  assert.ok(ids.includes("n_protein_amount") && ids.includes("n_approach"));
  assert.ok(!ids.includes("n_fueling"), "endurance fueling doesn't apply");
  const bank = CALIBRATION_QUESTIONS.filter((q) => q.chapter === "nutrition").map((q) => q.id);
  assert.deepEqual(ids, bank.filter((id) => ids.includes(id)));
});

console.log("\n2. Edits: only what changed, nothing saved until confirmed\n");

check("an untouched draft is not dirty and can't be saved", () => {
  const a = confirmed(STRENGTH);
  const s = methodEditState(a, { ...a });
  assert.equal(s.dirty, false);
  assert.equal(s.ready, false);
  assert.deepEqual(s.changes, []);
});

check("one nutrition change → exactly one change, shown before → after", () => {
  const a = confirmed({ ...STRENGTH, n_protein_basis: "per_lb_bodyweight" });
  const draft = { ...a, n_protein_amount: { base: { min: 0.9, max: 1.1, unit: "g/lb" }, varies: "no" } };
  const s = methodEditState(a, draft);
  assert.equal(s.changes.length, 1, JSON.stringify(s.changes));
  assert.equal(s.changes[0].label, "Protein target");
  assert.equal(s.changes[0].after, "0.9–1.1 g/lb");
  assert.notEqual(s.changes[0].before, s.changes[0].after);
  assert.equal(s.ready, true);
});

check("several changes in one category → one edit with every change listed", () => {
  const a = confirmed(STRENGTH);
  const draft = { ...a, n_supplements: "evidence_based_stack", n_adherence_standard: "weekly_average", n_meal_structure: { min: 3, max: 4, unit: "meals/day" } };
  const s = methodEditState(a, draft);
  assert.deepEqual(s.changes.map((c) => c.key).sort(), ["n_adherence_standard", "n_meal_structure", "n_supplements"]);
  assert.ok(s.changes.every((c) => c.chapter === "nutrition"));
  assert.equal(s.ready, true);
});

check("changing a value back to what it was leaves nothing to save", () => {
  const a = confirmed(STRENGTH);
  const s = methodEditState(a, { ...a, n_supplements: a.n_supplements });
  assert.equal(s.dirty, false);
});

check("a malformed value is reported and blocks saving", () => {
  const a = confirmed(STRENGTH);
  const s = methodEditState(a, { ...a, t_days: { base: { min: 3, max: 9, unit: "days/week" }, varies: "no" } });
  assert.ok(s.invalid && s.invalid.key === "t_days");
  assert.equal(s.ready, false);
});

console.log("\n3. Structural changes recompute applicability — never guess\n");

check("adding a coaching area asks only for the settings that newly become required", () => {
  const a = confirmed(STRENGTH);
  const draft: CalibrationAnswers = { ...a, coaching_areas: [...(a.coaching_areas as string[]), "endurance"] };
  const s = methodEditState(a, draft);
  const expected = requiredCalibrationKeys(pruneCalibrationAnswers(draft)).filter((k) => draft[k] === undefined);
  assert.deepEqual(s.needsInput.map((n) => n.key).sort(), [...expected].sort());
  assert.ok(s.needsInput.length > 0 && s.needsInput.every((n) => ["your_coaching", "endurance", "integration", "nutrition"].includes(n.chapter)), JSON.stringify(s.needsInput));
  assert.equal(s.ready, false, "not confirmable until answered");
  const answered = methodEditState(a, answerAllRequired(draft));
  assert.equal(answered.needsInput.length, 0);
  assert.equal(answered.ready, true);
});

check("nothing is filled in for the coach: needed settings stay unanswered until they act", () => {
  const a = confirmed(STRENGTH);
  const draft: CalibrationAnswers = { ...a, coaching_areas: [...(a.coaching_areas as string[]), "weight_management"], practice_goals: [...(a.practice_goals as string[]), "lose_fat"] };
  const s = methodEditState(a, draft);
  for (const n of s.needsInput) assert.equal(draft[n.key], undefined);
  assert.ok(s.needsInput.some((n) => n.key === "w_rate_of_loss"));
});

check("removing a coaching area: its answers leave the new method (shown as removed), nothing new is required", () => {
  const a = confirmed(STRENGTH);
  const draft = { ...a, coaching_areas: ["strength"], practice_goals: ["get_stronger"] };
  const s = methodEditState(a, draft);
  assert.equal(s.needsInput.length, 0);
  const removed = s.changes.filter((c) => c.kind === "removed").map((c) => c.key);
  assert.ok(removed.includes("sp_season_approach") && removed.includes("sport_performance_sports"), removed.join(","));
  assert.ok(s.changes.filter((c) => c.kind === "removed").every((c) => c.after === "No longer part of your method"));
  const next = build(draft, T1, 2);
  assert.equal(next.answers.sp_season_approach, undefined, "not active methodology in the new version");
  assert.ok(a.sp_season_approach !== undefined, "…while the previous version's answers still hold it");
});

console.log("\n4. Confirming builds one new version through the canonical builder\n");

check("the confirmed edit is the canonical build: validated, pruned, the change applied", () => {
  const a = confirmed({ ...STRENGTH, n_protein_basis: "per_lb_bodyweight" });
  const next = build({ ...a, n_protein_amount: { base: { min: 1, max: 1, unit: "g/lb" }, varies: "no" } }, T1, 4);
  assert.equal(next.operatingModel.version, 4);
  assert.deepEqual(next.answers.n_protein_amount, { base: { min: 1, max: 1, unit: "g/lb" }, varies: "no" });
  assert.equal(next.operatingModel.nutritionPhilosophy.proteinTargetGramsPerLbBodyweight, 1);
  assert.deepEqual(diffCalibrationAnswers(a, next.answers).map((c) => c.key), ["n_protein_amount"]);
});

check("an incomplete edit (a newly required setting unanswered) can't be built", () => {
  const a = confirmed(STRENGTH);
  assert.throws(() => build({ ...a, coaching_areas: ["strength", "sport_performance", "endurance"] }, T1, 2));
});

check("provenance: unchanged settings keep when the coach chose them; only changed ones get the new date", () => {
  const a = confirmed(STRENGTH);
  const v1 = build(a, T0, 1);
  const edited = { ...a, n_supplements: "evidence_based_stack" };
  const v2 = build(edited, T1, 2);
  const carried = carryOverUnchangedProvenance({ previousProvenance: v1.operatingModel.provenance, previousAnswers: v1.answers, nextProvenance: v2.operatingModel.provenance, nextAnswers: v2.answers });
  assert.equal(carried.n_supplements.updatedAtIso, T1);
  assert.equal(carried.t_days.updatedAtIso, T0);
  assert.equal(carried.checkin.updatedAtIso, T0, "group screens carry too");
  assert.ok(Object.values(carried).every((p) => p.source === "coach_selected" || p.source === "coach_confirmed"));
});

console.log("\n5. Safety and honest capability labels are unchanged\n");

check("safety minimums are read-only statements; only the supported stricter rule can be added", () => {
  const policy = ALL_CALIBRATION_ITEMS.find((q) => q.id === "safety_policy")!;
  assert.deepEqual(policy.policy!.statements, SAFETY_MINIMUM_STATEMENTS);
  const a = confirmed(STRENGTH);
  assert.ok(methodEditState(a, { ...a, safety_policy: { stricter: ["escalate_medical_before_reply"] } }).ready);
  assert.ok(methodEditState(a, { ...a, safety_policy: { stricter: ["never_escalate_pain"] } }).invalid);
  assert.ok(methodEditState(a, { ...a, scn_pain: "keep_training" }).invalid, "pain handling can't be loosened");
});

check("a recorded-for-future-use field keeps its status in the change list", () => {
  const a = confirmed(STRENGTH);
  const s = methodEditState(a, { ...a, program_format: a.program_format === "both" ? "fixed_length" : "both" });
  assert.equal(s.changes[0].status, "C");
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
