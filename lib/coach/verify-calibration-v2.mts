// Gate 3.1 — calibration v2: the adaptive interview, Step 0, range
// semantics, structured "it depends", provenance, safety and authority.
// Pure; runs against the real question bank and generators.

import assert from "node:assert/strict";
import { COACH_ONBOARDING_QUESTIONS } from "./coach-onboarding-questions.ts";
import { applyCoachAnswersToModel } from "./coach-onboarding-engine.ts";
import { createDefaultCoachOperatingModel, type CoachOperatingModel } from "./operating-model.ts";
import { ALL_CALIBRATION_ITEMS, CALIBRATION_QUESTIONS, answerKeyOf } from "./calibration/questions.ts";
import { applicableCalibrationChapters, applicableItemKeys, buildCalibrationContext, calibrationV2Readiness, chapterStatus, isApplicableItem, pruneCalibrationAnswers, unresolvedKeysInOrder } from "./calibration/engine.ts";
import { enduranceVolumeSpec, proteinSpec } from "./calibration/questions.ts";
import { hasUnitLabel, unitLabel } from "./calibration/units.ts";
import { interpretCoachDescription, suggestedAreas } from "./calibration/step0-interpreter.ts";
import { validateCalibrationAnswers, checkControl } from "./calibration/validate.ts";
import { applyCalibrationAnswersToModel } from "./calibration/model.ts";
import { describeDecisionPolicy, evaluateDecisionPolicy, validateDecisionPolicy } from "./calibration/decision-policy.ts";
import { DROPPED_V1_QUESTIONS, mapV1AnswersToV2 } from "./calibration/v1-migration.ts";
import { answerAllRequired } from "./calibration/fixtures.ts";
import { formatCalibrationAnswer } from "./calibration/format.ts";
import {
  constrainRpe,
  constrainSets,
  methodCoversResistance,
  resolveBaseRpe,
  resolveBaseSets,
  resolveDeloadEvery,
  resolvePhaseRepRange,
  resolvePreferredSplits,
  resolveResistanceDays,
  resolveSessionCap,
} from "./method-resolution.ts";
import { getMethodologyConfirmation } from "./methodology.ts";
import { evaluateGenerationPrerequisites } from "./generation-prerequisites.ts";
import { renderPlaybookForPrompt } from "./playbook.ts";
import { effectiveMustRespondPersonally, POLICY_LOCKED_PERSONAL_TOPICS, SAFETY_MINIMUM_STATEMENTS } from "./safety-policy.ts";
import { enforceCoachCommunicationAuthority } from "../ai/communication-authority.ts";
import { generateProgramDirectionSummaries } from "./program-directions.ts";
import { buildUniversalProgramForDirection, buildPlaceholderProgrammingProfile } from "./universal-program-generation.ts";
import type { CalibrationAnswers, ScenarioSpec } from "./calibration/types.ts";
import type { DayOfWeek } from "../types";

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

const NOW = "2026-10-01T12:00:00.000Z";
const base = () => createDefaultCoachOperatingModel({ coachId: "coach-a", workspaceId: "ws", nowIso: NOW, businessName: "OPTIM" });
const v2Model = (answers: CalibrationAnswers): CoachOperatingModel => ({ ...applyCalibrationAnswersToModel(base(), answers, NOW), status: "active", activatedAtIso: NOW });
const keysFor = (answers: CalibrationAnswers) => new Set(applicableItemKeys(answers));
const chaptersFor = (answers: CalibrationAnswers) => applicableCalibrationChapters(answers);

// ---------------------------------------------------------------------------
console.log("\n1. Canonical inventory and v1 → v2 mapping\n");

check("the v1 bank has exactly 83 questions (the canonical inventory)", () => {
  assert.equal(COACH_ONBOARDING_QUESTIONS.length, 83);
});

/** What every v1 question becomes. */
const V1_TREATMENT: Record<string, string> = {
  practice_populations: "coaching_areas", practice_experience_levels: "experience_levels", practice_common_goals: "practice_goals", practice_excluded: "practice_excluded",
  practice_program_length: "program_length", practice_service_structure: "program_format", practice_involvement: "dropped", practice_success_definition: "practice_success_definition",
  practice_important_behaviors: "comm_reinforce", program_splits: "t_splits", program_frequency: "t_days", program_session_length: "t_session_length",
  program_exercise_order: "dropped", program_movement_priorities: "dropped", program_equipment: "dropped", program_sets_reps: "t_sets", program_rep_philosophy: "t_reps",
  program_rpe_rir: "t_effort_metric", program_proximity_to_failure: "t_effort_rir", program_progression: "t_progression_method", program_deload: "t_deload_approach",
  program_warmup: "t_warmup", program_cardio: "t_cardio_roles", program_exercises_avoided: "t_exercises_avoided",
  scn_missed_one_workout: "sit_missed_one", scn_missed_multiple_workouts: "sit_missed_multiple", scn_schedule_change_midweek: "sit_schedule_change", scn_equipment_unavailable: "dropped",
  scn_exercise_dislike: "sit_dislike", scn_cannot_feel_target_muscle: "sit_cant_feel", scn_rpe_higher_than_expected: "sit_effort_high", scn_rpe_lower_than_expected: "sit_effort_low",
  scn_rep_targets_missed: "sit_reps_missed", scn_rapid_progress: "sit_rapid_progress", scn_plateau: "sit_plateau_strength", scn_low_sleep: "sit_low_sleep", scn_high_soreness: "sit_soreness", scn_traveling: "sit_travel",
  nutrition_offered: "nutrition_scope", nutrition_plan_vs_framework: "n_approach", nutrition_protein_approach: "n_protein_basis", nutrition_protein_target: "n_protein_amount",
  nutrition_protein_target_fat_loss: "n_protein_amount", nutrition_protein_target_maintenance: "n_protein_amount", nutrition_protein_target_muscle_gain: "n_protein_amount",
  nutrition_food_quality: "n_food_principles", nutrition_meal_frequency: "n_meal_structure", nutrition_training_vs_rest_day: "n_training_rest", nutrition_rate_of_loss: "w_rate_of_loss",
  nutrition_recomposition_approach: "n_recomposition", nutrition_progress_measurements: "n_measurements", nutrition_condition_before_change: "data_threshold_weeks", nutrition_supplement_boundaries: "n_supplements",
  scn_plateau_high_adherence: "sit_stall_high_adherence", scn_plateau_uncertain_adherence: "sit_stall_uncertain", scn_weight_changing_too_fast: "sit_loss_too_fast", scn_excessive_hunger: "sit_hunger",
  scn_training_performance_declining: "dropped", scn_repeated_macro_misses: "sit_macro_misses", scn_social_meal: "sit_social_meal", scn_traveling_nutrition: "sit_travel_nutrition",
  scn_digestive_problems: "sit_digestion", scn_extreme_request: "dropped",
  comm_missed_workout_reply: "comm_voice_sample", comm_directness: "comm_directness", comm_warmth: "comm_warmth", comm_accountability: "comm_accountability", comm_message_length: "comm_message_length",
  comm_humor: "comm_humor", comm_technical_language: "comm_technical_language", comm_checkin_cadence: "checkin_rhythm", comm_morning_message: "dropped", comm_workout_reminder: "dropped",
  comm_quiet_hours: "dropped", comm_ai_direct_response: "comm_ai_direct_response", comm_must_respond_personally: "comm_must_respond_personally", comm_avoided_phrases: "comm_avoided_phrases",
  scn_pain: "scn_pain", scn_possible_injury: "scn_possible_injury", safety_extreme_nutrition_request: "dropped", safety_mental_health: "dropped", safety_out_of_scope: "safety_policy", safety_absolute_rules: "safety_absolute_rules",
};

check("every one of the 83 v1 questions has a stated v2 treatment", () => {
  for (const q of COACH_ONBOARDING_QUESTIONS) assert.ok(V1_TREATMENT[q.id], `no treatment for ${q.id}`);
  assert.equal(Object.keys(V1_TREATMENT).length, 83);
  for (const [v1, v2] of Object.entries(V1_TREATMENT)) if (v2 !== "dropped") assert.ok(ALL_CALIBRATION_ITEMS.some((q) => answerKeyOf(q) === v2), `${v1} → ${v2} isn't a v2 key`);
  for (const d of DROPPED_V1_QUESTIONS) assert.equal(V1_TREATMENT[d], "dropped", d);
});

