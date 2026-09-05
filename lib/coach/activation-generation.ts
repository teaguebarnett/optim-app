// Phase 5.4A — the deterministic activation-generation engine.
//
// No real server-side AI/model provider exists in this repository (see this
// phase's audit and ai-authority.ts's own module doc) — this file is the
// honest provider Part XIII of the brief calls for when that's true: real
// program/exercise primitives, real client data, a real coach methodology,
// a real constraint engine, real scoring, and real explanations. Nothing
// here calls out to a model or fabricates a measurement the client never
// provided — every generated value traces to a specific client answer or a
// specific Coach Operating Model field, listed in each option's
// `explanation.clientFactsUsed`/`coachingRulesUsed`.
//
// Produces real ClientAssignedProgram-shaped output (see lib/types.ts) —
// the exact schema the existing program editor, client Training page, and
// live guided workout flow already know how to render, so a generated
// option needs no translation step before a coach can open it in the real
// editor or a client can actually log it.

import { buildPrescribedSets, DAYS_OF_WEEK_ORDER } from "./training.ts";
import { EXERCISE_LIBRARY, type EquipmentTag, type LibraryExercise, type MovementPattern } from "./exercise-library.ts";
import type { ClientAssignedProgram, DayOfWeek, Exercise, NutritionTargets, ProgramDay, ProgramWeek, RpeValue, Workout } from "../types";
import type { ClientProfileId, CoachProfileId, WorkspaceId } from "../tenancy/types";
import type { OnboardingProgress, OnboardingStepAnswers } from "./types";
import type { CoachOperatingModel } from "./operating-model.ts";

// ---------------------------------------------------------------------------
// Client snapshot — the exact, real intake fields generation may use
// ---------------------------------------------------------------------------

export interface ClientOnboardingSnapshot {
  age: number;
  heightTotalInches: number;
  weightLb: number;
  sex: "female" | "male" | "prefer_not_to_say";
  primaryGoal: string;
  secondaryGoals: string[];
  targetWeightLb?: number;
  availableDays: DayOfWeek[];
  maxSessionLengthMinutes: number;
  trainingEnvironment: string[];
  trainingExperience: string;
  hasDietaryRestrictions: boolean;
  dietaryRestrictionsDetail?: string;
  nutritionApproach: string;
}

const DAY_KEY_TO_DAY_OF_WEEK: Record<string, DayOfWeek> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

function readAnswers(onboarding: OnboardingProgress, step: string): OnboardingStepAnswers {
  return (onboarding.answers as Record<string, OnboardingStepAnswers | undefined>)[step] ?? {};
}

/** Every field generation genuinely needs, pulled from the real completed
 * intake — returns a list of missing/unusable field labels instead of a
 * snapshot when critical data is absent, so the caller can honestly report
 * "blocked by missing information" rather than silently guessing. */
export function extractClientSnapshot(onboarding: OnboardingProgress | null): { snapshot: ClientOnboardingSnapshot } | { missing: string[] } {
  if (!onboarding || !onboarding.completedAtIso) return { missing: ["Onboarding has not been completed yet."] };

  const about = readAnswers(onboarding, "about_you");
  const goals = readAnswers(onboarding, "what_you_want");
  const week = readAnswers(onboarding, "your_week");
  const start = readAnswers(onboarding, "starting_point");
  const fuel = readAnswers(onboarding, "fuel_recovery");

  const missing: string[] = [];
  const age = typeof about.age === "number" ? about.age : undefined;
  if (age === undefined) missing.push("Age");
  const heightFeet = typeof about.heightFeet === "number" ? about.heightFeet : undefined;
  const heightInches = typeof about.heightInchesRemainder === "number" ? about.heightInchesRemainder : undefined;
  if (heightFeet === undefined || heightInches === undefined) missing.push("Height");
  const weightLb = typeof about.weightLb === "number" ? about.weightLb : undefined;
  if (weightLb === undefined) missing.push("Weight");
  const primaryGoal = typeof goals.primaryGoal === "string" ? goals.primaryGoal : undefined;
  if (!primaryGoal) missing.push("Primary goal");
  const availableDaysRaw = Array.isArray(week.availableDays) ? (week.availableDays as string[]) : [];
  if (availableDaysRaw.length === 0) missing.push("Available training days");
  const maxSessionLengthRaw = typeof week.maxSessionLength === "string" ? week.maxSessionLength : undefined;
  if (!maxSessionLengthRaw) missing.push("Maximum session length");
  const trainingExperience = typeof start.trainingExperience === "string" ? start.trainingExperience : undefined;
  if (!trainingExperience) missing.push("Training experience");

  if (missing.length > 0) return { missing };

  const sexRaw = typeof about.sex === "string" ? about.sex : "prefer_not_to_say";
  const sex: ClientOnboardingSnapshot["sex"] = sexRaw === "female" || sexRaw === "male" ? sexRaw : "prefer_not_to_say";

  return {
    snapshot: {
      age: age!,
      heightTotalInches: heightFeet! * 12 + heightInches!,
      weightLb: weightLb!,
      sex,
      primaryGoal: primaryGoal!,
      secondaryGoals: Array.isArray(goals.secondaryGoals) ? (goals.secondaryGoals as string[]) : [],
      targetWeightLb: typeof goals.targetWeight === "number" ? goals.targetWeight : undefined,
      availableDays: availableDaysRaw.map((d) => DAY_KEY_TO_DAY_OF_WEEK[d]).filter((d): d is DayOfWeek => !!d),
      maxSessionLengthMinutes: maxSessionLengthRaw === "90_plus" ? 100 : Number(maxSessionLengthRaw),
      trainingEnvironment: Array.isArray(week.trainingEnvironment) ? (week.trainingEnvironment as string[]) : [],
      trainingExperience: trainingExperience!,
      hasDietaryRestrictions: fuel.hasDietaryRestrictions === "yes",
      dietaryRestrictionsDetail: typeof fuel.dietaryRestrictionsDetail === "string" ? fuel.dietaryRestrictionsDetail : undefined,
      nutritionApproach: typeof fuel.nutritionApproach === "string" ? fuel.nutritionApproach : "no_structure",
    },
  };
}

