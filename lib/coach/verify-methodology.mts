// Pure tests for lib/coach/methodology.ts: seeded or bootstrapped coach
// defaults are never "confirmed", confirmation requires explicit and valid
// answers for every field generation reads, and every label is readable.
// No DB, no network, no browser.
// Run with: npm run verify:methodology

import assert from "node:assert/strict";
import { createDefaultCoachOperatingModel } from "./operating-model.ts";
import { buildDefaultPlaybookContent } from "./playbook.ts";
import {
  GENERATION_METHOD_QUESTION_IDS,
  confirmMethodology,
  describeMethodField,
  getMethodologyConfirmation,
  methodAnswersFromModel,
  optionLabel,
  parseMethodAnswers,
  type MethodAnswers,
} from "./methodology.ts";

let passed = 0;
let failed = 0;
function check(description: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`  ok  - ${description}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL  - ${description}`);
    console.error(`        ${err instanceof Error ? err.message : String(err)}`);
  }
}

const NOW = "2026-09-29T12:00:00.000Z";
const base = () => createDefaultCoachOperatingModel({ coachId: "coach-1", workspaceId: "ws-1", nowIso: NOW, businessName: "Test" });

const ANSWERS: MethodAnswers = {
  program_splits: ["push_pull_legs"],
  program_frequency: "4_5",
  program_sets_reps: "3_4",
  program_rep_philosophy: "strength_low_3_6",
  program_rpe_rir: "rir",
  program_proximity_to_failure: "2_4_reps_in_reserve",
  program_progression: "linear_load",
  program_deload: "8",
  program_warmup: "general_then_specific",
  program_cardio: "rarely_used",
  program_exercises_avoided: "Behind-the-neck press",
  practice_common_goals: ["get_stronger"],
};

console.log("seeded defaults are never confirmed");
check("createDefaultCoachOperatingModel is unconfirmed", () => {
  const c = getMethodologyConfirmation(base());
  assert.equal(c.confirmed, false);
  assert.equal(c.confirmedAtIso, null);
});
check("the Supabase bootstrap content (row stored as 'approved') is unconfirmed", () => {
  const content = buildDefaultPlaybookContent({ coachId: "coach-1", workspaceId: "ws-1", nowIso: NOW, businessName: "Test" });
  assert.equal(getMethodologyConfirmation(content.operatingModel).confirmed, false);
});
check("no model at all is unconfirmed and lists every field", () => {
  const c = getMethodologyConfirmation(null);
  assert.equal(c.confirmed, false);
  assert.equal(c.unconfirmedFields.length, GENERATION_METHOD_QUESTION_IDS.length);
});
check("status 'active' alone (no coach provenance) is not confirmed", () => {
  assert.equal(getMethodologyConfirmation({ ...base(), status: "active", activatedAtIso: NOW }).confirmed, false);
});
check("coach provenance with status still 'draft' is not confirmed", () => {
  const m = confirmMethodology(base(), parseOk(ANSWERS), NOW);
  assert.equal(getMethodologyConfirmation({ ...m, status: "draft", activatedAtIso: undefined }).confirmed, false);
});
check("an 'optim_default' provenance entry doesn't count as confirmation", () => {
  const m = confirmMethodology(base(), parseOk(ANSWERS), NOW);
  const provenance = { ...m.provenance, program_splits: { source: "optim_default" as const, confidence: 0.3, updatedAtIso: NOW } };
  const c = getMethodologyConfirmation({ ...m, provenance });
  assert.equal(c.confirmed, false);
  assert.deepEqual(c.unconfirmedFields, ["Training splits"]);
});

