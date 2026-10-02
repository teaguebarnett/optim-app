// Gate 3.1 — mapping a coach's confirmed v1 calibration answers into v2.
//
// Used only to PREFILL a "Refine your method" review draft. Nothing here
// changes an active method: the coach's v1 version stays active until they
// explicitly confirm the refined draft (which creates a new version).
//
// Each mapped answer is one of:
//   - confirmed: same meaning, new shape (kept as the coach's answer);
//   - needs confirmation: the meaning changed or became more precise — the
//     value is prefilled, listed under NEEDS_CONFIRMATION_KEY, and the coach
//     must look at it before confirming;
//   - dropped: OPTIM policy or operational settings that left calibration
//     (kept in the old version's history, never carried forward).
// Questions v2 adds stay unanswered — never defaulted.

import type { CoachOnboardingAnswers } from "../coach-onboarding-questions.ts";
import { CALIBRATION_SCHEMA_KEY, CALIBRATION_SCHEMA_VERSION, NEEDS_CONFIRMATION_KEY, type CalibrationAnswers, type DecisionPolicy } from "./types.ts";

export const V1_NOTES_KEY = "__v1Notes";

const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
const range = (min: number, max: number | null, unit: string) => ({ min, max, unit });
const layered = (base: unknown, varies = "no", exceptions?: Record<string, unknown>) => ({ base, varies, ...(exceptions ? { exceptions } : {}) });
const list = (text: unknown): string[] =>
  (typeof text === "string" ? text : "")
    .split(/[,;\n]/)
    .map((x) => x.trim())
    .filter(Boolean);

const POPULATION_TO_AREA: Record<string, string> = {
  strength_athletes: "strength",
  physique_bodybuilding: "physique",
  team_sport_athletes: "sport_performance",
  endurance_athletes: "endurance",
  general_population: "general_fitness",
  busy_professionals: "general_fitness",
  older_adults: "general_fitness",
  postpartum_or_return_to_training: "general_fitness",
};

