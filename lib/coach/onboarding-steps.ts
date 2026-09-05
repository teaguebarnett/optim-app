// Phase 5.3A — the client onboarding field/pacing framework.
//
// This file holds three things:
//   1. The generic field/step/moment framework (types + pure helpers) —
//      still fully data-driven; no component ever branches on which
//      chapter or field it's rendering.
//   2. ONBOARDING_STEPS — the live six-chapter flow every new client
//      actually answers, each chapter internally paced into "moments"
//      (see OnboardingStepDef.moments) so a chapter with several related
//      decisions never renders as one tall wall of controls, without
//      inflating the top-level "X of 6" chapter count a client sees.
//   3. LEGACY_V51_STEPS — Phase 5.1's full nine-section field definitions,
//      kept ONLY so components/coach/coach-brief.tsx can still resolve a
//      field's label/options when rendering an already-completed Phase
//      5.1 record. No live step, no new client, and no code path other
//      than that lookup ever reads this constant again.
//
// Minimum age (Phase 5.3A): raised from 13 to 17, enforced in three
// independent places so it can never be bypassed one way while still
// getting through another — the wheel's own min (UI), isValidOnboardingAge
// (a pure guard usable anywhere), and lib/coach/platform-store.ts's
// SAVE_ONBOARDING_STEP case (server-of-record clamp against direct state
// manipulation).

import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Backpack,
  Bone,
  BriefcaseMedical,
  Building2,
  Calendar,
  CalendarClock,
  CalendarRange,
  Check,
  Clock3,
  Dumbbell,
  Flame,
  Footprints,
  HeartPulse,
  Home,
  MessageCircleHeart,
  Moon,
  MoreHorizontal,
  Ruler,
  Salad,
  Scale,
  ShieldAlert,
  Sparkles,
  Stethoscope,
  Sun,
  Sunrise,
  Sunset,
  Target,
  Timer,
  TrendingDown,
  TrendingUp,
  UserRound,
  Users2,
} from "lucide-react";

export type OnboardingFieldType =
  | "text"
  | "textarea"
  | "number_wheel"
  | "boolean"
  | "single_select"
  | "multi_select"
  | "day_selector"
  | "height_feet_inches"
  | "timezone_confirm"
  | "injury_list";

export interface OnboardingFieldOption {
  value: string;
  label: string;
  /** Anchored-choice description shown under the label — replaces an
   * unexplained numeric scale wherever one might otherwise be tempting. */
  description?: string;
  /** One consistent icon family (lucide-react) throughout — never emoji,
   * never a second icon set. Optional: a handful of fields (free text,
   * booleans) don't need per-option icons at all. */
  icon?: LucideIcon;
}

export interface OnboardingFieldDef {
  key: string;
  label: string;
  type: OnboardingFieldType;
  required: boolean;
  placeholder?: string;
  /** "Why we ask" microcopy — used only for sensitive or non-obvious
   * questions. */
  helpText?: string;
  options?: OnboardingFieldOption[];
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  /** multi_select only: caps how many options can be active at once — e.g.
   * "choose up to two". Once reached, unselected tiles clearly communicate
   * (via disabled state + reason) why they can't be added, while an
   * already-selected tile can always be deselected — see
   * isMultiSelectOptionDisabled. */
  maxSelections?: number;
  /** multi_select only: a "catch-all" value (e.g. "Varies", "None of these
   * apply") that's mutually exclusive with every other option — selecting
   * it clears everything else; selecting anything else clears it. Never
   * counts toward maxSelections. See toggleMultiSelectValue. */
  exclusiveValue?: string;
  /** multi_select/single_select only: when set, any option whose value
   * equals the named sibling field's CURRENT answer is filtered out of
   * what's selectable — e.g. secondary goals can never redundantly repeat
   * the already-chosen primary goal. See optionsForField, and
   * applyStepFieldUpdate's matching clear-on-change behavior. */
  excludeValueOfField?: string;
  /** A short sub-heading rendered once, immediately above this field, any
   * time it differs from the previous visible field's sectionLabel. */
  sectionLabel?: string;
  /** One consistent icon shown beside this field's own label — helps a
   * client scan a moment's questions at a glance. */
  icon?: LucideIcon;
  /** Real conditional logic: a field is only ever rendered, required, or
   * persisted-as-visible when this returns true for the step's current
   * answers. Absent means always visible. */
  visibleIf?: (answers: OnboardingStepAnswers) => boolean;
}

export interface OnboardingStepDef {
  id: OnboardingStepId;
  /** Short chapter name shown in the progress header, e.g. "About you" —
   * paired with "1 of 6", never "Step 1 of 9 · 0%". */
  section: string;
  title: string;
  description: string;
  fields: OnboardingFieldDef[];
  /** Optional internal pacing moments — groups of field KEYS shown as
   * separate screens WITHIN this one top-level chapter (adaptive pacing:
   * an important decision gets its own moment; closely-related low-effort
   * fields share one). The top-level "X of 6" progress a client sees never
   * changes because of this — see OnboardingWizard's moment navigation and
   * its own small, restrained "•••" sub-indicator. Every field key must
   * appear in exactly one moment — verified by
   * lib/coach/verify-onboarding-intake.mts, not the type system. Absent
   * means the whole chapter renders as one screen (a short chapter like
   * "Review" needs no moments at all). */
  moments?: string[][];
}

import type { OnboardingAnswerValue, OnboardingStepAnswers, OnboardingStepId } from "./types";

