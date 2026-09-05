// Phase 5.4A — turns a coach's raw onboarding answers into a real
// CoachOperatingModel, computes adaptive progress, and derives traceable
// (never auto-confirmed) inferences from a coach's existing saved work.
//
// Pure and testable — no React, no storage — mirrors the discipline of
// lib/coach/onboarding-steps.ts's helpers (isFieldAnswered,
// visibleFieldsForStep) for the client intake. See
// lib/coach/verify-coach-onboarding.mts.

import type { CoachProfileId, WorkspaceId } from "../tenancy/types";
import type { CoachProgramTemplate, MealRecommendation } from "./types";
import {
  ALL_CHAPTER_IDS_IN_ORDER,
  chapterApplies,
  COACH_ONBOARDING_QUESTIONS,
  type CoachOnboardingAnswers,
  type CoachOnboardingChapterId,
  type CoachOnboardingQuestionDef,
  SCENARIO_DEPENDS_VALUE,
  visibleQuestionsForChapter,
} from "./coach-onboarding-questions.ts";
import { coachSelectedProvenance, inferredProvenance, isCoachOperatingModelConfirmed, type AdjustmentPolicy, type CoachOperatingModel, type Provenance } from "./operating-model.ts";

// ---------------------------------------------------------------------------
// Save/resume progress record
// ---------------------------------------------------------------------------

export interface CoachOnboardingProgress {
  coachId: CoachProfileId;
  workspaceId: WorkspaceId;
  answers: CoachOnboardingAnswers;
  /** Set once the coach reaches and confirms the Review chapter — mirrors
   * OnboardingProgress.completedAtIso for the client intake. */
  completedAtIso?: string;
  updatedAtIso: string;
}

function isAnswered(question: CoachOnboardingQuestionDef, answers: CoachOnboardingAnswers): boolean {
  const v = answers[question.id];
  if (question.type === "multi_select" || question.type === "scenario") return Array.isArray(v) && v.length > 0;
  if (question.type === "boolean") return typeof v === "boolean";
  if (question.type === "slider" || question.type === "number") return typeof v === "number";
  return v !== undefined && v !== "";
}

/** Every chapter that currently applies, in fixed order — the honest
 * denominator for progress (this phase's brief §III.6: "Progress should
 * account for active branches rather than pretending every coach has the
 * same fixed question count."). Review is always last and always applies. */
export function applicableChapters(answers: CoachOnboardingAnswers): CoachOnboardingChapterId[] {
  return ALL_CHAPTER_IDS_IN_ORDER.filter((c) => c === "ai_authority" || c === "existing_work" || c === "review" || chapterApplies(c, answers));
}

/** Question-bank-driven chapters only (excludes ai_authority/existing_work/
 * review, which the wizard renders with dedicated, non-question-bank UI —
 * see components/coach-onboarding/). */
function questionDrivenChapters(answers: CoachOnboardingAnswers): CoachOnboardingChapterId[] {
  return applicableChapters(answers).filter((c) => c !== "ai_authority" && c !== "existing_work" && c !== "review");
}

export interface CoachOnboardingProgressSummary {
  totalApplicableQuestions: number;
  answeredQuestions: number;
  percentComplete: number;
}

/** Honest completion percentage across every currently-applicable
 * question-bank question — recomputed fresh from current answers every
 * time, never a stored/stale counter, so a mid-onboarding branch change
 * (e.g. toggling nutrition_offered) immediately reflects the real new
 * total rather than a percentage that can exceed 100% or get stuck. */
export function computeProgressSummary(answers: CoachOnboardingAnswers): CoachOnboardingProgressSummary {
  const chapters = questionDrivenChapters(answers);
  const visible = chapters.flatMap((c) => visibleQuestionsForChapter(c, answers));
  const answered = visible.filter((q) => isAnswered(q, answers));
  const total = visible.length;
  return {
    totalApplicableQuestions: total,
    answeredQuestions: answered.length,
    percentComplete: total === 0 ? 100 : Math.round((answered.length / total) * 100),
  };
}

/** Every required, currently-visible question id — used by
 * isCoachOperatingModelConfirmed's caller (the Review chapter) and by
 * verify-coach-onboarding.mts to confirm every required question is
 * reachable. */
