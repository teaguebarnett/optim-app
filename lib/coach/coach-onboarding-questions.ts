// Phase 5.4A — the coach-onboarding question bank.
//
// Structurally parallel to lib/coach/onboarding-steps.ts (the CLIENT
// intake's data-driven question engine) but a deliberately separate file:
// coach questions need scenario/ranked-selection shapes the client intake
// never uses, and the two engines must never be unioned into one type.
//
// Every question here maps to one or more real CoachOperatingModel fields
// (see modelFieldsAffected) or produces an executable AdjustmentPolicy (see
// operating-model.ts). Before adding a question, verify it would actually
// change training generation, nutrition generation, an adjustment policy,
// communication, safety, escalation, AI authority, or scheduling — see this
// phase's brief §III.3. lib/coach/verify-coach-onboarding.mts enforces this
// mechanically: every question id must appear in COACH_ONBOARDING_QUESTIONS
// with a non-empty modelFieldsAffected.

import type { LucideIcon } from "lucide-react";
import { Activity, Bike, Clock3, Dumbbell, Flame, Heart, HeartPulse, Rows3, Sparkles, Split, TrendingUp, Users2 } from "lucide-react";

export type CoachOnboardingChapterId =
  | "practice"
  | "program_architecture"
  | "training_adjustment"
  | "nutrition_philosophy"
  | "nutrition_adjustment"
  | "communication"
  | "safety"
  | "ai_authority"
  | "existing_work"
  | "review";

export const COACH_ONBOARDING_CHAPTERS: { id: CoachOnboardingChapterId; title: string; description: string }[] = [
  { id: "practice", title: "Your coaching practice", description: "Who you coach, and what success looks like." },
  { id: "program_architecture", title: "How you build training", description: "Your programming philosophy, in your own terms." },
  { id: "training_adjustment", title: "How you adjust training", description: "Real scenarios, so OPTIM reacts the way you would." },
  { id: "nutrition_philosophy", title: "How you coach nutrition", description: "Your approach to calories, macros, and food." },
  { id: "nutrition_adjustment", title: "How you adjust nutrition", description: "What you'd actually do in common situations." },
  { id: "communication", title: "How you communicate", description: "Tone, cadence, and where you draw the line." },
  { id: "safety", title: "Safety and non-negotiables", description: "Your stop, pause, and escalation rules." },
  { id: "ai_authority", title: "AI coaching authority", description: "How much OPTIM may do on its own." },
  { id: "existing_work", title: "Learn from your existing work", description: "OPTIM looks at what you've already built." },
  { id: "review", title: "Review your coaching model", description: "Confirm how OPTIM understands you." },
];

export type CoachQuestionType = "single_select" | "multi_select" | "ranked_select" | "scenario" | "slider" | "text" | "boolean" | "number";

export interface CoachQuestionOption {
  value: string;
  label: string;
  description?: string;
  icon?: LucideIcon;
}

/** Loose on purpose — mirrors OnboardingStepAnswers' own pragmatic looseness
 * (see lib/coach/onboarding-steps.ts). A coach's raw answer bag, keyed by
 * question id. */
export type CoachOnboardingAnswerValue = string | number | boolean | string[] | undefined;
export type CoachOnboardingAnswers = Record<string, CoachOnboardingAnswerValue>;

/** The three real actions the phase brief's "it depends" flow needs from a
 * scenario question. Every scenario question includes the trailing
 * `it_depends` option automatically (see SCENARIO_DEPENDS_OPTION) — question
 * defs never repeat it in their own scenarioActionOptions array. */
export const SCENARIO_DEPENDS_VALUE = "it_depends";

export const SCENARIO_DEPENDS_OPTION: CoachQuestionOption = { value: SCENARIO_DEPENDS_VALUE, label: "It depends" };

export interface CoachOnboardingQuestionDef {
  id: string;
  domain: string;
  chapter: CoachOnboardingChapterId;
  prompt: string;
  explanation?: string;
  type: CoachQuestionType;
  options?: CoachQuestionOption[];
  /** multi_select/ranked_select/scenario only. Absent means unlimited —
   * selection ORDER is the rank (first click = highest priority; see
   * rankSelectedByClickOrder in coach-onboarding-engine.ts). */
  maxSelections?: number;
  otherAllowed?: boolean;
  required: boolean;
  priority: number;
  /** Plain-language trace of what this question sets — shown nowhere in the
   * UI verbatim, but used by the Review chapter's per-domain summaries and
   * verified non-empty by verify-coach-onboarding.mts. */
  modelFieldsAffected: string[];
  /** slider/number only. */
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  /** Adaptive branching — a question is only ever shown, required, or
   * persisted-as-answered when this returns true for the coach's current
   * answers. Absent means always visible (subject to chapter-level
   * skipping — see coach-onboarding-engine.ts's chapterApplies). */
  visibleIf?: (answers: CoachOnboardingAnswers) => boolean;
}

// ---------------------------------------------------------------------------
// Chapter 1 — Your coaching practice
// ---------------------------------------------------------------------------

