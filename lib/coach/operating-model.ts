// Phase 5.4A — the Coach Operating Model: a versioned, per-coach, structured
// record of how one coach actually coaches, built from their dedicated
// onboarding (see coach-onboarding-questions.ts/coach-onboarding-engine.ts)
// and from traceable inference over their own existing work (program
// templates, meal recommendations — see infer-from-existing-work.ts).
//
// Product-facing name: "Your Coaching Method" / "How OPTIM Coaches for You"
// (see components/coach-onboarding/). This file is the internal schema only
// — no coach ever sees a field key from this file.
//
// Persisted in PlatformState.coachOperatingModels (see platform-store.ts),
// following the exact ownership/isolation discipline as
// CoachAiAuthoritySettings/CoachProgramTemplate: every record carries its
// own coachId/workspaceId, and a coach's model is never visible to, or
// derivable from, another coach's records — even in the same workspace.
//
// Versioning: every meaningful edit creates a NEW record with an
// incremented `version` rather than mutating the previous one in place. The
// previous version is kept, never deleted — an already-generated client
// activation snapshot's `coachModelVersion` (see activation-generation.ts)
// stays resolvable forever, so past decisions remain explainable even after
// the coach's methodology changes. Exactly one version per coach may be
// `status: "active"` at a time (repository.ts enforces this on write); a
// coach mid-recalibration has a `"draft"` version that isn't yet used by
// generation.
//
// Provenance is tracked per QUESTION, not per leaf field — see Provenance
// below and CoachOperatingModel.provenance. A single onboarding question
// often sets several closely-related fields at once (e.g. one "how do you
// use RPE/RIR" question sets useRpeOrRir, rpeOrRirPreference, and
// proximityToFailure together); tracking provenance at the field level
// would triple this file's size for no real traceability gain, since the
// question is already the smallest unit a coach can confirm/reject/edit.
// `CoachOperatingModelQuestionDef.modelFieldsAffected` (see
// coach-onboarding-questions.ts) is the explicit link from a provenance
// entry back to exactly which fields it set.

import type { CoachProfileId, WorkspaceId } from "../tenancy/types";

// ---------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------

/** How one value in the model came to be set. `inferred` values must never
 * be treated as confirmed coaching rules by the generation engine until a
 * `coach_confirmed` (or `coach_selected`) provenance entry supersedes them
 * — see confirmInference() in coach-onboarding-engine.ts. */
export type ProvenanceSource = "coach_selected" | "inferred" | "optim_default" | "coach_confirmed";

export interface Provenance {
  source: ProvenanceSource;
  /** 0–1. 1.0 for anything coach_selected/coach_confirmed (no uncertainty
   * about what the coach actually said); an inferred value's real computed
   * confidence; a fixed, honestly-low 0.3 for an optim_default the coach
   * never touched (adaptive skip, or a chapter not reached before
   * confirmation) — see DEFAULT_PROVENANCE below. */
  confidence: number;
  /** Human-readable trace shown in the Review chapter, e.g. "Based on 7
   * selected program templates." — required whenever source is "inferred",
   * optional otherwise. */
  note?: string;
  updatedAtIso: string;
}

export function coachSelectedProvenance(nowIso: string): Provenance {
  return { source: "coach_selected", confidence: 1, updatedAtIso: nowIso };
}

export function coachConfirmedProvenance(nowIso: string, note?: string): Provenance {
  return { source: "coach_confirmed", confidence: 1, note, updatedAtIso: nowIso };
}

export function inferredProvenance(confidence: number, note: string, nowIso: string): Provenance {
  return { source: "inferred", confidence, note, updatedAtIso: nowIso };
}

export function defaultProvenance(nowIso: string): Provenance {
  return { source: "optim_default", confidence: 0.3, note: "OPTIM default — not yet reviewed by the coach.", updatedAtIso: nowIso };
}

// ---------------------------------------------------------------------------
// A. Coaching practice and client fit
// ---------------------------------------------------------------------------

export interface CoachPracticeProfile {
  clientPopulations: string[];
  experienceLevelsServed: string[];
  specialties: string[];
  commonGoals: string[];
  excludedGoalsOrPopulations: string[];
  typicalProgramLengthWeeks: number;
  serviceStructure: string;
  expectedCoachInvolvement: string;
  successDefinition: string;
  importantClientBehaviors: string[];
  scopeBoundaries: string[];
}