console.log("explicit confirmation");
function parseOk(a: MethodAnswers) {
  const r = parseMethodAnswers(a);
  if (!r.ok) throw new Error(r.message);
  return r.answers;
}
check("confirming explicit answers produces a confirmed, activated, new-version model", () => {
  const b = base();
  const m = confirmMethodology(b, parseOk(ANSWERS), NOW);
  const c = getMethodologyConfirmation(m);
  assert.equal(c.confirmed, true);
  assert.equal(c.confirmedAtIso, NOW);
  assert.equal(m.version, b.version + 1);
  assert.equal(m.status, "active");
});
check("confirmed answers are applied to the model fields generation reads", () => {
  const m = confirmMethodology(base(), parseOk(ANSWERS), NOW);
  assert.deepEqual(m.programArchitecture.preferredSplits, ["push_pull_legs"]);
  assert.equal(m.programArchitecture.repRangePhilosophy, "strength_low_3_6");
  assert.equal(m.programArchitecture.deloadFrequencyWeeks, 8);
  assert.equal(m.programArchitecture.typicalFrequencyDaysMax, 5);
  assert.deepEqual(m.programArchitecture.exercisesAvoided, ["Behind-the-neck press"]);
  assert.deepEqual(m.practice.commonGoals, ["get_stronger"]);
});
check("'as needed' deloads confirm as null weeks", () => {
  const m = confirmMethodology(base(), parseOk({ ...ANSWERS, program_deload: "as_needed" }), NOW);
  assert.equal(m.programArchitecture.deloadFrequencyWeeks, null);
});
check("proximity to failure isn't required when the coach uses neither RPE nor RIR", () => {
  const { program_proximity_to_failure: _omit, ...rest } = ANSWERS;
  void _omit;
  const m = confirmMethodology(base(), parseOk({ ...rest, program_rpe_rir: "neither" }), NOW);
  assert.equal(getMethodologyConfirmation(m).confirmed, true);
});

console.log("validation — nothing filled from defaults");
check("an empty submission is rejected", () => assert.equal(parseMethodAnswers({}).ok, false));
check("a missing required field is rejected", () => {
  const { program_deload: _omit, ...rest } = ANSWERS;
  void _omit;
  const r = parseMethodAnswers(rest);
  assert.equal(r.ok, false);
  assert.match(!r.ok ? r.message : "", /Deloads/);
});
check("an empty multi-select is rejected", () => assert.equal(parseMethodAnswers({ ...ANSWERS, program_splits: [] }).ok, false));
check("an unknown option value is rejected", () => assert.equal(parseMethodAnswers({ ...ANSWERS, program_rep_philosophy: "whatever" }).ok, false));
check("an unknown multi-select value is rejected", () => assert.equal(parseMethodAnswers({ ...ANSWERS, practice_common_goals: ["get_stronger", "hack"] }).ok, false));
check("exercises avoided may be blank", () => assert.equal(parseMethodAnswers({ ...ANSWERS, program_exercises_avoided: "" }).ok, true));

console.log("readable labels");
check("known enums map to the onboarding question's own labels", () => {
  assert.equal(optionLabel("program_rep_philosophy", "moderate_8_12"), "Mostly moderate reps (8–12)");
  assert.equal(optionLabel("program_proximity_to_failure", "1_2_reps_in_reserve"), "1–2 reps in reserve");
  assert.equal(optionLabel("program_splits", "full_body"), "Full body");
});
check("unknown values are humanized, never raw snake_case", () => assert.equal(optionLabel("program_splits", "some_new_split"), "Some new split"));
check("describeMethodField renders every field of the default model with no raw enums", () => {
  const m = base();
  for (const id of GENERATION_METHOD_QUESTION_IDS) {
    const text = describeMethodField(m, id);
    assert.doesNotMatch(text, /[a-z]+_[a-z0-9]+/, `${id} rendered "${text}"`);
  }
});
check("methodAnswersFromModel round-trips through parse + confirm unchanged", () => {
  const m = confirmMethodology(base(), parseOk(ANSWERS), NOW);
  const again = confirmMethodology(m, parseOk(methodAnswersFromModel(m)), NOW);
  assert.deepEqual(again.programArchitecture, m.programArchitecture);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