const PRACTICE_QUESTIONS: CoachOnboardingQuestionDef[] = [
  {
    id: "practice_populations",
    domain: "practice",
    chapter: "practice",
    prompt: "Who do you typically coach?",
    type: "multi_select",
    required: true,
    priority: 1,
    modelFieldsAffected: ["practice.clientPopulations"],
    options: [
      { value: "general_population", label: "General population", icon: Users2 },
      { value: "strength_athletes", label: "Strength athletes (powerlifting/weightlifting)", icon: Dumbbell },
      { value: "physique_bodybuilding", label: "Physique / bodybuilding", icon: Sparkles },
      { value: "team_sport_athletes", label: "Team-sport athletes", icon: Activity },
      { value: "endurance_athletes", label: "Endurance athletes", icon: Bike },
      { value: "busy_professionals", label: "Busy professionals", icon: Clock3 },
      { value: "postpartum_or_return_to_training", label: "Postpartum / return-to-training", icon: Heart },
      { value: "older_adults", label: "Older adults", icon: HeartPulse },
    ],
  },
  {
    id: "practice_experience_levels",
    domain: "practice",
    chapter: "practice",
    prompt: "What experience levels do you typically work with?",
    type: "multi_select",
    required: true,
    priority: 2,
    modelFieldsAffected: ["practice.experienceLevelsServed"],
    options: [
      { value: "beginner", label: "Beginner" },
      { value: "intermediate", label: "Intermediate" },
      { value: "advanced", label: "Advanced" },
    ],
  },
  {
    id: "practice_common_goals",
    domain: "practice",
    chapter: "practice",
    prompt: "Which goals do you most commonly support?",
    type: "multi_select",
    required: true,
    priority: 3,
    modelFieldsAffected: ["practice.commonGoals", "outcomePriorities"],
    options: [
      { value: "build_muscle", label: "Build muscle", icon: Dumbbell },
      { value: "lose_fat", label: "Lose fat", icon: Flame },
      { value: "recomposition", label: "Body recomposition", icon: Sparkles },
      { value: "get_stronger", label: "Get stronger", icon: TrendingUp },
      { value: "athletic_performance", label: "Athletic performance", icon: Activity },
      { value: "general_health", label: "General health & consistency", icon: HeartPulse },
    ],
  },
  {
    id: "practice_excluded",
    domain: "practice",
    chapter: "practice",
    prompt: "Are there goals or populations you don't take on?",
    explanation: "OPTIM will never generate a plan for a goal or population you've excluded — it will flag the client for you instead.",
    type: "multi_select",
    required: false,
    priority: 4,
    modelFieldsAffected: ["practice.excludedGoalsOrPopulations"],
    options: [
      { value: "contest_prep", label: "Contest prep" },
      { value: "return_from_surgery", label: "Return from surgery" },
      { value: "eating_disorder_history", label: "Active eating-disorder history" },
      { value: "under_17", label: "Clients under 17" },
      { value: "extreme_weight_goals", label: "Extreme weight goals" },
      { value: "none", label: "None — I take a broad range of clients" },
    ],
  },
  {
    id: "practice_program_length",
    domain: "practice",
    chapter: "practice",
    prompt: "What program length do you typically use?",
    type: "single_select",
    required: true,
    priority: 5,
    modelFieldsAffected: ["practice.typicalProgramLengthWeeks", "operationalContext.supportedProgramDurationsWeeks"],
    options: [
      { value: "8", label: "8 weeks" },
      { value: "12", label: "12 weeks" },
      { value: "16", label: "16 weeks" },
      { value: "ongoing", label: "Ongoing, reviewed continually" },
    ],
  },
  {
    id: "practice_service_structure",
    domain: "practice",
    chapter: "practice",
    prompt: "How is your coaching structured?",
    type: "single_select",
    required: true,
    priority: 6,
    modelFieldsAffected: ["practice.serviceStructure"],
    options: [
      { value: "ongoing", label: "Ongoing monthly coaching" },
      { value: "fixed_program", label: "One fixed-length program at a time" },
      { value: "hybrid", label: "A mix, depending on the client" },
    ],
  },
  {
    id: "practice_involvement",
    domain: "practice",
    chapter: "practice",
    prompt: "How involved do you expect to stay, week to week?",
    type: "single_select",
    required: true,
    priority: 7,
    modelFieldsAffected: ["practice.expectedCoachInvolvement"],
    options: [
      { value: "daily_touchpoint", label: "Daily touchpoint" },
      { value: "weekly_check_in", label: "Weekly check-in" },
      { value: "biweekly_check_in", label: "Every other week" },
      { value: "as_needed", label: "As needed / exception-based" },
    ],
  },
  {
    id: "practice_success_definition",
    domain: "practice",
    chapter: "practice",
    prompt: "In one or two sentences, what does successful coaching look like to you?",
    explanation: "This becomes the standard OPTIM checks generated work against.",
    type: "text",
    required: true,
    priority: 8,
    modelFieldsAffected: ["practice.successDefinition"],
  },
  {
    id: "practice_important_behaviors",
    domain: "practice",
    chapter: "practice",
    prompt: "Which client behaviors matter most to you?",
    type: "multi_select",
    required: false,
    priority: 9,
    modelFieldsAffected: ["practice.importantClientBehaviors"],
    options: [
      { value: "consistency", label: "Consistency over intensity" },
      { value: "honest_reporting", label: "Honest reporting" },
      { value: "communication", label: "Proactive communication" },
      { value: "effort", label: "Visible effort" },
      { value: "patience", label: "Patience with the process" },
    ],
  },
];

// ---------------------------------------------------------------------------
// Chapter 2 — How you build training
// ---------------------------------------------------------------------------