const V1_FULL = {
  practice_populations: ["strength_athletes", "general_population"], practice_experience_levels: ["intermediate"], practice_common_goals: ["get_stronger", "lose_fat"], practice_excluded: ["under_17", "contest_prep"],
  practice_program_length: "12", practice_service_structure: "fixed_program", practice_success_definition: "Strong, consistent clients.", program_splits: ["upper_lower"], program_frequency: "3_4",
  program_session_length: "60", program_sets_reps: "3_4", program_rep_philosophy: "moderate_8_12", program_rpe_rir: "rir", program_proximity_to_failure: "1_2_reps_in_reserve",
  program_progression: "double_progression", program_deload: "6", program_warmup: "minimal", program_cardio: "rarely_used", program_exercises_avoided: "upright row",
  scn_missed_one_workout: ["reschedule"], scn_low_sleep: ["it_depends"], scn_low_sleep_depends_detail: "Depends how many nights.",
  nutrition_offered: true, nutrition_plan_vs_framework: "structured_meal_plan", nutrition_protein_approach: "fixed", nutrition_protein_target: "0.8", nutrition_rate_of_loss: "0.5",
  nutrition_condition_before_change: "four_plus_weeks", comm_missed_workout_reply: "warm_curious", comm_directness: 2, comm_warmth: 4, comm_humor: true,
  comm_ai_direct_response: ["routine_logistics"], comm_must_respond_personally: ["pain_or_injury_report", "billing_or_account"], comm_morning_message: true, comm_quiet_hours: "9pm_7am",
  scn_pain: ["modify_and_notify"], scn_possible_injury: ["pause_plan_and_escalate"], safety_out_of_scope: "escalate_to_coach_first", safety_mental_health: "escalate_immediately",
};

check("v1 → v2: same-meaning answers carry over as confirmed", () => {
  const r = mapV1AnswersToV2(V1_FULL as never);
  for (const k of ["experience_levels", "practice_goals", "t_splits", "t_days", "t_sets", "t_reps", "t_effort_rir", "t_progression_method", "t_deload_every", "comm_voice_sample", "comm_directness", "scn_possible_injury", "safety_policy"]) {
    assert.ok(r.confirmed.includes(k), `${k} should be confirmed`);
  }
  assert.deepEqual((r.answers.t_reps as { base: unknown }).base, { min: 8, max: 12, unit: "reps" });
  assert.deepEqual(r.answers.safety_policy, { stricter: ["escalate_medical_before_reply"] });
  assert.deepEqual(r.answers.data_threshold_weeks, { min: 4, max: null, unit: "weeks" });
});

check("v1 → v2: changed meanings are flagged for confirmation (never silently treated as confirmed)", () => {
  const r = mapV1AnswersToV2(V1_FULL as never);
  for (const k of ["coaching_areas", "client_modifiers", "t_session_length", "w_rate_of_loss", "comm_humor", "scn_pain", "nutrition_scope", "program_format"]) assert.ok(r.needsConfirmation.includes(k), `${k} should need confirmation`);
  assert.equal(r.answers.scn_pain, "stop_exercise_and_notify", "retired 'modify and keep going' maps to the stricter minimum (D2)");
});

check("v1 → v2: policy/operational answers are dropped, never carried forward", () => {
  const r = mapV1AnswersToV2(V1_FULL as never);
  for (const k of ["safety_mental_health", "comm_morning_message", "comm_quiet_hours"]) assert.ok(r.dropped.includes(k), k);
  assert.ok(!(r.answers.practice_excluded as string[]).includes("under_17"));
  assert.deepEqual(r.answers.comm_must_respond_personally, ["billing_or_account"]);
});

check("v1 → v2: an 'it depends' free-text answer is kept as a note, never turned into a rule", () => {
  const r = mapV1AnswersToV2(V1_FULL as never);
  assert.equal(r.answers.sit_low_sleep, undefined);
  assert.equal((r.answers.__v1Notes as Record<string, string>).sit_low_sleep, "Depends how many nights.");
});

check("v1 → v2: questions v2 adds stay unanswered (unknown, not defaulted)", () => {
  const r = mapV1AnswersToV2(V1_FULL as never);
  for (const k of ["t_swap_rule", "n_calorie_method", "t_rest_periods", "s_max_testing"]) assert.equal(r.answers[k], undefined, k);
  const readiness = calibrationV2Readiness({ answers: r.answers, aiAuthorityConfirmed: true });
  assert.equal(readiness.ready, false);
  assert.ok(readiness.unansweredKeys.includes("t_swap_rule"));
  assert.ok(readiness.needsConfirmation.length > 0);
});

// ---------------------------------------------------------------------------
console.log("\n2. Step 0 — natural description → suggested scope (never confirmed scope)\n");

const SOCCER = "I help soccer players perform better and become quicker and more agile on the field. I also do athletic strength training for general athletes.";

check("the soccer description suggests Sport performance (soccer) + Strength (athletic), with speed/agility", () => {
  const s = interpretCoachDescription(SOCCER);
  const areas = suggestedAreas(s);
  assert.ok(areas.includes("sport_performance"));
  assert.ok(areas.includes("strength"));
  assert.ok(s.sportPerformanceSports.includes("soccer"));
  assert.ok(s.strengthSpecialties.includes("athletic_strength"));
  assert.ok(s.emphases.includes("speed_agility"));
  assert.equal(s.uncertain, false);
});

check("the soccer description introduces no Physique, Weight management, Endurance or Nutrition", () => {
  const s = interpretCoachDescription(SOCCER);
  for (const a of ["physique", "weight_management", "endurance", "general_fitness"]) assert.ok(!s.areas.some((x) => x.area === a), a);
  assert.equal(s.mentionsNutrition, false);
});

check("a suggestion alone is never scope: without the coach's confirmation, only Step 0 applies", () => {
  const s = interpretCoachDescription(SOCCER);
  const answers: CalibrationAnswers = { coach_description: SOCCER, __step0Suggestion: { areas: suggestedAreas(s), sports: s.sportPerformanceSports, uncertain: false } };
  assert.deepEqual(chaptersFor(answers), ["your_coaching"]);
  assert.equal(buildCalibrationContext(answers).areasConfirmed, false);
});

check("confirmed soccer scope assembles Sport performance + Training + Strength — and nothing unrelated", () => {
  const a = answerAllRequired({ coaching_areas: ["sport_performance", "strength"], sport_performance_sports: ["soccer"], experience_levels: ["intermediate"], client_modifiers: ["none"], nutrition_scope: "none", practice_goals: ["athletic_performance", "get_stronger"] });
  const chapters = chaptersFor(a);
  for (const c of ["sport_performance", "training", "strength"]) assert.ok(chapters.includes(c as never), c);
  for (const c of ["physique", "weight_management", "endurance", "nutrition", "general_fitness", "integration"]) assert.ok(!chapters.includes(c as never), c);
});

check("a one-domain description suggests one domain", () => {
  const s = interpretCoachDescription("I coach powerlifters to get stronger for meets.");
  assert.deepEqual(suggestedAreas(s), ["strength"]);
  assert.ok(s.strengthSpecialties.includes("powerlifting"));
});

check("a multi-domain description suggests each domain", () => {
  const s = interpretCoachDescription("I coach marathon runners, and I help busy parents lose weight.");
  const areas = suggestedAreas(s);
  assert.ok(areas.includes("endurance") && areas.includes("weight_management"), areas.join(","));
  assert.ok(s.enduranceSports.includes("running"));
});

check("an unusual sport becomes a custom 'Other' entry the coach can edit", () => {
  const s = interpretCoachDescription("I train ultimate frisbee players to get faster and more explosive.");
  assert.ok(suggestedAreas(s).includes("sport_performance"));
  assert.ok(s.sportPerformanceSports.includes("other:Ultimate frisbee"));
  const v = validateCalibrationAnswers(answerAllRequired({ coaching_areas: ["sport_performance"], sport_performance_sports: ["other:Ultimate frisbee"], experience_levels: ["beginner"], client_modifiers: ["none"], nutrition_scope: "none", practice_goals: ["athletic_performance"] }));
  assert.ok(v.ok && (v.answers.sport_performance_sports as string[]).includes("other:Ultimate frisbee"));
});

check("an ambiguous description is flagged uncertain — calibration falls back to manual selection", () => {
  const s = interpretCoachDescription("I coach clients online.");
  assert.equal(s.uncertain, true);
  assert.deepEqual(suggestedAreas(s), []);
});

check("manual selection works with no description at all", () => {
  const a: CalibrationAnswers = { coaching_areas: ["general_fitness"] };
  assert.ok(chaptersFor(a).includes("general_fitness"));
  assert.ok(buildCalibrationContext(a).areasConfirmed);
});