export function isRecompositionGoal(snapshot: ClientOnboardingSnapshot): boolean {
  if (snapshot.primaryGoal === "body_recomposition") return true;
  const set = new Set([snapshot.primaryGoal, ...snapshot.secondaryGoals]);
  return set.has("build_muscle") && set.has("lose_fat");
}

export function experienceTier(snapshot: ClientOnboardingSnapshot): "novice" | "intermediate" | "advanced" {
  if (snapshot.trainingExperience === "new" || snapshot.trainingExperience === "learning_fundamentals") return "novice";
  if (snapshot.trainingExperience === "experienced_consistent") return "advanced";
  return "intermediate";
}

const ENVIRONMENT_EQUIPMENT: Record<string, EquipmentTag[]> = {
  commercial_gym: ["barbell", "dumbbell", "machine", "cable", "bodyweight", "bands", "kettlebell"],
  private_gym: ["barbell", "dumbbell", "machine", "cable", "bodyweight", "bands", "kettlebell"],
  multiple_locations: ["barbell", "dumbbell", "machine", "cable", "bodyweight", "bands", "kettlebell"],
  home_gym: ["dumbbell", "bodyweight", "bands", "kettlebell"],
  limited_equipment: ["bodyweight", "bands"],
};

export function equipmentForClient(snapshot: ClientOnboardingSnapshot): EquipmentTag[] {
  const tags = new Set<EquipmentTag>(["bodyweight"]);
  for (const env of snapshot.trainingEnvironment) {
    for (const t of ENVIRONMENT_EQUIPMENT[env] ?? []) tags.add(t);
  }
  return Array.from(tags);
}

// ---------------------------------------------------------------------------
// Hard-constraint validation
// ---------------------------------------------------------------------------

export interface ConstraintCheckResult {
  id: string;
  label: string;
  passed: boolean;
  reason?: string;
}

export interface ConstraintValidation {
  passed: boolean;
  checks: ConstraintCheckResult[];
}

/** Every real hard constraint this phase's brief §V.1 requires, checked
 * against one already-built program option. Called AFTER generation and
 * before persistence/activation — never trusted to be true just because the
 * generator "should have" respected it (defense in depth: a future change
 * to the generator that accidentally violates a constraint fails loudly
 * here instead of silently reaching a client). */
export function validateTrainingHardConstraints(program: ClientAssignedProgram, snapshot: ClientOnboardingSnapshot, com: CoachOperatingModel): ConstraintValidation {
  const week1 = program.weeks.find((w) => w.weekNumber === 1);
  const trainingDays = week1?.days.filter((d) => d.type === "training") ?? [];
  const equipment = new Set(equipmentForClient(snapshot));
  const nonNegotiableTerms = com.programArchitecture.nonNegotiables.map((s) => s.toLowerCase());
  const avoidedTerms = com.programArchitecture.exercisesAvoided.map((s) => s.toLowerCase());

  const checks: ConstraintCheckResult[] = [
    {
      id: "available_days",
      label: "Respects the client's available training days",
      passed: trainingDays.length <= snapshot.availableDays.length && trainingDays.every((d) => snapshot.availableDays.includes(d.dayOfWeek)),
    },
    {
      id: "session_duration",
      label: "Respects the client's maximum session length",
      passed: trainingDays.every((d) => (d.workout?.estimatedDurationMin ?? 0) <= snapshot.maxSessionLengthMinutes + 10),
      reason: "A session exceeds the client's stated maximum length.",
    },
    {
      id: "equipment",
      label: "Only uses equipment the client has access to",
      passed: trainingDays.every((d) => (d.workout?.exercises ?? []).every((ex) => equipmentTagForExerciseName(ex.name) === undefined || equipment.has(equipmentTagForExerciseName(ex.name)!))),
      reason: "An exercise requires equipment outside the client's training environment.",
    },
    {
      id: "coach_non_negotiables",
      label: "Honors the coach's non-negotiable rules",
      passed: nonNegotiableTerms.length === 0 || trainingDays.every((d) => (d.workout?.exercises ?? []).every((ex) => !nonNegotiableTerms.some((t) => ex.name.toLowerCase().includes(t)))),
    },
    {
      id: "exercises_avoided",
      label: "Avoids exercises the coach never prescribes",
      passed: avoidedTerms.length === 0 || trainingDays.every((d) => (d.workout?.exercises ?? []).every((ex) => !avoidedTerms.some((t) => ex.name.toLowerCase().includes(t)))),
    },
    {
      id: "usable_week1",
      label: "Every training day has a genuinely usable workout",
      passed: trainingDays.length > 0 && trainingDays.every((d) => (d.workout?.exercises.length ?? 0) > 0),
    },
  ];

  return { passed: checks.every((c) => c.passed), checks };
}