const PROGRAM_ARCHITECTURE_QUESTIONS: CoachOnboardingQuestionDef[] = [
  {
    id: "program_splits",
    domain: "program_architecture",
    chapter: "program_architecture",
    prompt: "Which training splits do you use regularly?",
    explanation: "Select every split you'd genuinely consider — OPTIM will match one to each client's real availability.",
    type: "multi_select",
    required: true,
    priority: 1,
    modelFieldsAffected: ["programArchitecture.preferredSplits"],
    options: [
      { value: "full_body", label: "Full body", icon: Rows3 },
      { value: "upper_lower", label: "Upper / lower", icon: Split },
      { value: "push_pull_legs", label: "Push / pull / legs", icon: Split },
      { value: "body_part_split", label: "Body-part split", icon: Split },
      { value: "full_body_high_frequency", label: "High-frequency full body" },
    ],
  },
  {
    id: "program_frequency",
    domain: "program_architecture",
    chapter: "program_architecture",
    prompt: "What's your typical training-frequency range?",
    type: "single_select",
    required: true,
    priority: 2,
    modelFieldsAffected: ["programArchitecture.typicalFrequencyDaysMin", "programArchitecture.typicalFrequencyDaysMax"],
    options: [
      { value: "2_3", label: "2–3 days/week" },
      { value: "3_4", label: "3–4 days/week" },
      { value: "4_5", label: "4–5 days/week" },
      { value: "5_6", label: "5–6 days/week" },
    ],
  },
  {
    id: "program_session_length",
    domain: "program_architecture",
    chapter: "program_architecture",
    prompt: "What session length do you usually program for?",
    type: "single_select",
    required: true,
    priority: 3,
    modelFieldsAffected: ["programArchitecture.sessionDurationMinutesTypical"],
    options: [
      { value: "30", label: "~30 minutes" },
      { value: "45", label: "~45 minutes" },
      { value: "60", label: "~60 minutes" },
      { value: "75", label: "~75 minutes" },
      { value: "90", label: "~90 minutes" },
    ],
  },
  {
    id: "program_exercise_order",
    domain: "program_architecture",
    chapter: "program_architecture",
    prompt: "How do you usually order exercises within a session?",
    type: "single_select",
    required: true,
    priority: 4,
    modelFieldsAffected: ["programArchitecture.exerciseOrderPhilosophy"],
    options: [
      { value: "compound_first", label: "Heaviest compound movement first" },
      { value: "priority_first", label: "The client's weakest/priority area first" },
      { value: "skill_first", label: "Technical/skill work first, while fresh" },
    ],
  },
  {
    id: "program_movement_priorities",
    domain: "program_architecture",
    chapter: "program_architecture",
    prompt: "Which movement patterns do you prioritize in most programs?",
    type: "multi_select",
    required: true,
    priority: 5,
    modelFieldsAffected: ["programArchitecture.movementPatternPriorities"],
    options: [
      { value: "squat", label: "Squat" },
      { value: "hinge", label: "Hinge" },
      { value: "push_horizontal", label: "Horizontal push" },
      { value: "push_vertical", label: "Vertical push" },
      { value: "pull_horizontal", label: "Horizontal pull" },
      { value: "pull_vertical", label: "Vertical pull" },
      { value: "lunge", label: "Lunge / single-leg" },
      { value: "core", label: "Core / anti-rotation" },
    ],
  },
  {
    id: "program_equipment",
    domain: "program_architecture",
    chapter: "program_architecture",
    prompt: "Which equipment do you build around most?",
    type: "multi_select",
    required: true,
    priority: 6,
    modelFieldsAffected: ["programArchitecture.equipmentPreferences", "programArchitecture.exerciseFamiliesPreferred"],
    options: [
      { value: "barbell", label: "Barbell" },
      { value: "dumbbell", label: "Dumbbell" },
      { value: "machine", label: "Machines" },
      { value: "cable", label: "Cable" },
      { value: "bodyweight", label: "Bodyweight" },
      { value: "bands", label: "Bands" },
      { value: "kettlebell", label: "Kettlebell" },
    ],
  },
  {
    id: "program_sets_reps",
    domain: "program_architecture",
    chapter: "program_architecture",
    prompt: "What's your default working-set range per exercise?",
    type: "single_select",
    required: true,
    priority: 7,
    modelFieldsAffected: ["programArchitecture.setsPerExerciseMin", "programArchitecture.setsPerExerciseMax"],
    options: [
      { value: "2_3", label: "2–3 sets" },
      { value: "3_4", label: "3–4 sets" },
      { value: "4_5", label: "4–5 sets" },
    ],
  },
  {
    id: "program_rep_philosophy",
    domain: "program_architecture",
    chapter: "program_architecture",
    prompt: "Which rep ranges do you build most of a program around?",
    type: "single_select",
    required: true,
    priority: 8,
    modelFieldsAffected: ["programArchitecture.repRangePhilosophy"],
    options: [
      { value: "strength_low_3_6", label: "Mostly low reps (3–6) for strength" },
      { value: "moderate_8_12", label: "Mostly moderate reps (8–12)" },
      { value: "higher_12_20", label: "Mostly higher reps (12–20)" },
      { value: "varied_by_block", label: "Varied deliberately across the program" },
    ],
  },
  {
    id: "program_rpe_rir",
    domain: "program_architecture",
    chapter: "program_architecture",
    prompt: "Do you coach with RPE, RIR, both, or neither?",
    type: "single_select",
    required: true,
    priority: 9,
    modelFieldsAffected: ["programArchitecture.usesRpeOrRir"],
    options: [
      { value: "rpe", label: "RPE" },
      { value: "rir", label: "RIR" },
      { value: "both", label: "Both, interchangeably" },
      { value: "neither", label: "Neither — fixed loads/percentages" },
    ],
  },
  {
    id: "program_proximity_to_failure",
    domain: "program_architecture",
    chapter: "program_architecture",
    prompt: "How close to failure do your clients typically train?",
    type: "single_select",
    required: true,
    priority: 10,
    modelFieldsAffected: ["programArchitecture.proximityToFailure"],
    visibleIf: (a) => a.program_rpe_rir !== "neither",
    options: [
      { value: "0_1_reps_in_reserve", label: "0–1 reps in reserve — close to failure" },
      { value: "1_2_reps_in_reserve", label: "1–2 reps in reserve" },
      { value: "2_4_reps_in_reserve", label: "2–4 reps in reserve — more conservative" },
    ],
  },
  {
    id: "program_progression",
    domain: "program_architecture",
    chapter: "program_architecture",
    prompt: "How do you typically progress a client week to week?",
    type: "single_select",
    required: true,
    priority: 11,
    modelFieldsAffected: ["programArchitecture.progressionMethod"],
    options: [
      { value: "linear_load", label: "Add load whenever reps/RPE allow" },
      { value: "double_progression", label: "Double progression (reps first, then load)" },
      { value: "planned_undulation", label: "Planned week-to-week undulation" },
      { value: "autoregulated", label: "Fully autoregulated by daily performance" },
    ],
  },
  {
    id: "program_deload",
    domain: "program_architecture",
    chapter: "program_architecture",
    prompt: "How often do you build in a deload?",
    type: "single_select",
    required: true,
    priority: 12,
    modelFieldsAffected: ["programArchitecture.deloadFrequencyWeeks"],
    options: [
      { value: "4", label: "Every 4 weeks" },
      { value: "6", label: "Every 6 weeks" },
      { value: "8", label: "Every 8 weeks" },
      { value: "as_needed", label: "Only when fatigue signals call for it" },
    ],
  },
  {
    id: "program_warmup",
    domain: "program_architecture",
    chapter: "program_architecture",
    prompt: "What's your warm-up philosophy?",
    type: "single_select",
    required: true,
    priority: 13,
    modelFieldsAffected: ["programArchitecture.warmupPhilosophy"],
    options: [
      { value: "ramped_warmup_sets", label: "Ramped warm-up sets before working weight" },
      { value: "general_then_specific", label: "General movement prep, then specific ramp-up" },
      { value: "minimal", label: "Minimal — a light first set is enough" },
    ],
  },
  {
    id: "program_cardio",
    domain: "program_architecture",
    chapter: "program_architecture",
    prompt: "How do you use cardio in a training program?",
    type: "single_select",
    required: true,
    priority: 14,
    modelFieldsAffected: ["programArchitecture.cardioPhilosophy"],
    options: [
      { value: "optional_low_intensity_supplemental", label: "Optional, low-intensity, supplemental" },
      { value: "prescribed_for_fat_loss", label: "Prescribed specifically for fat-loss goals" },
      { value: "prescribed_for_conditioning", label: "Prescribed for general conditioning, regardless of goal" },
      { value: "rarely_used", label: "Rarely part of my programs" },
    ],
  },
  {
    id: "program_non_negotiables",
    domain: "program_architecture",
    chapter: "program_architecture",
    prompt: "Any hard rules OPTIM should never break when building a program?",
    explanation: "These are treated as absolute constraints, not preferences.",
    type: "text",
    required: false,
    priority: 15,
    modelFieldsAffected: ["programArchitecture.nonNegotiables"],
  },
  {
    id: "program_exercises_avoided",
    domain: "program_architecture",
    chapter: "program_architecture",
    prompt: "Are there exercises you avoid prescribing?",
    type: "text",
    required: false,
    priority: 16,
    modelFieldsAffected: ["programArchitecture.exercisesAvoided"],
  },
];

// ---------------------------------------------------------------------------
// Chapter 3 — How you adjust training (scenario-based)
// ---------------------------------------------------------------------------

const TRAINING_ADJUSTMENT_ACTIONS: Record<"missedOneWorkout" | "missedMultipleWorkouts", CoachQuestionOption[]> = {
  missedOneWorkout: [
    { value: "reschedule", label: "Reschedule the missed workout" },
    { value: "continue_next_scheduled", label: "Continue with the next scheduled workout" },
    { value: "condense_week", label: "Condense the remaining week" },
    { value: "ask_client_first", label: "Ask the client before changing anything" },
  ],
  missedMultipleWorkouts: [
    { value: "reduce_week_workload", label: "Reduce the rest of the week's workload" },
    { value: "continue_next_scheduled", label: "Continue with the next scheduled workout" },
    { value: "condense_week", label: "Condense the remaining week" },
    { value: "check_in_first", label: "Check in on what's going on before changing the plan" },
  ],
};

