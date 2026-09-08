// Phase 5.4A — coach onboarding question bank + engine: adaptive branching,
// safe pruning, question-to-field mapping, scenario -> executable policy
// conversion, platform-minimum safety scenarios, and traceable inference.

import assert from "node:assert/strict";
import {
  ALL_CHAPTER_IDS_IN_ORDER,
  chapterApplies,
  COACH_ONBOARDING_QUESTIONS,
  findQuestion,
  isQuestionVisible,
  SCENARIO_DEPENDS_VALUE,
  visibleQuestionsForChapter,
  type CoachOnboardingAnswers,
} from "./coach-onboarding-questions.ts";
import {
  allRequiredVisibleQuestionIds,
  applicableChapters,
  applyCoachAnswersToModel,
  buildAdjustmentPolicy,
  computeProgressSummary,
  confirmInference,
  inferFromExistingWork,
  pruneAnswersToVisibleQuestions,
} from "./coach-onboarding-engine.ts";
import { createDefaultCoachOperatingModel, inferredProvenance } from "./operating-model.ts";
import { WORKSPACE_OPTIM_ID, COACH_PROFILE_TEAGUE } from "../tenancy/seed.ts";
import type { CoachProgramTemplate, MealRecommendation } from "./types";

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

console.log("\n1. Every question maps to a real model field (or an executable policy)\n");

check("Every question in the bank declares a non-empty modelFieldsAffected", () => {
  for (const q of COACH_ONBOARDING_QUESTIONS) {
    assert.ok(q.modelFieldsAffected.length > 0, `${q.id} has no modelFieldsAffected`);
  }
});

check("Every question id is unique across the whole bank", () => {
  const ids = COACH_ONBOARDING_QUESTIONS.map((q) => q.id);
  assert.equal(new Set(ids).size, ids.length);
});

check("findQuestion resolves a real question by id and is undefined for a bogus id", () => {
  assert.equal(findQuestion("practice_success_definition")?.chapter, "practice");
  assert.equal(findQuestion("not_a_real_question"), undefined);
});

console.log("\n2. Adaptive branching — chapters and questions skip safely\n");

check("A coach who answers nutrition_offered=false skips the entire nutrition_philosophy and nutrition_adjustment chapters", () => {
  const answers: CoachOnboardingAnswers = { nutrition_offered: false };
  assert.equal(chapterApplies("nutrition_philosophy", answers), false);
  assert.equal(chapterApplies("nutrition_adjustment", answers), false);
  assert.equal(applicableChapters(answers).includes("nutrition_philosophy"), false);
  assert.equal(applicableChapters(answers).includes("nutrition_adjustment"), false);
});

check("A coach who answers nutrition_offered=true sees the nutrition chapters and their questions", () => {
  const answers: CoachOnboardingAnswers = { nutrition_offered: true };
  assert.equal(chapterApplies("nutrition_philosophy", answers), true);
  const visible = visibleQuestionsForChapter("nutrition_philosophy", answers);
  assert.ok(visible.some((q) => q.id === "nutrition_protein_approach"));
});

check("Phase 5.6A.4 — the goal-dependent protein follow-up is a real, meaningfully different branch, not the flat single-select it replaced", () => {
  const fixed: CoachOnboardingAnswers = { nutrition_offered: true, nutrition_protein_approach: "fixed" };
  const goalDependent: CoachOnboardingAnswers = { nutrition_offered: true, nutrition_protein_approach: "goal_dependent" };
  const visibleFixed = visibleQuestionsForChapter("nutrition_philosophy", fixed);
  const visibleGoalDependent = visibleQuestionsForChapter("nutrition_philosophy", goalDependent);
  assert.ok(visibleFixed.some((q) => q.id === "nutrition_protein_target"), "fixed approach still shows the one universal target question");
  assert.ok(!visibleFixed.some((q) => q.id === "nutrition_protein_target_fat_loss"), "fixed approach never shows goal-specific follow-ups");
  assert.ok(!visibleGoalDependent.some((q) => q.id === "nutrition_protein_target"), "goal-dependent approach hides the single flat target question");
  assert.ok(
    ["nutrition_protein_target_fat_loss", "nutrition_protein_target_maintenance", "nutrition_protein_target_muscle_gain"].every((id) => visibleGoalDependent.some((q) => q.id === id)),
    "goal-dependent approach reveals all three goal-specific follow-ups"
  );
});