check("a coach rejecting a suggested domain removes it from scope", () => {
  const s = interpretCoachDescription(SOCCER);
  const confirmed = suggestedAreas(s).filter((x) => x !== "strength");
  const chapters = chaptersFor(answerAllRequired({ coaching_areas: confirmed, sport_performance_sports: ["soccer"], experience_levels: ["intermediate"], client_modifiers: ["none"], nutrition_scope: "none", practice_goals: ["athletic_performance"] }));
  assert.ok(!chapters.includes("strength"));
  assert.ok(chapters.includes("sport_performance"));
});

check("a coach adding a domain the interpreter didn't suggest adds it to scope", () => {
  const s = interpretCoachDescription(SOCCER);
  const confirmed = [...suggestedAreas(s), "endurance"];
  const chapters = chaptersFor(answerAllRequired({ coaching_areas: confirmed, sport_performance_sports: ["soccer"], endurance_sports: ["running"], experience_levels: ["intermediate"], client_modifiers: ["none"], nutrition_scope: "none", practice_goals: ["athletic_performance"] }));
  assert.ok(chapters.includes("endurance"));
  assert.ok(chapters.includes("integration"), "strength + endurance → integration");
});

check("negated mentions are ignored", () => {
  const s = interpretCoachDescription("I coach strength athletes. I don't do bodybuilding.");
  assert.ok(!suggestedAreas(s).includes("physique"));
});

// ---------------------------------------------------------------------------
console.log("\n3. Adaptive applicability by coach (irrelevant questions disappear)\n");

const PERSONAS: { name: string; scope: CalibrationAnswers; must: string[]; never: string[] }[] = [
  {
    name: "powerlifting",
    scope: { coaching_areas: ["strength"], strength_specialties: ["powerlifting"], experience_levels: ["intermediate", "advanced"], client_modifiers: ["none"], nutrition_scope: "full", practice_goals: ["get_stronger"] },
    must: ["t_days", "t_reps", "t_effort_rir", "t_long_term_structure", "s_lift_frequency", "s_max_testing", "s_peaking", "s_supramaximal", "n_approach"],
    never: ["p_weekly_sets", "p_intensity_techniques", "e_weekly_volume", "w_rate_of_loss", "g_intensity_guide", "sp_competition", "x_priority", "n_fueling", "n_rate_of_gain", "w_gain_levers", "sit_gain_stall", "sit_stall_high_adherence", "s_supramaximal_load"],
  },
  {
    name: "hypertrophy",
    scope: { coaching_areas: ["physique"], experience_levels: ["intermediate"], client_modifiers: ["none"], nutrition_scope: "full", practice_goals: ["build_muscle", "recomposition", "lose_fat"] },
    must: ["p_weekly_sets", "p_exercise_selection", "n_rate_of_gain", "n_recomposition", "w_rate_of_loss", "sit_cant_feel", "sit_gain_stall", "sit_stall_high_adherence"],
    never: ["s_max_testing", "s_peaking", "s_supramaximal", "t_percent_1rm", "e_days", "sp_season_approach", "pk_older_build_in", "w_gain_levers", "w_maintenance_band"],
  },
  {
    name: "50+ general-pop fat loss at home",
    scope: { coaching_areas: ["general_fitness", "weight_management"], experience_levels: ["beginner"], client_modifiers: ["older_adults", "home_limited"], nutrition_scope: "full", practice_goals: ["lose_fat", "general_health"], programs_resistance: true, t_effort_metric: ["plain_cues"] },
    must: ["t_effort_plain", "g_intensity_guide", "w_rate_of_loss", "w_levers", "t_cardio_roles", "sit_stall_high_adherence", "pk_older_build_in", "pk_home_equipment", "n_approach"],
    never: ["t_effort_rir", "t_percent_1rm", "t_long_term_structure", "s_peaking", "s_supramaximal", "p_intensity_techniques", "e_taper", "n_fueling", "n_rate_of_gain", "sit_cant_feel", "w_gain_levers", "sit_gain_stall", "sit_gain_appetite", "w_maintenance_band"],
  },
  {
    name: "marathon",
    scope: { coaching_areas: ["endurance"], endurance_sports: ["running"], experience_levels: ["beginner", "intermediate"], client_modifiers: ["none"], nutrition_scope: "guidance", practice_goals: ["endurance_event"], e_intensity_method: ["pace", "heart_rate"] },
    must: ["e_days", "e_weekly_volume", "e_quality_sessions", "e_zone_source", "e_taper", "e_strength_rule", "n_protein_basis", "n_fueling", "sit_missed_long"],
    never: ["t_splits", "t_reps", "t_effort_rir", "p_weekly_sets", "s_max_testing", "sit_cant_feel", "sit_reps_missed", "n_recomposition", "w_rate_of_loss", "n_calorie_method", "e_discipline", "t_cardio_roles", "t_cardio_fat_loss_minutes", "t_cardio_health_minutes", "t_conditioning_minutes"],
  },
  {
    name: "sport performance",
    scope: { coaching_areas: ["sport_performance"], sport_performance_sports: ["soccer"], experience_levels: ["intermediate"], client_modifiers: ["none"], nutrition_scope: "none", practice_goals: ["athletic_performance"], programs_resistance: true },
    must: ["sp_season_approach", "sp_competition", "sp_speed_power", "sp_conditioning", "t_days", "t_long_term_structure"],
    never: ["p_weekly_sets", "s_peaking", "s_supramaximal", "e_days", "w_rate_of_loss", "n_approach", "x_priority", "t_conditioning_minutes", "sit_gain_stall"],
  },
  {
    name: "hybrid strength + endurance",
    scope: { coaching_areas: ["strength", "endurance"], endurance_sports: ["running"], experience_levels: ["intermediate"], client_modifiers: ["none"], nutrition_scope: "full", practice_goals: ["get_stronger", "endurance_event"] },
    must: ["t_days", "s_lift_frequency", "e_weekly_volume", "x_priority", "x_same_day", "x_hard_days", "n_fueling"],
    never: ["e_strength_rule", "t_cardio_roles", "t_cardio_fat_loss_minutes", "t_cardio_health_minutes", "t_conditioning_minutes", "p_weekly_sets", "sp_competition", "w_rate_of_loss"],
  },
  {
    name: "general-fitness only (no weight management)",
    scope: { coaching_areas: ["general_fitness"], experience_levels: ["beginner"], client_modifiers: ["none"], nutrition_scope: "guidance", practice_goals: ["general_health"], programs_resistance: true },
    must: ["g_intensity_guide", "g_activity_emphasis", "g_habit_pacing", "t_days", "t_cardio_roles"],
    never: ["w_rate_of_loss", "w_levers", "w_breaks", "sit_stall_high_adherence", "sit_loss_too_fast", "w_data_threshold", "w_gain_levers", "w_maintenance_band", "sit_gain_stall", "sit_gain_appetite", "sit_hunger", "n_rate_of_gain", "s_supramaximal"],
  },
  {
    name: "weight-gain-focused physique coach",
    scope: { coaching_areas: ["physique", "weight_management"], experience_levels: ["beginner", "intermediate"], client_modifiers: ["none"], nutrition_scope: "full", practice_goals: ["build_muscle", "gain_weight"] },
    must: ["n_rate_of_gain", "w_gain_levers", "sit_gain_stall", "sit_gain_appetite", "p_weekly_sets", "t_cardio_roles"],
    never: ["w_rate_of_loss", "w_levers", "w_breaks", "w_break_every", "w_after_goal", "sit_stall_high_adherence", "sit_stall_uncertain", "sit_loss_too_fast", "sit_hunger", "w_maintenance_band", "s_supramaximal", "t_cardio_fat_loss_minutes"],
  },
  {
    name: "coach who explicitly does not prescribe cardio",
    scope: { coaching_areas: ["strength", "weight_management"], experience_levels: ["intermediate"], client_modifiers: ["none"], nutrition_scope: "full", practice_goals: ["get_stronger", "lose_fat"], t_cardio_roles: ["none"] },
    must: ["t_cardio_roles", "w_rate_of_loss", "w_levers", "s_supramaximal"],
    never: ["t_cardio_fat_loss_minutes", "t_cardio_health_minutes", "t_conditioning_minutes", "w_gain_levers", "sit_gain_stall"],
  },
];

for (const p of PERSONAS) {
  check(`${p.name}: relevant modules appear, irrelevant ones don't`, () => {
    const answers = answerAllRequired(p.scope);
    const keys = keysFor(answers);
    const groupIds = new Set(CALIBRATION_QUESTIONS.filter((q) => q.kind === "group").map((q) => q.id));
    const ctx = buildCalibrationContext(answers);
    const applicableQuestion = (id: string) => (groupIds.has(id) ? CALIBRATION_QUESTIONS.some((q) => q.id === id && (!q.visibleIf || q.visibleIf(ctx))) : keys.has(id));
    for (const id of p.must) assert.ok(applicableQuestion(id), `${p.name} should get ${id}`);
    for (const id of p.never) assert.ok(!applicableQuestion(id), `${p.name} should NOT get ${id}`);
    assert.equal(calibrationV2Readiness({ answers, aiAuthorityConfirmed: true }).ready, true);
  });
}