function scenarioQuestion(input: {
  id: string;
  domain: string;
  chapter: CoachOnboardingChapterId;
  prompt: string;
  priority: number;
  actions: CoachQuestionOption[];
  explanation?: string;
  modelFieldsAffected?: string[];
}): CoachOnboardingQuestionDef {
  return {
    id: input.id,
    domain: input.domain,
    chapter: input.chapter,
    prompt: input.prompt,
    explanation: input.explanation,
    type: "scenario",
    required: true,
    priority: input.priority,
    modelFieldsAffected: input.modelFieldsAffected ?? [`${input.domain}AdjustmentPolicies[${input.id}]`],
    options: [...input.actions, SCENARIO_DEPENDS_OPTION],
  };
}

const TRAINING_ADJUSTMENT_QUESTIONS: CoachOnboardingQuestionDef[] = [
  scenarioQuestion({
    id: "scn_missed_one_workout",
    domain: "training",
    chapter: "training_adjustment",
    priority: 1,
    prompt: "A client misses one workout this week. What should OPTIM usually do first?",
    actions: TRAINING_ADJUSTMENT_ACTIONS.missedOneWorkout,
  }),
  scenarioQuestion({
    id: "scn_missed_multiple_workouts",
    domain: "training",
    chapter: "training_adjustment",
    priority: 2,
    prompt: "A client misses two or more workouts because life got in the way. What should OPTIM usually do first?",
    actions: TRAINING_ADJUSTMENT_ACTIONS.missedMultipleWorkouts,
  }),
  scenarioQuestion({
    id: "scn_schedule_change_midweek",
    domain: "training",
    chapter: "training_adjustment",
    priority: 3,
    prompt: "A client's schedule changes midweek and they can no longer train on a planned day. What should OPTIM do?",
    actions: [
      { value: "shift_remaining_days", label: "Shift the remaining days to fit" },
      { value: "drop_lowest_priority_day", label: "Drop the lowest-priority session for the week" },
      { value: "ask_client_first", label: "Ask the client which day works better" },
    ],
  }),
  scenarioQuestion({
    id: "scn_equipment_unavailable",
    domain: "training",
    chapter: "training_adjustment",
    priority: 4,
    prompt: "The client shows up and their usual equipment isn't available. What should OPTIM do?",
    actions: [
      { value: "use_approved_substitute", label: "Use a pre-approved substitute for that exercise" },
      { value: "pick_closest_pattern_match", label: "Pick the closest movement-pattern match automatically" },
      { value: "ask_client_first", label: "Ask the client before substituting" },
    ],
  }),
  scenarioQuestion({
    id: "scn_exercise_dislike",
    domain: "training",
    chapter: "training_adjustment",
    priority: 5,
    prompt: "A client says they dislike a prescribed exercise. What should OPTIM usually do?",
    actions: [
      { value: "swap_same_pattern", label: "Swap in another exercise for the same movement pattern" },
      { value: "keep_but_note", label: "Keep it, but note the feedback for the coach" },
      { value: "ask_coach_first", label: "Ask the coach before changing anything" },
    ],
  }),
  scenarioQuestion({
    id: "scn_cannot_feel_target_muscle",
    domain: "training",
    chapter: "training_adjustment",
    priority: 6,
    prompt: "A client says they can't feel a target muscle working on an exercise. What should OPTIM do?",
    actions: [
      { value: "suggest_technique_cue", label: "Suggest a technique/mind-muscle cue" },
      { value: "swap_to_isolation_variant", label: "Swap toward a more isolated variant of the same pattern" },
      { value: "flag_for_coach_review", label: "Flag it for the coach to look at" },
    ],
  }),
  scenarioQuestion({
    id: "scn_rpe_higher_than_expected",
    domain: "training",
    chapter: "training_adjustment",
    priority: 7,
    prompt: "RPE has been consistently higher than expected for several sessions. What should OPTIM do first?",
    actions: [
      { value: "reduce_load_or_volume", label: "Reduce load or volume slightly" },
      { value: "hold_and_monitor", label: "Hold the plan steady and keep monitoring" },
      { value: "insert_deload", label: "Insert an earlier deload" },
      { value: "flag_for_coach_review", label: "Flag it for the coach to look at" },
    ],
  }),
  scenarioQuestion({
    id: "scn_rpe_lower_than_expected",
    domain: "training",
    chapter: "training_adjustment",
    priority: 8,
    prompt: "RPE has been consistently lower than expected — the client seems to have more in the tank. What should OPTIM do?",
    actions: [
      { value: "increase_load", label: "Increase the working load" },
      { value: "increase_volume", label: "Add a working set" },
      { value: "hold_and_monitor", label: "Hold steady one more week to confirm the trend" },
    ],
  }),
  scenarioQuestion({
    id: "scn_rep_targets_missed",
    domain: "training",
    chapter: "training_adjustment",
    priority: 9,
    prompt: "The client is consistently missing prescribed rep targets. What should OPTIM do first?",
    actions: [
      { value: "reduce_load", label: "Reduce the prescribed load" },
      { value: "reduce_working_sets", label: "Reduce the number of working sets" },
      { value: "hold_and_monitor", label: "Hold and monitor one more session" },
      { value: "flag_for_coach_review", label: "Flag it for the coach to look at" },
    ],
  }),
  scenarioQuestion({
    id: "scn_rapid_progress",
    domain: "training",
    chapter: "training_adjustment",
    priority: 10,
    prompt: "A client is progressing noticeably faster than expected. What should OPTIM do?",
    actions: [
      { value: "accelerate_progression", label: "Accelerate the planned progression" },
      { value: "hold_and_monitor", label: "Hold the current plan and keep confirming the trend" },
      { value: "flag_for_coach_review", label: "Flag it for the coach to look at" },
    ],
  }),
  scenarioQuestion({
    id: "scn_plateau",
    domain: "training",
    chapter: "training_adjustment",
    priority: 11,
    prompt: "A client's performance has plateaued for several weeks. What should OPTIM try first?",
    actions: [
      { value: "vary_stimulus", label: "Vary the stimulus (rep range, exercise variation)" },
      { value: "insert_deload", label: "Insert a deload before pushing further" },
      { value: "increase_volume", label: "Increase volume" },
      { value: "flag_for_coach_review", label: "Flag it for the coach to look at" },
    ],
  }),
  scenarioQuestion({
    id: "scn_low_sleep",
    domain: "training",
    chapter: "training_adjustment",
    priority: 12,
    prompt: "The client reports unusually poor sleep this week. What should OPTIM do?",
    actions: [
      { value: "reduce_intensity_slightly", label: "Reduce intensity slightly for the week" },
      { value: "hold_plan", label: "Hold the plan as written" },
      { value: "ask_client_first", label: "Ask how they're feeling before changing anything" },
    ],
  }),
  scenarioQuestion({
    id: "scn_high_soreness",
    domain: "training",
    chapter: "training_adjustment",
    priority: 13,
    prompt: "A client reports unusually high soreness. What should OPTIM do?",
    actions: [
      { value: "reduce_volume_affected_muscle", label: "Reduce volume for the affected muscle group" },
      { value: "hold_plan", label: "Hold the plan as written — normal soreness" },
      { value: "flag_for_coach_review", label: "Flag it for the coach to look at" },
    ],
  }),
  scenarioQuestion({
    id: "scn_traveling",
    domain: "training",
    chapter: "training_adjustment",
    priority: 14,
    prompt: "A client is traveling with limited equipment access. What should OPTIM do?",
    actions: [
      { value: "swap_to_travel_friendly", label: "Swap to travel/bodyweight-friendly equivalents" },
      { value: "reduce_to_maintenance", label: "Reduce to a simple maintenance routine for the trip" },
      { value: "pause_and_resume", label: "Pause formal programming and resume after the trip" },
    ],
  }),
  scenarioQuestion({
    id: "scn_pain",
    domain: "training",
    chapter: "training_adjustment",
    priority: 15,
    prompt: "A client reports pain during a workout. Beyond OPTIM's built-in safety stop, what should happen next?",
    explanation: "This always escalates to you, regardless of your answer here — OPTIM's platform safety rules never depend on a coach's preference for this scenario.",
    actions: [
      { value: "stop_exercise_and_notify", label: "Stop that exercise and notify me" },
      { value: "stop_workout_and_notify", label: "Stop the whole workout and notify me" },
    ],
  }),
  scenarioQuestion({
    id: "scn_possible_injury",
    domain: "training",
    chapter: "training_adjustment",
    priority: 16,
    prompt: "A client reports something that sounds like a possible injury, not just soreness. Beyond OPTIM's built-in safety stop, what should happen next?",
    explanation: "This always escalates to you, regardless of your answer here.",
    actions: [
      { value: "pause_plan_and_escalate", label: "Pause their plan and notify me" },
      { value: "modify_and_escalate", label: "Modify around it and notify me" },
    ],
  }),
];

