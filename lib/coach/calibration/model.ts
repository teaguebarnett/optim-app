// Gate 3.1 — v2 answers → the coach's confirmed operating model.
//
// The confirmed v2 answers are kept verbatim in `model.calibration` — ranges
// stay ranges, conditions stay conditions. The legacy model fields existing
// consumers read are PROJECTIONS, under one rule: exact or none. A legacy
// field is set only when the coach's answer maps onto it exactly (a range
// field from a range, an enum from an equivalent choice). Otherwise the
// legacy field keeps OPTIM's starting value, carries no coach provenance,
// and every v2-aware consumer reads the v2 answer instead (see
// lib/coach/method-resolution.ts). Projections are never written back into
// the answers.

import { ALL_CALIBRATION_ITEMS, VOICE_SAMPLE_PRESETS, answerKeyOf } from "./questions.ts";
import { buildCalibrationContext, isApplicableItem, isNotApplicable, pruneCalibrationAnswers } from "./engine.ts";
import { STEP0_SUGGESTION_KEY, type CalibrationAnswers, type LayeredAnswer, type RangeAnswer } from "./types.ts";
import { coachConfirmedProvenance, coachSelectedProvenance, type AdjustmentPolicy, type CoachOperatingModel, type Provenance } from "../operating-model.ts";

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

export function asRange(v: unknown): RangeAnswer | undefined {
  return isObj(v) && typeof v.min === "number" ? (v as unknown as RangeAnswer) : undefined;
}
export function asLayered(v: unknown): LayeredAnswer | undefined {
  return isObj(v) && "base" in v && typeof v.varies === "string" ? (v as unknown as LayeredAnswer) : undefined;
}
/** The base value of a layered answer, or the value itself. */
export function baseOf(v: unknown): unknown {
  const l = asLayered(v);
  return l ? l.base : v;
}
/** A single exact value represented by a range, if there is one. */
export function exactValue(r: RangeAnswer | undefined): number | undefined {
  if (!r) return undefined;
  if (r.preferred !== undefined) return r.preferred;
  return r.max !== null && r.min === r.max ? r.min : undefined;
}

const LEGACY_REP_RANGES: [number, number, string][] = [
  [3, 6, "strength_low_3_6"],
  [8, 12, "moderate_8_12"],
  [12, 20, "higher_12_20"],
];
const LEGACY_RIR_BANDS: [number, number, string][] = [
  [0, 1, "0_1_reps_in_reserve"],
  [1, 2, "1_2_reps_in_reserve"],
  [2, 4, "2_4_reps_in_reserve"],
];
const PROGRESSION_TO_LEGACY: Record<string, string> = {
  add_load_when_reps_hit: "linear_load",
  double_progression: "double_progression",
  autoregulated: "autoregulated",
};
const PLAIN_EFFORT_RIR: Record<string, [number, number]> = { comfortable: [4, 5], challenging: [2, 3], very_hard: [0, 1] };
export { PLAIN_EFFORT_RIR };

function cardioProjection(roles: string[]): string {
  if (roles.length === 0 || roles.includes("none")) return "rarely_used";
  if (roles.includes("conditioning")) return "prescribed_for_conditioning";
  if (roles.includes("fat_loss")) return "prescribed_for_fat_loss";
  return "optional_low_intensity_supplemental";
}

/**
 * Applies validated v2 answers to OPTIM's starting model. Every answered
 * item gets coach provenance under its own question id; unanswered items get
 * none (unknown stays unknown — never an implied coach rule).
 */