export function allRequiredVisibleQuestionIds(answers: CoachOnboardingAnswers): string[] {
  return questionDrivenChapters(answers)
    .flatMap((c) => visibleQuestionsForChapter(c, answers))
    .filter((q) => q.required)
    .map((q) => q.id);
}

// ---------------------------------------------------------------------------
// Calibration status — Phase 5.4A corrective pass
// ---------------------------------------------------------------------------

/** Distinguishes "a Coach Operating Model exists" from "the coach actually
 * confirmed it" — manual review found the earlier phase's binary
 * activeModel-or-not check let a coach who confirmed only PART of the
 * wizard (e.g. activated straight from an early chapter, or accepted an
 * inference from Chapter 9 without explicitly confirming it) show up as
 * fully "calibrated" everywhere else in the product. Used to drive the
 * Command Center's "Calibrate OPTIM" banner and the Playbook's permanent
 * "Your Coaching Method" status. */
export type CoachCalibrationStatus = "not_started" | "in_progress" | "inferred_unconfirmed" | "calibrated";

export function resolveCoachCalibrationStatus(input: { activeModel: CoachOperatingModel | null; progress: CoachOnboardingProgress | null }): CoachCalibrationStatus {
  if (!input.activeModel) {
    if (input.progress && !input.progress.completedAtIso && Object.keys(input.progress.answers).length > 0) return "in_progress";
    return "not_started";
  }
  const requiredIds = allRequiredVisibleQuestionIds(input.progress?.answers ?? {});
  return isCoachOperatingModelConfirmed(input.activeModel, requiredIds) ? "calibrated" : "inferred_unconfirmed";
}

/**
 * Recalculates which answers remain valid after a parent answer changes —
 * this phase's brief §III.7: "Recalculate downstream questions safely when
 * a parent answer changes... Do not erase unrelated answers." Only drops an
 * answer for a question that is no longer VISIBLE given the new answer bag;
 * every other answer, including ones for still-visible questions the coach
 * hasn't revisited, survives untouched.
 */
export function pruneAnswersToVisibleQuestions(answers: CoachOnboardingAnswers): CoachOnboardingAnswers {
  const next: CoachOnboardingAnswers = { ...answers };
  for (const question of COACH_ONBOARDING_QUESTIONS) {
    // A question that its OWN chapter's chapterApplies depends on (right
    // now, only nutrition_offered — see chapterApplies above) must never be
    // pruned by that same check: the instant a coach answers "No", this
    // loop would otherwise see chapterApplies("nutrition_philosophy",
    // {..., nutrition_offered: false}) === false and delete
    // nutrition_offered itself, silently reverting the coach's real answer
    // back to unanswered and leaving Continue permanently disabled on that
    // exact question. It has no visibleIf of its own, so nothing else in
    // this loop would ever need to prune it.
    if (question.id === "nutrition_offered") continue;
    if (!chapterApplies(question.chapter, next)) {
      delete next[question.id];
      continue;
    }
    if (question.visibleIf && !question.visibleIf(next)) {
      delete next[question.id];
    }
  }
  return next;
}

// ---------------------------------------------------------------------------
// Scenario answers -> executable AdjustmentPolicy
// ---------------------------------------------------------------------------

/** A scenario question's answer is an array of selected action values, in
 * click order (rank), optionally including the trailing SCENARIO_DEPENDS_VALUE
 * sentinel. `dependsText` is only ever read when that sentinel is present. */
export function buildAdjustmentPolicy(question: CoachOnboardingQuestionDef, selectedValues: string[], dependsText: string | undefined): AdjustmentPolicy {
  const domain = question.domain === "nutrition" ? "nutrition" : "training";
  const depends = selectedValues.includes(SCENARIO_DEPENDS_VALUE);
  const realActions = selectedValues.filter((v) => v !== SCENARIO_DEPENDS_VALUE);
  const [preferredAction, ...rest] = realActions;
  // Platform-minimum safety scenarios — see lib/coach/health-review.ts and
  // this phase's brief §III.4 chapter 7 doc: "Existing OPTIM safety rules
  // remain the minimum. A coach may create stricter rules but may not
  // weaken platform-level safety protections." No coach answer to these two
  // scenarios can ever produce a policy OPTIM is allowed to auto-execute.
  const isPlatformSafetyMinimum = question.id === "scn_pain" || question.id === "scn_possible_injury";

  return {
    id: question.id,
    domain,
    trigger: question.prompt,
    conditions: depends ? dependsText?.trim() || undefined : undefined,
    preferredAction: depends ? SCENARIO_DEPENDS_VALUE : preferredAction ?? "flag_for_coach_review",
    acceptableAlternatives: depends ? [] : rest,
    alwaysEscalates: isPlatformSafetyMinimum,
    aiMayExecute: isPlatformSafetyMinimum
      ? false
      : !depends && preferredAction !== "flag_for_coach_review" && preferredAction !== "ask_client_first" && preferredAction !== "ask_coach_first" && preferredAction !== "check_in_first",
    requiresCoachApproval: isPlatformSafetyMinimum || depends || preferredAction === "flag_for_coach_review" || preferredAction === "ask_coach_first",
    rationale: depends ? dependsText : undefined,
    source: "coach_selected",
    confidence: 1,
  };
}