/** v1 scenario id → v2 situation id, with action value renames. */
const SCENARIO_MAP: Record<string, { to: string; actions: Record<string, string> }> = {
  scn_missed_one_workout: { to: "sit_missed_one", actions: { reschedule: "reschedule", continue_next_scheduled: "continue_next", condense_week: "condense_week", ask_client_first: "ask_client" } },
  scn_missed_multiple_workouts: { to: "sit_missed_multiple", actions: { reduce_week_workload: "reduce_week", continue_next_scheduled: "continue_next", condense_week: "condense_week", check_in_first: "check_in" } },
  scn_schedule_change_midweek: { to: "sit_schedule_change", actions: { shift_remaining_days: "shift_days", drop_lowest_priority_day: "drop_lowest_priority", ask_client_first: "ask_client" } },
  scn_exercise_dislike: { to: "sit_dislike", actions: { swap_same_pattern: "swap_using_rule", keep_but_note: "keep_and_note", ask_coach_first: "ask_coach" } },
  scn_cannot_feel_target_muscle: { to: "sit_cant_feel", actions: { suggest_technique_cue: "technique_cue", swap_to_isolation_variant: "isolation_variant", flag_for_coach_review: "flag_for_coach" } },
  scn_rpe_higher_than_expected: { to: "sit_effort_high", actions: { reduce_load_or_volume: "reduce_load_or_volume", hold_and_monitor: "hold_and_monitor", insert_deload: "earlier_deload", flag_for_coach_review: "flag_for_coach" } },
  scn_rpe_lower_than_expected: { to: "sit_effort_low", actions: { increase_load: "increase_load", increase_volume: "add_set", hold_and_monitor: "hold_and_monitor" } },
  scn_rep_targets_missed: { to: "sit_reps_missed", actions: { reduce_load: "reduce_load", reduce_working_sets: "reduce_sets", hold_and_monitor: "hold_and_monitor", flag_for_coach_review: "flag_for_coach" } },
  scn_rapid_progress: { to: "sit_rapid_progress", actions: { accelerate_progression: "accelerate", hold_and_monitor: "hold_and_monitor", flag_for_coach_review: "flag_for_coach" } },
  scn_plateau: { to: "sit_plateau_strength", actions: { vary_stimulus: "vary_stimulus", insert_deload: "deload_first", increase_volume: "increase_volume", flag_for_coach_review: "flag_for_coach" } },
  scn_low_sleep: { to: "sit_low_sleep", actions: { reduce_intensity_slightly: "reduce_intensity", hold_plan: "hold_plan", ask_client_first: "ask_client" } },
  scn_high_soreness: { to: "sit_soreness", actions: { reduce_volume_affected_muscle: "reduce_affected", hold_plan: "hold_plan", flag_for_coach_review: "flag_for_coach" } },
  scn_traveling: { to: "sit_travel", actions: { swap_to_travel_friendly: "travel_friendly", reduce_to_maintenance: "maintenance", pause_and_resume: "pause" } },
  scn_plateau_high_adherence: { to: "sit_stall_high_adherence", actions: { reduce_calories_slightly: "reduce_calories", increase_activity_first: "increase_activity", hold_and_reassess: "hold_and_reassess" } },
  scn_plateau_uncertain_adherence: { to: "sit_stall_uncertain", actions: { review_logging_first: "review_logging", ask_client_directly: "ask_client", flag_for_coach_review: "flag_for_coach" } },
  scn_weight_changing_too_fast: { to: "sit_loss_too_fast", actions: { adjust_calories_toward_target_rate: "add_calories", hold_and_monitor: "hold_and_monitor", flag_for_coach_review: "flag_for_coach" } },
  scn_excessive_hunger: { to: "sit_hunger", actions: { increase_protein_fiber_volume: "more_volume_foods", add_a_small_refeed: "small_refeed", flag_for_coach_review: "flag_for_coach" } },
  scn_repeated_macro_misses: { to: "sit_macro_misses", actions: { simplify_the_targets: "simplify_targets", reduce_meal_frequency_requirement: "fewer_tracked_meals", flag_for_coach_review: "flag_for_coach" } },
  scn_social_meal: { to: "sit_social_meal", actions: { adjust_surrounding_meals: "adjust_around", treat_as_a_free_pass: "guilt_free", no_change_needed: "no_change" } },
  scn_traveling_nutrition: { to: "sit_travel_nutrition", actions: { simplify_to_protein_and_calorie_ballpark: "simplify", pause_tracking_for_the_trip: "pause_tracking", hold_normal_targets: "best_effort" } },
  scn_digestive_problems: { to: "sit_digestion", actions: { suggest_reviewing_common_triggers: "review_triggers", flag_for_coach_review: "flag_for_coach" } },
};

/** Situations whose meaning narrowed in v2 (e.g. "changing too fast" is now
 * specifically weight loss). */
const NARROWED_SCENARIOS = new Set(["sit_loss_too_fast"]);

/** v1 questions dropped from calibration: OPTIM policy or operational
 * settings. Their values stay in the v1 version's history. */
export const DROPPED_V1_QUESTIONS = [
  "program_exercise_order",
  "program_movement_priorities",
  "program_equipment",
  "practice_involvement",
  "comm_morning_message",
  "comm_workout_reminder",
  "comm_quiet_hours",
  "safety_extreme_nutrition_request",
  "safety_mental_health",
  "scn_extreme_request",
  "scn_equipment_unavailable",
  "scn_training_performance_declining",
];

export interface V1MappingResult {
  answers: CalibrationAnswers;
  confirmed: string[];
  needsConfirmation: string[];
  dropped: string[];
}