export function applyCalibrationAnswersToModel(base: CoachOperatingModel, rawAnswers: CalibrationAnswers, nowIso: string): CoachOperatingModel {
  const answers = pruneCalibrationAnswers(rawAnswers);
  const ctx = buildCalibrationContext(answers);
  const model: CoachOperatingModel = structuredClone(base);
  const provenance: Record<string, Provenance> = {};
  const a = (key: string) => {
    const v = answers[key];
    return isNotApplicable(v) ? undefined : v;
  };

  for (const q of ALL_CALIBRATION_ITEMS) {
    if (q.kind === "group") continue;
    const key = answerKeyOf(q);
    if (answers[key] === undefined || !isApplicableItem(q, ctx)) continue;
    provenance[q.id] = q.id === "coaching_areas" && answers[STEP0_SUGGESTION_KEY] ? coachConfirmedProvenance(nowIso, "Confirmed from OPTIM's suggestion of your description") : coachSelectedProvenance(nowIso);
  }
  // Group screens count as answered when every visible required part is.
  for (const q of ALL_CALIBRATION_ITEMS) {
    if (q.kind !== "group") continue;
    const parts = (q.parts ?? []).filter((p) => !p.visibleIf || p.visibleIf(ctx));
    if (parts.length > 0 && parts.every((p) => !p.required || answers[answerKeyOf(p)] !== undefined)) provenance[q.id] = coachSelectedProvenance(nowIso);
  }

  // --- Practice ---
  const pr = model.practice;
  pr.clientPopulations = [...ctx.areas];
  if (a("experience_levels")) pr.experienceLevelsServed = arr(a("experience_levels"));
  if (a("practice_goals")) pr.commonGoals = arr(a("practice_goals"));
  pr.specialties = [...arr(a("strength_specialties")), ...arr(a("sport_performance_sports")), ...arr(a("endurance_sports"))];
  if (a("practice_excluded")) pr.excludedGoalsOrPopulations = arr(a("practice_excluded")).filter((v) => v !== "none");
  if (str(a("practice_success_definition"))) pr.successDefinition = str(a("practice_success_definition"))!;
  if (str(a("program_format"))) pr.serviceStructure = str(a("program_format"))!;
  const lengthExact = exactValue(asRange(baseOf(a("program_length"))));
  if (lengthExact !== undefined) pr.typicalProgramLengthWeeks = lengthExact;
  if (a("comm_reinforce")) pr.importantClientBehaviors = arr(a("comm_reinforce"));

  // --- Training (projections only when exact) ---
  const pa = model.programArchitecture;
  const splits = arr(baseOf(a("t_splits")));
  if (splits.length) pa.preferredSplits = splits;
  const days = asRange(baseOf(a("t_days")));
  if (days && days.max !== null) {
    pa.typicalFrequencyDaysMin = days.min;
    pa.typicalFrequencyDaysMax = days.max;
  }
  const session = exactValue(asRange(a("t_session_length")));
  if (session !== undefined) pa.sessionDurationMinutesTypical = session;
  const sets = asRange(baseOf(a("t_sets")));
  if (sets && sets.max !== null) {
    pa.setsPerExerciseMin = sets.min;
    pa.setsPerExerciseMax = sets.max;
  }
  const repsLayer = asLayered(a("t_reps"));
  const reps = asRange(repsLayer?.base);
  if (reps) {
    const legacy = LEGACY_REP_RANGES.find(([lo, hi]) => reps.min === lo && reps.max === hi)?.[2];
    pa.repRangePhilosophy = repsLayer?.varies === "program_phase" ? "varied_by_block" : (legacy ?? "custom");
  }
  const metrics = arr(a("t_effort_metric"));
  if (metrics.length) pa.usesRpeOrRir = metrics.includes("rpe") && metrics.includes("rir") ? "both" : metrics.includes("rpe") ? "rpe" : metrics.includes("rir") ? "rir" : "neither";
  const rir = asRange(baseOf(a("t_effort_rir"))) ?? (str(a("t_effort_plain")) ? { min: PLAIN_EFFORT_RIR[str(a("t_effort_plain"))!][0], max: PLAIN_EFFORT_RIR[str(a("t_effort_plain"))!][1], unit: "reps in reserve" } : undefined);
  if (rir) pa.proximityToFailure = LEGACY_RIR_BANDS.find(([lo, hi]) => rir.min === lo && rir.max === hi)?.[2] ?? "custom";
  const progression = arr(baseOf(a("t_progression_method")))[0];
  const structure = str(baseOf(a("t_long_term_structure")));
  if (progression) pa.progressionMethod = structure === "undulating" ? "planned_undulation" : (PROGRESSION_TO_LEGACY[progression] ?? progression);
  if (structure) pa.phaseStructure = structure;
  const deload = str(a("t_deload_approach"));
  if (deload === "as_needed" || deload === "none") pa.deloadFrequencyWeeks = null;
  else if (deload === "fixed") {
    const every = asRange(a("t_deload_every"));
    if (every && every.max !== null && every.min === every.max) pa.deloadFrequencyWeeks = every.min;
  }
  if (str(a("t_warmup"))) pa.warmupPhilosophy = str(a("t_warmup"))!;
  if (str(a("t_swap_rule"))) pa.substitutionLogic = str(a("t_swap_rule"))!;
  if (a("t_exercises_avoided") !== undefined) pa.exercisesAvoided = arr(a("t_exercises_avoided"));
  if (a("t_cardio_roles") !== undefined) pa.cardioPhilosophy = cardioProjection(arr(a("t_cardio_roles")));
  const hardRules = arr(a("safety_absolute_rules"));
  pa.nonNegotiables = hardRules;

  // --- Nutrition ---
  const np = model.nutritionPhilosophy;
  if (ctx.nutritionScope) np.providesNutritionCoaching = ctx.nutritionScope !== "none";
  const approach = arr(a("n_approach"));
  if (approach.length) {
    const structured = approach.includes("meal_plan");
    const flexible = approach.some((x) => x !== "meal_plan");
    np.planVsFrameworkPreference = structured && flexible ? "hybrid" : structured ? "structured_meal_plan" : "flexible_framework";
  }
  if (str(a("n_calorie_method"))) np.calorieTargetPhilosophy = str(a("n_calorie_method"))!;
  const basis = str(a("n_protein_basis"));
  const protein = asLayered(a("n_protein_amount"));
  if (basis === "per_lb_bodyweight" && protein) {
    const baseExact = exactValue(asRange(protein.base));
    if (protein.varies === "goal" && protein.exceptions) {
      const ex = (k: string) => exactValue(asRange(protein.exceptions?.[k])) ?? baseExact;
      const fat = ex("lose_fat");
      const maint = ex("maintenance");
      const gain = ex("build_muscle");
      if (fat !== undefined && maint !== undefined && gain !== undefined) {
        np.proteinTargetApproach = "goal_dependent";
        np.proteinTargetsByGoalGramsPerLbBodyweight = { fatLoss: fat, maintenanceOrRecomposition: maint, muscleGain: gain };
      }
    } else if (baseExact !== undefined) {
      np.proteinTargetApproach = "fixed";
      np.proteinTargetGramsPerLbBodyweight = baseExact;
    }
  }
  if (a("n_food_principles") !== undefined) np.foodQualityPriorities = arr(a("n_food_principles"));
  if (str(a("n_training_rest"))) np.trainingDayVsRestDayStrategy = str(a("n_training_rest"))!;
  if (str(a("n_supplements"))) np.supplementBoundaries = str(a("n_supplements"))!;
  const loss = exactValue(asRange(baseOf(a("w_rate_of_loss"))));
  if (loss !== undefined) np.rateOfLossPercentPerWeek = loss;
  const gain = exactValue(asRange(a("n_rate_of_gain")));
  if (gain !== undefined) np.rateOfGainPercentPerWeek = gain;
  if (str(a("n_recomposition"))) np.recompositionApproach = str(a("n_recomposition"))!;
  if (str(a("n_adherence_standard"))) np.adherenceStandard = str(a("n_adherence_standard"))!;
  if (a("n_measurements") !== undefined) np.progressMeasurementsUsed = arr(a("n_measurements"));
  if (str(a("w_breaks"))) np.refeedOrDietBreakPhilosophy = str(a("w_breaks"))!;

  // --- Communication ---
  const cm = model.communication;
  const preset = VOICE_SAMPLE_PRESETS[String(a("comm_voice_sample") ?? "")];
  if (preset) {
    cm.tone = preset.tone;
    cm.missedWorkoutFollowUp = preset.followUp;
  }
  if (typeof a("comm_directness") === "number") cm.directness = a("comm_directness") as number;
  if (typeof a("comm_warmth") === "number") cm.warmth = a("comm_warmth") as number;
  if (typeof a("comm_accountability") === "number") cm.accountabilityLevel = a("comm_accountability") as number;
  const length = str(a("comm_message_length")) as CoachOperatingModel["communication"]["messageLength"] | undefined;
  if (length) {
    cm.messageLength = length;
    cm.conciseness = length === "short" ? "brief" : length === "long" ? "detailed" : "balanced";
  }
  if (str(a("comm_technical_language"))) cm.technicalLanguageLevel = str(a("comm_technical_language")) as CoachOperatingModel["communication"]["technicalLanguageLevel"];
  if (str(a("comm_humor"))) cm.usesHumor = str(a("comm_humor")) !== "rarely";
  if (a("comm_avoided_phrases") !== undefined) cm.avoidedPhrasesOrTones = arr(a("comm_avoided_phrases"));
  if (a("comm_ai_direct_response") !== undefined) cm.aiMayRespondDirectly = arr(a("comm_ai_direct_response")).filter((v) => v !== "none");
  cm.coachMustRespondPersonally = arr(a("comm_must_respond_personally"));
  const checkin = a("checkin_rhythm") as { value?: number } | undefined;
  if (checkin?.value !== undefined) cm.checkInCadence = `every_${checkin.value}_days`;

  // --- Safety ---
  const sf = model.safety;
  const pain = str(a("scn_pain"));
  if (pain) {
    sf.painResponsePolicy = pain;
    sf.stopExerciseConditions = ["reported_pain"];
  }
  if (str(a("scn_possible_injury"))) sf.injuryResponsePolicy = str(a("scn_possible_injury"))!;
  const policy = a("safety_policy") as { stricter?: string[] } | undefined;
  if (policy) {
    const escalateFirst = arr(policy.stricter).includes("escalate_medical_before_reply");
    sf.outOfScopeHandling = escalateFirst ? "escalate_to_coach_first" : "acknowledge_and_redirect_to_appropriate_professional";
    sf.medicalConcernPolicy = sf.outOfScopeHandling;
  }
  sf.absoluteOverrideRules = hardRules;

  // Pain / possible injury stay executable-policy-shaped for the existing
  // adaptation code: always escalate, never AI-executable.
  const policies: AdjustmentPolicy[] = [];
  if (pain) policies.push({ id: "scn_pain", domain: "training", trigger: "A client reports pain during a workout.", preferredAction: pain, acceptableAlternatives: [], alwaysEscalates: true, aiMayExecute: false, requiresCoachApproval: true, source: "coach_selected", confidence: 1 });
  if (str(a("scn_possible_injury"))) policies.push({ id: "scn_possible_injury", domain: "training", trigger: "A client reports a possible injury.", preferredAction: str(a("scn_possible_injury"))!, acceptableAlternatives: [], alwaysEscalates: true, aiMayExecute: false, requiresCoachApproval: true, source: "coach_selected", confidence: 1 });
  model.trainingAdjustmentPolicies = policies;
  model.nutritionAdjustmentPolicies = [];

  const confirmedAnswers: CalibrationAnswers = {};
  for (const [key, value] of Object.entries(answers)) if (!key.startsWith("__")) confirmedAnswers[key] = value;
  model.calibration = {
    schema: 2,
    ...(str(answers.coach_description) ? { description: str(answers.coach_description) } : {}),
    areas: ctx.areas,
    modifiers: ctx.modifiers,
    nutritionScope: ctx.nutritionScope,
    goals: ctx.goals,
    experience: ctx.experience,
    specialties: { strength: arr(answers.strength_specialties), sportPerformance: arr(answers.sport_performance_sports), endurance: arr(answers.endurance_sports) },
    answers: confirmedAnswers,
  };
  model.provenance = provenance;
  return model;
}

/** True when the coach said the question doesn't apply, or never answered
 * it: either way there is no coach rule to follow. */
export function hasCoachRule(model: CoachOperatingModel, questionId: string): boolean {
  const p = model.provenance[questionId];
  if (!p || (p.source !== "coach_selected" && p.source !== "coach_confirmed")) return false;
  const q = ALL_CALIBRATION_ITEMS.find((x) => x.id === questionId);
  const value = model.calibration?.answers[q ? answerKeyOf(q) : questionId];
  return model.calibration ? value !== undefined && !isNotApplicable(value) : true;
}