check("program_proximity_to_failure is hidden when the coach uses neither RPE nor RIR", () => {
  const withNeither: CoachOnboardingAnswers = { program_rpe_rir: "neither" };
  const withRpe: CoachOnboardingAnswers = { program_rpe_rir: "rpe" };
  const q = findQuestion("program_proximity_to_failure")!;
  assert.equal(isQuestionVisible(q, withNeither), false);
  assert.equal(isQuestionVisible(q, withRpe), true);
});

check("ai_authority, existing_work, and review are always applicable regardless of any branch answer", () => {
  const answers: CoachOnboardingAnswers = { nutrition_offered: false };
  const applicable = applicableChapters(answers);
  for (const id of ["ai_authority", "existing_work", "review"] as const) {
    assert.ok(applicable.includes(id), `${id} should always apply`);
  }
});

check("ALL_CHAPTER_IDS_IN_ORDER contains exactly the 10 documented chapters, in the documented order", () => {
  assert.deepEqual(ALL_CHAPTER_IDS_IN_ORDER, [
    "practice",
    "program_architecture",
    "training_adjustment",
    "nutrition_philosophy",
    "nutrition_adjustment",
    "communication",
    "safety",
    "ai_authority",
    "existing_work",
    "review",
  ]);
});

console.log("\n3. Safe pruning — a parent-answer change never erases unrelated answers\n");

check("Flipping nutrition_offered from true to false prunes only nutrition-chapter answers, keeping everything else", () => {
  const answers: CoachOnboardingAnswers = {
    nutrition_offered: true,
    nutrition_protein_target: "0.8",
    practice_success_definition: "Consistent, sustainable progress.",
    program_rpe_rir: "rpe",
  };
  const flipped: CoachOnboardingAnswers = { ...answers, nutrition_offered: false };
  const pruned = pruneAnswersToVisibleQuestions(flipped);
  assert.equal(pruned.nutrition_protein_target, undefined, "nutrition answer must be pruned once nutrition coaching is turned off");
  assert.equal(pruned.practice_success_definition, answers.practice_success_definition, "unrelated practice answer must survive untouched");
  assert.equal(pruned.program_rpe_rir, "rpe", "unrelated program answer must survive untouched");
  assert.equal(pruned.nutrition_offered, false, "nutrition_offered itself must survive as the coach's real 'No' answer, never be silently erased");
});

check("REGRESSION: answering nutrition_offered=false never erases that very answer, even from a bare answer bag with nothing else set", () => {
  // nutrition_offered is what chapterApplies("nutrition_philosophy", ...)
  // itself reads — pruning it via that same check the instant it's false
  // would erase a coach's real "No" answer and leave the onboarding
  // wizard's Continue button permanently disabled on this exact question
  // (canContinue requires typeof currentValue === "boolean"). Found via a
  // live walkthrough during this pass, not just a hypothetical.
  const pruned = pruneAnswersToVisibleQuestions({ nutrition_offered: false });
  assert.equal(pruned.nutrition_offered, false);
});

check("Switching program_rpe_rir to 'neither' prunes the now-invisible proximity-to-failure answer only", () => {
  const answers: CoachOnboardingAnswers = {
    program_rpe_rir: "rpe",
    program_proximity_to_failure: "1_2_reps_in_reserve",
    program_progression: "double_progression",
  };
  const pruned = pruneAnswersToVisibleQuestions({ ...answers, program_rpe_rir: "neither" });
  assert.equal(pruned.program_proximity_to_failure, undefined);
  assert.equal(pruned.program_progression, "double_progression");
});

check("Pruning is idempotent — pruning an already-pruned, fully-consistent answer set changes nothing", () => {
  const answers: CoachOnboardingAnswers = { nutrition_offered: false, practice_success_definition: "x" };
  const once = pruneAnswersToVisibleQuestions(answers);
  const twice = pruneAnswersToVisibleQuestions(once);
  assert.deepEqual(once, twice);
});