// ---------------------------------------------------------------------------
// Chapter 4 — How you coach nutrition
// ---------------------------------------------------------------------------

const NUTRITION_PHILOSOPHY_QUESTIONS: CoachOnboardingQuestionDef[] = [
  {
    id: "nutrition_offered",
    domain: "nutrition_philosophy",
    chapter: "nutrition_philosophy",
    prompt: "Do you coach nutrition as part of your service?",
    type: "boolean",
    required: true,
    priority: 0,
    modelFieldsAffected: ["nutritionPhilosophy.providesNutritionCoaching"],
  },
  {
    id: "nutrition_plan_vs_framework",
    domain: "nutrition_philosophy",
    chapter: "nutrition_philosophy",
    prompt: "Do you prefer rigid meal plans or a flexible framework?",
    type: "single_select",
    required: true,
    priority: 1,
    visibleIf: (a) => a.nutrition_offered === true,
    modelFieldsAffected: ["nutritionPhilosophy.planVsFrameworkPreference"],
    options: [
      { value: "structured_meal_plan", label: "Structured meal plan" },
      { value: "flexible_framework", label: "Flexible framework (targets, not fixed meals)" },
      { value: "hybrid", label: "A hybrid, depending on the client" },
    ],
  },
  {
    id: "nutrition_protein_target",
    domain: "nutrition_philosophy",
    chapter: "nutrition_philosophy",
    prompt: "What's your default protein target?",
    type: "single_select",
    required: true,
    priority: 2,
    visibleIf: (a) => a.nutrition_offered === true,
    modelFieldsAffected: ["nutritionPhilosophy.proteinTargetGramsPerLbBodyweight"],
    options: [
      { value: "0.7", label: "~0.7g per lb bodyweight" },
      { value: "0.8", label: "~0.8g per lb bodyweight" },
      { value: "1.0", label: "~1.0g per lb bodyweight" },
    ],
  },
  {
    id: "nutrition_food_quality",
    domain: "nutrition_philosophy",
    chapter: "nutrition_philosophy",
    prompt: "What matters most in food choices, beyond hitting numbers?",
    type: "multi_select",
    required: false,
    priority: 3,
    visibleIf: (a) => a.nutrition_offered === true,
    modelFieldsAffected: ["nutritionPhilosophy.foodQualityPriorities"],
    options: [
      { value: "whole_foods_majority", label: "Whole foods, most of the time" },
      { value: "adequate_protein", label: "Adequate protein at every meal" },
      { value: "fiber_and_micronutrients", label: "Fiber and micronutrient variety" },
      { value: "no_strict_rules", label: "No strict rules — flexibility matters most" },
    ],
  },
  {
    id: "nutrition_meal_frequency",
    domain: "nutrition_philosophy",
    chapter: "nutrition_philosophy",
    prompt: "What meal frequency do you typically recommend?",
    type: "single_select",
    required: true,
    priority: 4,
    visibleIf: (a) => a.nutrition_offered === true,
    modelFieldsAffected: ["nutritionPhilosophy.mealFrequencyPreference"],
    options: [
      { value: "2_3_meals", label: "2–3 larger meals" },
      { value: "3_4_meals", label: "3–4 meals" },
      { value: "5_plus_meals", label: "5+ smaller meals" },
      { value: "client_preference", label: "Whatever fits the client's life" },
    ],
  },
  {
    id: "nutrition_training_vs_rest_day",
    domain: "nutrition_philosophy",
    chapter: "nutrition_philosophy",
    prompt: "Do training-day and rest-day targets differ?",
    type: "single_select",
    required: true,
    priority: 5,
    visibleIf: (a) => a.nutrition_offered === true,
    modelFieldsAffected: ["nutritionPhilosophy.trainingDayVsRestDayStrategy"],
    options: [
      { value: "same_calories_shift_carbs", label: "Same calories, shift carbs around training" },
      { value: "higher_on_training_days", label: "Higher calories on training days" },
      { value: "identical_every_day", label: "Identical every day" },
    ],
  },
  {
    id: "nutrition_rate_of_loss",
    domain: "nutrition_philosophy",
    chapter: "nutrition_philosophy",
    prompt: "What weekly rate of loss do you typically target for fat loss?",
    type: "single_select",
    required: true,
    priority: 6,
    visibleIf: (a) => a.nutrition_offered === true,
    modelFieldsAffected: ["nutritionPhilosophy.rateOfLossPercentPerWeek"],
    options: [
      { value: "0.5", label: "~0.5% of bodyweight/week — conservative" },
      { value: "0.75", label: "~0.75% of bodyweight/week — moderate" },
      { value: "1", label: "~1% of bodyweight/week — aggressive" },
    ],
  },
  {
    id: "nutrition_recomposition_approach",
    domain: "nutrition_philosophy",
    chapter: "nutrition_philosophy",
    prompt: "How do you approach a body-recomposition goal (build muscle and lose fat together)?",
    type: "single_select",
    required: true,
    priority: 7,
    visibleIf: (a) => a.nutrition_offered === true,
    modelFieldsAffected: ["nutritionPhilosophy.recompositionApproach"],
    options: [
      { value: "small_deficit_high_protein_maintain_training_intensity", label: "Small deficit, high protein, maintain training intensity" },
      { value: "maintenance_calories_high_protein", label: "Maintenance calories, high protein, let recomposition happen slowly" },
      { value: "alternating_deficit_and_maintenance", label: "Alternate deficit and maintenance blocks" },
    ],
  },
  {
    id: "nutrition_progress_measurements",
    domain: "nutrition_philosophy",
    chapter: "nutrition_philosophy",
    prompt: "Which measurements do you actually use to judge nutrition progress?",
    type: "multi_select",
    required: true,
    priority: 8,
    visibleIf: (a) => a.nutrition_offered === true,
    modelFieldsAffected: ["nutritionPhilosophy.progressMeasurementsUsed"],
    options: [
      { value: "body_weight_trend", label: "Body-weight trend" },
      { value: "photos", label: "Progress photos" },
      { value: "measurements", label: "Body measurements" },
      { value: "performance", label: "Training performance" },
      { value: "how_clothes_fit", label: "How clothes fit" },
    ],
  },
  {
    id: "nutrition_condition_before_change",
    domain: "nutrition_philosophy",
    chapter: "nutrition_philosophy",
    prompt: "How much data do you want before changing a nutrition target?",
    type: "single_select",
    required: true,
    priority: 9,
    visibleIf: (a) => a.nutrition_offered === true,
    modelFieldsAffected: ["nutritionPhilosophy.conditionsRequiredBeforeChange"],
    options: [
      { value: "one_week", label: "One week of consistent data" },
      { value: "two_to_three_weeks_of_consistent_data", label: "2–3 weeks of consistent data" },
      { value: "four_plus_weeks", label: "4+ weeks of consistent data" },
    ],
  },
  {
    id: "nutrition_supplement_boundaries",
    domain: "nutrition_philosophy",
    chapter: "nutrition_philosophy",
    prompt: "What's your stance on supplements?",
    type: "single_select",
    required: false,
    priority: 10,
    visibleIf: (a) => a.nutrition_offered === true,
    modelFieldsAffected: ["nutritionPhilosophy.supplementBoundaries"],
    options: [
      { value: "food_first_basic_supplements_only", label: "Food first — only basics (protein, creatine)" },
      { value: "open_to_evidence_based_supplements", label: "Open to a broader evidence-based stack" },
      { value: "outside_my_scope", label: "Supplement advice is outside my scope" },
    ],
  },
];