// ---------------------------------------------------------------------------
// Answers -> CoachOperatingModel
// ---------------------------------------------------------------------------

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? (v as string[]) : [];
}
function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}
function asNumber(v: unknown, fallback: number): number {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  return fallback;
}
function asBoolean(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}
function splitRange(v: unknown, fallbackMin: number, fallbackMax: number): [number, number] {
  const s = asString(v);
  const parts = s.split("_").map(Number).filter((n) => !Number.isNaN(n));
  if (parts.length === 2) return [parts[0], parts[1]];
  return [fallbackMin, fallbackMax];
}
function freeTextList(v: unknown): string[] {
  const s = asString(v);
  if (!s.trim()) return [];
  return s
    .split(/[,;\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

const QUIET_HOURS: Record<string, [string, string]> = {
  "9pm_7am": ["21:00", "07:00"],
  "8pm_8am": ["20:00", "08:00"],
  "10pm_6am": ["22:00", "06:00"],
};

/**
 * Applies every question-bank answer onto a base model, producing a new
 * model with real values + real per-question provenance. Never mutates
 * `base`. A question the coach never answered (adaptive skip, or not yet
 * reached) simply leaves that field at whatever `base` already had — see
 * createDefaultCoachOperatingModel for the honest OPTIM-default starting
 * point every new coach onboarding begins from.
 */
export function applyCoachAnswersToModel(base: CoachOperatingModel, answers: CoachOnboardingAnswers, nowIso: string): CoachOperatingModel {
  const model: CoachOperatingModel = structuredClone(base);
  const provenance: Record<string, Provenance> = { ...model.provenance };

  function markAnswered(id: string) {
    provenance[id] = coachSelectedProvenance(nowIso);
  }

  // --- Practice ---
  if (answers.practice_populations !== undefined) {
    model.practice.clientPopulations = asStringArray(answers.practice_populations);
    markAnswered("practice_populations");
  }
  if (answers.practice_experience_levels !== undefined) {
    model.practice.experienceLevelsServed = asStringArray(answers.practice_experience_levels);
    markAnswered("practice_experience_levels");
  }
  if (answers.practice_common_goals !== undefined) {
    model.practice.commonGoals = asStringArray(answers.practice_common_goals);
    markAnswered("practice_common_goals");
  }
  if (answers.practice_excluded !== undefined) {
    model.practice.excludedGoalsOrPopulations = asStringArray(answers.practice_excluded).filter((v) => v !== "none");
    markAnswered("practice_excluded");
  }
  if (answers.practice_program_length !== undefined) {
    const raw = asString(answers.practice_program_length);
    model.practice.typicalProgramLengthWeeks = raw === "ongoing" ? 12 : asNumber(raw, 12);
    model.operationalContext.supportedProgramDurationsWeeks = raw === "ongoing" ? [8, 12, 16] : [asNumber(raw, 12)];
    markAnswered("practice_program_length");
  }
  if (answers.practice_service_structure !== undefined) {
    model.practice.serviceStructure = asString(answers.practice_service_structure);
    markAnswered("practice_service_structure");
  }
  if (answers.practice_involvement !== undefined) {
    model.practice.expectedCoachInvolvement = asString(answers.practice_involvement);
    markAnswered("practice_involvement");
  }
  if (answers.practice_success_definition !== undefined) {
    model.practice.successDefinition = asString(answers.practice_success_definition);
    markAnswered("practice_success_definition");
  }
  if (answers.practice_important_behaviors !== undefined) {
    model.practice.importantClientBehaviors = asStringArray(answers.practice_important_behaviors);
    markAnswered("practice_important_behaviors");
  }

  // --- Program architecture ---
  if (answers.program_splits !== undefined) {
    model.programArchitecture.preferredSplits = asStringArray(answers.program_splits);
    markAnswered("program_splits");
  }
  if (answers.program_frequency !== undefined) {
    const [min, max] = splitRange(answers.program_frequency, 3, 4);
    model.programArchitecture.typicalFrequencyDaysMin = min;
    model.programArchitecture.typicalFrequencyDaysMax = max;
    markAnswered("program_frequency");
  }
  if (answers.program_session_length !== undefined) {
    model.programArchitecture.sessionDurationMinutesTypical = asNumber(answers.program_session_length, 60);
    markAnswered("program_session_length");
  }
  if (answers.program_exercise_order !== undefined) {
    model.programArchitecture.exerciseOrderPhilosophy = asString(answers.program_exercise_order);
    markAnswered("program_exercise_order");
  }
  if (answers.program_movement_priorities !== undefined) {
    model.programArchitecture.movementPatternPriorities = asStringArray(answers.program_movement_priorities);
    markAnswered("program_movement_priorities");
  }
  if (answers.program_equipment !== undefined) {
    const eq = asStringArray(answers.program_equipment);
    model.programArchitecture.equipmentPreferences = eq;
    model.programArchitecture.exerciseFamiliesPreferred = eq;
    markAnswered("program_equipment");
  }
  if (answers.program_sets_reps !== undefined) {
    const [min, max] = splitRange(answers.program_sets_reps, 3, 4);
    model.programArchitecture.setsPerExerciseMin = min;
    model.programArchitecture.setsPerExerciseMax = max;
    markAnswered("program_sets_reps");
  }
  if (answers.program_rep_philosophy !== undefined) {
    model.programArchitecture.repRangePhilosophy = asString(answers.program_rep_philosophy);
    markAnswered("program_rep_philosophy");
  }
  if (answers.program_rpe_rir !== undefined) {
    model.programArchitecture.usesRpeOrRir = asString(answers.program_rpe_rir) as CoachOperatingModel["programArchitecture"]["usesRpeOrRir"];
    markAnswered("program_rpe_rir");
  }
  if (answers.program_proximity_to_failure !== undefined) {
    model.programArchitecture.proximityToFailure = asString(answers.program_proximity_to_failure);
    markAnswered("program_proximity_to_failure");
  }
  if (answers.program_progression !== undefined) {
    model.programArchitecture.progressionMethod = asString(answers.program_progression);
    markAnswered("program_progression");
  }
  if (answers.program_deload !== undefined) {
    const raw = asString(answers.program_deload);
    model.programArchitecture.deloadFrequencyWeeks = raw === "as_needed" ? null : asNumber(raw, 6);
    markAnswered("program_deload");
  }
  if (answers.program_warmup !== undefined) {
    model.programArchitecture.warmupPhilosophy = asString(answers.program_warmup);
    markAnswered("program_warmup");
  }
  if (answers.program_cardio !== undefined) {
    model.programArchitecture.cardioPhilosophy = asString(answers.program_cardio);
    markAnswered("program_cardio");
  }
  if (answers.program_non_negotiables !== undefined) {
    model.programArchitecture.nonNegotiables = freeTextList(answers.program_non_negotiables);
    markAnswered("program_non_negotiables");
  }
  if (answers.program_exercises_avoided !== undefined) {
    model.programArchitecture.exercisesAvoided = freeTextList(answers.program_exercises_avoided);
    markAnswered("program_exercises_avoided");
  }

  // --- Training / nutrition adjustment scenarios ---
  for (const question of COACH_ONBOARDING_QUESTIONS) {
    if (question.type !== "scenario") continue;
    const raw = answers[question.id];
    if (raw === undefined) continue;
    const selected = asStringArray(raw);
    if (selected.length === 0) continue;
    const dependsText = asString(answers[`${question.id}_depends_detail`]);
    const policy = buildAdjustmentPolicy(question, selected, dependsText);
    if (policy.domain === "training") {
      model.trainingAdjustmentPolicies = [...model.trainingAdjustmentPolicies.filter((p) => p.id !== policy.id), policy];
    } else {
      model.nutritionAdjustmentPolicies = [...model.nutritionAdjustmentPolicies.filter((p) => p.id !== policy.id), policy];
    }
    markAnswered(question.id);
  }

  // --- Nutrition philosophy ---
  if (answers.nutrition_offered !== undefined) {
    model.nutritionPhilosophy.providesNutritionCoaching = asBoolean(answers.nutrition_offered, true);
    markAnswered("nutrition_offered");
  }
  if (answers.nutrition_plan_vs_framework !== undefined) {
    model.nutritionPhilosophy.planVsFrameworkPreference = asString(answers.nutrition_plan_vs_framework) as CoachOperatingModel["nutritionPhilosophy"]["planVsFrameworkPreference"];
    markAnswered("nutrition_plan_vs_framework");
  }
  if (answers.nutrition_protein_target !== undefined) {
    model.nutritionPhilosophy.proteinTargetGramsPerLbBodyweight = asNumber(answers.nutrition_protein_target, 0.8);
    markAnswered("nutrition_protein_target");
  }
  if (answers.nutrition_food_quality !== undefined) {
    model.nutritionPhilosophy.foodQualityPriorities = asStringArray(answers.nutrition_food_quality);
    markAnswered("nutrition_food_quality");
  }
  if (answers.nutrition_meal_frequency !== undefined) {
    model.nutritionPhilosophy.mealFrequencyPreference = asString(answers.nutrition_meal_frequency);
    markAnswered("nutrition_meal_frequency");
  }
  if (answers.nutrition_training_vs_rest_day !== undefined) {
    model.nutritionPhilosophy.trainingDayVsRestDayStrategy = asString(answers.nutrition_training_vs_rest_day);
    markAnswered("nutrition_training_vs_rest_day");
  }
  if (answers.nutrition_rate_of_loss !== undefined) {
    model.nutritionPhilosophy.rateOfLossPercentPerWeek = asNumber(answers.nutrition_rate_of_loss, 0.75);
    markAnswered("nutrition_rate_of_loss");
  }
  if (answers.nutrition_recomposition_approach !== undefined) {
    model.nutritionPhilosophy.recompositionApproach = asString(answers.nutrition_recomposition_approach);
    markAnswered("nutrition_recomposition_approach");
  }
  if (answers.nutrition_progress_measurements !== undefined) {
    model.nutritionPhilosophy.progressMeasurementsUsed = asStringArray(answers.nutrition_progress_measurements);
    markAnswered("nutrition_progress_measurements");
  }
  if (answers.nutrition_condition_before_change !== undefined) {
    model.nutritionPhilosophy.conditionsRequiredBeforeChange = asString(answers.nutrition_condition_before_change);
    markAnswered("nutrition_condition_before_change");
  }
  if (answers.nutrition_supplement_boundaries !== undefined) {
    model.nutritionPhilosophy.supplementBoundaries = asString(answers.nutrition_supplement_boundaries);
    markAnswered("nutrition_supplement_boundaries");
  }

  // --- Communication ---
  if (answers.comm_missed_workout_reply !== undefined) {
    const v = asString(answers.comm_missed_workout_reply);
    const styleMap: Record<string, { tone: string; directness: number; warmth: number; followUp: string }> = {
      direct_concise: { tone: "direct", directness: 4, warmth: 2, followUp: "same_day_direct_check_in" },
      warm_curious: { tone: "warm", directness: 2, warmth: 4, followUp: "same_day_gentle_check_in" },
      explain_reasoning: { tone: "explanatory", directness: 3, warmth: 3, followUp: "same_day_explain_impact" },
      highly_accountable: { tone: "accountable", directness: 5, warmth: 2, followUp: "same_day_firm_check_in" },
    };
    const chosen = styleMap[v];
    if (chosen) {
      model.communication.tone = chosen.tone;
      model.communication.missedWorkoutFollowUp = chosen.followUp;
    }
    markAnswered("comm_missed_workout_reply");
  }
  if (answers.comm_directness !== undefined) {
    model.communication.directness = asNumber(answers.comm_directness, 3);
    markAnswered("comm_directness");
  }
  if (answers.comm_warmth !== undefined) {
    model.communication.warmth = asNumber(answers.comm_warmth, 3);
    markAnswered("comm_warmth");
  }
  if (answers.comm_accountability !== undefined) {
    model.communication.accountabilityLevel = asNumber(answers.comm_accountability, 3);
    markAnswered("comm_accountability");
  }
  if (answers.comm_message_length !== undefined) {
    const v = asString(answers.comm_message_length) as CoachOperatingModel["communication"]["messageLength"];
    model.communication.messageLength = v;
    model.communication.conciseness = v === "short" ? "brief" : v === "long" ? "detailed" : "balanced";
    markAnswered("comm_message_length");
  }
  if (answers.comm_humor !== undefined) {
    model.communication.usesHumor = asBoolean(answers.comm_humor, false);
    markAnswered("comm_humor");
  }
  if (answers.comm_technical_language !== undefined) {
    model.communication.technicalLanguageLevel = asString(answers.comm_technical_language) as CoachOperatingModel["communication"]["technicalLanguageLevel"];
    markAnswered("comm_technical_language");
  }
  if (answers.comm_checkin_cadence !== undefined) {
    model.communication.checkInCadence = asString(answers.comm_checkin_cadence);
    markAnswered("comm_checkin_cadence");
  }
  if (answers.comm_morning_message !== undefined) {
    model.communication.morningMessageEnabled = asBoolean(answers.comm_morning_message, false);
    markAnswered("comm_morning_message");
  }
  if (answers.comm_workout_reminder !== undefined) {
    model.communication.workoutReminderEnabled = asBoolean(answers.comm_workout_reminder, true);
    markAnswered("comm_workout_reminder");
  }
  if (answers.comm_quiet_hours !== undefined) {
    const [start, end] = QUIET_HOURS[asString(answers.comm_quiet_hours)] ?? ["21:00", "07:00"];
    model.communication.quietHoursStart = start;
    model.communication.quietHoursEnd = end;
    model.operationalContext.quietHoursStart = start;
    model.operationalContext.quietHoursEnd = end;
    markAnswered("comm_quiet_hours");
  }
  if (answers.comm_ai_direct_response !== undefined) {
    model.communication.aiMayRespondDirectly = asStringArray(answers.comm_ai_direct_response).filter((v) => v !== "none");
    markAnswered("comm_ai_direct_response");
  }
  if (answers.comm_must_respond_personally !== undefined) {
    model.communication.coachMustRespondPersonally = asStringArray(answers.comm_must_respond_personally);
    markAnswered("comm_must_respond_personally");
  }
  if (answers.comm_avoided_phrases !== undefined) {
    model.communication.avoidedPhrasesOrTones = freeTextList(answers.comm_avoided_phrases);
    markAnswered("comm_avoided_phrases");
  }

  // --- Safety ---
  if (answers.safety_pain_response !== undefined) {
    const v = asString(answers.safety_pain_response);
    model.safety.painResponsePolicy = v;
    model.safety.stopExerciseConditions = v === "stop_exercise_and_notify" || v === "stop_workout_and_notify" ? ["reported_pain"] : model.safety.stopExerciseConditions;
    markAnswered("safety_pain_response");
  }
  if (answers.safety_possible_injury !== undefined) {
    model.safety.injuryResponsePolicy = asString(answers.safety_possible_injury);
    markAnswered("safety_possible_injury");
  }
  if (answers.safety_extreme_nutrition_request !== undefined) {
    const v = asString(answers.safety_extreme_nutrition_request);
    model.safety.disorderedEatingEscalation = v;
    model.safety.extremeNutritionRequestPolicy = v;
    markAnswered("safety_extreme_nutrition_request");
  }
  if (answers.safety_mental_health !== undefined) {
    model.safety.mentalHealthEscalation = asString(answers.safety_mental_health);
    markAnswered("safety_mental_health");
  }
  if (answers.safety_out_of_scope !== undefined) {
    model.safety.outOfScopeHandling = asString(answers.safety_out_of_scope);
    markAnswered("safety_out_of_scope");
  }
  if (answers.safety_absolute_rules !== undefined) {
    model.safety.absoluteOverrideRules = freeTextList(answers.safety_absolute_rules);
    markAnswered("safety_absolute_rules");
  }

  model.provenance = provenance;
  return model;
}

// ---------------------------------------------------------------------------
// Change summary — Phase 5.4A corrective pass
// ---------------------------------------------------------------------------

const CHANGE_SUMMARY_DOMAINS: { key: keyof CoachOperatingModel; label: string }[] = [
  { key: "practice", label: "Coaching practice" },
  { key: "outcomePriorities", label: "Outcome priorities" },
  { key: "programArchitecture", label: "Program architecture" },
  { key: "trainingAdjustmentPolicies", label: "Training adjustment scenarios" },
  { key: "nutritionPhilosophy", label: "Nutrition philosophy" },
  { key: "nutritionAdjustmentPolicies", label: "Nutrition adjustment scenarios" },
  { key: "communication", label: "Communication style" },
  { key: "safety", label: "Safety boundaries" },
];

/** A real, honest diff between a coach's previously-active model and their
 * new draft — every changed domain compared by actual value, never
 * fabricated. Used by the Review chapter to show "what's changing" before
 * a re-confirmation creates a new version (this phase's corrective-pass
 * brief §2's "Present a change summary before creating a new active model
 * version"). Returns an empty array when there's nothing to compare
 * against (a coach's very first confirmation). */
export function summarizeCoachOperatingModelChanges(previousActive: CoachOperatingModel | null, next: CoachOperatingModel): string[] {
  if (!previousActive) return [];
  return CHANGE_SUMMARY_DOMAINS.filter((d) => JSON.stringify(previousActive[d.key]) !== JSON.stringify(next[d.key])).map((d) => d.label);
}

// ---------------------------------------------------------------------------
// Confirming an inference (Chapter 9 + Review)
// ---------------------------------------------------------------------------

/** A coach explicitly confirming (or editing, then confirming) a
 * previously-inferred value — the ONLY thing that upgrades an `inferred`
 * provenance entry to `coach_confirmed`. Nothing else in this file ever
 * performs that upgrade automatically, per this phase's brief §II.2: "Never
 * present an inference as an established coaching rule until the coach
 * confirms it." */
export function confirmInference(model: CoachOperatingModel, questionId: string, nowIso: string): CoachOperatingModel {
  const existing = model.provenance[questionId];
  if (!existing || existing.source !== "inferred") return model;
  return { ...model, provenance: { ...model.provenance, [questionId]: { ...existing, source: "coach_confirmed", updatedAtIso: nowIso } } };
}

// ---------------------------------------------------------------------------
// Chapter 9 — real inference from existing coach work
// ---------------------------------------------------------------------------

export interface OperatingModelInference {
  questionId: string;
  label: string;
  inferredValue: string;
  confidence: number;
  note: string;
  apply: (model: CoachOperatingModel, nowIso: string) => CoachOperatingModel;
}

/**
 * Real, computed inference over a coach's own saved program templates and
 * meal recommendations — never fabricated, and always empty when there
 * isn't enough real data to say anything honest (this phase's brief: "If an
 * answer changes nothing, remove the question" applies here too — an
 * inference nobody could act on isn't shown). Every returned inference
 * carries the real sample it was computed from in `note`, and is applied
 * via `confirmInference`-eligible `inferred` provenance, never
 * `coach_selected` — see applyInference below.
 */
export function inferFromExistingWork(templates: CoachProgramTemplate[], mealRecommendations: MealRecommendation[]): OperatingModelInference[] {
  const inferences: OperatingModelInference[] = [];
  const MIN_TEMPLATES_FOR_INFERENCE = 2;

  if (templates.length >= MIN_TEMPLATES_FOR_INFERENCE) {
    const allExercises = templates.flatMap((t) => t.weeks.flatMap((w) => w.days.flatMap((d) => (d.workout ? d.workout.exercises : []))));
    if (allExercises.length > 0) {
      const avgWorkingSets = allExercises.reduce((sum, e) => sum + e.workingSets, 0) / allExercises.length;
      const roundedSets = Math.round(avgWorkingSets);
      inferences.push({
        questionId: "program_sets_reps",
        label: "Typical working sets per exercise",
        inferredValue: `${Math.max(1, roundedSets - 1)}_${roundedSets + 1}`,
        confidence: Math.min(0.85, 0.4 + allExercises.length * 0.02),
        note: `Based on ${allExercises.length} exercises across ${templates.length} saved templates — averaging ${avgWorkingSets.toFixed(1)} working sets.`,
        apply: (model, nowIso) => ({
          ...model,
          programArchitecture: { ...model.programArchitecture, setsPerExerciseMin: Math.max(1, roundedSets - 1), setsPerExerciseMax: roundedSets + 1 },
          provenance: { ...model.provenance, program_sets_reps: inferredProvenance(Math.min(0.85, 0.4 + allExercises.length * 0.02), `Based on ${allExercises.length} exercises across ${templates.length} saved templates.`, nowIso) },
        }),
      });

      const avgRpe = allExercises.reduce((sum, e) => sum + e.targetRpe, 0) / allExercises.length;
      inferences.push({
        questionId: "program_proximity_to_failure",
        label: "Typical proximity to failure",
        inferredValue: avgRpe >= 8.5 ? "0_1_reps_in_reserve" : avgRpe >= 7.5 ? "1_2_reps_in_reserve" : "2_4_reps_in_reserve",
        confidence: Math.min(0.8, 0.4 + allExercises.length * 0.02),
        note: `Based on an average target RPE of ${avgRpe.toFixed(1)} across your saved templates' exercises.`,
        apply: (model, nowIso) => {
          const value = avgRpe >= 8.5 ? "0_1_reps_in_reserve" : avgRpe >= 7.5 ? "1_2_reps_in_reserve" : "2_4_reps_in_reserve";
          return {
            ...model,
            programArchitecture: { ...model.programArchitecture, proximityToFailure: value },
            provenance: { ...model.provenance, program_proximity_to_failure: inferredProvenance(Math.min(0.8, 0.4 + allExercises.length * 0.02), `Based on an average target RPE of ${avgRpe.toFixed(1)} across your saved templates.`, nowIso) },
          };
        },
      });

      const trainingDayCounts = templates.map((t) => t.weeks[0]?.days.filter((d) => d.type === "training").length ?? 0).filter((n) => n > 0);
      if (trainingDayCounts.length > 0) {
        const avgDays = Math.round(trainingDayCounts.reduce((a, b) => a + b, 0) / trainingDayCounts.length);
        inferences.push({
          questionId: "program_frequency",
          label: "Typical training frequency",
          inferredValue: `${Math.max(1, avgDays - 1)}_${avgDays + 1}`,
          confidence: Math.min(0.8, 0.4 + trainingDayCounts.length * 0.05),
          note: `Based on Week 1 of ${trainingDayCounts.length} saved templates, averaging ${avgDays} training days/week.`,
          apply: (model, nowIso) => ({
            ...model,
            programArchitecture: { ...model.programArchitecture, typicalFrequencyDaysMin: Math.max(1, avgDays - 1), typicalFrequencyDaysMax: avgDays + 1 },
            provenance: { ...model.provenance, program_frequency: inferredProvenance(Math.min(0.8, 0.4 + trainingDayCounts.length * 0.05), `Based on ${trainingDayCounts.length} saved templates averaging ${avgDays} training days/week.`, nowIso) },
          }),
        });
      }
    }
  }

  if (mealRecommendations.length >= 2) {
    const withMacros = mealRecommendations.filter((m) => m.macros?.proteinG);
    if (withMacros.length >= 2) {
      const avgProtein = withMacros.reduce((sum, m) => sum + (m.macros?.proteinG ?? 0), 0) / withMacros.length;
      inferences.push({
        questionId: "nutrition_food_quality",
        label: "Protein emphasis in saved meals",
        inferredValue: avgProtein >= 35 ? "adequate_protein" : "no_strict_rules",
        confidence: Math.min(0.7, 0.3 + withMacros.length * 0.05),
        note: `Based on ${withMacros.length} saved meal recommendations averaging ${Math.round(avgProtein)}g protein.`,
        apply: (model, nowIso) => {
          const value = avgProtein >= 35 ? "adequate_protein" : "no_strict_rules";
          const priorities = Array.from(new Set([...model.nutritionPhilosophy.foodQualityPriorities, value]));
          return {
            ...model,
            nutritionPhilosophy: { ...model.nutritionPhilosophy, foodQualityPriorities: priorities },
            provenance: { ...model.provenance, nutrition_food_quality: inferredProvenance(Math.min(0.7, 0.3 + withMacros.length * 0.05), `Based on ${withMacros.length} saved meal recommendations.`, nowIso) },
          };
        },
      });
    }
  }

  return inferences;
}

/** Applies one inference to a model as `inferred` provenance — never
 * `coach_selected`/`coach_confirmed`. Use confirmInference() once the coach
 * explicitly reviews it. */
export function applyInference(model: CoachOperatingModel, inference: OperatingModelInference, nowIso: string): CoachOperatingModel {
  return inference.apply(model, nowIso);
}