console.log("\n4. Honest, recomputed progress — never stuck, never over 100%\n");

check("Progress is 0% with no answers, and rises as required visible questions are answered", () => {
  const summary0 = computeProgressSummary({});
  assert.equal(summary0.answeredQuestions, 0);
  assert.ok(summary0.totalApplicableQuestions > 0);

  const summary1 = computeProgressSummary({ practice_success_definition: "x" });
  assert.equal(summary1.answeredQuestions, 1);
  assert.ok(summary1.percentComplete > summary0.percentComplete);
});

check("Turning off nutrition coaching reduces the total question count (fewer applicable questions), never increases it", () => {
  const withNutrition = computeProgressSummary({ nutrition_offered: true });
  const withoutNutrition = computeProgressSummary({ nutrition_offered: false });
  assert.ok(withoutNutrition.totalApplicableQuestions < withNutrition.totalApplicableQuestions);
});

check("allRequiredVisibleQuestionIds never includes a question hidden by the current answers", () => {
  const ids = allRequiredVisibleQuestionIds({ program_rpe_rir: "neither" });
  assert.ok(!ids.includes("program_proximity_to_failure"));
});

console.log("\n5. Scenario answers become real, executable AdjustmentPolicy records\n");

check("A ranked scenario answer preserves selection order as the alternatives ranking, never re-sorted", () => {
  const q = findQuestion("scn_missed_one_workout")!;
  const policy = buildAdjustmentPolicy(q, ["condense_week", "reschedule", "continue_next_scheduled"], undefined);
  assert.equal(policy.preferredAction, "condense_week");
  assert.deepEqual(policy.acceptableAlternatives, ["reschedule", "continue_next_scheduled"]);
  assert.equal(policy.domain, "training");
  assert.equal(policy.source, "coach_selected");
});

check("An 'it depends' scenario answer carries the coach's own free-text condition as rationale, with no auto-executable action", () => {
  const q = findQuestion("scn_plateau")!;
  const policy = buildAdjustmentPolicy(q, [SCENARIO_DEPENDS_VALUE], "Depends on whether they're also sleeping poorly.");
  assert.equal(policy.preferredAction, SCENARIO_DEPENDS_VALUE);
  assert.equal(policy.conditions, "Depends on whether they're also sleeping poorly.");
  assert.equal(policy.aiMayExecute, false);
  assert.equal(policy.requiresCoachApproval, true);
});

check("A 'flag_for_coach_review' or 'ask_coach_first' preferred action is never marked AI-executable", () => {
  const q = findQuestion("scn_cannot_feel_target_muscle")!;
  const policy = buildAdjustmentPolicy(q, ["flag_for_coach_review", "suggest_technique_cue"], undefined);
  assert.equal(policy.aiMayExecute, false);
  assert.equal(policy.requiresCoachApproval, true);
});

check("A concrete, non-review preferred action IS marked AI-executable for a non-safety-minimum scenario", () => {
  const q = findQuestion("scn_equipment_unavailable")!;
  const policy = buildAdjustmentPolicy(q, ["use_approved_substitute", "pick_closest_pattern_match"], undefined);
  assert.equal(policy.aiMayExecute, true);
  assert.equal(policy.requiresCoachApproval, false);
});

console.log("\n6. Platform-minimum safety scenarios override every coach answer\n");

check("scn_pain always sets alwaysEscalates=true, aiMayExecute=false, requiresCoachApproval=true, regardless of the coach's chosen action", () => {
  const q = findQuestion("scn_pain")!;
  for (const action of ["stop_exercise_and_notify", "stop_workout_and_notify"]) {
    const policy = buildAdjustmentPolicy(q, [action], undefined);
    assert.equal(policy.alwaysEscalates, true, `scn_pain (${action}) must always escalate`);
    assert.equal(policy.aiMayExecute, false, `scn_pain (${action}) must never be AI-executable`);
    assert.equal(policy.requiresCoachApproval, true);
  }
});