// ---------------------------------------------------------------------------
// Chapter 5 — How you adjust nutrition (scenario-based)
// ---------------------------------------------------------------------------

const NUTRITION_ADJUSTMENT_QUESTIONS: CoachOnboardingQuestionDef[] = [
  scenarioQuestion({
    id: "scn_plateau_high_adherence",
    domain: "nutrition",
    chapter: "nutrition_adjustment",
    priority: 1,
    prompt: "Body weight has stalled but adherence has genuinely been high. What should OPTIM do?",
    actions: [
      { value: "reduce_calories_slightly", label: "Reduce calories slightly" },
      { value: "increase_activity_first", label: "Increase activity (steps/cardio) before cutting calories further" },
      { value: "hold_and_reassess", label: "Hold one more week and reassess" },
    ],
  }),
  scenarioQuestion({
    id: "scn_plateau_uncertain_adherence",
    domain: "nutrition",
    chapter: "nutrition_adjustment",
    priority: 2,
    prompt: "Body weight has stalled and adherence is uncertain. What should OPTIM do first?",
    actions: [
      { value: "review_logging_first", label: "Review logging accuracy/consistency before changing targets" },
      { value: "ask_client_directly", label: "Ask the client directly about adherence" },
      { value: "flag_for_coach_review", label: "Flag it for the coach to look at" },
    ],
  }),
  scenarioQuestion({
    id: "scn_weight_changing_too_fast",
    domain: "nutrition",
    chapter: "nutrition_adjustment",
    priority: 3,
    prompt: "Weight is changing faster than intended. What should OPTIM do?",
    actions: [
      { value: "adjust_calories_toward_target_rate", label: "Adjust calories back toward the target rate" },
      { value: "hold_and_monitor", label: "Hold and monitor one more week" },
      { value: "flag_for_coach_review", label: "Flag it for the coach to look at" },
    ],
  }),
  scenarioQuestion({
    id: "scn_excessive_hunger",
    domain: "nutrition",
    chapter: "nutrition_adjustment",
    priority: 4,
    prompt: "The client reports excessive hunger. What should OPTIM try first?",
    actions: [
      { value: "increase_protein_fiber_volume", label: "Increase protein/fiber and food volume within the same calories" },
      { value: "add_a_small_refeed", label: "Add a scheduled small refeed" },
      { value: "flag_for_coach_review", label: "Flag it for the coach to look at" },
    ],
  }),
  scenarioQuestion({
    id: "scn_training_performance_declining",
    domain: "nutrition",
    chapter: "nutrition_adjustment",
    priority: 5,
    prompt: "Training performance is declining and nutrition may be a factor. What should OPTIM do?",
    actions: [
      { value: "increase_calories_slightly", label: "Increase calories slightly" },
      { value: "prioritize_carbs_around_training", label: "Prioritize carbohydrate timing around training" },
      { value: "flag_for_coach_review", label: "Flag it for the coach to look at" },
    ],
  }),
  scenarioQuestion({
    id: "scn_repeated_macro_misses",
    domain: "nutrition",
    chapter: "nutrition_adjustment",
    priority: 6,
    prompt: "The client repeatedly misses macro targets. What should OPTIM do first?",
    actions: [
      { value: "simplify_the_targets", label: "Simplify the targets or structure" },
      { value: "reduce_meal_frequency_requirement", label: "Reduce the number of tracked meals" },
      { value: "flag_for_coach_review", label: "Flag it for the coach to look at" },
    ],
  }),
  scenarioQuestion({
    id: "scn_social_meal",
    domain: "nutrition",
    chapter: "nutrition_adjustment",
    priority: 7,
    prompt: "The client has a planned social meal. What should OPTIM do?",
    actions: [
      { value: "adjust_surrounding_meals", label: "Help adjust surrounding meals to fit it in" },
      { value: "treat_as_a_free_pass", label: "Treat it as a guilt-free exception, no adjustment" },
      { value: "no_change_needed", label: "No change needed either way" },
    ],
  }),
  scenarioQuestion({
    id: "scn_traveling_nutrition",
    domain: "nutrition",
    chapter: "nutrition_adjustment",
    priority: 8,
    prompt: "The client is traveling and can't follow their normal structure. What should OPTIM do?",
    actions: [
      { value: "simplify_to_protein_and_calorie_ballpark", label: "Simplify to a protein target and a calorie ballpark" },
      { value: "pause_tracking_for_the_trip", label: "Pause formal tracking for the trip" },
      { value: "hold_normal_targets", label: "Hold the normal targets as a goal, best-effort" },
    ],
  }),
  scenarioQuestion({
    id: "scn_digestive_problems",
    domain: "nutrition",
    chapter: "nutrition_adjustment",
    priority: 9,
    prompt: "The client reports digestive problems. What should OPTIM do?",
    actions: [
      { value: "suggest_reviewing_common_triggers", label: "Suggest reviewing common trigger foods" },
      { value: "flag_for_coach_review", label: "Flag it for the coach to look at" },
      { value: "recommend_professional_if_persistent", label: "Recommend a professional if it persists" },
    ],
  }),
  scenarioQuestion({
    id: "scn_extreme_request",
    domain: "nutrition",
    chapter: "nutrition_adjustment",
    priority: 10,
    prompt: "The client asks for an extreme deficit or surplus. What should OPTIM do?",
    actions: [
      { value: "explain_and_recommend_moderate_target", label: "Explain the risk and recommend a moderate target instead" },
      { value: "flag_for_coach_review", label: "Flag it for the coach to look at" },
    ],
  }),
];