export function mapV1AnswersToV2(v1: CoachOnboardingAnswers): V1MappingResult {
  const out: CalibrationAnswers = { [CALIBRATION_SCHEMA_KEY]: CALIBRATION_SCHEMA_VERSION };
  const confirmed: string[] = [];
  const needs: string[] = [];
  const notes: Record<string, string> = {};
  const set = (key: string, value: unknown, needsConfirmation = false) => {
    out[key] = value as CalibrationAnswers[string];
    (needsConfirmation ? needs : confirmed).push(key);
  };

  // --- Scope (reinterpreted from v1's mixed population list) ---
  const populations = arr(v1.practice_populations);
  const goals = arr(v1.practice_common_goals);
  const areas = new Set(populations.map((p) => POPULATION_TO_AREA[p]).filter(Boolean));
  if (goals.includes("lose_fat")) areas.add("weight_management");
  if (areas.size > 0) set("coaching_areas", [...areas], true);
  const modifiers = [...(populations.includes("older_adults") ? ["older_adults"] : []), ...(populations.includes("postpartum_or_return_to_training") ? ["postpartum"] : [])];
  if (populations.length > 0) set("client_modifiers", modifiers.length ? modifiers : ["none"], true);
  if (arr(v1.practice_experience_levels).length) set("experience_levels", arr(v1.practice_experience_levels));
  if (goals.length) set("practice_goals", goals);
  if (v1.nutrition_offered === false) set("nutrition_scope", "none");
  else if (v1.nutrition_offered === true) set("nutrition_scope", "full", true);

  // --- Philosophy ---
  if (str(v1.practice_success_definition)) set("practice_success_definition", v1.practice_success_definition);
  const length = str(v1.practice_program_length);
  if (length && length !== "ongoing") set("program_length", layered(range(Number(length), Number(length), "weeks")));
  const service = str(v1.practice_service_structure);
  if (length === "ongoing" || service === "ongoing") set("program_format", "rolling_blocks", true);
  else if (service === "fixed_program") set("program_format", "fixed_length", true);
  else if (service === "hybrid") set("program_format", "both", true);
  const excluded = arr(v1.practice_excluded).filter((v) => v !== "under_17");
  if (arr(v1.practice_excluded).length) set("practice_excluded", excluded.length ? excluded : ["none"]);
  const cadence: Record<string, number> = { daily: 1, weekly: 7, biweekly: 14, monthly: 30 };
  // v1 asked about any check-in; v2 asks about a structured check-in, so the
  // carried-over cadence is flagged for the coach to confirm.
  if (str(v1.comm_checkin_cadence) && cadence[str(v1.comm_checkin_cadence)!]) {
    set("checkin_approach", "every_n_days", true);
    set("checkin_rhythm", { value: cadence[str(v1.comm_checkin_cadence)!], unit: "days" }, true);
  }
  if (arr(v1.practice_important_behaviors).length) set("comm_reinforce", arr(v1.practice_important_behaviors));

  // --- Training ---
  if (arr(v1.program_splits).length) set("t_splits", layered(arr(v1.program_splits)));
  const band = (v: unknown) => str(v)?.split("_").map(Number);
  const freq = band(v1.program_frequency);
  if (freq && freq.length === 2) set("t_days", layered(range(freq[0], freq[1], "days/week")));
  if (str(v1.program_session_length)) set("t_session_length", range(Number(v1.program_session_length), Number(v1.program_session_length), "min"), true);
  const sets = band(v1.program_sets_reps);
  if (sets && sets.length === 2) set("t_sets", layered(range(sets[0], sets[1], "sets")));
  const repMap: Record<string, [number, number]> = { strength_low_3_6: [3, 6], moderate_8_12: [8, 12], higher_12_20: [12, 20] };
  const rep = str(v1.program_rep_philosophy);
  if (rep && repMap[rep]) set("t_reps", layered(range(repMap[rep][0], repMap[rep][1], "reps")));
  else if (rep === "varied_by_block") set("t_reps", layered(range(8, 12, "reps"), "program_phase"), true);
  const rpe = str(v1.program_rpe_rir);
  if (rpe === "rpe") set("t_effort_metric", ["rpe"]);
  else if (rpe === "rir") set("t_effort_metric", ["rir"]);
  else if (rpe === "both") set("t_effort_metric", ["rpe", "rir"]);
  else if (rpe === "neither") set("t_effort_metric", ["fixed_loads"], true);
  const rirMap: Record<string, [number, number]> = { "0_1_reps_in_reserve": [0, 1], "1_2_reps_in_reserve": [1, 2], "2_4_reps_in_reserve": [2, 4] };
  const prox = str(v1.program_proximity_to_failure);
  if (prox && rirMap[prox]) set("t_effort_rir", layered(range(rirMap[prox][0], rirMap[prox][1], "reps in reserve")));
  const progMap: Record<string, string> = { linear_load: "add_load_when_reps_hit", double_progression: "double_progression", autoregulated: "autoregulated" };
  const prog = str(v1.program_progression);
  if (prog && progMap[prog]) set("t_progression_method", layered([progMap[prog]]));
  else if (prog === "planned_undulation") set("t_long_term_structure", layered("undulating"), true);
  const deload = str(v1.program_deload);
  if (deload === "as_needed") set("t_deload_approach", "as_needed", true);
  else if (deload) {
    set("t_deload_approach", "fixed");
    set("t_deload_every", range(Number(deload), Number(deload), "weeks"));
  }
  if (str(v1.program_warmup)) set("t_warmup", v1.program_warmup);
  const cardioMap: Record<string, string> = { optional_low_intensity_supplemental: "optional_low_intensity", prescribed_for_fat_loss: "fat_loss", prescribed_for_conditioning: "conditioning", rarely_used: "none" };
  if (str(v1.program_cardio) && cardioMap[str(v1.program_cardio)!]) set("t_cardio_roles", [cardioMap[str(v1.program_cardio)!]]);
  if (list(v1.program_exercises_avoided).length) set("t_exercises_avoided", list(v1.program_exercises_avoided));

  // --- Situations ---
  for (const [from, map] of Object.entries(SCENARIO_MAP)) {
    const selected = arr(v1[from]);
    if (selected.length === 0) continue;
    const detail = str(v1[`${from}_depends_detail`]);
    if (selected.includes("it_depends")) {
      if (detail) notes[map.to] = detail;
      continue; // "it depends" with free text can't become a rule silently
    }
    const actions = selected.map((a) => map.actions[a]).filter(Boolean);
    const lost = selected.some((a) => !map.actions[a]);
    if (actions.length === 0) continue;
    const policy: DecisionPolicy = { mode: "single", actions: [...new Set(actions)] };
    set(map.to, policy, lost || NARROWED_SCENARIOS.has(map.to));
  }

  // --- Nutrition ---
  const plan = str(v1.nutrition_plan_vs_framework);
  if (plan === "structured_meal_plan") set("n_approach", ["meal_plan"]);
  else if (plan === "flexible_framework") set("n_approach", ["full_macros"], true);
  else if (plan === "hybrid") set("n_approach", ["meal_plan", "full_macros"], true);
  const approach = str(v1.nutrition_protein_approach);
  if (approach === "fixed" && str(v1.nutrition_protein_target)) {
    const g = Number(v1.nutrition_protein_target);
    set("n_protein_basis", "per_lb_bodyweight");
    set("n_protein_amount", layered(range(g, g, "g/lb")));
  } else if (approach === "goal_dependent") {
    const m = Number(v1.nutrition_protein_target_maintenance);
    const f = Number(v1.nutrition_protein_target_fat_loss);
    const b = Number(v1.nutrition_protein_target_muscle_gain);
    if ([m, f, b].every((x) => Number.isFinite(x) && x > 0)) {
      set("n_protein_basis", "per_lb_bodyweight");
      set("n_protein_amount", layered(range(m, m, "g/lb"), "goal", { lose_fat: range(f, f, "g/lb"), build_muscle: range(b, b, "g/lb") }));
    }
  }
  const foodMap: Record<string, string> = { whole_foods_majority: "whole_foods_majority", adequate_protein: "protein_each_meal", fiber_and_micronutrients: "fiber_and_micronutrients", no_strict_rules: "no_strict_rules" };
  const food = arr(v1.nutrition_food_quality).map((f) => foodMap[f]).filter(Boolean);
  if (food.length) set("n_food_principles", food.includes("no_strict_rules") ? ["no_strict_rules"] : food);
  const meals: Record<string, [number, number | null]> = { "2_3_meals": [2, 3], "3_4_meals": [3, 4], "5_plus_meals": [5, null] };
  const meal = str(v1.nutrition_meal_frequency);
  if (meal && meals[meal]) set("n_meal_structure", range(meals[meal][0], meals[meal][1], "meals/day"));
  if (str(v1.nutrition_training_vs_rest_day)) set("n_training_rest", v1.nutrition_training_vs_rest_day);
  if (str(v1.nutrition_rate_of_loss)) set("w_rate_of_loss", layered(range(Number(v1.nutrition_rate_of_loss), Number(v1.nutrition_rate_of_loss), "% bodyweight/week")), true);
  const recompMap: Record<string, string> = { small_deficit_high_protein_maintain_training_intensity: "small_deficit_high_protein", maintenance_calories_high_protein: "maintenance_high_protein", alternating_deficit_and_maintenance: "alternating_blocks" };
  if (str(v1.nutrition_recomposition_approach) && recompMap[str(v1.nutrition_recomposition_approach)!]) set("n_recomposition", recompMap[str(v1.nutrition_recomposition_approach)!]);
  const measMap: Record<string, string> = { body_weight_trend: "weekly_average_weight", photos: "photos", measurements: "waist", performance: "performance", how_clothes_fit: "how_clothes_fit" };
  const meas = arr(v1.nutrition_progress_measurements);
  if (meas.length) set("n_measurements", meas.map((m) => measMap[m]).filter(Boolean), meas.includes("measurements"));
  const threshold: Record<string, [number, number | null]> = { one_week: [1, 1], two_to_three_weeks_of_consistent_data: [2, 3], four_plus_weeks: [4, null] };
  const cond = str(v1.nutrition_condition_before_change);
  if (cond && threshold[cond]) set("data_threshold_weeks", range(threshold[cond][0], threshold[cond][1], "weeks"));
  const suppMap: Record<string, string> = { food_first_basic_supplements_only: "food_first_basics", open_to_evidence_based_supplements: "evidence_based_stack", outside_my_scope: "outside_scope" };
  if (str(v1.nutrition_supplement_boundaries) && suppMap[str(v1.nutrition_supplement_boundaries)!]) set("n_supplements", suppMap[str(v1.nutrition_supplement_boundaries)!]);

  // --- Communication ---
  if (str(v1.comm_missed_workout_reply)) set("comm_voice_sample", v1.comm_missed_workout_reply);
  for (const k of ["comm_directness", "comm_warmth", "comm_accountability"]) if (typeof v1[k] === "number") set(k, v1[k]);
  if (str(v1.comm_message_length)) set("comm_message_length", v1.comm_message_length);
  if (str(v1.comm_technical_language)) set("comm_technical_language", v1.comm_technical_language);
  if (typeof v1.comm_humor === "boolean") set("comm_humor", v1.comm_humor ? "sometimes" : "rarely", true);
  if (arr(v1.comm_ai_direct_response).length) set("comm_ai_direct_response", arr(v1.comm_ai_direct_response));
  const personal = arr(v1.comm_must_respond_personally).filter((t) => t === "billing_or_account" || t === "major_goal_change_request");
  if (arr(v1.comm_must_respond_personally).length) set("comm_must_respond_personally", personal);
  if (list(v1.comm_avoided_phrases).length) set("comm_avoided_phrases", list(v1.comm_avoided_phrases));

  // --- Safety ---
  const pain = arr(v1.scn_pain).find((a) => a !== "it_depends");
  if (pain === "stop_exercise_and_notify" || pain === "stop_workout_and_notify") set("scn_pain", pain);
  else if (pain === "modify_and_notify") set("scn_pain", "stop_exercise_and_notify", true);
  const injury = arr(v1.scn_possible_injury).find((a) => a !== "it_depends");
  if (injury === "pause_plan_and_escalate" || injury === "modify_and_escalate") set("scn_possible_injury", injury);
  const scope = str(v1.safety_out_of_scope);
  if (scope) set("safety_policy", { stricter: scope === "escalate_to_coach_first" ? ["escalate_medical_before_reply"] : [] });
  if (list(v1.safety_absolute_rules).length) set("safety_absolute_rules", list(v1.safety_absolute_rules));

  if (needs.length) out[NEEDS_CONFIRMATION_KEY] = [...new Set(needs)];
  if (Object.keys(notes).length) out[V1_NOTES_KEY] = notes as unknown as CalibrationAnswers[string];
  return { answers: out, confirmed: [...new Set(confirmed)], needsConfirmation: [...new Set(needs)], dropped: DROPPED_V1_QUESTIONS.filter((k) => v1[k] !== undefined) };
}

/** True when an answer bag is already v2. */
export function isV2Answers(answers: Record<string, unknown> | null | undefined): boolean {
  return !!answers && answers[CALIBRATION_SCHEMA_KEY] === CALIBRATION_SCHEMA_VERSION;
}