export const MIN_ONBOARDING_AGE = 17;
export const MAX_ONBOARDING_AGE = 90;

const DAYS_OF_WEEK: OnboardingFieldOption[] = [
  { value: "mon", label: "Mon" },
  { value: "tue", label: "Tue" },
  { value: "wed", label: "Wed" },
  { value: "thu", label: "Thu" },
  { value: "fri", label: "Fri" },
  { value: "sat", label: "Sat" },
  { value: "sun", label: "Sun" },
];

const GOAL_BODY_RECOMPOSITION = "body_recomposition";
const GOAL_BUILD_MUSCLE = "build_muscle";
const GOAL_LOSE_FAT = "lose_fat";
const GOAL_GET_STRONGER = "get_stronger";
const GOAL_ATHLETIC_PERFORMANCE = "athletic_performance";
const GOAL_HEALTH_CONSISTENCY = "health_consistency";
const GOAL_SOMETHING_ELSE = "something_else";

/** Every real, choosable goal — "something else" is deliberately excluded
 * here since it can never be a truthful *secondary* priority (it's a
 * catch-all for the primary slot only). Shared by primaryGoal's own options
 * and secondaryGoals' selectable list (see excludeValueOfField, which
 * additionally removes whichever one is currently the primary goal). */
const GOAL_OPTIONS: OnboardingFieldOption[] = [
  { value: GOAL_BODY_RECOMPOSITION, label: "Body recomposition", description: "Build muscle and lose fat at the same time", icon: Sparkles },
  { value: GOAL_BUILD_MUSCLE, label: "Build muscle", icon: Dumbbell },
  { value: GOAL_LOSE_FAT, label: "Lose body fat", icon: Flame },
  { value: GOAL_GET_STRONGER, label: "Get stronger", icon: TrendingUp },
  { value: GOAL_ATHLETIC_PERFORMANCE, label: "Improve athletic performance", icon: Activity },
  { value: GOAL_HEALTH_CONSISTENCY, label: "Improve health and consistency", icon: HeartPulse },
];

// ---------------------------------------------------------------------------
// Live flow — six chapters + Review
// ---------------------------------------------------------------------------