check("scn_possible_injury always sets alwaysEscalates=true, aiMayExecute=false, requiresCoachApproval=true, regardless of the coach's chosen action", () => {
  const q = findQuestion("scn_possible_injury")!;
  for (const action of ["pause_plan_and_escalate", "modify_and_escalate"]) {
    const policy = buildAdjustmentPolicy(q, [action], undefined);
    assert.equal(policy.alwaysEscalates, true);
    assert.equal(policy.aiMayExecute, false);
    assert.equal(policy.requiresCoachApproval, true);
  }
});

check("applyCoachAnswersToModel stores every scenario answer as a real policy in trainingAdjustmentPolicies/nutritionAdjustmentPolicies, with real per-question provenance", () => {
  const base = createDefaultCoachOperatingModel({ coachId: COACH_PROFILE_TEAGUE.id, workspaceId: WORKSPACE_OPTIM_ID, nowIso: "2026-01-01T00:00:00.000Z", businessName: "OPTIM" });
  const answers: CoachOnboardingAnswers = {
    scn_pain: ["stop_workout_and_notify"],
    scn_extreme_request: ["flag_for_coach_review"],
    practice_success_definition: "Sustainable, steady progress.",
  };
  const model = applyCoachAnswersToModel(base, answers, "2026-01-02T00:00:00.000Z");
  assert.ok(model.trainingAdjustmentPolicies.some((p) => p.id === "scn_pain"));
  assert.ok(model.nutritionAdjustmentPolicies.some((p) => p.id === "scn_extreme_request"));
  assert.equal(model.provenance.scn_pain.source, "coach_selected");
  assert.equal(model.provenance.practice_success_definition.source, "coach_selected");
  assert.equal(model.practice.successDefinition, "Sustainable, steady progress.");
});

check("applyCoachAnswersToModel never mutates the base model it's given", () => {
  const base = createDefaultCoachOperatingModel({ coachId: COACH_PROFILE_TEAGUE.id, workspaceId: WORKSPACE_OPTIM_ID, nowIso: "2026-01-01T00:00:00.000Z", businessName: "OPTIM" });
  const baseSnapshot = JSON.parse(JSON.stringify(base));
  applyCoachAnswersToModel(base, { practice_success_definition: "changed" }, "2026-01-02T00:00:00.000Z");
  assert.deepEqual(base, baseSnapshot);
});

check("An unanswered question leaves its field at whatever the base model already had", () => {
  const base = createDefaultCoachOperatingModel({ coachId: COACH_PROFILE_TEAGUE.id, workspaceId: WORKSPACE_OPTIM_ID, nowIso: "2026-01-01T00:00:00.000Z", businessName: "OPTIM" });
  const model = applyCoachAnswersToModel(base, {}, "2026-01-02T00:00:00.000Z");
  assert.equal(model.practice.successDefinition, base.practice.successDefinition);
  assert.deepEqual(model.provenance, {});
});

console.log("\n7. Traceable inference from existing work — real, never fabricated, never auto-confirmed\n");

function template(sets: number, rpe: number, trainingDays: number): CoachProgramTemplate {
  const day = (type: "training" | "rest") =>
    type === "rest"
      ? { type: "rest" as const }
      : { type: "training" as const, workout: { exercises: Array.from({ length: 3 }, () => ({ workingSets: sets, targetRpe: rpe })) } };
  const days = Array.from({ length: 7 }, (_, i) => day(i < trainingDays ? "training" : "rest"));
  return { weeks: [{ days }] } as unknown as CoachProgramTemplate;
}

check("Fewer than 2 saved templates produces zero training inferences — never a guess from insufficient data", () => {
  const inferences = inferFromExistingWork([template(4, 8, 4)], []);
  assert.equal(inferences.some((i) => i.questionId === "program_sets_reps"), false);
});

check("Two or more real templates produce a real, computed sets/RPE/frequency inference with an honest sample-size note", () => {
  const inferences = inferFromExistingWork([template(4, 8.5, 4), template(4, 8.5, 4)], []);
  const setsInference = inferences.find((i) => i.questionId === "program_sets_reps");
  assert.ok(setsInference);
  assert.match(setsInference!.note, /saved templates/);
  assert.ok(setsInference!.confidence > 0 && setsInference!.confidence < 1);

  const rpeInference = inferences.find((i) => i.questionId === "program_proximity_to_failure");
  assert.equal(rpeInference?.inferredValue, "0_1_reps_in_reserve");
});