check("a 50+ pack applies only after the coach confirms an older-adult approach — never from age alone", () => {
  const without = keysFor(answerAllRequired({ coaching_areas: ["general_fitness"], experience_levels: ["beginner"], client_modifiers: ["none"], nutrition_scope: "none", practice_goals: ["general_health"], programs_resistance: true }));
  assert.ok(!without.has("pk_older_build_in"));
});

// ---------------------------------------------------------------------------
console.log("\n4. Base rule → varies? → exceptions → conditions\n");

check("exceptions only exist when the coach says the rule varies", () => {
  const answers = answerAllRequired(PERSONAS[0].scope);
  const v = validateCalibrationAnswers({ ...answers, t_reps: { base: { min: 3, max: 6, unit: "reps" }, varies: "no", exceptions: { accessory: { min: 8, max: 12, unit: "reps" } } } });
  assert.ok(v.ok);
  assert.equal((v.answers.t_reps as { exceptions?: unknown }).exceptions, undefined);
});

check("an exception for a dimension key the coach can't use (outside their day range) is dropped", () => {
  const answers = answerAllRequired(PERSONAS[0].scope);
  const v = validateCalibrationAnswers({ ...answers, t_days: { base: { min: 3, max: 4, unit: "days/week" }, varies: "no" }, t_splits: { base: ["full_body"], varies: "day_count", exceptions: { "4": ["upper_lower"], "6": ["push_pull_legs"] } } });
  assert.ok(v.ok);
  assert.deepEqual((v.answers.t_splits as { exceptions: unknown }).exceptions, { "4": ["upper_lower"] });
});

const STALL = CALIBRATION_QUESTIONS.find((q) => q.id === "sit_stall_high_adherence")!;
const STALL_SPEC = STALL.scenario as ScenarioSpec;
const STALL_POLICY = {
  mode: "conditional" as const,
  rules: [
    { when: { all: [{ factor: "stall_weeks", op: "gte" as const, value: 2 }, { factor: "adherence", op: "is" as const, value: "high" }, { factor: "performance", op: "is" as const, value: "stable" }, { factor: "recovery", op: "is_one_of" as const, value: ["good", "acceptable"] }] }, then: ["reduce_calories"] },
    { when: { all: [{ factor: "adherence", op: "is" as const, value: "low" }] }, then: ["address_adherence"] },
  ],
  otherwise: ["hold_and_reassess"],
  note: "Never cut below maintenance minus 500.",
};

check("the condition schema expresses AND conditions, ordered rules, a fallback and a note", () => {
  const r = validateDecisionPolicy(STALL_POLICY, STALL_SPEC);
  assert.ok(r.ok, r.ok ? "" : r.message);
  assert.deepEqual(evaluateDecisionPolicy(STALL_POLICY, { stall_weeks: 3, adherence: "high", performance: "stable", recovery: "good" }).actions, ["reduce_calories"]);
  assert.deepEqual(evaluateDecisionPolicy(STALL_POLICY, { stall_weeks: 1, adherence: "low" }).actions, ["address_adherence"]);
  assert.deepEqual(evaluateDecisionPolicy(STALL_POLICY, { stall_weeks: 3, adherence: "moderate" }).actions, ["hold_and_reassess"]);
});

check("OR grouping: all-of AND at-least-one-of", () => {
  const p = { mode: "conditional" as const, rules: [{ when: { all: [{ factor: "stall_weeks", op: "gte" as const, value: 2 }], any: [{ factor: "hunger", op: "is" as const, value: "high" }, { factor: "recovery", op: "is" as const, value: "poor" }] }, then: ["hold_and_reassess"] }], otherwise: ["reduce_calories"] };
  assert.ok(validateDecisionPolicy(p, STALL_SPEC).ok);
  assert.deepEqual(evaluateDecisionPolicy(p, { stall_weeks: 2, recovery: "poor" }).actions, ["hold_and_reassess"]);
  assert.deepEqual(evaluateDecisionPolicy(p, { stall_weeks: 2, hunger: "normal", recovery: "good" }).actions, ["reduce_calories"]);
});

check("unknown facts never satisfy a condition", () => {
  assert.deepEqual(evaluateDecisionPolicy(STALL_POLICY, {}).actions, ["hold_and_reassess"]);
});

check("incomplete or invalid policies are refused (no fallback, unknown factor, wrong operator)", () => {
  assert.equal(validateDecisionPolicy({ ...STALL_POLICY, otherwise: [] }, STALL_SPEC).ok, false);
  assert.equal(validateDecisionPolicy({ mode: "conditional", rules: [{ when: { all: [{ factor: "made_up", op: "is", value: "x" }] }, then: ["reduce_calories"] }], otherwise: ["hold_and_reassess"] }, STALL_SPEC).ok, false);
  assert.equal(validateDecisionPolicy({ mode: "conditional", rules: [{ when: { all: [{ factor: "adherence", op: "gte", value: 2 }] }, then: ["reduce_calories"] }], otherwise: ["hold_and_reassess"] }, STALL_SPEC).ok, false);
});