export const ONBOARDING_STEPS: OnboardingStepDef[] = [
  // -----------------------------------------------------------------------
  // 1. About you
  // -----------------------------------------------------------------------
  {
    id: "about_you",
    section: "About you",
    title: "A little about you",
    description: "The essentials — nothing you already told us at invite.",
    // Phase 5.3C — one real decision per moment. Each wheel/choice is its
    // own screen; timeZone+sex are the one allowed exception (a confirm-
    // and-an-optional-afterthought pairing, not two independent decisions).
    moments: [["age"], ["heightFeetInches"], ["weightLb"], ["weightDirection"], ["timeZone", "sex"]],
    fields: [
      { key: "age", label: "Age", type: "number_wheel", required: true, min: MIN_ONBOARDING_AGE, max: MAX_ONBOARDING_AGE, step: 1, unit: "yrs", icon: UserRound },
      { key: "heightFeetInches", label: "Height", type: "height_feet_inches", required: true, icon: Ruler },
      { key: "weightLb", label: "Current weight", type: "number_wheel", required: true, min: 80, max: 400, step: 1, unit: "lb", icon: Scale },
      {
        key: "weightDirection",
        label: "Recent weight direction",
        type: "single_select",
        required: true,
        icon: TrendingUp,
        options: [
          { value: "stable", label: "Stable", icon: Check },
          { value: "trending_up", label: "Trending up", icon: TrendingUp },
          { value: "trending_down", label: "Trending down", icon: TrendingDown },
          { value: "unsure", label: "Unsure" },
        ],
      },
      { key: "timeZone", label: "Time zone", type: "timezone_confirm", required: true, icon: Clock3 },
      {
        key: "sex",
        label: "Sex",
        type: "single_select",
        required: false,
        sectionLabel: "Optional",
        helpText: "Used only for physiological/energy-estimation context — never required.",
        options: [
          { value: "female", label: "Female" },
          { value: "male", label: "Male" },
          { value: "prefer_not_to_say", label: "Prefer not to say" },
        ],
      },
    ],
  },

  // -----------------------------------------------------------------------
  // 2. What you want
  // -----------------------------------------------------------------------
  {
    id: "what_you_want",
    section: "What you want",
    title: "What you want",
    description: "One clear picture of what you're working toward.",
    // primaryGoalOther only ever renders alongside secondaryGoals for the
    // rare "something else" answer (visibleFieldsForStep already hides it
    // otherwise) — every other independent fact gets its own screen.
    // eventOrDeadline/targetWeight stay paired: both are optional "any
    // extra detail?" facts, and targetWeight alone would sometimes be a
    // blank moment (it's hidden for every goal except build-muscle/lose-fat).
    moments: [["primaryGoal"], ["primaryGoalOther", "secondaryGoals"], ["successDefinition"], ["eventOrDeadline", "targetWeight"]],
    fields: [
      {
        key: "primaryGoal",
        label: "Primary goal",
        type: "single_select",
        required: true,
        icon: Target,
        options: [...GOAL_OPTIONS, { value: GOAL_SOMETHING_ELSE, label: "Something else", icon: MoreHorizontal }],
      },
      {
        key: "primaryGoalOther",
        label: "Tell us more about your goal",
        type: "text",
        required: true,
        visibleIf: (a) => a.primaryGoal === GOAL_SOMETHING_ELSE,
      },
      {
        key: "secondaryGoals",
        label: "Any secondary priorities? (choose up to two, optional)",
        type: "multi_select",
        required: false,
        maxSelections: 2,
        excludeValueOfField: "primaryGoal",
        icon: Target,
        options: GOAL_OPTIONS,
      },
      {
        key: "successDefinition",
        label: "What would make this coaching feel successful to you?",
        type: "textarea",
        required: true,
      },
      {
        key: "eventOrDeadline",
        label: "Event or deadline (optional)",
        type: "text",
        required: false,
        placeholder: "e.g. wedding in June — leave blank if none",
        icon: CalendarRange,
      },
      {
        key: "targetWeight",
        label: "Target weight (optional)",
        type: "number_wheel",
        required: false,
        min: 80,
        max: 400,
        step: 1,
        unit: "lb",
        icon: Scale,
        visibleIf: (a) => a.primaryGoal === GOAL_BUILD_MUSCLE || a.primaryGoal === GOAL_LOSE_FAT,
      },
    ],
  },

  // -----------------------------------------------------------------------
  // 3. Your real week
  // -----------------------------------------------------------------------
  {
    id: "your_week",
    section: "Your real week",
    title: "Your real week",
    description: "So your plan fits your real life, not an ideal one.",
    // Phase 5.3C — none of these six are conditional on each other, so each
    // gets its own real decision screen.
    moments: [["availableDays"], ["maxSessionLength"], ["preferredTrainingTime"], ["schedulePredictability"], ["trainingEnvironment"], ["scheduleContext"]],
    fields: [
      { key: "availableDays", label: "Days available to train", type: "day_selector", required: true, options: DAYS_OF_WEEK, icon: Calendar },
      {
        key: "maxSessionLength",
        label: "Maximum realistic session length",
        type: "single_select",
        required: true,
        icon: Timer,
        options: [
          { value: "30", label: "30 min" },
          { value: "45", label: "45 min" },
          { value: "60", label: "60 min" },
          { value: "75", label: "75 min" },
          { value: "90", label: "90 min" },
          { value: "90_plus", label: "90+ min" },
        ],
      },
      {
        key: "preferredTrainingTime",
        label: "Normal training window (choose any that apply)",
        type: "multi_select",
        required: true,
        exclusiveValue: "varies",
        icon: Sun,
        options: [
          { value: "morning", label: "Morning", icon: Sunrise },
          { value: "midday", label: "Midday", icon: Sun },
          { value: "afternoon", label: "Afternoon", icon: Sun },
          { value: "evening", label: "Evening", icon: Sunset },
          { value: "varies", label: "Varies" },
        ],
      },
      {
        key: "schedulePredictability",
        label: "Schedule pattern",
        type: "single_select",
        required: true,
        icon: CalendarClock,
        options: [
          { value: "mostly_predictable", label: "Mostly predictable" },
          { value: "changes_weekly", label: "Changes week to week" },
          { value: "shift_or_travel", label: "Shift-based or frequent travel" },
        ],
      },
      {
        key: "trainingEnvironment",
        label: "Training environment (choose any that apply)",
        type: "multi_select",
        required: true,
        icon: Building2,
        options: [
          { value: "commercial_gym", label: "Commercial gym", icon: Building2 },
          { value: "private_gym", label: "Private gym", icon: Building2 },
          { value: "home_gym", label: "Home gym", icon: Home },
          { value: "limited_equipment", label: "Limited equipment", icon: Backpack },
          { value: "multiple_locations", label: "Multiple locations", icon: Building2 },
        ],
      },
      {
        key: "scheduleContext",
        label: "Anything about your schedule, gym, or equipment your coach should plan around? (optional)",
        type: "textarea",
        required: false,
      },
    ],
  },

  // -----------------------------------------------------------------------
  // 4. Your starting point
  // -----------------------------------------------------------------------
  {
    id: "starting_point",
    section: "Starting point",
    title: "Your starting point",
    description: "Meeting you exactly where you are.",
    moments: [["trainingExperience"], ["recentConsistency"], ["weeklyFrequency"], ["trainingNotes"]],
    fields: [
      {
        key: "trainingExperience",
        label: "Training experience",
        type: "single_select",
        required: true,
        icon: Dumbbell,
        options: [
          { value: "new", label: "New to structured training" },
          { value: "learning_fundamentals", label: "Learning the fundamentals" },
          { value: "comfortable_common", label: "Comfortable with common movements" },
          { value: "experienced_consistent", label: "Experienced and consistent" },
        ],
      },
      {
        key: "recentConsistency",
        label: "Recent training consistency",
        type: "single_select",
        required: true,
        icon: Activity,
        options: [
          { value: "not_recently", label: "Not training recently" },
          { value: "inconsistent", label: "Inconsistent" },
          { value: "fairly_consistent", label: "Fairly consistent" },
          { value: "very_consistent", label: "Very consistent" },
        ],
      },
      {
        key: "weeklyFrequency",
        label: "Recent weekly training frequency",
        type: "number_wheel",
        required: true,
        min: 0,
        max: 7,
        step: 1,
        unit: "days",
        icon: Calendar,
      },
      {
        key: "trainingNotes",
        label: "Anything you love, dislike, or cannot currently do in training? (optional)",
        type: "textarea",
        required: false,
      },
    ],
  },

  // -----------------------------------------------------------------------
  // 5. Fuel, recovery, and consistency
  // -----------------------------------------------------------------------
  {
    id: "fuel_recovery",
    section: "Fuel & recovery",
    title: "Fuel, recovery, and consistency",
    description: "The real things that make a plan work or fall apart.",
    // hasDietaryRestrictions + its conditional detail field stay paired
    // (parent question + its own immediate follow-up, not two independent
    // decisions) — everything else here is unconditional and independent.
    moments: [
      ["nutritionApproach"],
      ["hasDietaryRestrictions", "dietaryRestrictionsDetail"],
      ["typicalSleep"],
      ["consistencyObstacles"],
      ["coachSupportStyle"],
    ],
    fields: [
      {
        key: "nutritionApproach",
        label: "Current nutrition approach",
        type: "single_select",
        required: true,
        icon: Salad,
        options: [
          { value: "no_structure", label: "No real structure" },
          { value: "mostly_intuitive", label: "Mostly intuitive" },
          { value: "general_habits", label: "General habits or a meal plan" },
          { value: "tracking", label: "Tracking calories or macros" },
        ],
      },
      {
        key: "hasDietaryRestrictions",
        label: "Food allergies, intolerances, or firm dietary restrictions?",
        type: "single_select",
        required: true,
        options: [
          { value: "none", label: "None", icon: Check },
          { value: "yes", label: "Yes — I'll list them" },
        ],
      },
      {
        key: "dietaryRestrictionsDetail",
        label: "List them",
        type: "text",
        required: true,
        visibleIf: (a) => a.hasDietaryRestrictions === "yes",
      },
      {
        key: "typicalSleep",
        label: "Typical sleep",
        type: "single_select",
        required: true,
        icon: Moon,
        options: [
          { value: "under_6", label: "Under 6 hours" },
          { value: "6_7", label: "6–7 hours" },
          { value: "7_8", label: "7–8 hours" },
          { value: "more_than_8", label: "More than 8 hours" },
        ],
      },
      {
        key: "consistencyObstacles",
        label: "What most often gets in the way of consistency? (choose up to two)",
        type: "multi_select",
        required: true,
        maxSelections: 2,
        icon: ShieldAlert,
        options: [
          { value: "schedule", label: "Schedule", icon: CalendarClock },
          { value: "stress", label: "Stress or mental load", icon: MessageCircleHeart },
          { value: "sleep", label: "Sleep", icon: Moon },
          { value: "appetite", label: "Appetite or cravings", icon: Salad },
          { value: "meal_prep", label: "Meal preparation", icon: Salad },
          { value: "social", label: "Social events or travel", icon: Backpack },
          { value: "motivation", label: "Motivation", icon: Flame },
          { value: "pain", label: "Pain or physical limitations", icon: HeartPulse },
          { value: "not_sure", label: "I'm not sure yet" },
        ],
      },
      {
        key: "coachSupportStyle",
        label: "How should your coach support you? (choose up to two)",
        type: "multi_select",
        required: true,
        maxSelections: 2,
        icon: Users2,
        options: [
          { value: "direct", label: "Direct and straightforward" },
          { value: "encouraging", label: "Encouraging but honest" },
          { value: "explain", label: "Explain the reasoning" },
          { value: "accountable", label: "Keep me highly accountable" },
          { value: "balanced", label: "A balanced approach" },
        ],
      },
    ],
  },

  // -----------------------------------------------------------------------
  // 6. Health and finish
  // -----------------------------------------------------------------------
  {
    id: "health_finish",
    section: "Health",
    title: "Health and readiness",
    description: "Quick, respectful, and it goes straight to your coach.",
    // Phase 5.3C — each real decision in the injury cascade gets its own
    // unhurried screen (matching the spec's own "interactive body-area
    // selection" example); injuryBodyAreaOther stays paired with
    // injuryBodyAreas as its one immediate conditional follow-up, the same
    // parent+detail exception used for dietary restrictions above.
    moments: [
      ["hasInjuryHistory"],
      ["injuryBodyAreas", "injuryBodyAreaOther"],
      ["injuryAggravatingFactors"],
      ["injuryRestrictions"],
      ["injuryWorkingWithProfessional"],
      ["safetyScreen"],
    ],
    fields: [
      {
        key: "hasInjuryHistory",
        label: "Are you currently dealing with pain, an injury, or a physical limitation that could affect training?",
        type: "boolean",
        required: true,
        icon: HeartPulse,
        helpText: "This helps your coach keep you training safely — it's never a diagnosis, and it doesn't stop you from getting started.",
      },
      {
        key: "injuryBodyAreas",
        label: "Where? (choose any that apply)",
        type: "multi_select",
        required: true,
        icon: Bone,
        visibleIf: (a) => a.hasInjuryHistory === true,
        options: [
          { value: "shoulder", label: "Shoulder" },
          { value: "upper_back", label: "Upper back" },
          { value: "lower_back", label: "Lower back" },
          { value: "hip", label: "Hip" },
          { value: "knee", label: "Knee" },
          { value: "ankle_foot", label: "Ankle or foot" },
          { value: "wrist_elbow", label: "Wrist or elbow" },
          { value: "neck", label: "Neck" },
          { value: "other", label: "Other" },
        ],
      },
      {
        key: "injuryBodyAreaOther",
        label: "Where, specifically?",
        type: "text",
        required: true,
        visibleIf: (a) => a.hasInjuryHistory === true && Array.isArray(a.injuryBodyAreas) && (a.injuryBodyAreas as string[]).includes("other"),
      },
      {
        key: "injuryAggravatingFactors",
        label: "What currently aggravates it?",
        type: "text",
        required: true,
        visibleIf: (a) => a.hasInjuryHistory === true,
      },
      {
        key: "injuryRestrictions",
        label: "What are you unable to do, or advised not to do?",
        type: "text",
        required: true,
        visibleIf: (a) => a.hasInjuryHistory === true,
      },
      {
        key: "injuryWorkingWithProfessional",
        label: "Are you currently working with a qualified healthcare professional on this?",
        type: "boolean",
        required: true,
        icon: Stethoscope,
        visibleIf: (a) => a.hasInjuryHistory === true,
      },
      {
        key: "safetyScreen",
        label: "Select anything your coach should review before you begin",
        type: "multi_select",
        required: true,
        exclusiveValue: "none",
        sectionLabel: "Pre-participation safety screen",
        helpText: "A quick, standard check — not a diagnosis.",
        icon: BriefcaseMedical,
        options: [
          { value: "cardiovascular", label: "Known cardiovascular condition or concerning symptoms" },
          { value: "chest_dizziness", label: "Unexplained chest pain, dizziness, or fainting" },
          { value: "blood_pressure", label: "Blood-pressure concerns" },
          { value: "joint_muscular", label: "Bone, joint, or muscular problems activity may worsen" },
          { value: "medication_condition", label: "Medication or a medical condition that may affect exercise" },
          { value: "advised_limit", label: "Advised to limit or avoid exercise" },
          { value: "none", label: "None of these apply", icon: Check },
        ],
      },
    ],
  },

  // -----------------------------------------------------------------------
  // 7. Review (compact summary + submission — not counted among "6 chapters")
  // -----------------------------------------------------------------------
  {
    id: "review",
    section: "Review",
    title: "Review",
    description: "One quick look before this goes to your coach.",
    fields: [],
  },
];