check("An inference's apply() sets `inferred` provenance, never coach_selected/coach_confirmed", () => {
  const base = createDefaultCoachOperatingModel({ coachId: COACH_PROFILE_TEAGUE.id, workspaceId: WORKSPACE_OPTIM_ID, nowIso: "2026-01-01T00:00:00.000Z", businessName: "OPTIM" });
  const inferences = inferFromExistingWork([template(4, 8, 4), template(5, 8, 4)], []);
  const setsInference = inferences.find((i) => i.questionId === "program_sets_reps")!;
  const applied = setsInference.apply(base, "2026-01-02T00:00:00.000Z");
  assert.equal(applied.provenance.program_sets_reps.source, "inferred");
});

check("Meal recommendations without macro data never produce a food-quality inference", () => {
  const meals = [{ macros: {} }, { macros: {} }] as unknown as MealRecommendation[];
  const inferences = inferFromExistingWork([], meals);
  assert.equal(inferences.some((i) => i.questionId === "nutrition_food_quality"), false);
});

check("Two or more meal recommendations with real protein macros produce a real food-quality inference", () => {
  const meals = [{ macros: { proteinG: 40 } }, { macros: { proteinG: 45 } }] as unknown as MealRecommendation[];
  const inferences = inferFromExistingWork([], meals);
  const inference = inferences.find((i) => i.questionId === "nutrition_food_quality");
  assert.ok(inference);
  assert.equal(inference!.inferredValue, "adequate_protein");
});

check("confirmInference only upgrades a genuinely `inferred` entry, and is a no-op on anything else (coach_selected, optim_default, or missing)", () => {
  const base = createDefaultCoachOperatingModel({ coachId: COACH_PROFILE_TEAGUE.id, workspaceId: WORKSPACE_OPTIM_ID, nowIso: "2026-01-01T00:00:00.000Z", businessName: "OPTIM" });
  const withInference = { ...base, provenance: { program_sets_reps: inferredProvenance(0.7, "Based on 2 templates.", "2026-01-01T00:00:00.000Z") } };
  const confirmed = confirmInference(withInference, "program_sets_reps", "2026-01-02T00:00:00.000Z");
  assert.equal(confirmed.provenance.program_sets_reps.source, "coach_confirmed");

  const noOpMissing = confirmInference(base, "never_set", "2026-01-02T00:00:00.000Z");
  assert.equal(noOpMissing, base);

  const withCoachSelected = { ...base, provenance: { practice_success_definition: { source: "coach_selected" as const, confidence: 1, updatedAtIso: "2026-01-01T00:00:00.000Z" } } };
  const noOpSelected = confirmInference(withCoachSelected, "practice_success_definition", "2026-01-02T00:00:00.000Z");
  assert.equal(noOpSelected.provenance.practice_success_definition.source, "coach_selected");
});

console.log("\n8. Phase 5.6A.4 — duplicate safety/escalation/non-negotiable questions consolidated to one each\n");

check("REGRESSION: safety_pain_response and safety_possible_injury (the exact duplicates of scn_pain/scn_possible_injury) no longer exist in the bank", () => {
  assert.equal(findQuestion("safety_pain_response"), undefined);
  assert.equal(findQuestion("safety_possible_injury"), undefined);
});

check("REGRESSION: program_non_negotiables (the near-duplicate of safety_absolute_rules) no longer exists in the bank", () => {
  assert.equal(findQuestion("program_non_negotiables"), undefined);
});

check("scn_pain and scn_possible_injury now live once, in the safety chapter — never asked a second time in training_adjustment", () => {
  assert.equal(findQuestion("scn_pain")?.chapter, "safety");
  assert.equal(findQuestion("scn_possible_injury")?.chapter, "safety");
  const trainingAdjustmentIds = COACH_ONBOARDING_QUESTIONS.filter((q) => q.chapter === "training_adjustment").map((q) => q.id);
  assert.ok(!trainingAdjustmentIds.includes("scn_pain"));
  assert.ok(!trainingAdjustmentIds.includes("scn_possible_injury"));
});