// ---------------------------------------------------------------------------
// B. Outcome priorities and tradeoffs
// ---------------------------------------------------------------------------

export type OutcomePriority =
  | "strength"
  | "hypertrophy"
  | "fat_loss"
  | "recomposition"
  | "weight_gain"
  | "athletic_performance"
  | "general_health"
  | "enjoyment"
  | "simplicity"
  | "adherence"
  | "speed_of_progress"
  | "sustainability"
  | "recovery"
  | "skill_development";

export const OUTCOME_PRIORITIES: OutcomePriority[] = [
  "strength",
  "hypertrophy",
  "fat_loss",
  "recomposition",
  "weight_gain",
  "athletic_performance",
  "general_health",
  "enjoyment",
  "simplicity",
  "adherence",
  "speed_of_progress",
  "sustainability",
  "recovery",
  "skill_development",
];

export const OUTCOME_PRIORITY_LABELS: Record<OutcomePriority, string> = {
  strength: "Strength",
  hypertrophy: "Hypertrophy",
  fat_loss: "Fat loss",
  recomposition: "Body recomposition",
  weight_gain: "Weight gain",
  athletic_performance: "Athletic performance",
  general_health: "General health",
  enjoyment: "Enjoyment",
  simplicity: "Simplicity",
  adherence: "Adherence",
  speed_of_progress: "Speed of progress",
  sustainability: "Long-term sustainability",
  recovery: "Recovery",
  skill_development: "Exercise skill development",
};

/** A conditional priority context — the same coach may trade off strength
 * vs. adherence differently for a novice than for an advanced lifter. See
 * this phase's brief §II.1.B: "Do not reduce the coach to one universal
 * style." `resolveOutcomePriorityRanking` (below) always has a real
 * fallback: default → context. */
export type OutcomePriorityContext = "default" | "novice" | "advanced" | "recomposition_goal" | "limited_availability";

export const OUTCOME_PRIORITY_CONTEXTS: OutcomePriorityContext[] = ["default", "novice", "advanced", "recomposition_goal", "limited_availability"];

export const OUTCOME_PRIORITY_CONTEXT_LABELS: Record<OutcomePriorityContext, string> = {
  default: "In general",
  novice: "For a novice client",
  advanced: "For an advanced lifter",
  recomposition_goal: "For a body-recomposition client",
  limited_availability: "For a client with limited availability",
};

export interface OutcomePriorityRanking {
  context: OutcomePriorityContext;
  /** Ordered most → least important. Never all 14 — a coach ranks the ones
   * that actually matter to them; unranked priorities are simply absent,
   * not assumed last. */
  rankedPriorities: OutcomePriority[];
}

export interface OutcomePriorityProfile {
  rankings: OutcomePriorityRanking[];
}

/** The effective ranking for a context, falling back to "default" (and
 * finally an honest empty ranking) so a caller never has to branch on
 * whether a specific context was ever configured. */
export function resolveOutcomePriorityRanking(profile: OutcomePriorityProfile, context: OutcomePriorityContext): OutcomePriority[] {
  const exact = profile.rankings.find((r) => r.context === context);
  if (exact && exact.rankedPriorities.length > 0) return exact.rankedPriorities;
  const fallback = profile.rankings.find((r) => r.context === "default");
  return fallback?.rankedPriorities ?? [];
}

// ---------------------------------------------------------------------------
// C. Program architecture
// ---------------------------------------------------------------------------

export interface ProgramArchitectureProfile {
  preferredSplits: string[];
  typicalFrequencyDaysMin: number;
  typicalFrequencyDaysMax: number;
  sessionDurationMinutesTypical: number;
  phaseStructure: string;
  exerciseOrderPhilosophy: string;
  movementPatternPriorities: string[];
  exerciseFamiliesPreferred: string[];
  exercisesAvoided: string[];
  equipmentPreferences: string[];
  setsPerExerciseMin: number;
  setsPerExerciseMax: number;
  repRangePhilosophy: string;
  usesRpeOrRir: "rpe" | "rir" | "both" | "neither";
  proximityToFailure: string;
  restPeriodPhilosophy: string;
  volumeRangePhilosophy: string;
  intensityRangePhilosophy: string;
  progressionMethod: string;
  regressionMethod: string;
  deloadFrequencyWeeks: number | null;
  fatigueManagementApproach: string;
  warmupPhilosophy: string;
  cardioPhilosophy: string;
  substitutionLogic: string;
  novelExerciseRule: string;
  /** Coach-defined hard rules — carried into activation-generation.ts as
   * literal hard constraints (never merely a soft preference). */
  nonNegotiables: string[];
}