export function onboardingStepIndex(stepId: OnboardingStepDef["id"]): number {
  return ONBOARDING_STEPS.findIndex((s) => s.id === stepId);
}

/** Every field currently visible for a step's in-progress answers. */
export function visibleFieldsForStep(step: OnboardingStepDef, answers: OnboardingStepAnswers): OnboardingFieldDef[] {
  return step.fields.filter((f) => !f.visibleIf || f.visibleIf(answers));
}

/** A chapter's internal pacing screens — always at least one. Falls back to
 * a single moment containing every field when the chapter defines none
 * (e.g. Review), so callers never need to branch on whether moments exist. */
export function momentsForStep(step: OnboardingStepDef): string[][] {
  return step.moments && step.moments.length > 0 ? step.moments : [step.fields.map((f) => f.key)];
}

/** Which moment (0-based) a given field key actually lives in right now —
 * the one place Review's per-row "Edit" jump target is computed (see
 * onboarding-wizard.tsx's ReviewSummary), so a moment split/regroup can
 * never silently point a Review row at the wrong internal screen the way a
 * hardcoded index would. Returns 0 (never throws) for an unknown key, so a
 * caller always lands somewhere sane in the chapter rather than crashing. */
export function momentIndexForField(step: OnboardingStepDef, fieldKey: string): number {
  const moments = momentsForStep(step);
  const index = moments.findIndex((moment) => moment.includes(fieldKey));
  return index === -1 ? 0 : index;
}