// ---------------------------------------------------------------------------
// Chapter 6 — How you communicate
// ---------------------------------------------------------------------------

const COMMUNICATION_QUESTIONS: CoachOnboardingQuestionDef[] = [
  {
    id: "comm_missed_workout_reply",
    domain: "communication",
    chapter: "communication",
    prompt: "A client misses their second workout this week without saying anything. Which response sounds most like you?",
    type: "single_select",
    required: true,
    priority: 1,
    modelFieldsAffected: ["communication.tone", "communication.directness", "communication.warmth", "communication.missedWorkoutFollowUp"],
    options: [
      { value: "direct_concise", label: "“Noticed you missed leg day and yesterday's session — what's going on? Let's get back on track today.”", description: "Direct, concise, action-first" },
      { value: "warm_curious", label: "“Hey! Haven't seen you log the last couple sessions — everything okay? No judgment, just checking in.”", description: "Warm, curious, low-pressure" },
      { value: "explain_reasoning", label: "“Missing back-to-back sessions this week will push your progress back — let's figure out what happened and adjust the rest of the week.”", description: "Explains the stakes, then acts" },
      { value: "highly_accountable", label: "“That's twice this week now. I need you to check in with me before you skip a third.”", description: "High accountability, firm" },
    ],
  },
  {
    id: "comm_directness",
    domain: "communication",
    chapter: "communication",
    prompt: "How direct are you, in general?",
    type: "slider",
    required: true,
    priority: 2,
    min: 1,
    max: 5,
    modelFieldsAffected: ["communication.directness"],
  },
  {
    id: "comm_warmth",
    domain: "communication",
    chapter: "communication",
    prompt: "How warm/personal is your typical tone?",
    type: "slider",
    required: true,
    priority: 3,
    min: 1,
    max: 5,
    modelFieldsAffected: ["communication.warmth"],
  },
  {
    id: "comm_accountability",
    domain: "communication",
    chapter: "communication",
    prompt: "How much accountability pressure do you typically apply?",
    type: "slider",
    required: true,
    priority: 4,
    min: 1,
    max: 5,
    modelFieldsAffected: ["communication.accountabilityLevel"],
  },
  {
    id: "comm_message_length",
    domain: "communication",
    chapter: "communication",
    prompt: "How long are your typical client messages?",
    type: "single_select",
    required: true,
    priority: 5,
    modelFieldsAffected: ["communication.messageLength", "communication.conciseness"],
    options: [
      { value: "short", label: "Short — a sentence or two" },
      { value: "medium", label: "Medium — a short paragraph" },
      { value: "long", label: "Long — I like to fully explain" },
    ],
  },
  {
    id: "comm_humor",
    domain: "communication",
    chapter: "communication",
    prompt: "Do you use humor with clients?",
    type: "boolean",
    required: true,
    priority: 6,
    modelFieldsAffected: ["communication.usesHumor"],
  },
  {
    id: "comm_technical_language",
    domain: "communication",
    chapter: "communication",
    prompt: "How technical is your language with clients, by default?",
    type: "single_select",
    required: true,
    priority: 7,
    modelFieldsAffected: ["communication.technicalLanguageLevel"],
    options: [
      { value: "plain", label: "Plain — I avoid jargon" },
      { value: "moderate", label: "Moderate — I explain terms as I use them" },
      { value: "technical", label: "Technical — most of my clients know the terminology" },
    ],
  },
  {
    id: "comm_checkin_cadence",
    domain: "communication",
    chapter: "communication",
    prompt: "How often do you check in with an active client?",
    type: "single_select",
    required: true,
    priority: 8,
    modelFieldsAffected: ["communication.checkInCadence"],
    options: [
      { value: "daily", label: "Daily" },
      { value: "weekly", label: "Weekly" },
      { value: "biweekly", label: "Every other week" },
      { value: "monthly", label: "Monthly" },
    ],
  },
  {
    id: "comm_morning_message",
    domain: "communication",
    chapter: "communication",
    prompt: "Do you want OPTIM to send a morning message on training days?",
    type: "boolean",
    required: true,
    priority: 9,
    modelFieldsAffected: ["communication.morningMessageEnabled"],
  },
  {
    id: "comm_workout_reminder",
    domain: "communication",
    chapter: "communication",
    prompt: "Should OPTIM send a reminder before a scheduled workout?",
    type: "boolean",
    required: true,
    priority: 10,
    modelFieldsAffected: ["communication.workoutReminderEnabled"],
  },
  {
    id: "comm_quiet_hours",
    domain: "communication",
    chapter: "communication",
    prompt: "What are your quiet hours — no client-facing messages sent?",
    type: "single_select",
    required: true,
    priority: 11,
    modelFieldsAffected: ["communication.quietHoursStart", "communication.quietHoursEnd"],
    options: [
      { value: "9pm_7am", label: "9:00 PM – 7:00 AM" },
      { value: "8pm_8am", label: "8:00 PM – 8:00 AM" },
      { value: "10pm_6am", label: "10:00 PM – 6:00 AM" },
    ],
  },
  {
    id: "comm_ai_direct_response",
    domain: "communication",
    chapter: "communication",
    prompt: "Which client messages can OPTIM answer directly, with no draft review?",
    type: "multi_select",
    required: true,
    priority: 12,
    modelFieldsAffected: ["communication.aiMayRespondDirectly"],
    options: [
      { value: "routine_logistics", label: "Routine logistics (“what time is my session”)" },
      { value: "how_to_log_a_meal", label: "How to log something" },
      { value: "exercise_how_to", label: "How to perform an exercise" },
      { value: "none", label: "None — I want to see everything first" },
    ],
  },
  {
    id: "comm_must_respond_personally",
    domain: "communication",
    chapter: "communication",
    prompt: "Which situations do you always want to respond to personally?",
    type: "multi_select",
    required: true,
    priority: 13,
    modelFieldsAffected: ["communication.coachMustRespondPersonally"],
    options: [
      { value: "pain_or_injury_report", label: "Any pain or injury report" },
      { value: "emotional_distress", label: "Emotional distress" },
      { value: "billing_or_account", label: "Billing or account questions" },
      { value: "major_goal_change_request", label: "A major goal-change request" },
    ],
  },
  {
    id: "comm_avoided_phrases",
    domain: "communication",
    chapter: "communication",
    prompt: "Any phrases, tones, or approaches you never want OPTIM to use on your behalf?",
    type: "text",
    required: false,
    priority: 14,
    modelFieldsAffected: ["communication.avoidedPhrasesOrTones"],
  },
];