// ---------------------------------------------------------------------------
// D & F. Executable adjustment policies (training + nutrition)
// ---------------------------------------------------------------------------

export type AdjustmentPolicyDomain = "training" | "nutrition";

/** One scenario's real, executable policy — the phase brief's explicit
 * "Trigger / Conditions / Preferred action / Acceptable alternatives /
 * Action priority / execute? / approve? / escalation / rationale / source /
 * confidence" structure. `acceptableAlternatives` is ordered by the order
 * the coach selected them in (see the ranked-by-selection-order convention
 * documented on ScenarioQuestionDef in coach-onboarding-questions.ts). */
export interface AdjustmentPolicy {
  /** The originating scenario question's id — see
   * coach-onboarding-questions.ts's ScenarioQuestionDef.id. */
  id: string;
  domain: AdjustmentPolicyDomain;
  trigger: string;
  /** Set only when the coach answered "it depends" — the one targeted
   * follow-up capturing the deciding condition, in the coach's own words. */
  conditions?: string;
  preferredAction: string;
  acceptableAlternatives: string[];
  /** True only for the platform-level absolute-override scenarios (pain,
   * possible injury) — mirrors lib/coach/health-review.ts's existing
   * behavior and can never be set to false by a coach's answer for those
   * two scenario ids (see coach-onboarding-engine.ts's buildAdjustmentPolicy,
   * which hardcodes this true regardless of the coach's selection). */
  alwaysEscalates: boolean;
  /** Whether OPTIM may execute this action on its own within the coach's
   * configured AI Authority level for the relevant domain — a policy-level
   * signal consulted alongside (never instead of) ai-authority.ts's
   * resolver. */
  aiMayExecute: boolean;
  requiresCoachApproval: boolean;
  rationale?: string;
  source: ProvenanceSource;
  confidence: number;
}

// ---------------------------------------------------------------------------
// E. Nutrition philosophy
// ---------------------------------------------------------------------------

export interface NutritionPhilosophyProfile {
  providesNutritionCoaching: boolean;
  calorieTargetPhilosophy: string;
  macroTargetPhilosophy: string;
  proteinTargetGramsPerLbBodyweight: number;
  planVsFrameworkPreference: "structured_meal_plan" | "flexible_framework" | "hybrid";
  foodQualityPriorities: string[];
  mealFrequencyPreference: string;
  mealTimingPhilosophy: string;
  trainingDayVsRestDayStrategy: string;
  hydrationPhilosophy: string;
  supplementBoundaries: string;
  dietaryRestrictionHandling: string;
  rateOfLossPercentPerWeek: number;
  rateOfGainPercentPerWeek: number;
  recompositionApproach: string;
  adherenceStandard: string;
  progressMeasurementsUsed: string[];
  conditionsRequiredBeforeChange: string;
  plateauFirstResponse: string;
  rapidChangeFirstResponse: string;
  refeedOrDietBreakPhilosophy: string;
  situationsRequiringCoachApproval: string[];
  situationsOutsideScope: string[];
}

// ---------------------------------------------------------------------------
// G. Communication style
// ---------------------------------------------------------------------------

export interface CommunicationStyleProfile {
  tone: string;
  conciseness: "brief" | "balanced" | "detailed";
  directness: number; // 1 (gentle) – 5 (very direct)
  warmth: number; // 1 (matter-of-fact) – 5 (very warm)
  accountabilityLevel: number; // 1 (light touch) – 5 (highly accountable)
  motivationalStyle: string;
  celebrationStyle: string;
  usesHumor: boolean;
  technicalLanguageLevel: "plain" | "moderate" | "technical";
  messageLength: "short" | "medium" | "long";
  checkInCadence: string;
  morningMessageEnabled: boolean;
  workoutReminderEnabled: boolean;
  missedWorkoutFollowUp: string;
  nutritionReminderBehavior: string;
  quietHoursStart: string; // "HH:mm"
  quietHoursEnd: string;
  typicalResponseWindowHours: number;
  aiMayRespondDirectly: string[];
  aiMayDraftOnly: string[];
  coachMustRespondPersonally: string[];
  avoidedPhrasesOrTones: string[];
}