/** Whether a field counts as answered. Tolerates a legacy plain-string value
 * on a field that's since become multi_select (e.g. a client who completed
 * onboarding before Phase 5.3A's trainingEnvironment/preferredTrainingTime/
 * coachSupportStyle became multi-select) — never treats their real,
 * already-submitted answer as unanswered. */
export function isFieldAnswered(field: OnboardingFieldDef, answers: OnboardingStepAnswers): boolean {
  if (field.type === "height_feet_inches") {
    return typeof answers.heightFeet === "number" && typeof answers.heightInchesRemainder === "number";
  }
  if (field.type === "timezone_confirm") {
    return typeof answers[field.key] === "string" && (answers[field.key] as string).length > 0;
  }
  if (field.type === "day_selector" || field.type === "injury_list") {
    const v = answers[field.key];
    return Array.isArray(v) && v.length > 0;
  }
  if (field.type === "multi_select") {
    const v = answers[field.key];
    if (Array.isArray(v)) return v.length > 0;
    return typeof v === "string" && v.length > 0;
  }
  const v = answers[field.key];
  return v !== undefined && v !== "";
}

/** multi_select only: the options actually selectable right now — filters
 * out whichever option excludeValueOfField's referenced sibling currently
 * holds (see OnboardingFieldDef.excludeValueOfField). Every other field
 * type's options are returned unchanged. */
export function optionsForField(field: OnboardingFieldDef, answers: OnboardingStepAnswers): OnboardingFieldOption[] {
  const base = field.options ?? [];
  if (!field.excludeValueOfField) return base;
  const excludeValue = answers[field.excludeValueOfField];
  if (typeof excludeValue !== "string" || excludeValue === "") return base;
  return base.filter((o) => o.value !== excludeValue);
}

/** multi_select only: whether this specific option should render disabled
 * right now — purely the maxSelections cap (an exclusiveValue never
 * disables anything; selecting through it just transforms the selection —
 * see toggleMultiSelectValue). An already-selected option is never
 * disabled, so it can always be deselected even once a cap is reached. */