check("the policy reads as plain language", () => {
  const text = describeDecisionPolicy(STALL_POLICY, STALL_SPEC);
  assert.match(text, /^If how long it's stalled ≥ 2 weeks and adherence is high/);
  assert.match(text, /Else if adherence is low → Re-check adherence before changing anything\./);
  assert.match(text, /Otherwise → Hold and reassess\./);
});

check("no safety question offers 'it depends'", () => {
  for (const q of CALIBRATION_QUESTIONS.filter((x) => x.chapter === "safety")) assert.ok(q.kind !== "scenario" || q.scenario?.allowDepends === false, q.id);
  const nonDepends: ScenarioSpec = { actions: [{ value: "a", label: "A" }], factors: STALL_SPEC.factors, allowDepends: false };
  assert.equal(validateDecisionPolicy(STALL_POLICY, nonDepends).ok, false);
});

// ---------------------------------------------------------------------------
console.log("\n5. Numbers and ranges: UI bounds are not validation limits\n");

const sessionControl = CALIBRATION_QUESTIONS.find((q) => q.id === "t_session_length")!.control!;

check("a range outside the wheel's typical bounds is kept and tagged", () => {
  const r = checkControl({ min: 150, max: 210, unit: "min" }, sessionControl);
  assert.equal(r.ok, true);
  assert.deepEqual((r as { value: unknown }).value, { min: 150, max: 210, unit: "min", outsideTypical: true });
});

check("protein far outside the wheel (e.g. 1.6–2.0 g/lb) is accepted", () => {
  const protein = CALIBRATION_QUESTIONS.find((q) => q.id === "n_protein_amount")!.control!;
  assert.equal(checkControl({ min: 1.6, max: 2.0, unit: "g/lb" }, protein).ok, true);
});

check("only definitional limits reject: negative minutes, 8 days a week, min above max", () => {
  assert.equal(checkControl({ min: -5, max: 30, unit: "min" }, sessionControl).ok, false);
  const days = CALIBRATION_QUESTIONS.find((q) => q.id === "t_days")!.control!;
  assert.equal(checkControl({ min: 3, max: 8, unit: "days/week" }, days).ok, false);
  assert.equal(checkControl({ min: 75, max: 60, unit: "min" }, sessionControl).ok, false);
});

check("a preferred value must sit inside the range; open-ended only where allowed", () => {
  assert.equal(checkControl({ min: 60, max: 75, unit: "min", preferred: 90 }, sessionControl).ok, false);
  assert.equal(checkControl({ min: 60, max: 75, unit: "min", preferred: 70 }, sessionControl).ok, true);
  assert.equal(checkControl({ min: 60, max: null, unit: "min" }, sessionControl).ok, false);
  const threshold = CALIBRATION_QUESTIONS.find((q) => q.id === "n_data_threshold")!.control!;
  assert.equal(checkControl({ min: 4, max: null, unit: "weeks" }, threshold).ok, true);
});

check("a stale unit (the coach changed their unit) drops the answer rather than mislabeling it", () => {
  assert.equal(checkControl({ min: 60, max: 75, unit: "hours" }, sessionControl).ok, "drop");
});

check("ranges render as ranges; a preferred value only when set", () => {
  const answers = { ...answerAllRequired(PERSONAS[0].scope), t_session_length: { min: 60, max: 75, unit: "min" } };
  const q = CALIBRATION_QUESTIONS.find((x) => x.id === "t_session_length")!;
  assert.equal(formatCalibrationAnswer(q, answers), "60–75 min");
  assert.equal(formatCalibrationAnswer(q, { ...answers, t_session_length: { min: 60, max: 75, unit: "min", preferred: 70 } }), "60–75 min (usually 70)");
});

// ---------------------------------------------------------------------------
console.log("\n6. Range contracts in live generation\n");

const strengthAnswers = (overrides: CalibrationAnswers) => answerAllRequired({ ...PERSONAS[0].scope, ...overrides });

check("session length 60–75: cap = min(client max, coach max); never a midpoint", () => {
  const m = v2Model(strengthAnswers({ t_session_length: { min: 60, max: 75, unit: "min" } }));
  assert.deepEqual(resolveSessionCap(m, 90), { cap: 75, belowCoachMinimum: null });
  assert.deepEqual(resolveSessionCap(m, 70), { cap: 70, belowCoachMinimum: null });
  assert.deepEqual(resolveSessionCap(m, 45), { cap: 45, belowCoachMinimum: 60 });
  assert.deepEqual(resolveSessionCap(m, null), { cap: 75, belowCoachMinimum: null });
  const withPreferred = v2Model(strengthAnswers({ t_session_length: { min: 60, max: 75, unit: "min", preferred: 65 } }));
  assert.deepEqual(resolveSessionCap(withPreferred, null), { cap: 65, belowCoachMinimum: null });
});

check("RIR range: base target is one rep above the hardest end; phases stay inside the coach's range", () => {
  const m = v2Model(strengthAnswers({ t_effort_rir: { base: { min: 1, max: 3, unit: "reps in reserve" }, varies: "no" } }));
  assert.equal(resolveBaseRpe(m, true), 8);
  assert.equal(constrainRpe(m, true, 10, false), 9, "never harder than the coach's minimum RIR");
  assert.equal(constrainRpe(m, true, 6, false), 7, "never easier than the coach's maximum RIR (outside deloads)");
  assert.equal(constrainRpe(m, true, 6, true), 6, "a deload may go easier");
});

check("the three v1 RIR bands reproduce v1 base targets exactly", () => {
  for (const [lo, hi, rpe] of [[0, 1, 9], [1, 2, 8], [2, 4, 7]] as const) {
    const m = v2Model(strengthAnswers({ t_effort_rir: { base: { min: lo, max: hi, unit: "reps in reserve" }, varies: "no" } }));
    assert.equal(resolveBaseRpe(m, true), rpe);
  }
});

check("exercise-type exceptions: main lifts and accessories get their own ranges", () => {
  const m = v2Model(strengthAnswers({ t_reps: { base: { min: 3, max: 6, unit: "reps" }, varies: "exercise_type", exceptions: { accessory: { min: 8, max: 15, unit: "reps" } } }, t_sets: { base: { min: 3, max: 5, unit: "sets" }, varies: "no" } }));
  assert.deepEqual(resolvePhaseRepRange(m, true, "none"), [3, 6]);
  assert.deepEqual(resolvePhaseRepRange(m, false, "none"), [8, 15]);
  assert.equal(resolveBaseSets(m, true), 5);
  assert.equal(resolveBaseSets(m, false), 3);
  assert.equal(constrainSets(m, true, 7, false), 5);
});

check("experience-level exceptions use the client's own intake experience", () => {
  const m = v2Model(strengthAnswers({ t_sets: { base: { min: 3, max: 4, unit: "sets" }, varies: "experience_level", exceptions: { beginner: { min: 2, max: 3, unit: "sets" } } } }));
  assert.equal(resolveBaseSets(m, true, { trainingExperience: "new" }), 3);
  assert.equal(resolveBaseSets(m, true, { trainingExperience: "experienced_consistent" }), 4);
  assert.equal(resolveBaseSets(m, true, {}), 4, "unknown experience → base rule");
});

check("reps that shift by phase stay inside the coach's range", () => {
  const m = v2Model(strengthAnswers({ t_reps: { base: { min: 6, max: 12, unit: "reps" }, varies: "program_phase" } }));
  assert.deepEqual(resolvePhaseRepRange(m, true, "higher"), [9, 12]);
  assert.deepEqual(resolvePhaseRepRange(m, true, "lower"), [6, 9]);
});

check("deload contract: fixed range picks the N that fits the program; 'as needed' schedules none", () => {
  const fixed = v2Model(strengthAnswers({ t_deload_approach: "fixed", t_deload_every: { min: 4, max: 6, unit: "weeks" } }));
  assert.equal(resolveDeloadEvery(fixed, 12), 6);
  assert.equal(resolveDeloadEvery(fixed, 10), 5);
  const reactive = v2Model(strengthAnswers({ t_deload_approach: "as_needed" }));
  assert.equal(resolveDeloadEvery(reactive, 12), 0);
});

check("training days: coach maximum caps; availability below the minimum is flagged", () => {
  const m = v2Model(strengthAnswers({ t_days: { base: { min: 3, max: 4, unit: "days/week" }, varies: "no" } }));
  assert.deepEqual(resolveResistanceDays(m, 6), { count: 4, belowCoachMinimum: null });
  assert.deepEqual(resolveResistanceDays(m, 2), { count: 2, belowCoachMinimum: 3 });
});

check("split day-count exceptions apply only for that day count", () => {
  const m = v2Model(strengthAnswers({ t_days: { base: { min: 3, max: 5, unit: "days/week" }, varies: "no" }, t_splits: { base: ["full_body"], varies: "day_count", exceptions: { "4": ["upper_lower"] } } }));
  assert.deepEqual(resolvePreferredSplits(m, 4), ["upper_lower"]);
  assert.deepEqual(resolvePreferredSplits(m, 3), ["full_body"]);
});

check("v1 methods resolve exactly as before Gate 3.1", () => {
  const v1 = applyCoachAnswersToModel(base(), V1_FULL as never, NOW);
  assert.equal(resolveBaseRpe(v1, true), 8);
  assert.equal(resolveBaseSets(v1, true), v1.programArchitecture.setsPerExerciseMax);
  assert.equal(resolveDeloadEvery(v1, 12), 6);
  assert.deepEqual(resolveSessionCap(v1, 55), { cap: 55, belowCoachMinimum: null });
  assert.deepEqual(resolvePreferredSplits(v1, 4), ["upper_lower"]);
});

check("a generated program for a v2 coach keeps every RPE and set count inside the coach's ranges", () => {
  const m = v2Model(strengthAnswers({ t_effort_rir: { base: { min: 1, max: 2, unit: "reps in reserve" }, varies: "no" }, t_sets: { base: { min: 3, max: 4, unit: "sets" }, varies: "no" }, t_deload_approach: "fixed", t_deload_every: { min: 4, max: 4, unit: "weeks" } }));
  const profile = buildPlaceholderProgrammingProfile(["Monday", "Wednesday", "Friday"] as DayOfWeek[]);
  const directions = generateProgramDirectionSummaries({ profile, com: m, durationWeeks: 8 });
  const program = buildUniversalProgramForDirection(directions[0], { clientId: "c", workspaceId: "ws", coachId: "coach-a", profile, com: m, durationWeeks: 8, nowIso: NOW });
  for (const week of program.content.weeks) {
    const deload = week.weekNumber % 4 === 0 || week.weekNumber === 8;
    for (const day of week.days) for (const s of day.sessions ?? []) for (const b of s.blocks) for (const item of b.items) {
      const p = item.prescription;
      if (p.family !== "resistance") continue;
      if (!deload) {
        assert.ok((p.rpe ?? 8) >= 8 && (p.rpe ?? 8) <= 9, `week ${week.weekNumber} RPE ${p.rpe}`);
        assert.ok((p.sets ?? 3) >= 3 && (p.sets ?? 3) <= 4, `week ${week.weekNumber} sets ${p.sets}`);
      } else assert.ok((p.rpe ?? 8) <= 9 && (p.sets ?? 3) <= 4);
    }
  }
});

check("a v2 method without a training base refuses resistance generation (never defaults)", () => {
  const m = v2Model(answerAllRequired(PERSONAS[3].scope));
  assert.equal(methodCoversResistance(m), false);
  const c = getMethodologyConfirmation(m);
  assert.equal(c.confirmed, false);
  assert.equal(c.coversResistance, false);
  const r = evaluateGenerationPrerequisites({ playbook: { version: 1, operatingModel: m }, onboarding: null, intake: { missing: ["x"] } as never, clientProfileId: "c" });
  assert.ok(!r.ready && r.missing.some((x) => x.id === "coach_method" && /resistance-training method/.test(x.message)));
});

// ---------------------------------------------------------------------------
console.log("\n7. Provenance: no OPTIM default presented as the coach's method\n");

check("v1 prompt: the four never-asked defaults are gone; coach-given lines remain", () => {
  const v1 = { ...applyCoachAnswersToModel(base(), V1_FULL as never, NOW), status: "active" as const, activatedAtIso: NOW };
  const prompt = renderPlaybookForPrompt({ operatingModel: v1, aiAuthority: { coachId: "a", workspaceId: "w", global: { level: "advisor", domainOverrides: {} }, clientOverrides: {}, updatedAtIso: NOW }, examples: [] });
  assert.ok(!/Substitution rule/.test(prompt));
  assert.ok(!/adherence standard/.test(prompt));
  assert.ok(!/moderate_deficit_or_surplus_from_maintenance/.test(prompt));
  assert.ok(!/medical concern -> escalate_and_recommend_professional/.test(prompt));
  assert.match(prompt, /Program philosophy: double_progression, RPE\/RIR target proximity: 1_2_reps_in_reserve\./);
  assert.match(prompt, /medical or out-of-scope question -> escalate_to_coach_first/);
});

check("v2 prompt: only what the coach gave; status-C answers never reach chat; scope 'none' says so", () => {
  const answers = answerAllRequired({ ...PERSONAS[3].scope, nutrition_scope: "none" });
  const m = v2Model({ ...answers, e_weekly_volume: { base: { min: 30, max: 50, unit: "km/week" }, varies: "no" } });
  const prompt = renderPlaybookForPrompt({ operatingModel: m, aiAuthority: { coachId: "a", workspaceId: "w", global: { level: "advisor", domainOverrides: {} }, clientOverrides: {}, updatedAtIso: NOW }, examples: [] });
  assert.ok(!/Training method/.test(prompt), "no resistance rules for an endurance-only coach");
  assert.ok(!/km\/week|weekly volume/i.test(prompt), "status-C endurance answers never reach chat");
  assert.match(prompt, /Nutrition: not part of this coach's service/);
  assert.ok(!/Substitution rule|adherence standard/i.test(prompt));
});

check("v2 prompt renders coach ranges as ranges", () => {
  const m = v2Model(strengthAnswers({ t_reps: { base: { min: 4, max: 8, unit: "reps" }, varies: "no" } }));
  const prompt = renderPlaybookForPrompt({ operatingModel: m, aiAuthority: { coachId: "a", workspaceId: "w", global: { level: "advisor", domainOverrides: {} }, clientOverrides: {}, updatedAtIso: NOW }, examples: [] });
  assert.match(prompt, /rep range: 4–8 reps/);
});

check("unanswered questions carry no provenance", () => {
  const m = v2Model(strengthAnswers({}));
  for (const id of ["t_rest_periods", "t_when_short", "sit_low_sleep", "n_meal_structure"]) assert.equal(m.provenance[id], undefined, id);
});

// ---------------------------------------------------------------------------
console.log("\n8. Safety and authority\n");

check("safety minimums are stated once and describe existing enforcement", () => {
  assert.equal(SAFETY_MINIMUM_STATEMENTS.length, 6);
  const q = CALIBRATION_QUESTIONS.find((x) => x.id === "safety_policy")!;
  assert.equal(q.policy?.statements, SAFETY_MINIMUM_STATEMENTS);
  assert.deepEqual(q.policy?.stricter.map((o) => o.value), ["escalate_medical_before_reply"]);
});

check("removed fake safety questions no longer exist in v2", () => {
  for (const id of ["safety_mental_health", "safety_extreme_nutrition_request", "scn_extreme_request"]) assert.equal(ALL_CALIBRATION_ITEMS.find((q) => q.id === id), undefined, id);
  const pain = CALIBRATION_QUESTIONS.find((q) => q.id === "scn_pain")!;
  assert.deepEqual(pain.control?.kind === "single" ? pain.control.options.map((o) => o.value) : [], ["stop_exercise_and_notify", "stop_workout_and_notify"]);
});

check("pain/injury and emotional distress always escalate, even if a coach selected neither (D3, stricter only)", () => {
  assert.deepEqual([...POLICY_LOCKED_PERSONAL_TOPICS], ["pain_or_injury_report", "emotional_distress"]);
  assert.deepEqual(effectiveMustRespondPersonally(["billing_or_account"]).sort(), ["billing_or_account", "emotional_distress", "pain_or_injury_report"]);
  const d = enforceCoachCommunicationAuthority({ kind: "answer", responseText: "ok" } as never, "my knee hurts after squats", { aiMayRespondDirectly: ["routine_logistics"], coachMustRespondPersonally: [] });
  assert.equal(d.kind, "escalate");
});

check("the stricter medical rule maps onto the existing out-of-scope field", () => {
  const m = v2Model(strengthAnswers({ safety_policy: { stricter: ["escalate_medical_before_reply"] } }));
  assert.equal(m.safety.outOfScopeHandling, "escalate_to_coach_first");
});

check("authority is not a calibration answer: there's no parallel authority field in v2", () => {
  assert.equal(ALL_CALIBRATION_ITEMS.some((q) => /authority/i.test(q.id)), false);
  const m = v2Model(strengthAnswers({ comm_ai_direct_response: ["routine_logistics"] }));
  assert.deepEqual(m.communication.aiMayRespondDirectly, ["routine_logistics"]);
});

check("pruning: removing an area drops its module's answers", () => {
  const a = answerAllRequired(PERSONAS[5].scope);
  const pruned = pruneCalibrationAnswers({ ...a, coaching_areas: ["strength"] });
  assert.equal(pruned.e_weekly_volume, undefined);
  assert.equal(pruned.x_priority, undefined);
  assert.ok(pruned.t_days !== undefined);
});

console.log("\n9. Refinement state: chapter status + unresolved-only navigation\n");

check("a refinement draft's chapters show real state — never 'complete' just because they exist", () => {
  const draft = mapV1AnswersToV2(V1_FULL as never).answers;
  const ctx = buildCalibrationContext(draft);
  assert.ok(ctx.areasConfirmed);
  const training = chapterStatus("training", draft);
  assert.equal(training, "incomplete", "new required questions (e.g. the swap rule) are missing");
  assert.equal(chapterStatus("ai_authority", draft, { aiAuthorityConfirmed: false }), "incomplete");
  assert.equal(chapterStatus("ai_authority", draft, { aiAuthorityConfirmed: true }), "complete");
});

check("a chapter with every required answer but a carried-over answer to check is 'needs review'", () => {
  const draft = answerAllRequired({ ...mapV1AnswersToV2(V1_FULL as never).answers });
  assert.ok((draft.__needsConfirmation as string[]).includes("t_session_length"));
  assert.equal(chapterStatus("training", draft), "needs_review");
  const looked = { ...draft, __needsConfirmation: (draft.__needsConfirmation as string[]).filter((k) => !k.startsWith("t_")) };
  assert.equal(chapterStatus("training", looked), "complete");
});

check("an optional-only chapter with nothing answered is 'optional', not complete", () => {
  const a = answerAllRequired(PERSONAS[0].scope);
  assert.equal(chapterStatus("situations", a), "optional");
});

check("unresolved-only navigation lists just the unresolved keys, in interview order", () => {
  const draft = mapV1AnswersToV2(V1_FULL as never).answers;
  const required = unresolvedKeysInOrder(draft, "required");
  const r = calibrationV2Readiness({ answers: draft, aiAuthorityConfirmed: true });
  assert.deepEqual([...required].sort(), [...r.unansweredKeys].sort());
  const review = unresolvedKeysInOrder(draft, "needs_review");
  assert.deepEqual([...review].sort(), [...r.needsConfirmation].sort());
  assert.ok(required.indexOf("t_swap_rule") > -1);
  const order = ["your_coaching", "philosophy", "training"];
  const firstTraining = required.findIndex((k) => k.startsWith("t_"));
  assert.ok(required.slice(0, firstTraining).every((k) => !k.startsWith("t_")), order.join(">"));
});


console.log("\n10. Content clarity + goal-aware applicability (first-time calibration QA)\n");

const item = (id: string) => ALL_CALIBRATION_ITEMS.find((q) => q.id === id)!;
const visibleIds = (answers: CalibrationAnswers) => {
  const ctx = buildCalibrationContext(answers);
  return new Set(ALL_CALIBRATION_ITEMS.filter((q) => q.kind !== "group" && isApplicableItem(q, ctx)).map((q) => q.id));
};
const PL = PERSONAS[0].scope;

check("check-in asks about a STRUCTURED coaching check-in, not day-to-day messaging", () => {
  const g = CALIBRATION_QUESTIONS.find((q) => q.id === "checkin")!;
  assert.match(g.prompt, /structured coaching check-in/);
  assert.match(g.explanation ?? "", /not normal day-to-day messaging/);
  assert.deepEqual(item("checkin_approach").control && (item("checkin_approach").control as { options: { value: string }[] }).options.map((o) => o.value), ["every_n_days", "every_n_weeks", "as_needed", "varies"]);
});

check("cadence: as-needed and varies-by-client need no number; days/weeks ask for one in that unit", () => {
  const a = answerAllRequired(PL);
  for (const approach of ["as_needed", "varies"]) {
    const v = validateCalibrationAnswers({ ...a, checkin_approach: approach, checkin_rhythm: { value: 7, unit: "days" } });
    assert.ok(v.ok);
    assert.equal(v.answers.checkin_rhythm, undefined, "no forced cadence");
    assert.equal(calibrationV2Readiness({ answers: v.answers, aiAuthorityConfirmed: true }).unansweredKeys.includes("checkin_rhythm"), false);
  }
  const weeks = validateCalibrationAnswers({ ...a, checkin_approach: "every_n_weeks", checkin_rhythm: { value: 2, unit: "weeks" } });
  assert.ok(weeks.ok);
  assert.deepEqual(weeks.answers.checkin_rhythm, { value: 2, unit: "weeks" });
  const stale = validateCalibrationAnswers({ ...a, checkin_approach: "every_n_weeks", checkin_rhythm: { value: 7, unit: "days" } });
  assert.ok(stale.ok);
  assert.equal(stale.answers.checkin_rhythm, undefined, "a days value isn't read as weeks");
  assert.equal(v2Model({ ...a, checkin_approach: "as_needed" }).communication.checkInCadence, "as_needed");
  assert.equal(v2Model({ ...a, checkin_approach: "varies" }).communication.checkInCadence, "varies_by_client");
  assert.equal(v2Model({ ...a, checkin_approach: "every_n_weeks", checkin_rhythm: { value: 2, unit: "weeks" } }).communication.checkInCadence, "every_2_weeks");
  assert.equal(v2Model({ ...a, checkin_approach: "every_n_days", checkin_rhythm: { value: 10, unit: "days" } }).communication.checkInCadence, "every_10_days");
});

check("a check-in value confirmed before the schedule question existed is kept — and the schedule is asked, never invented", () => {
  const old = answerAllRequired(PL);
  delete old.checkin_approach;
  old.checkin_rhythm = { value: 7, unit: "days" };
  const v = validateCalibrationAnswers(old);
  assert.ok(v.ok);
  assert.deepEqual(v.answers.checkin_rhythm, { value: 7, unit: "days" });
  assert.equal(v.answers.checkin_approach, undefined);
  assert.ok(calibrationV2Readiness({ answers: v.answers, aiAuthorityConfirmed: true }).unansweredKeys.includes("checkin_approach"));
});

check("normal dynamic %1RM stays capped at 100%", () => {
  const q = item("t_percent_1rm");
  assert.match(q.prompt, /normal dynamic working sets/);
  assert.equal((q.control as { spec: { hardMax: number } }).spec.hardMax, 100);
  const a = answerAllRequired({ ...PL, t_effort_metric: ["percent_1rm"] });
  assert.ok(validateCalibrationAnswers({ ...a, t_percent_1rm: { min: 70, max: 85, unit: "% of 1RM" } }).ok);
  assert.equal(validateCalibrationAnswers({ ...a, t_percent_1rm: { min: 90, max: 110, unit: "% of 1RM" } }).ok, false);
});

check("supramaximal loading: Strength coaches only, loading asked only after they say yes, and it may exceed 100%", () => {
  const a = answerAllRequired(PL);
  assert.ok(visibleIds(a).has("s_supramaximal"));
  assert.ok(!visibleIds(a).has("s_supramaximal_load"));
  assert.ok(!visibleIds({ ...a, s_supramaximal: ["none"] }).has("s_supramaximal_load"));
  const yes = { ...a, s_supramaximal: ["static_holds", "eccentrics"], s_supramaximal_load: { base: { min: 105, max: 120, unit: "% of 1RM" }, varies: "method", exceptions: { eccentrics: { min: 110, max: 125, unit: "% of 1RM" } } } };
  assert.ok(visibleIds(yes).has("s_supramaximal_load"));
  const v = validateCalibrationAnswers(yes);
  assert.ok(v.ok, v.ok ? "" : v.message);
  assert.equal((v.answers.s_supramaximal_load as { base: { max: number } }).base.max, 120);
  assert.equal(item("s_supramaximal").status, "C");
  assert.equal(item("s_supramaximal_load").status, "C");
  for (const p of [PERSONAS[1], PERSONAS[2], PERSONAS[3], PERSONAS[4], PERSONAS[6]]) assert.ok(!visibleIds(answerAllRequired(p.scope)).has("s_supramaximal"), p.name);
});

check("every numeric and range control names its unit in plain words", () => {
  const specs: { id: string; unit: string }[] = [];
  const answersSets = PERSONAS.map((p) => answerAllRequired(p.scope));
  for (const q of ALL_CALIBRATION_ITEMS) {
    for (const a of [{}, ...answersSets]) {
      const c = (q.dynamicControl ? q.dynamicControl(buildCalibrationContext(a)) : q.control) as { kind?: string; spec?: { unit: string } } | undefined;
      if (c && (c.kind === "number" || c.kind === "range") && c.spec) specs.push({ id: q.id, unit: c.spec.unit });
    }
  }
  for (const u of ["hours", "km", "mi", "load"]) specs.push({ id: `e_weekly_volume:${u}`, unit: enduranceVolumeSpec(u).unit });
  for (const b of ["per_lb_bodyweight", "per_kg_bodyweight", "fixed_grams"]) specs.push({ id: `n_protein_amount:${b}`, unit: proteinSpec(b).unit });
  const missing = specs.filter((s) => !s.unit || !hasUnitLabel(s.unit));
  assert.deepEqual(missing, []);
  assert.equal(unitLabel("min"), "minutes");
  assert.equal(unitLabel("min/week"), "minutes/week");
});

check("numeric steps never invent methodology: minutes are representable to the minute, typed values kept exactly", () => {
  const a = answerAllRequired({ ...PERSONAS[2].scope, t_cardio_roles: ["fat_loss", "health"] });
  for (const [key, min, max] of [["t_cardio_fat_loss_minutes", 1, 7], ["t_cardio_fat_loss_minutes", 22, 143], ["t_cardio_health_minutes", 0, 271], ["t_session_length", 47, 73]] as const) {
    const unit = key === "t_session_length" ? "min" : "min/week";
    const v = validateCalibrationAnswers({ ...a, [key]: { min, max, unit } });
    assert.ok(v.ok, `${key} ${min}–${max}`);
    assert.deepEqual({ min: (v.answers[key] as { min: number }).min, max: (v.answers[key] as { max: number }).max }, { min, max });
  }
  const minuteSpecs = ALL_CALIBRATION_ITEMS.map((q) => q.control as { kind?: string; spec?: { unit: string; step: number } } | undefined).filter((c) => c?.spec && /^min/.test(c.spec.unit));
  assert.ok(minuteSpecs.length > 0);
  for (const c of minuteSpecs) assert.ok(c!.spec!.step <= 5, `${c!.spec!.unit} step ${c!.spec!.step}`);
});

check("cardio volume is hidden from a coach who doesn't prescribe cardio", () => {
  const ids = visibleIds(answerAllRequired(PERSONAS[8].scope));
  assert.ok(ids.has("t_cardio_roles"));
  for (const id of ["t_cardio_fat_loss_minutes", "t_cardio_health_minutes", "t_conditioning_minutes"]) assert.ok(!ids.has(id), id);
  assert.equal(item("t_cardio_roles").control && (item("t_cardio_roles").control as { options: { value: string; label: string }[] }).options.find((o) => o.value === "none")?.label, "I don't prescribe cardio");
});

check("cardio volume appears in the context the coach prescribes it for", () => {
  const base = answerAllRequired(PERSONAS[2].scope);
  const fat = visibleIds({ ...base, t_cardio_roles: ["fat_loss"] });
  assert.ok(fat.has("t_cardio_fat_loss_minutes") && !fat.has("t_cardio_health_minutes") && !fat.has("t_conditioning_minutes"));
  const health = visibleIds({ ...base, t_cardio_roles: ["health"] });
  assert.ok(health.has("t_cardio_health_minutes") && !health.has("t_cardio_fat_loss_minutes"));
  const optional = visibleIds({ ...base, t_cardio_roles: ["optional_low_intensity"] });
  assert.ok(!optional.has("t_cardio_fat_loss_minutes") && !optional.has("t_cardio_health_minutes"), "an optional extra has no prescribed volume");
  const cond = visibleIds({ ...base, t_cardio_roles: ["conditioning"] });
  assert.ok(cond.has("t_conditioning_minutes"));
  const sp = visibleIds({ ...answerAllRequired(PERSONAS[4].scope), t_cardio_roles: ["conditioning"] });
  assert.ok(!sp.has("t_conditioning_minutes") && sp.has("sp_conditioning"), "sport performance owns conditioning");
  assert.match(item("t_cardio_fat_loss_minutes").prompt, /fat-loss clients/);
  assert.match(item("t_cardio_health_minutes").prompt, /general health/);
});

check("no generic cardio questions for an endurance coach (the Endurance module owns volume)", () => {
  for (const p of [PERSONAS[3], PERSONAS[5]]) {
    const ids = visibleIds({ ...answerAllRequired(p.scope), practice_goals: [...(p.scope.practice_goals as string[]), "lose_fat"] });
    for (const id of ["t_cardio_roles", "t_cardio_fat_loss_minutes", "t_cardio_health_minutes", "t_conditioning_minutes"]) assert.ok(!ids.has(id), `${p.name}: ${id}`);
    assert.ok(ids.has("e_weekly_volume"));
  }
});

check("a lever the coach ruled out isn't offered, and a stale choice is dropped rather than refused", () => {
  const a = answerAllRequired(PERSONAS[8].scope);
  const opts = (buildCalibrationContext(a) && item("w_levers").dynamicControl!(buildCalibrationContext(a))) as { options: { value: string }[] };
  assert.ok(!opts.options.some((o) => o.value === "cardio"));
  const v = validateCalibrationAnswers({ ...a, w_levers: ["cardio", "calories"] });
  assert.ok(v.ok);
  assert.deepEqual(v.answers.w_levers, ["calories"]);
  const only = validateCalibrationAnswers({ ...a, w_levers: ["cardio"] });
  assert.ok(only.ok);
  assert.equal(only.answers.w_levers, undefined);
});

check("fat-loss questions are hidden from a weight-gain-only coach; weight-gain ones from a fat-loss-only coach", () => {
  const gain = visibleIds(answerAllRequired(PERSONAS[7].scope));
  for (const id of ["w_rate_of_loss", "w_levers", "w_breaks", "w_after_goal", "sit_stall_high_adherence", "sit_stall_uncertain", "sit_loss_too_fast", "sit_hunger"]) assert.ok(!gain.has(id), `gain coach saw ${id}`);
  assert.ok(gain.has("w_rate_of_gain") && gain.has("w_gain_levers"));
  const fatOnly = visibleIds(answerAllRequired({ coaching_areas: ["weight_management"], experience_levels: ["beginner"], client_modifiers: ["none"], nutrition_scope: "full", practice_goals: ["lose_fat"] }));
  for (const id of ["w_rate_of_gain", "n_rate_of_gain", "w_gain_levers", "sit_gain_stall", "sit_gain_appetite", "w_maintenance_band"]) assert.ok(!fatOnly.has(id), `fat-loss coach saw ${id}`);
  assert.ok(fatOnly.has("w_rate_of_loss") && fatOnly.has("sit_stall_high_adherence"));
});

check("a general-fitness coach without weight management sees neither branch", () => {
  const ids = visibleIds(answerAllRequired(PERSONAS[6].scope));
  for (const q of ALL_CALIBRATION_ITEMS) if (q.chapter === "weight_management") assert.ok(!ids.has(q.id), q.id);
  for (const id of ["sit_stall_high_adherence", "sit_gain_stall", "sit_gain_appetite", "sit_loss_too_fast", "sit_hunger"]) assert.ok(!ids.has(id), id);
});

check("every bodyweight scenario names its goal and appears only for coaches of that goal", () => {
  const fatLoss = ["sit_stall_high_adherence", "sit_stall_uncertain", "sit_loss_too_fast", "sit_hunger"];
  const gain = ["sit_gain_stall", "sit_gain_appetite"];
  for (const id of fatLoss) assert.match(item(id).prompt, /^A fat-loss client/, id);
  for (const id of gain) assert.match(item(id).prompt, /^A weight-gain client/, id);
  assert.equal(item("sit_stall_high_adherence").prompt, "A fat-loss client's bodyweight has stopped decreasing, and adherence is high. What should happen?");
  assert.equal(item("sit_gain_stall").prompt, "A weight-gain client's bodyweight has stopped increasing, and adherence is high. What should happen?");
  for (const q of ALL_CALIBRATION_ITEMS.filter((x) => x.chapter === "situations")) {
    if (/bodyweight|weight|hunger|eat enough/i.test(q.prompt)) assert.ok([...fatLoss, ...gain].includes(q.id), `${q.id} talks about bodyweight without naming a goal`);
  }
  const fatCoach = answerAllRequired({ coaching_areas: ["weight_management"], experience_levels: ["beginner"], client_modifiers: ["none"], nutrition_scope: "full", practice_goals: ["lose_fat"] });
  assert.ok(gain.every((id) => !visibleIds(fatCoach).has(id)));
});

check("a multi-goal weight-management coach gets each branch once, with no duplicate rate-of-gain question", () => {
  const a = answerAllRequired({ coaching_areas: ["weight_management", "physique"], experience_levels: ["beginner"], client_modifiers: ["none"], nutrition_scope: "full", practice_goals: ["lose_fat", "gain_weight", "maintain_weight", "build_muscle"] });
  const ids = visibleIds(a);
  for (const id of ["w_rate_of_loss", "w_levers", "w_rate_of_gain", "w_gain_levers", "w_maintenance_band", "w_maintenance_adjust", "sit_stall_high_adherence", "sit_gain_stall"]) assert.ok(ids.has(id), id);
  assert.ok(!ids.has("n_rate_of_gain"), "rate of gain asked once, in Weight management");
  assert.ok(calibrationV2Readiness({ answers: a, aiAuthorityConfirmed: true }).ready);
  const keyCounts = new Map<string, number>();
  for (const q of ALL_CALIBRATION_ITEMS) if (q.kind !== "group" && ids.has(q.id)) keyCounts.set(answerKeyOf(q), (keyCounts.get(answerKeyOf(q)) ?? 0) + 1);
  assert.deepEqual([...keyCounts].filter(([, n]) => n > 1), [], "no answer is asked twice");
});

check("protein 'varies by goal' only offers the goals the coach coaches", () => {
  const a = answerAllRequired(PERSONAS[1].scope);
  const dims = item("n_protein_amount").variesBy!(buildCalibrationContext(a));
  assert.deepEqual(dims[0].keys.map((k) => k.value), ["lose_fat", "maintenance", "build_muscle"]);
  const single = answerAllRequired({ ...PERSONAS[0].scope, practice_goals: ["build_muscle"] });
  assert.deepEqual(item("n_protein_amount").variesBy!(buildCalibrationContext(single)), [], "one goal → nothing to vary by");
});

check("program length varies by season for sport performance — never by endurance events", () => {
  const dims = item("program_length").variesBy!(buildCalibrationContext(answerAllRequired(PERSONAS[4].scope)));
  assert.deepEqual(dims.map((d) => d.id), ["season_phase"]);
  const endurance = item("program_length").variesBy!(buildCalibrationContext(answerAllRequired(PERSONAS[3].scope)));
  assert.deepEqual(endurance.map((d) => d.id), ["event"]);
});

check("an already-confirmed method's answers are never rewritten: retired keys drop, new questions stay unknown", () => {
  const confirmed = { ...answerAllRequired(PERSONAS[2].scope), t_cardio_roles: ["fat_loss"], t_cardio_minutes: { min: 120, max: 180, unit: "min/week" } } as CalibrationAnswers;
  delete confirmed.checkin_approach;
  const v = validateCalibrationAnswers(confirmed);
  assert.ok(v.ok);
  assert.equal(v.answers.t_cardio_minutes, undefined, "the old generic cardio total isn't kept");
  assert.equal(v.answers.t_cardio_fat_loss_minutes, undefined, "…and isn't reinterpreted as fat-loss cardio");
  assert.equal(v.answers.checkin_approach, undefined, "a schedule is never manufactured");
});

check("v1 refinement: the carried-over cadence is flagged for confirmation (its meaning narrowed)", () => {
  const r = mapV1AnswersToV2({ ...V1_FULL, comm_checkin_cadence: "weekly" } as never);
  assert.equal(r.answers.checkin_approach, "every_n_days");
  assert.deepEqual(r.answers.checkin_rhythm, { value: 7, unit: "days" });
  assert.ok((r.answers.__needsConfirmation as string[]).includes("checkin_approach") && (r.answers.__needsConfirmation as string[]).includes("checkin_rhythm"));
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