// ---------------------------------------------------------------------------
// H. Safety and escalation
// ---------------------------------------------------------------------------

export interface SafetyProfile {
  painResponsePolicy: string;
  injuryResponsePolicy: string;
  medicalConcernPolicy: string;
  disorderedEatingEscalation: string;
  mentalHealthEscalation: string;
  outOfScopeHandling: string;
  majorGoalChangePolicy: string;
  extremeNutritionRequestPolicy: string;
  unusualPerformanceDeclinePolicy: string;
  repeatedNonAdherencePolicy: string;
  emergencyLanguagePolicy: string;
  /** Coach-authored rules that override every AI Authority level — merged
   * with (never replacing) the platform's own non-negotiable safety rules
   * in ai-authority.ts. A coach may add stricter rules here; nothing here
   * can weaken a platform rule (enforced by activation-generation.ts, which
   * always checks the platform rules independently of this list). */
  absoluteOverrideRules: string[];
  stopExerciseConditions: string[];
  stopWorkoutConditions: string[];
  pausePlanConditions: string[];
  immediateNotificationConditions: string[];
}

// ---------------------------------------------------------------------------
// J. Operational context
// ---------------------------------------------------------------------------

export interface OperationalContextProfile {
  /** Real IANA identifier (e.g. "America/Chicago") — never a fixed UTC
   * offset. See components/ui/timezone-picker.tsx. */
  timeZone: string;
  quietHoursStart: string;
  quietHoursEnd: string;
  workingDays: string[];
  reviewWindowHours: number;
  notificationPreference: string;
  supportedProgramDurationsWeeks: number[];
  clientCapacity: number | null;
  /** Client-facing business/coach name — read from the workspace's real
   * WorkspaceBranding.businessName by default (see
   * coach-onboarding-engine.ts's seedOperatingModelFromWorkspace), never
   * hardcoded to any one coach or business. */
  clientFacingName: string;
  welcomeIdentity: string;
  servicesOffered: string[];
}

// ---------------------------------------------------------------------------
// Top-level Coach Operating Model
// ---------------------------------------------------------------------------

export type CoachOperatingModelStatus = "draft" | "active" | "superseded";

export interface CoachOperatingModel {
  coachId: CoachProfileId;
  workspaceId: WorkspaceId;
  /** 1-based, strictly increasing per coach. See platform-store.ts's
   * SAVE_COACH_OPERATING_MODEL — never mutated after creation; a later edit
   * always creates version + 1. */
  version: number;
  status: CoachOperatingModelStatus;
  createdAtIso: string;
  activatedAtIso?: string;
  /** Set only when status transitions to "superseded" — points at the
   * version that replaced it, so history stays a real linked chain rather
   * than an assumption based on version-number adjacency alone. */
  supersededByVersion?: number;

  practice: CoachPracticeProfile;
  outcomePriorities: OutcomePriorityProfile;
  programArchitecture: ProgramArchitectureProfile;
  trainingAdjustmentPolicies: AdjustmentPolicy[];
  nutritionPhilosophy: NutritionPhilosophyProfile;
  nutritionAdjustmentPolicies: AdjustmentPolicy[];
  communication: CommunicationStyleProfile;
  safety: SafetyProfile;
  operationalContext: OperationalContextProfile;

  /** Keyed by onboarding question id — see Provenance's module doc above
   * for why this is per-question rather than per-leaf-field. */
  provenance: Record<string, Provenance>;
}

/** A model is usable by the generation engine only once every domain the
 * coach's practice actually needs has at least been reviewed — "reviewed"
 * meaning every provenance entry for a REQUIRED question is
 * coach_selected/coach_confirmed, not merely an optim_default the coach
 * skipped past. Used by the Review chapter's "confirm to activate" gate and
 * by activation-generation.ts's own defensive re-check. */
export function isCoachOperatingModelConfirmed(model: CoachOperatingModel, requiredQuestionIds: string[]): boolean {
  return requiredQuestionIds.every((id) => {
    const p = model.provenance[id];
    return !!p && (p.source === "coach_selected" || p.source === "coach_confirmed");
  });
}

/** Every value the model doesn't yet have real coach input for — used to
 * drive the Review chapter's "Unknown or low-confidence areas" section and
 * the adaptive engine's "low-confidence domains get more attention" rule
 * (this phase's brief §III.6). */