export function isMultiSelectOptionDisabled(field: OnboardingFieldDef, selected: string[], value: string): boolean {
  if (selected.includes(value)) return false;
  if (field.maxSelections !== undefined && selected.length >= field.maxSelections) return true;
  return false;
}

/** multi_select only: the one place selection/deselection/exclusivity/cap
 * logic lives, so every caller (the live UI, and tests) gets identical
 * behavior. Selecting the field's exclusiveValue (e.g. "Varies", "None of
 * these apply") replaces the whole selection; selecting anything else
 * drops the exclusiveValue if it was active. The cap is enforced here too,
 * as a defensive backstop behind the UI's own disabled state. */
export function toggleMultiSelectValue(field: OnboardingFieldDef, selected: string[], value: string): string[] {
  if (selected.includes(value)) return selected.filter((v) => v !== value);
  if (field.exclusiveValue && value === field.exclusiveValue) return [value];
  const withoutExclusive = field.exclusiveValue ? selected.filter((v) => v !== field.exclusiveValue) : selected;
  if (field.maxSelections !== undefined && withoutExclusive.length >= field.maxSelections) return withoutExclusive;
  return [...withoutExclusive, value];
}

/** Clamps a submitted age into OPTIM's actual onboarding range. The UI
 * wheel already only ever offers [MIN_ONBOARDING_AGE, MAX_ONBOARDING_AGE],
 * but this is the real, independent backstop against direct state
 * manipulation — see sanitizeOnboardingAnswers below, called from
 * lib/coach/platform-store.ts's SAVE_ONBOARDING_STEP before anything is
 * ever persisted. */
export function clampOnboardingAge(age: number): number {
  return Math.min(MAX_ONBOARDING_AGE, Math.max(MIN_ONBOARDING_AGE, age));
}

/** The one place a just-submitted chapter's answers are sanitized before
 * being persisted — currently only clamps `about_you`'s age, but this is
 * where any future hard floor/ceiling belongs, rather than trusting the UI
 * alone. Never mutates a field it doesn't own; every other key passes
 * through untouched. */
export function sanitizeOnboardingAnswers(stepId: OnboardingStepId, answers: OnboardingStepAnswers): OnboardingStepAnswers {
  if (stepId !== "about_you") return answers;
  if (typeof answers.age !== "number") return answers;
  const clamped = clampOnboardingAge(answers.age);
  if (clamped === answers.age) return answers;
  return { ...answers, age: clamped };
}

/** Applies one field change and generically clears any OTHER field on the
 * same step that becomes hidden as a direct result — real adaptive
 * behavior, not per-field hardcoded logic. Also generically drops a value
 * from a multi_select field the moment a sibling field it excludes-by
 * changes TO that same value (see OnboardingFieldDef.excludeValueOfField)
 * — e.g. picking "Build muscle" as the primary goal immediately removes
 * "Build muscle" from secondary priorities if it was sitting there,
 * instead of leaving it redundantly selected in both places. */
export function applyStepFieldUpdate(step: OnboardingStepDef, answers: OnboardingStepAnswers, key: string, value: OnboardingAnswerValue): OnboardingStepAnswers {
  let next: OnboardingStepAnswers = { ...answers, [key]: value };
  for (const field of step.fields) {
    if (field.key === key) continue;
    const stillVisible = !field.visibleIf || field.visibleIf(next);
    if (!stillVisible && next[field.key] !== undefined) {
      const cleared = { ...next };
      delete cleared[field.key];
      next = cleared;
    }
    if (field.excludeValueOfField === key && typeof value === "string" && Array.isArray(next[field.key])) {
      const arr = next[field.key] as string[];
      if (arr.includes(value)) {
        next = { ...next, [field.key]: arr.filter((v) => v !== value) };
      }
    }
  }
  return next;
}

// ---------------------------------------------------------------------------
// Legacy (Phase 5.1) step definitions — lookup-only, never a live step.
// See components/coach/coach-brief.tsx for the one place this is read.
// ---------------------------------------------------------------------------