// ---------------------------------------------------------------------------
// Chapter 7 — Safety and non-negotiables
// ---------------------------------------------------------------------------

const SAFETY_QUESTIONS: CoachOnboardingQuestionDef[] = [
  {
    id: "safety_pain_response",
    domain: "safety",
    chapter: "safety",
    prompt: "A client reports pain during a workout. What should happen?",
    type: "single_select",
    required: true,
    priority: 1,
    modelFieldsAffected: ["safety.painResponsePolicy", "safety.stopExerciseConditions"],
    options: [
      { value: "stop_exercise_and_notify", label: "Stop that exercise and notify me immediately" },
      { value: "stop_workout_and_notify", label: "Stop the entire workout and notify me immediately" },
      { value: "modify_and_notify", label: "Modify safely and notify me — don't necessarily stop" },
    ],
  },
  {
    id: "safety_possible_injury",
    domain: "safety",
    chapter: "safety",
    prompt: "A client reports something that sounds like a possible injury, not just soreness. What should happen?",
    type: "single_select",
    required: true,
    priority: 2,
    modelFieldsAffected: ["safety.injuryResponsePolicy", "safety.pausePlanConditions"],
    options: [
      { value: "pause_plan_and_escalate", label: "Pause their plan and escalate to me immediately" },
      { value: "modify_and_escalate", label: "Modify around it and escalate to me for review" },
    ],
  },
  {
    id: "safety_extreme_nutrition_request",
    domain: "safety",
    chapter: "safety",
    prompt: "A client requests an extreme calorie deficit/surplus, or shows signs of disordered eating. What should happen?",
    type: "single_select",
    required: true,
    priority: 3,
    modelFieldsAffected: ["safety.disorderedEatingEscalation", "safety.extremeNutritionRequestPolicy"],
    options: [
      { value: "escalate_immediately_pause_automation", label: "Escalate to me immediately and pause nutrition automation" },
      { value: "escalate_but_continue", label: "Escalate to me, but keep the current plan running" },
    ],
  },
  {
    id: "safety_mental_health",
    domain: "safety",
    chapter: "safety",
    prompt: "A client expresses something that sounds like a mental-health concern. What should happen?",
    type: "single_select",
    required: true,
    priority: 4,
    modelFieldsAffected: ["safety.mentalHealthEscalation"],
    options: [
      { value: "escalate_immediately", label: "Escalate to me immediately, every time" },
    ],
  },
  {
    id: "safety_out_of_scope",
    domain: "safety",
    chapter: "safety",
    prompt: "A client asks a medical or clinical question outside your scope. What should OPTIM do?",
    type: "single_select",
    required: true,
    priority: 5,
    modelFieldsAffected: ["safety.outOfScopeHandling"],
    options: [
      { value: "acknowledge_and_redirect_to_appropriate_professional", label: "Acknowledge it and recommend a relevant professional" },
      { value: "escalate_to_coach_first", label: "Escalate to me before responding at all" },
    ],
  },
  {
    id: "safety_absolute_rules",
    domain: "safety",
    chapter: "safety",
    prompt: "Any absolute rules of your own that should override everything else, no exceptions?",
    explanation: "These are added on top of OPTIM's own platform safety rules — they can only make things stricter, never looser.",
    type: "text",
    required: false,
    priority: 6,
    modelFieldsAffected: ["safety.absoluteOverrideRules"],
  },
];

// ---------------------------------------------------------------------------
// All chapters combined
// ---------------------------------------------------------------------------

export const COACH_ONBOARDING_QUESTIONS: CoachOnboardingQuestionDef[] = [
  ...PRACTICE_QUESTIONS,
  ...PROGRAM_ARCHITECTURE_QUESTIONS,
  ...TRAINING_ADJUSTMENT_QUESTIONS,
  ...NUTRITION_PHILOSOPHY_QUESTIONS,
  ...NUTRITION_ADJUSTMENT_QUESTIONS,
  ...COMMUNICATION_QUESTIONS,
  ...SAFETY_QUESTIONS,
];

export function questionsForChapter(chapter: CoachOnboardingChapterId): CoachOnboardingQuestionDef[] {
  return COACH_ONBOARDING_QUESTIONS.filter((q) => q.chapter === chapter).sort((a, b) => a.priority - b.priority);
}

export function findQuestion(id: string): CoachOnboardingQuestionDef | undefined {
  return COACH_ONBOARDING_QUESTIONS.find((q) => q.id === id);
}

/** A question counts as visible right now given the coach's answers so far
 * — mirrors lib/coach/onboarding-steps.ts's visibleFieldsForStep. */
export function isQuestionVisible(question: CoachOnboardingQuestionDef, answers: CoachOnboardingAnswers): boolean {
  return !question.visibleIf || question.visibleIf(answers);
}

export function visibleQuestionsForChapter(chapter: CoachOnboardingChapterId, answers: CoachOnboardingAnswers): CoachOnboardingQuestionDef[] {
  return questionsForChapter(chapter).filter((q) => isQuestionVisible(q, answers));
}

/** Whether an entire chapter should be skipped outright given prior answers
 * — the phase brief's adaptive-branching examples ("a coach who doesn't
 * provide nutrition coaching shouldn't see the entire nutrition
 * questionnaire"). Distinct from a single question's visibleIf: this
 * removes the chapter from the coach's progress count entirely rather than
 * rendering an empty screen. */
export function chapterApplies(chapter: CoachOnboardingChapterId, answers: CoachOnboardingAnswers): boolean {
  if (chapter === "nutrition_philosophy" || chapter === "nutrition_adjustment") {
    return answers.nutrition_offered !== false;
  }
  return true;
}

export const ALL_CHAPTER_IDS_IN_ORDER: CoachOnboardingChapterId[] = COACH_ONBOARDING_CHAPTERS.map((c) => c.id);

export { PRACTICE_QUESTIONS, PROGRAM_ARCHITECTURE_QUESTIONS, TRAINING_ADJUSTMENT_QUESTIONS, NUTRITION_PHILOSOPHY_QUESTIONS, NUTRITION_ADJUSTMENT_QUESTIONS, COMMUNICATION_QUESTIONS, SAFETY_QUESTIONS };