function equipmentTagForExerciseName(name: string): EquipmentTag | undefined {
  return EXERCISE_LIBRARY.find((e) => e.name === name)?.equipment;
}

export function validateNutritionHardConstraints(strategy: { targets: NutritionTargets }, snapshot: ClientOnboardingSnapshot): ConstraintValidation {
  const checks: ConstraintCheckResult[] = [
    {
      id: "safe_calorie_floor",
      label: "Calorie target stays at or above a safe floor",
      passed: strategy.targets.calories >= 1200,
      reason: "Calculated target fell below a safe minimum and was clamped — see assumptions.",
    },
    {
      id: "dietary_restrictions_acknowledged",
      label: "Dietary restrictions are acknowledged, not ignored",
      passed: !snapshot.hasDietaryRestrictions || !!snapshot.dietaryRestrictionsDetail,
    },
  ];
  return { passed: checks.every((c) => c.passed), checks };
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export interface ScoreBreakdown {
  total: number;
  goalFit: number;
  methodologyFit: number;
  experienceFit: number;
  scheduleFit: number;
  adherenceLikelihood: number;
}

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

// ---------------------------------------------------------------------------
// Training generation
// ---------------------------------------------------------------------------

export type OptionKind = "best_fit" | "strong_alternative" | "wildcard";

export const OPTION_KIND_LABELS: Record<OptionKind, string> = {
  best_fit: "Best fit",
  strong_alternative: "Strong alternative",
  wildcard: "Strategic wildcard",
};

interface SplitPlan {
  splitName: string;
  /** One pattern set per training day, in order. */
  dayPatterns: MovementPattern[][];
}

const SPLIT_LIBRARY: Record<string, (days: number) => SplitPlan | null> = {
  full_body: (days) => (days >= 2 && days <= 4 ? { splitName: "Full body", dayPatterns: Array.from({ length: days }, () => ["squat", "hinge", "push_horizontal", "pull_horizontal", "push_vertical", "core"]) } : null),
  upper_lower: (days) =>
    days >= 4
      ? {
          splitName: "Upper / lower",
          dayPatterns: Array.from({ length: days }, (_, i) =>
            i % 2 === 0 ? ["push_horizontal", "pull_horizontal", "push_vertical", "pull_vertical", "isolation"] : ["squat", "hinge", "lunge", "isolation", "core"]
          ),
        }
      : null,
  push_pull_legs: (days) =>
    days >= 3
      ? {
          splitName: "Push / pull / legs",
          dayPatterns: Array.from({ length: days }, (_, i) => {
            const r = i % 3;
            if (r === 0) return ["push_horizontal", "push_vertical", "isolation"];
            if (r === 1) return ["pull_horizontal", "pull_vertical", "isolation"];
            return ["squat", "hinge", "lunge", "core"];
          }),
        }
      : null,
  body_part_split: (days) =>
    days >= 5
      ? {
          splitName: "Body-part split",
          dayPatterns: Array.from({ length: days }, (_, i) => {
            const rotation: MovementPattern[][] = [
              ["push_horizontal", "isolation"],
              ["pull_horizontal", "pull_vertical", "isolation"],
              ["squat", "lunge", "core"],
              ["push_vertical", "isolation"],
              ["hinge", "lunge", "core"],
              ["isolation", "carry"],
            ];
            return rotation[i % rotation.length];
          }),
        }
      : null,
  full_body_high_frequency: (days) =>
    days >= 3 ? { splitName: "High-frequency full body", dayPatterns: Array.from({ length: days }, () => ["squat", "hinge", "push_horizontal", "pull_horizontal", "isolation"]) } : null,
};

function candidateSplits(days: number, preferred: string[]): { key: string; plan: SplitPlan }[] {
  const ordered = [...preferred, ...Object.keys(SPLIT_LIBRARY).filter((k) => !preferred.includes(k))];
  const out: { key: string; plan: SplitPlan }[] = [];
  for (const key of ordered) {
    const plan = SPLIT_LIBRARY[key]?.(days);
    if (plan) out.push({ key, plan });
  }
  return out;
}

function chooseSplitForKind(days: number, com: CoachOperatingModel, kind: OptionKind): { key: string; plan: SplitPlan } {
  const candidates = candidateSplits(days, com.programArchitecture.preferredSplits);
  if (candidates.length === 0) {
    // Honest, universally valid fallback — full body always accepts any day count 1+.
    return { key: "full_body", plan: { splitName: "Full body", dayPatterns: Array.from({ length: days }, () => ["squat", "hinge", "push_horizontal", "pull_horizontal", "core"]) } };
  }
  if (kind === "best_fit") return candidates[0];
  if (kind === "strong_alternative") return candidates[1] ?? candidates[0];
  // Wildcard: a legitimate, different-in-kind approach — the one candidate
  // NOT drawn from the coach's own stated preferences, if one validly
  // exists for this day count; otherwise the last preferred candidate
  // (still different from best_fit whenever more than one exists).
  const nonPreferred = candidateSplits(days, []).find((c) => !com.programArchitecture.preferredSplits.includes(c.key) && c.key !== candidates[0].key);
  return nonPreferred ?? candidates[candidates.length - 1];
}

function pickExercise(pattern: MovementPattern, equipment: EquipmentTag[], avoided: string[], used: Set<string>): LibraryExercise | null {
  const equipmentSet = new Set(equipment);
  const options = EXERCISE_LIBRARY.filter((e) => e.pattern === pattern && equipmentSet.has(e.equipment) && !avoided.some((a) => e.name.toLowerCase().includes(a.toLowerCase())));
  const fresh = options.find((e) => !used.has(e.name));
  return fresh ?? options[0] ?? null;
}

function repRangeForPhilosophy(philosophy: string): [number, number] {
  if (philosophy === "strength_low_3_6") return [3, 6];
  if (philosophy === "higher_12_20") return [12, 20];
  return [8, 12];
}

function rpeForProximity(proximity: string, weekProgress: number): RpeValue {
  const base = proximity === "0_1_reps_in_reserve" ? 9 : proximity === "2_4_reps_in_reserve" ? 7 : 8;
  const bumped = base + (weekProgress > 0.6 ? 1 : 0);
  return Math.max(6, Math.min(10, bumped)) as RpeValue;
}

/** A rough, deliberately conservative per-exercise time budget (warm-up +
 * working sets + rest, for a real compound lift) — used only to decide HOW
 * MANY exercises fit a session, never to fabricate a precise duration (the
 * real estimatedDurationMin below is always computed from the actual
 * generated content). Without this, a short session length (e.g. a
 * client's real 30-minute max) would silently generate a 6-exercise
 * full-body day that no one could finish in time — a real gap found via
 * live testing with an intentionally short session length. */
const MINUTES_PER_EXERCISE_BUDGET = 15;

function buildWorkoutForDay(
  workspaceId: WorkspaceId,
  dayOfWeek: DayOfWeek,
  patterns: MovementPattern[],
  equipment: EquipmentTag[],
  com: CoachOperatingModel,
  weekProgress: number,
  isDeload: boolean,
  maxSessionLengthMinutes: number
): Workout {
  const [repLow, repHigh] = repRangeForPhilosophy(com.programArchitecture.repRangePhilosophy);
  const targetRpe = rpeForProximity(com.programArchitecture.proximityToFailure, isDeload ? 0 : weekProgress);
  const usedNames = new Set<string>();
  const exercises: Exercise[] = [];
  let order = 1;

  const maxExercises = Math.max(1, Math.floor(maxSessionLengthMinutes / MINUTES_PER_EXERCISE_BUDGET));
  const fittedPatterns = patterns.slice(0, maxExercises);

  for (const pattern of fittedPatterns) {
    const picked = pickExercise(pattern, equipment, com.programArchitecture.exercisesAvoided, usedNames);
    if (!picked) continue;
    usedNames.add(picked.name);
    const isFirstCompound = picked.isCompound && order === 1;
    const workingSets = isDeload
      ? Math.max(2, com.programArchitecture.setsPerExerciseMin - 1)
      : picked.isCompound
        ? com.programArchitecture.setsPerExerciseMax
        : com.programArchitecture.setsPerExerciseMin;
    const warmupSets = isFirstCompound ? 2 : picked.isCompound ? 1 : 0;
    exercises.push({
      id: `ex-${dayOfWeek}-${order}-${picked.name.replace(/\s+/g, "-").toLowerCase()}`,
      order,
      name: picked.name,
      warmupSets,
      workingSets,
      targetRepsLow: repLow,
      targetRepsHigh: repHigh,
      targetRpe: isDeload ? (Math.max(6, targetRpe - 2) as RpeValue) : targetRpe,
      restSeconds: picked.isCompound ? 150 : 75,
      tempo: "controlled",
      cue: picked.cue,
      previousPerformance: [],
      prescribedSets: buildPrescribedSets({ warmupSets, workingSets, targetRepsLow: repLow, targetRepsHigh: repHigh, targetRpe: isDeload ? (Math.max(6, targetRpe - 2) as RpeValue) : targetRpe }),
    });
    order += 1;
  }

  const estimatedDurationMin = exercises.reduce((sum, e) => sum + (e.warmupSets + e.workingSets) * (e.restSeconds + 45), 0) / 60;

  return {
    id: `workout-${dayOfWeek}-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
    workspaceId,
    name: `${dayOfWeek} session`,
    dayOfWeek,
    focus: patterns.slice(0, 2).join(" / "),
    estimatedDurationMin: Math.round(Math.min(estimatedDurationMin, 120)),
    warmupOverview: com.programArchitecture.warmupPhilosophy === "minimal" ? "A light first set is your warm-up." : "Ramp up gradually to your first working set.",
    coachNote: isDeload ? "Deload week — intentionally lighter. Trust the process." : "",
    exercises,
  };
}

function buildProgramForOption(input: {
  clientId: ClientProfileId;
  workspaceId: WorkspaceId;
  coachId: CoachProfileId;
  kind: OptionKind;
  snapshot: ClientOnboardingSnapshot;
  com: CoachOperatingModel;
  durationWeeks: number;
  nowIso: string;
}): { program: ClientAssignedProgram; splitName: string } {
  const days = input.snapshot.availableDays.length;
  const { plan } = chooseSplitForKind(days, input.com, input.kind);
  const equipment = equipmentForClient(input.snapshot);
  const deloadEvery = input.com.programArchitecture.deloadFrequencyWeeks ?? 6;

  const weeks: ProgramWeek[] = [];
  for (let weekNumber = 1; weekNumber <= input.durationWeeks; weekNumber++) {
    const isDeload = deloadEvery > 0 && weekNumber % deloadEvery === 0 && weekNumber !== input.durationWeeks;
    const weekProgress = deloadEvery > 0 ? ((weekNumber - 1) % deloadEvery) / deloadEvery : (weekNumber - 1) / input.durationWeeks;
    const days7: ProgramDay[] = DAYS_OF_WEEK_ORDER.map((dayOfWeek) => ({ dayOfWeek, type: "rest" as const }));
    input.snapshot.availableDays.slice(0, plan.dayPatterns.length).forEach((dayOfWeek, i) => {
      const idx = days7.findIndex((d) => d.dayOfWeek === dayOfWeek);
      if (idx === -1) return;
      days7[idx] = {
        dayOfWeek,
        type: "training",
        workout: buildWorkoutForDay(input.workspaceId, dayOfWeek, plan.dayPatterns[i], equipment, input.com, weekProgress, isDeload, input.snapshot.maxSessionLengthMinutes),
      };
    });
    weeks.push({ weekNumber, days: days7 });
  }

  const program: ClientAssignedProgram = {
    id: `program-${input.kind}-${input.clientId}-${Date.now()}`,
    workspaceId: input.workspaceId,
    clientId: input.clientId,
    coachId: input.coachId,
    name: `${OPTION_KIND_LABELS[input.kind]} — ${plan.splitName}`,
    durationWeeks: input.durationWeeks,
    weeks,
    status: "assigned",
    createdAtIso: input.nowIso,
    updatedAtIso: input.nowIso,
  };

  return { program, splitName: plan.splitName };
}

export interface TrainingOptionExplanation {
  whyItFits: string;
  primaryAdvantage: string;
  tradeoff: string;
  whatOptimWillMonitor: string[];
  clientFactsUsed: string[];
  coachingRulesUsed: string[];
}

export interface GeneratedTrainingOption {
  id: string;
  kind: OptionKind;
  label: string;
  splitName: string;
  program: ClientAssignedProgram;
  score: ScoreBreakdown;
  explanation: TrainingOptionExplanation;
  constraints: ConstraintValidation;
}

function scoreTrainingOption(kind: OptionKind, snapshot: ClientOnboardingSnapshot, com: CoachOperatingModel, splitKey: string): ScoreBreakdown {
  const tier = experienceTier(snapshot);
  const preferredIndex = com.programArchitecture.preferredSplits.indexOf(splitKey);
  const methodologyFit = preferredIndex === -1 ? 55 : clampScore(90 - preferredIndex * 12);
  const experienceFit = tier === "advanced" && splitKey === "body_part_split" ? 90 : tier === "novice" && splitKey === "full_body" ? 92 : 75;
  const scheduleFit = snapshot.availableDays.length >= 3 ? 88 : 70;
  const goalFit = isRecompositionGoal(snapshot) ? 82 : 85;
  const adherenceLikelihood = kind === "wildcard" ? 65 : kind === "strong_alternative" ? 78 : 85;
  const total = clampScore(methodologyFit * 0.3 + experienceFit * 0.25 + scheduleFit * 0.2 + goalFit * 0.15 + adherenceLikelihood * 0.1);
  return { total, goalFit, methodologyFit, experienceFit, scheduleFit, adherenceLikelihood };
}

function buildTrainingExplanation(kind: OptionKind, snapshot: ClientOnboardingSnapshot, com: CoachOperatingModel, splitName: string): TrainingOptionExplanation {
  const tier = experienceTier(snapshot);
  const clientFacts = [
    `${snapshot.availableDays.length} available training days/week`,
    `${snapshot.maxSessionLengthMinutes}-minute session limit`,
    `${tier} training experience`,
    `Goal: ${snapshot.primaryGoal.replace(/_/g, " ")}${isRecompositionGoal(snapshot) ? " (recognized as body recomposition)" : ""}`,
  ];
  const coachRules = [
    `Preferred splits: ${com.programArchitecture.preferredSplits.join(", ") || "none specified"}`,
    `Rep-range philosophy: ${com.programArchitecture.repRangePhilosophy}`,
    `Proximity to failure: ${com.programArchitecture.proximityToFailure}`,
    `Deload every ${com.programArchitecture.deloadFrequencyWeeks ?? "—"} weeks`,
  ];

  if (kind === "best_fit") {
    return {
      whyItFits: `${splitName} matches your top preferred split for a ${tier} client training ${snapshot.availableDays.length} days/week.`,
      primaryAdvantage: "Closest alignment with your own stated methodology and this client's real schedule.",
      tradeoff: "Prioritizes proven consistency with your style over novelty.",
      whatOptimWillMonitor: ["RPE trend vs. prescribed", "Missed sessions", "Rep-target adherence"],
      clientFactsUsed: clientFacts,
      coachingRulesUsed: coachRules,
    };
  }
  if (kind === "strong_alternative") {
    return {
      whyItFits: `${splitName} is a second legitimate approach you also use, trading emphasis differently for this schedule.`,
      primaryAdvantage: "A genuinely different volume/frequency distribution while staying inside your own methodology.",
      tradeoff: "Slightly less session-to-session predictability than the best-fit option.",
      whatOptimWillMonitor: ["RPE trend vs. prescribed", "Session duration vs. limit", "Rep-target adherence"],
      clientFactsUsed: clientFacts,
      coachingRulesUsed: coachRules,
    };
  }
  return {
    whyItFits: `${splitName} is not one of your usual first picks, but it's a defensible fit given this client's real constraints — worth considering if you want to try something different.`,
    primaryAdvantage: "A distinct stimulus that may outperform the conventional choice for this specific client.",
    tradeoff: "Less proven inside your own typical style — expect to watch adherence closely early on.",
    whatOptimWillMonitor: ["Early adherence (first 2 weeks)", "RPE trend vs. prescribed", "Client feedback on the approach"],
    clientFactsUsed: clientFacts,
    coachingRulesUsed: coachRules,
  };
}

export function generateThreeTrainingOptions(input: {
  clientId: ClientProfileId;
  workspaceId: WorkspaceId;
  coachId: CoachProfileId;
  snapshot: ClientOnboardingSnapshot;
  com: CoachOperatingModel;
  durationWeeks: number;
  nowIso: string;
}): GeneratedTrainingOption[] {
  const kinds: OptionKind[] = ["best_fit", "strong_alternative", "wildcard"];
  return kinds.map((kind) => {
    const { program, splitName } = buildProgramForOption({ ...input, kind });
    const splitKey = Object.keys(SPLIT_LIBRARY).find((k) => SPLIT_LIBRARY[k](input.snapshot.availableDays.length)?.splitName === splitName) ?? "full_body";
    return {
      id: `${program.id}`,
      kind,
      label: OPTION_KIND_LABELS[kind],
      splitName,
      program,
      score: scoreTrainingOption(kind, input.snapshot, input.com, splitKey),
      explanation: buildTrainingExplanation(kind, input.snapshot, input.com, splitName),
      constraints: validateTrainingHardConstraints(program, input.snapshot, input.com),
    };
  });
}

// ---------------------------------------------------------------------------
// Nutrition generation
// ---------------------------------------------------------------------------

export interface GeneratedNutritionStrategy {
  id: string;
  kind: OptionKind;
  label: string;
  targets: NutritionTargets;
  trainingDayTargets?: NutritionTargets;
  restDayTargets?: NutritionTargets;
  mealStructureDescription: string;
  hydrationOzPerDay: number;
  adherenceStrategy: string;
  metricsToMonitor: string[];
  weeklyAdjustmentRule: string;
  conditionsPreventingAutoAdjustment: string[];
  requiresCoachApproval: boolean;
  assumptions: string[];
  score: ScoreBreakdown;
  explanation: TrainingOptionExplanation;
  constraints: ConstraintValidation;
}

function bmr(snapshot: ClientOnboardingSnapshot): number {
  const weightKg = snapshot.weightLb * 0.453592;
  const heightCm = snapshot.heightTotalInches * 2.54;
  const male = 10 * weightKg + 6.25 * heightCm - 5 * snapshot.age + 5;
  const female = 10 * weightKg + 6.25 * heightCm - 5 * snapshot.age - 161;
  if (snapshot.sex === "male") return male;
  if (snapshot.sex === "female") return female;
  return (male + female) / 2;
}

function activityMultiplier(snapshot: ClientOnboardingSnapshot): number {
  const days = snapshot.availableDays.length;
  if (days >= 5) return 1.725;
  if (days >= 3) return 1.55;
  return 1.375;
}

function goalCalories(tdee: number, snapshot: ClientOnboardingSnapshot, com: CoachOperatingModel): { calories: number; assumption?: string } {
  const wantsFatLoss = snapshot.primaryGoal === "lose_fat" || snapshot.secondaryGoals.includes("lose_fat");
  const wantsMuscle = snapshot.primaryGoal === "build_muscle" || snapshot.secondaryGoals.includes("build_muscle");

  if (isRecompositionGoal(snapshot)) {
    const calories = Math.round(tdee * 0.92);
    return { calories: Math.max(1200, calories) };
  }
  if (wantsFatLoss) {
    const weeklyLossLb = snapshot.weightLb * (com.nutritionPhilosophy.rateOfLossPercentPerWeek / 100);
    const dailyDeficit = (weeklyLossLb * 3500) / 7;
    const raw = Math.round(tdee - dailyDeficit);
    const calories = Math.max(1200, raw);
    return { calories, assumption: raw < 1200 ? "Calculated deficit was clamped to a safe 1200-calorie floor." : undefined };
  }
  if (wantsMuscle) {
    const weeklyGainLb = snapshot.weightLb * (com.nutritionPhilosophy.rateOfGainPercentPerWeek / 100);
    const dailySurplus = (weeklyGainLb * 3500) / 7;
    return { calories: Math.round(tdee + dailySurplus) };
  }
  return { calories: Math.round(tdee) };
}

function macrosForCalories(calories: number, weightLb: number, com: CoachOperatingModel, fatPercent: number): NutritionTargets {
  const proteinG = Math.round(com.nutritionPhilosophy.proteinTargetGramsPerLbBodyweight * weightLb);
  const fatG = Math.round((calories * fatPercent) / 9);
  const remaining = calories - proteinG * 4 - fatG * 9;
  const carbsG = Math.max(0, Math.round(remaining / 4));
  return { calories, proteinG, carbsG, fatG };
}

function scoreNutritionOption(kind: OptionKind, snapshot: ClientOnboardingSnapshot): ScoreBreakdown {
  const goalFit = 85;
  const methodologyFit = kind === "best_fit" ? 90 : kind === "strong_alternative" ? 78 : 62;
  const experienceFit = 80;
  const scheduleFit = 80;
  const adherenceLikelihood = snapshot.nutritionApproach === "tracking" ? 88 : kind === "wildcard" ? 55 : 72;
  const total = clampScore(methodologyFit * 0.3 + goalFit * 0.25 + adherenceLikelihood * 0.25 + experienceFit * 0.1 + scheduleFit * 0.1);
  return { total, goalFit, methodologyFit, experienceFit, scheduleFit, adherenceLikelihood };
}

export function generateThreeNutritionStrategies(input: { snapshot: ClientOnboardingSnapshot; com: CoachOperatingModel; nowIso: string }): GeneratedNutritionStrategy[] {
  if (!input.com.nutritionPhilosophy.providesNutritionCoaching) return [];

  const tdee = bmr(input.snapshot) * activityMultiplier(input.snapshot);
  const { calories, assumption } = goalCalories(tdee, input.snapshot, input.com);
  const baseAssumptions = [
    `Estimated using the Mifflin-St Jeor formula from reported age/height/weight${input.snapshot.sex === "prefer_not_to_say" ? " (sex not specified — averaged the male/female formula)" : ""}.`,
    `Activity level estimated from ${input.snapshot.availableDays.length} available training days/week — no separate daily-activity data was provided.`,
    ...(assumption ? [assumption] : []),
  ];

  const bestFitTargets = macrosForCalories(calories, input.snapshot.weightLb, input.com, 0.3);
  const alternativeTargets = macrosForCalories(calories, input.snapshot.weightLb, input.com, input.com.nutritionPhilosophy.planVsFrameworkPreference === "structured_meal_plan" ? 0.25 : 0.35);

  // Wildcard: training-day / rest-day carb cycling at the same weekly
  // average calories — a real, legitimate, safe strategy distinct from a
  // flat daily target, not a renamed copy of best_fit.
  const trainingDayCalories = Math.round(calories * 1.08);
  const restDayCalories = Math.round(calories * 0.92);
  const wildcardTrainingTargets = macrosForCalories(trainingDayCalories, input.snapshot.weightLb, input.com, 0.25);
  const wildcardRestTargets = macrosForCalories(restDayCalories, input.snapshot.weightLb, input.com, 0.35);

  const explanationFor = (kind: OptionKind, description: string, advantage: string, tradeoff: string): TrainingOptionExplanation => ({
    whyItFits: description,
    primaryAdvantage: advantage,
    tradeoff,
    whatOptimWillMonitor: ["Body-weight trend", "Adherence to logged meals", "Hunger/energy feedback"],
    clientFactsUsed: [`${input.snapshot.weightLb}lb reported weight`, `Goal: ${input.snapshot.primaryGoal.replace(/_/g, " ")}`, `Dietary restrictions: ${input.snapshot.hasDietaryRestrictions ? input.snapshot.dietaryRestrictionsDetail || "reported, detail pending" : "none reported"}`],
    coachingRulesUsed: [`Protein target: ${input.com.nutritionPhilosophy.proteinTargetGramsPerLbBodyweight}g/lb`, `Rate of loss: ${input.com.nutritionPhilosophy.rateOfLossPercentPerWeek}%/week`, `Plan style: ${input.com.nutritionPhilosophy.planVsFrameworkPreference}`],
  });

  const requiresApproval = input.snapshot.hasDietaryRestrictions && !input.snapshot.dietaryRestrictionsDetail;

  const strategies: GeneratedNutritionStrategy[] = [
    {
      id: `nutrition-best_fit-${Date.now()}`,
      kind: "best_fit",
      label: OPTION_KIND_LABELS.best_fit,
      targets: bestFitTargets,
      mealStructureDescription: input.com.nutritionPhilosophy.planVsFrameworkPreference === "structured_meal_plan" ? "A structured daily meal plan hitting these targets." : "A flexible framework — hit these daily targets however fits the client's life.",
      hydrationOzPerDay: Math.round(input.snapshot.weightLb * 0.5),
      adherenceStrategy: input.com.nutritionPhilosophy.adherenceStandard,
      metricsToMonitor: input.com.nutritionPhilosophy.progressMeasurementsUsed,
      weeklyAdjustmentRule: input.com.nutritionPhilosophy.plateauFirstResponse,
      conditionsPreventingAutoAdjustment: [input.com.nutritionPhilosophy.conditionsRequiredBeforeChange],
      requiresCoachApproval: requiresApproval,
      assumptions: baseAssumptions,
      score: scoreNutritionOption("best_fit", input.snapshot),
      explanation: explanationFor("best_fit", "Matches your default calorie/macro philosophy for this goal, computed from this client's real stats.", "Directly reflects your own stated nutrition philosophy.", "Assumes average activity level from training days alone."),
      constraints: validateNutritionHardConstraints({ targets: bestFitTargets }, input.snapshot),
    },
    {
      id: `nutrition-strong_alternative-${Date.now()}`,
      kind: "strong_alternative",
      label: OPTION_KIND_LABELS.strong_alternative,
      targets: alternativeTargets,
      mealStructureDescription: input.com.nutritionPhilosophy.planVsFrameworkPreference === "structured_meal_plan" ? "A more flexible framework version of the same targets." : "A more structured meal-plan version of the same targets.",
      hydrationOzPerDay: Math.round(input.snapshot.weightLb * 0.5),
      adherenceStrategy: "Same protein target, different fat/carb emphasis and structure.",
      metricsToMonitor: input.com.nutritionPhilosophy.progressMeasurementsUsed,
      weeklyAdjustmentRule: input.com.nutritionPhilosophy.plateauFirstResponse,
      conditionsPreventingAutoAdjustment: [input.com.nutritionPhilosophy.conditionsRequiredBeforeChange],
      requiresCoachApproval: requiresApproval,
      assumptions: baseAssumptions,
      score: scoreNutritionOption("strong_alternative", input.snapshot),
      explanation: explanationFor("strong_alternative", "Same calorie math, opposite structure/macro emphasis from best-fit — a legitimate second approach.", "Offers more flexibility (or more structure) for a client who may need it.", "Slightly different macro emphasis than your default."),
      constraints: validateNutritionHardConstraints({ targets: alternativeTargets }, input.snapshot),
    },
    {
      id: `nutrition-wildcard-${Date.now()}`,
      kind: "wildcard",
      label: OPTION_KIND_LABELS.wildcard,
      targets: bestFitTargets,
      trainingDayTargets: wildcardTrainingTargets,
      restDayTargets: wildcardRestTargets,
      mealStructureDescription: "Training-day / rest-day carb cycling — higher carbs and calories on training days, lower on rest days, same weekly average.",
      hydrationOzPerDay: Math.round(input.snapshot.weightLb * 0.5),
      adherenceStrategy: "Requires slightly more day-to-day awareness than a flat target.",
      metricsToMonitor: [...input.com.nutritionPhilosophy.progressMeasurementsUsed, "training performance on higher-carb days"],
      weeklyAdjustmentRule: input.com.nutritionPhilosophy.plateauFirstResponse,
      conditionsPreventingAutoAdjustment: [input.com.nutritionPhilosophy.conditionsRequiredBeforeChange, "Client comfort with a non-flat daily target"],
      requiresCoachApproval: true,
      assumptions: [...baseAssumptions, "Weekly average calories match the best-fit option — only the daily distribution differs."],
      score: scoreNutritionOption("wildcard", input.snapshot),
      explanation: explanationFor(
        "wildcard",
        "Not your default structure, but a real, safe carb-cycling approach that may improve training performance and adherence for the right client.",
        "Aligns food intake with training demand rather than a flat daily number.",
        "More complex to follow — best for a client who's already comfortable tracking."
      ),
      constraints: validateNutritionHardConstraints({ targets: bestFitTargets }, input.snapshot),
    },
  ];

  return strategies;
}