check("The merged scn_pain question now offers the third real option safety_pain_response used to have ('modify safely, don't necessarily stop')", () => {
  const q = findQuestion("scn_pain")!;
  assert.ok(q.options?.some((o) => o.value === "modify_and_notify"));
});

check("REGRESSION: a single scn_pain/scn_possible_injury answer populates BOTH the executable trainingAdjustmentPolicies entry AND the safety-chapter summary fields — one coach answer, two real consumers, never asked twice", () => {
  const base = createDefaultCoachOperatingModel({ coachId: COACH_PROFILE_TEAGUE.id, workspaceId: WORKSPACE_OPTIM_ID, nowIso: "2026-01-01T00:00:00.000Z", businessName: "OPTIM" });
  const model = applyCoachAnswersToModel(
    base,
    { scn_pain: ["modify_and_notify"], scn_possible_injury: ["pause_plan_and_escalate"] },
    "2026-01-02T00:00:00.000Z"
  );
  assert.ok(model.trainingAdjustmentPolicies.some((p) => p.id === "scn_pain" && p.preferredAction === "modify_and_notify"));
  assert.equal(model.safety.painResponsePolicy, "modify_and_notify");
  assert.ok(model.trainingAdjustmentPolicies.some((p) => p.id === "scn_possible_injury" && p.preferredAction === "pause_plan_and_escalate"));
  assert.equal(model.safety.injuryResponsePolicy, "pause_plan_and_escalate");
});

check("REGRESSION: a single safety_absolute_rules answer populates BOTH safety.absoluteOverrideRules AND programArchitecture.nonNegotiables — never asked as two separate questions", () => {
  const base = createDefaultCoachOperatingModel({ coachId: COACH_PROFILE_TEAGUE.id, workspaceId: WORKSPACE_OPTIM_ID, nowIso: "2026-01-01T00:00:00.000Z", businessName: "OPTIM" });
  const model = applyCoachAnswersToModel(base, { safety_absolute_rules: "Never program behind-the-neck presses." }, "2026-01-02T00:00:00.000Z");
  assert.deepEqual(model.safety.absoluteOverrideRules, ["Never program behind-the-neck presses."]);
  assert.deepEqual(model.programArchitecture.nonNegotiables, ["Never program behind-the-neck presses."]);
});

console.log("\n9. Phase 5.6A.4 — goal-dependent protein philosophy (never one hard-coded universal assumption)\n");

check("The default model uses the honest, backward-compatible 'fixed' approach, never a fabricated goal-dependent default", () => {
  const base = createDefaultCoachOperatingModel({ coachId: COACH_PROFILE_TEAGUE.id, workspaceId: WORKSPACE_OPTIM_ID, nowIso: "2026-01-01T00:00:00.000Z", businessName: "OPTIM" });
  assert.equal(base.nutritionPhilosophy.proteinTargetApproach, "fixed");
  assert.equal(base.nutritionPhilosophy.proteinTargetsByGoalGramsPerLbBodyweight, undefined);
});

check("Answering the three goal-specific follow-ups stores a real, structured per-goal policy, never a single flattened number", () => {
  const base = createDefaultCoachOperatingModel({ coachId: COACH_PROFILE_TEAGUE.id, workspaceId: WORKSPACE_OPTIM_ID, nowIso: "2026-01-01T00:00:00.000Z", businessName: "OPTIM" });
  const model = applyCoachAnswersToModel(
    base,
    {
      nutrition_protein_approach: "goal_dependent",
      nutrition_protein_target_fat_loss: "1.2",
      nutrition_protein_target_maintenance: "0.8",
      nutrition_protein_target_muscle_gain: "0.7",
    },
    "2026-01-02T00:00:00.000Z"
  );
  assert.equal(model.nutritionPhilosophy.proteinTargetApproach, "goal_dependent");
  assert.deepEqual(model.nutritionPhilosophy.proteinTargetsByGoalGramsPerLbBodyweight, { fatLoss: 1.2, maintenanceOrRecomposition: 0.8, muscleGain: 0.7 });
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