export function lowConfidenceQuestionIds(model: CoachOperatingModel, threshold = 0.6): string[] {
  return Object.entries(model.provenance)
    .filter(([, p]) => p.confidence < threshold)
    .map(([id]) => id);
}

/** The one place a client-facing clock reads which timezone "the coach's
 * business operates in" for scheduling/quiet-hours purposes — never a raw
 * IANA id shown to anyone; see components/ui/timezone-picker.tsx's
 * friendlyTimeZoneLabel usage. */
export function coachClientFacingIdentity(model: CoachOperatingModel): { name: string; welcome: string } {
  return { name: model.operationalContext.clientFacingName, welcome: model.operationalContext.welcomeIdentity };
}

/** A complete, honest "OPTIM default" model — every leaf has a real,
 * reasonable value (never blank/undefined; the generation engine must never
 * special-case "field not set") and every provenance entry is
 * `optim_default` at confidence 0.3. This is the coach onboarding wizard's
 * starting point (each answered question overwrites its own fields'
 * provenance to coach_selected as the coach goes), and is also what a
 * legacy coach who skips calibration entirely keeps operating on — see
 * coach-onboarding-engine.ts's migrateLegacyCoach. */
export function createDefaultCoachOperatingModel(input: { coachId: CoachProfileId; workspaceId: WorkspaceId; nowIso: string; businessName: string }): CoachOperatingModel {
  return {
    coachId: input.coachId,
    workspaceId: input.workspaceId,
    version: 1,
    status: "draft",
    createdAtIso: input.nowIso,
    practice: {
      clientPopulations: ["general_population"],
      experienceLevelsServed: ["beginner", "intermediate"],
      specialties: [],
      commonGoals: ["general_health", "fat_loss", "build_muscle"],
      excludedGoalsOrPopulations: [],
      typicalProgramLengthWeeks: 12,
      serviceStructure: "ongoing",
      expectedCoachInvolvement: "weekly_check_in",
      successDefinition: "Consistent adherence and steady, sustainable progress toward the client's stated goal.",
      importantClientBehaviors: ["consistency", "honest_reporting"],
      scopeBoundaries: ["no_medical_diagnosis", "no_disordered_eating_treatment"],
    },
    outcomePriorities: {
      rankings: [{ context: "default", rankedPriorities: ["adherence", "sustainability", "hypertrophy", "fat_loss"] }],
    },
    programArchitecture: {
      preferredSplits: ["full_body", "upper_lower"],
      typicalFrequencyDaysMin: 3,
      typicalFrequencyDaysMax: 4,
      sessionDurationMinutesTypical: 60,
      phaseStructure: "linear_block",
      exerciseOrderPhilosophy: "compound_first",
      movementPatternPriorities: ["squat", "hinge", "push_horizontal", "pull_horizontal"],
      exerciseFamiliesPreferred: ["barbell", "dumbbell", "machine"],
      exercisesAvoided: [],
      equipmentPreferences: ["barbell", "dumbbell", "machine", "cable"],
      setsPerExerciseMin: 3,
      setsPerExerciseMax: 4,
      repRangePhilosophy: "moderate_8_12",
      usesRpeOrRir: "rpe",
      proximityToFailure: "1_2_reps_in_reserve",
      restPeriodPhilosophy: "90_180s_compounds_60_90s_isolation",
      volumeRangePhilosophy: "moderate",
      intensityRangePhilosophy: "moderate_to_high",
      progressionMethod: "double_progression",
      regressionMethod: "reduce_volume_before_intensity",
      deloadFrequencyWeeks: 6,
      fatigueManagementApproach: "monitor_rpe_trend",
      warmupPhilosophy: "ramped_warmup_sets",
      cardioPhilosophy: "optional_low_intensity_supplemental",
      substitutionLogic: "match_movement_pattern_and_equipment",
      novelExerciseRule: "prefer_familiar_pattern_variations",
      nonNegotiables: [],
    },
    trainingAdjustmentPolicies: [],
    nutritionPhilosophy: {
      providesNutritionCoaching: true,
      calorieTargetPhilosophy: "moderate_deficit_or_surplus_from_maintenance",
      macroTargetPhilosophy: "protein_first_then_split_remainder",
      proteinTargetGramsPerLbBodyweight: 0.8,
      planVsFrameworkPreference: "flexible_framework",
      foodQualityPriorities: ["whole_foods_majority", "adequate_protein"],
      mealFrequencyPreference: "3_4_meals",
      mealTimingPhilosophy: "flexible_around_training",
      trainingDayVsRestDayStrategy: "same_calories_shift_carbs",
      hydrationPhilosophy: "half_bodyweight_oz_daily",
      supplementBoundaries: "food_first_basic_supplements_only",
      dietaryRestrictionHandling: "accommodate_within_targets",
      rateOfLossPercentPerWeek: 0.75,
      rateOfGainPercentPerWeek: 0.25,
      recompositionApproach: "small_deficit_high_protein_maintain_training_intensity",
      adherenceStandard: "consistent_within_range_not_perfect",
      progressMeasurementsUsed: ["body_weight_trend", "photos", "performance"],
      conditionsRequiredBeforeChange: "two_to_three_weeks_of_consistent_data",
      plateauFirstResponse: "verify_adherence_before_changing_targets",
      rapidChangeFirstResponse: "check_measurement_and_logging_accuracy",
      refeedOrDietBreakPhilosophy: "scheduled_diet_break_every_8_12_weeks_in_a_deficit",
      situationsRequiringCoachApproval: ["extreme_deficit_or_surplus_request", "disordered_eating_signals"],
      situationsOutsideScope: ["medical_nutrition_therapy", "eating_disorder_treatment"],
    },
    nutritionAdjustmentPolicies: [],
    communication: {
      tone: "encouraging_direct",
      conciseness: "balanced",
      directness: 3,
      warmth: 3,
      accountabilityLevel: 3,
      motivationalStyle: "progress_focused",
      celebrationStyle: "specific_and_brief",
      usesHumor: false,
      technicalLanguageLevel: "moderate",
      messageLength: "medium",
      checkInCadence: "weekly",
      morningMessageEnabled: false,
      workoutReminderEnabled: true,
      missedWorkoutFollowUp: "same_day_gentle_check_in",
      nutritionReminderBehavior: "none",
      quietHoursStart: "21:00",
      quietHoursEnd: "07:00",
      typicalResponseWindowHours: 24,
      aiMayRespondDirectly: ["routine_logistics", "how_to_log_a_meal"],
      aiMayDraftOnly: ["missed_workout_follow_up", "weekly_progress_summary"],
      coachMustRespondPersonally: ["pain_or_injury_report", "emotional_distress"],
      avoidedPhrasesOrTones: [],
    },
    safety: {
      painResponsePolicy: "stop_and_escalate_to_coach",
      injuryResponsePolicy: "stop_and_escalate_to_coach",
      medicalConcernPolicy: "escalate_and_recommend_professional",
      disorderedEatingEscalation: "escalate_immediately_pause_nutrition_automation",
      mentalHealthEscalation: "escalate_immediately",
      outOfScopeHandling: "acknowledge_and_redirect_to_appropriate_professional",
      majorGoalChangePolicy: "escalate_to_coach",
      extremeNutritionRequestPolicy: "escalate_to_coach",
      unusualPerformanceDeclinePolicy: "flag_for_coach_review",
      repeatedNonAdherencePolicy: "flag_for_coach_review",
      emergencyLanguagePolicy: "escalate_immediately_and_display_professional_resources",
      absoluteOverrideRules: [],
      stopExerciseConditions: ["sharp_or_worsening_pain"],
      stopWorkoutConditions: ["chest_pain_dizziness_or_fainting"],
      pausePlanConditions: ["unresolved_pain_or_injury_report"],
      immediateNotificationConditions: ["pain_or_injury_report", "disordered_eating_signal", "mental_health_concern"],
    },
    operationalContext: {
      timeZone: "America/Chicago",
      quietHoursStart: "21:00",
      quietHoursEnd: "07:00",
      workingDays: ["mon", "tue", "wed", "thu", "fri"],
      reviewWindowHours: 24,
      notificationPreference: "daily_digest",
      supportedProgramDurationsWeeks: [8, 12, 16],
      clientCapacity: null,
      clientFacingName: input.businessName,
      welcomeIdentity: input.businessName,
      servicesOffered: ["personal_training", "nutrition_coaching"],
    },
    provenance: {},
  } satisfies CoachOperatingModel;
}