export const LEGACY_V51_STEPS: OnboardingStepDef[] = [
  {
    id: "basics",
    section: "Basics",
    title: "The basics",
    description: "",
    fields: [
      { key: "fullName", label: "Full name", type: "text", required: true },
      { key: "age", label: "Age", type: "number_wheel", required: true, unit: "yrs" },
      { key: "weightLb", label: "Current weight", type: "number_wheel", required: true, unit: "lb" },
      {
        key: "weightDirection",
        label: "Recent weight direction",
        type: "single_select",
        required: true,
        options: [
          { value: "stable", label: "Relatively stable" },
          { value: "trending_up", label: "Trending up" },
          { value: "trending_down", label: "Trending down" },
          { value: "unsure", label: "Unsure" },
        ],
      },
      { key: "timeZone", label: "Time zone", type: "text", required: true },
      {
        key: "sex",
        label: "Sex",
        type: "single_select",
        required: false,
        options: [
          { value: "female", label: "Female" },
          { value: "male", label: "Male" },
          { value: "prefer_not_to_say", label: "Prefer not to say" },
        ],
      },
    ],
  },
  {
    id: "goals",
    section: "Goals",
    title: "Your goals",
    description: "",
    fields: [
      {
        key: "primaryGoal",
        label: "Primary goal",
        type: "single_select",
        required: true,
        options: [
          { value: "build_muscle", label: "Build muscle" },
          { value: "lose_fat", label: "Lose body fat" },
          { value: "gain_strength", label: "Gain strength" },
          { value: "improve_performance", label: "Improve athletic performance" },
          { value: "general_health", label: "Improve general health and consistency" },
          { value: "other", label: "Other" },
        ],
      },
      { key: "successDefinition", label: "What would make this coaching phase feel successful to you?", type: "textarea", required: true },
      { key: "whyItMatters", label: "Why is this important to you right now?", type: "textarea", required: true },
    ],
  },
  {
    id: "availability",
    section: "Availability",
    title: "Availability & training environment",
    description: "",
    fields: [
      { key: "availableDays", label: "Days available to train", type: "day_selector", required: true, options: DAYS_OF_WEEK },
      {
        key: "preferredTrainingTime",
        label: "Preferred training time",
        type: "single_select",
        required: true,
        options: [
          { value: "morning", label: "Morning" },
          { value: "midday", label: "Midday" },
          { value: "afternoon", label: "Afternoon" },
          { value: "evening", label: "Evening" },
          { value: "varies", label: "Varies" },
        ],
      },
      {
        key: "maxSessionLength",
        label: "Maximum realistic session length",
        type: "single_select",
        required: true,
        options: [
          { value: "30", label: "30 minutes" },
          { value: "45", label: "45 minutes" },
          { value: "60", label: "60 minutes" },
          { value: "75", label: "75 minutes" },
          { value: "90", label: "90 minutes" },
          { value: "90_plus", label: "More than 90 minutes" },
        ],
      },
      {
        key: "trainingEnvironment",
        label: "Training environment",
        type: "single_select",
        required: true,
        options: [
          { value: "commercial_gym", label: "Commercial gym" },
          { value: "private_gym", label: "Private gym" },
          { value: "home_gym", label: "Home gym" },
          { value: "school_workplace_gym", label: "School or workplace gym" },
          { value: "multiple_locations", label: "Multiple locations" },
          { value: "limited_equipment", label: "Limited equipment" },
        ],
      },
      {
        key: "travelFrequency",
        label: "Travel frequency",
        type: "single_select",
        required: false,
        options: [
          { value: "rarely", label: "Rarely" },
          { value: "occasionally", label: "Occasionally" },
          { value: "monthly", label: "Monthly" },
          { value: "frequently", label: "Frequently" },
        ],
      },
    ],
  },
  {
    id: "training_background",
    section: "Training background",
    title: "Training background",
    description: "",
    fields: [
      {
        key: "trainingTime",
        label: "Time spent resistance training",
        type: "single_select",
        required: true,
        options: [
          { value: "new", label: "New to resistance training" },
          { value: "under_6mo", label: "Less than 6 months" },
          { value: "6_12mo", label: "6–12 months" },
          { value: "1_2yr", label: "1–2 years" },
          { value: "3_5yr", label: "3–5 years" },
          { value: "5yr_plus", label: "More than 5 years" },
        ],
      },
      {
        key: "consistencyRecently",
        label: "Consistency during the previous six months",
        type: "single_select",
        required: true,
        options: [
          { value: "rare", label: "Rare or inconsistent" },
          { value: "some_stretches", label: "Some consistent stretches" },
          { value: "mostly_consistent", label: "Mostly consistent" },
          { value: "highly_consistent", label: "Highly consistent" },
        ],
      },
      { key: "currentWeeklyFrequency", label: "Current or most recent weekly training frequency", type: "number_wheel", required: true, unit: "days" },
      {
        key: "currentCardio",
        label: "Current cardio",
        type: "single_select",
        required: true,
        options: [
          { value: "none", label: "None" },
          { value: "walking", label: "Walking or general activity" },
          { value: "steady_state", label: "Steady-state cardio" },
          { value: "intervals", label: "Interval training" },
          { value: "sport_conditioning", label: "Sport conditioning" },
          { value: "combination", label: "Combination" },
        ],
      },
    ],
  },
  {
    id: "nutrition",
    section: "Nutrition",
    title: "Nutrition baseline",
    description: "",
    fields: [
      {
        key: "trackingHistory",
        label: "Current calorie or macro tracking",
        type: "single_select",
        required: true,
        options: [
          { value: "never", label: "Never tracked" },
          { value: "tracked_previously", label: "Tracked previously" },
          { value: "occasionally", label: "Track occasionally" },
          { value: "consistently", label: "Track consistently" },
        ],
      },
      { key: "mealsPerDay", label: "Typical number of meals per day", type: "number_wheel", required: true, unit: "meals" },
      { key: "typicalEatingDay", label: "What does a typical weekday of eating look like?", type: "textarea", required: true },
      {
        key: "dietaryPattern",
        label: "Dietary pattern",
        type: "single_select",
        required: false,
        options: [
          { value: "none", label: "No specific pattern" },
          { value: "vegetarian", label: "Vegetarian" },
          { value: "vegan", label: "Vegan" },
          { value: "other", label: "Other" },
        ],
      },
      { key: "allergiesOrIntolerances", label: "Allergies or intolerances", type: "text", required: false },
    ],
  },
  {
    id: "recovery",
    section: "Recovery",
    title: "Recovery & lifestyle",
    description: "",
    fields: [
      { key: "averageSleepHours", label: "Average sleep duration", type: "number_wheel", required: true, unit: "hrs" },
      {
        key: "sleepQuality",
        label: "Sleep quality",
        type: "single_select",
        required: true,
        options: [
          { value: "usually_rested", label: "Usually wake rested" },
          { value: "adequate_inconsistent", label: "Sleep is adequate but inconsistent" },
          { value: "frequently_tired", label: "Frequently wake tired" },
          { value: "major_problem", label: "Sleep is currently a major recovery problem" },
        ],
      },
      {
        key: "stressSources",
        label: "Primary current stress sources",
        type: "multi_select",
        required: true,
        options: [
          { value: "work", label: "Work" },
          { value: "school", label: "School" },
          { value: "relationships", label: "Relationships or family" },
          { value: "finances", label: "Finances" },
          { value: "health", label: "Health" },
          { value: "schedule_overload", label: "Schedule overload" },
          { value: "travel", label: "Travel" },
          { value: "other", label: "Other" },
        ],
      },
      {
        key: "currentBandwidth",
        label: "Current bandwidth for a structured plan",
        type: "single_select",
        required: true,
        options: [
          { value: "plenty_of_room", label: "Plenty of room for a structured plan" },
          { value: "busy_manageable", label: "Busy but manageable" },
          { value: "frequently_stretched", label: "Frequently stretched" },
          { value: "currently_struggling", label: "Currently struggling to keep up" },
        ],
      },
    ],
  },
  {
    id: "health",
    section: "Health",
    title: "Health & readiness",
    description: "",
    fields: [
      { key: "hasDiagnosedCondition", label: "Any diagnosed medical condition that may affect exercise, recovery, heart rate, appetite, or nutrition?", type: "boolean", required: true },
      { key: "takesRelevantMedication", label: "Any current medications that may affect training, heart rate, blood pressure, appetite, hydration, or recovery?", type: "boolean", required: true },
      { key: "hasSignificantSurgeryHistory", label: "Any significant surgery history?", type: "boolean", required: true },
      { key: "hasExerciseRestriction", label: "Any professional exercise restrictions currently in place?", type: "boolean", required: true },
      { key: "hasInjuryHistory", label: "Do you currently have pain, an injury, or a recurring physical issue that could affect training?", type: "boolean", required: true },
      { key: "injuries", label: "Tell us about it", type: "injury_list", required: false, visibleIf: (a) => a.hasInjuryHistory === true },
      { key: "safetyHeartCondition", label: "Have you been told you have a heart or cardiovascular condition requiring exercise guidance?", type: "boolean", required: true },
      { key: "safetyChestDiscomfortActivity", label: "Do you get chest discomfort during physical activity?", type: "boolean", required: true },
      { key: "safetyChestDiscomfortRest", label: "Do you get chest discomfort at rest?", type: "boolean", required: true },
      { key: "safetyDizzinessFainting", label: "Do you experience dizziness, fainting, or loss of consciousness?", type: "boolean", required: true },
      { key: "safetyBoneJointIssue", label: "Do you have a bone, joint, or soft-tissue issue that activity might worsen?", type: "boolean", required: true },
      { key: "safetyHeartMedication", label: "Are you on medication prescribed for a heart or blood-pressure condition?", type: "boolean", required: true },
      { key: "safetyProfessionalRestriction", label: "Has a professional given you instructions that limit exercise?", type: "boolean", required: true },
      { key: "safetyOtherConcern", label: "Any other reason you believe you should seek professional guidance before increasing activity?", type: "boolean", required: true },
    ],
  },
  {
    id: "coaching",
    section: "Coaching",
    title: "Coaching & accountability",
    description: "",
    fields: [
      { key: "whatMadePlansDifficult", label: "What has made previous plans difficult to follow?", type: "textarea", required: true },
      {
        key: "feedbackStyle",
        label: "Preferred feedback style",
        type: "single_select",
        required: true,
        options: [
          { value: "direct_concise", label: "Direct and concise" },
          { value: "detailed_explanation", label: "Detailed explanation" },
          { value: "encouraging_firm", label: "Encouraging but firm" },
          { value: "collaborative", label: "Collaborative problem-solving" },
        ],
      },
      { key: "whatYouNeedFromCoach", label: "What do you need most from your coach?", type: "textarea", required: true },
    ],
  },
];

export function legacyFieldByKey(stepId: OnboardingStepId, key: string): OnboardingFieldDef | undefined {
  return LEGACY_V51_STEPS.find((s) => s.id === stepId)?.fields.find((f) => f.key === key);
}

/** A handful of icons used outside any one field's own definition (chapter
 * headers, the review summary, completion states) — kept here so every
 * onboarding-adjacent surface pulls from the same one icon family instead
 * of each screen picking its own. */
export const ONBOARDING_CHAPTER_ICONS: Record<OnboardingStepId, LucideIcon> = {
  about_you: UserRound,
  what_you_want: Target,
  your_week: CalendarRange,
  starting_point: Footprints,
  fuel_recovery: Salad,
  health_finish: HeartPulse,
  review: Check,
  // Legacy/oldest-era ids — never shown in the live chapter header, but the
  // type is shared across every era so every OnboardingStepId needs an
  // entry.
  basics: UserRound,
  goals: Target,
  availability: CalendarRange,
  training_background: Footprints,
  nutrition: Salad,
  recovery: Moon,
  health: HeartPulse,
  coaching: Users2,
  schedule_lifestyle: CalendarRange,
  health_readiness: HeartPulse,
};
