// Phase 5.5 — the two-stage program composer engine (spec Parts 2 & 3).
//
// Stage A (generateProgramDirectionSummaries): three concise, structurally
// distinct directions — real split/frequency/periodization/volume/
// intensity/progression/cardio decisions, but NO full weeks built yet.
// Stage B (buildFullProgramForDirection): called only once the coach picks
// (or combines) a direction — builds every week, every exercise, using the
// real periodization engine (program-periodization.ts) so progression is
// intentional rather than Week 1 cloned N times.
//
// Reuses lib/coach/activation-generation.ts's real split library, exercise
// picker, scoring, and explanation builders rather than duplicating them —
// this file is additive, not a parallel generation system.

import {
  buildTrainingExplanation,
  chooseSplitForKind,
  equipmentForClient,
  equipmentTagForExerciseName,
  pickExercise,
  repRangeForPhilosophy,
  scoreTrainingOption,
  SPLIT_LIBRARY,
  MINUTES_PER_EXERCISE_BUDGET,
  type ConstraintCheckResult,
  type ConstraintValidation,
  type GeneratedTrainingOption,
  type OptionKind,
  OPTION_KIND_LABELS,
  type ScoreBreakdown,
  type TrainingOptionExplanation,
} from "./activation-generation.ts";
import { buildPrescribedSets, DAYS_OF_WEEK_ORDER } from "./training.ts";
import type { EquipmentTag, LibraryExercise, MovementPattern } from "./exercise-library.ts";
import { computeProgramPhases, computeWeekParameters, shiftRepRange, applyRpeOffset, type ProgramPhase, type WeekParameters } from "./program-periodization.ts";
import type { ClientProgrammingProfile } from "./programming-profile.ts";
import type { CoachOperatingModel } from "./operating-model.ts";
import type { ClientAssignedProgram, DayOfWeek, Exercise, ProgramDay, ProgramWeek, RpeValue, Workout } from "../types";
import type { ClientProfileId, CoachProfileId, WorkspaceId } from "../tenancy/types";

const PERIODIZATION_METHOD_LABELS: Record<string, string> = {
  linear_load: "Linear — steady week-to-week load increases within each phase.",
  double_progression: "Double progression — reps first, then load, with a steady phase-to-phase ramp.",
  planned_undulation: "Planned undulation — alternating heavier/lighter weeks within each phase.",
  autoregulated: "Autoregulated — intensity ramps toward each phase's ceiling based on how the block is going.",
};

/** A real, conservative name-based conflict map — the same discipline as
 * the coach's own non-negotiable/avoided-exercise matching, extended to a
 * client's reported injury areas. Deliberately narrow: only flags a
 * well-known real conflict, never a medical judgment call. Shared by
 * exercise SELECTION (buildPeriodizedWorkoutForDay, so a conflicting
 * exercise is never picked in the first place) and hard-constraint
 * VALIDATION (validateFullProgramHardConstraints) — the two can never
 * disagree about what counts as a conflict. */
const INJURY_AREA_EXERCISE_CONFLICTS: Record<string, string[]> = {
  knee: ["squat", "lunge", "leg press", "leg extension"],
  shoulder: ["overhead press", "bench press", "pull-up", "lateral raise", "push-up"],
  lower_back: ["deadlift", "row", "back extension"],
  wrist_elbow: ["bench press", "push-up", "curl", "pushdown"],
  hip: ["squat", "lunge", "hip thrust"],
  ankle_foot: ["lunge", "squat"],
  neck: ["overhead press"],
};

function exerciseConflictsWithArea(exerciseName: string, area: string): boolean {
  const name = exerciseName.toLowerCase();
  return (INJURY_AREA_EXERCISE_CONFLICTS[area] ?? []).some((term) => name.includes(term));
}

/** Every real, conservative term to exclude from exercise selection for
 * this client — the coach's own avoided-exercise list plus a term per
 * exercise conflicting with a reported injury area. Never a full pattern
 * exclusion (a knee restriction still allows a hinge-pattern hamstring
 * exercise, for instance) — only the specific named conflicts above. */
function avoidedTermsForProfile(profile: ClientProgrammingProfile, com: CoachOperatingModel): string[] {
  const injuryTerms = profile.hasCurrentInjury ? profile.injuryBodyAreas.flatMap((area) => INJURY_AREA_EXERCISE_CONFLICTS[area] ?? []) : [];
  return [...com.programArchitecture.exercisesAvoided, ...injuryTerms];
}

const CARDIO_INTEGRATION_BY_PREFERENCE: Record<ClientProgrammingProfile["cardioPreference"], string> = {
  enjoys_cardio: "2-3x/week dedicated cardio sessions, separate from lifting days where possible.",
  neutral_on_cardio: "1-2x/week light cardio, kept short and optional.",
  avoids_cardio: "Cardio need met incidentally through conditioning finishers, not a dedicated session.",
};

// ---------------------------------------------------------------------------
// Stage A — lightweight direction summaries
// ---------------------------------------------------------------------------

export interface ProgramDirectionSummary {
  id: string;
  kind: OptionKind;
  label: string;
  splitKey: string;
  splitName: string;
  frequencyPerWeek: number;
  periodizationApproach: string;
  approxVolumeDescription: string;
  approxIntensityDescription: string;
  progressionMethodDescription: string;
  cardioIntegration: string;
  estimatedSessionLengthMin: number;
  whyItFits: string;
  howItReflectsCoach: string;
  tradeoff: string;
  constraintsHonored: string[];
  confidenceNote: string;
  score: ScoreBreakdown;
  explanation: TrainingOptionExplanation;
}

export interface GenerateDirectionsInput {
  profile: ClientProgrammingProfile;
  com: CoachOperatingModel;
  durationWeeks: number;
}

function estimateSessionLength(exerciseCount: number, profile: ClientProgrammingProfile): number {
  const estimate = exerciseCount * MINUTES_PER_EXERCISE_BUDGET;
  return Math.min(profile.maxSessionLengthMinutes, estimate);
}

function constraintsHonoredFor(profile: ClientProgrammingProfile, com: CoachOperatingModel): string[] {
  const honored = [
    `${profile.availableDays.length} available day${profile.availableDays.length === 1 ? "" : "s"}/week`,
    `${profile.maxSessionLengthMinutes}-minute session ceiling`,
    `Equipment: ${equipmentForClient(profile).join(", ")}`,
  ];
  if (profile.hasCurrentInjury && profile.injuryBodyAreas.length > 0) honored.push(`Working around: ${profile.injuryBodyAreas.join(", ")}`);
  if (com.programArchitecture.nonNegotiables.length > 0) honored.push(`Coach non-negotiables: ${com.programArchitecture.nonNegotiables.join(", ")}`);
  return honored;
}

export function generateProgramDirectionSummaries(input: GenerateDirectionsInput): ProgramDirectionSummary[] {
  const { profile, com, durationWeeks } = input;
  const days = profile.availableDays.length;
  const phases = computeProgramPhases(durationWeeks);
  const kinds: OptionKind[] = ["best_fit", "strong_alternative", "wildcard"];

  return kinds.map((kind) => {
    const { key: splitKey, plan } = chooseSplitForKind(days, com, kind);
    const exercisesPerDay = Math.max(1, Math.floor(profile.maxSessionLengthMinutes / MINUTES_PER_EXERCISE_BUDGET));
    const estimatedSessionLengthMin = estimateSessionLength(exercisesPerDay, profile);

    const foundationParams = computeWeekParameters(phases[0].endWeek, durationWeeks, phases, com);
    const peakParams = computeWeekParameters(phases[phases.length - 1].startWeek, durationWeeks, phases, com);
    const [repLow, repHigh] = repRangeForPhilosophy(com.programArchitecture.repRangePhilosophy);

    const approxVolumeDescription = `${com.programArchitecture.setsPerExerciseMin}-${com.programArchitecture.setsPerExerciseMax} working sets/exercise, scaling ${Math.round(foundationParams.volumeMultiplier * 100)}% → ${Math.round(peakParams.volumeMultiplier * 100)}% across the program.`;
    const approxIntensityDescription = `Rep range ${repLow}-${repHigh}, RPE easing in around the foundation and building toward the peak phase.`;

    const explanation = buildTrainingExplanation(kind, profile, com, plan.splitName);

    const summary: ProgramDirectionSummary = {
      id: `direction-${kind}-${splitKey}`,
      kind,
      label: OPTION_KIND_LABELS[kind],
      splitKey,
      splitName: plan.splitName,
      frequencyPerWeek: days,
      periodizationApproach: PERIODIZATION_METHOD_LABELS[com.programArchitecture.progressionMethod] ?? "Progressive overload across three phases.",
      approxVolumeDescription,
      approxIntensityDescription,
      progressionMethodDescription: com.programArchitecture.progressionMethod.replace(/_/g, " "),
      cardioIntegration: CARDIO_INTEGRATION_BY_PREFERENCE[profile.cardioPreference],
      estimatedSessionLengthMin,
      whyItFits: explanation.whyItFits,
      howItReflectsCoach: explanation.coachingRulesUsed.join(" "),
      tradeoff: explanation.tradeoff,
      constraintsHonored: constraintsHonoredFor(profile, com),
      confidenceNote: profile.dailyActivityLevelIsAssumed || profile.cardioPreferenceIsAssumed ? "Some inputs were assumed — see the client's programming readiness note." : "Every input below was directly reported by the client.",
      score: scoreTrainingOption(kind, profile, com, splitKey),
      explanation,
    };
    return summary;
  });
}

/**
 * Spec Part 2's "combine useful elements" — a real, working combination:
 * takes the chosen split/frequency from the primary direction but the
 * periodization emphasis (volume/intensity description) from the
 * secondary, producing one real synthesized direction rather than a
 * decorative merge of labels.
 */
export function combineDirections(primary: ProgramDirectionSummary, secondary: ProgramDirectionSummary): ProgramDirectionSummary {
  return {
    ...primary,
    id: `${primary.id}+${secondary.id}`,
    label: `${primary.label} + ${secondary.label} (combined)`,
    approxVolumeDescription: secondary.approxVolumeDescription,
    approxIntensityDescription: secondary.approxIntensityDescription,
    whyItFits: `${primary.whyItFits} Combined with ${secondary.label.toLowerCase()}'s volume/intensity emphasis: ${secondary.whyItFits}`,
    tradeoff: `Blends two directions — ${primary.tradeoff} ${secondary.tradeoff}`,
  };
}

// ---------------------------------------------------------------------------
// Stage B — full, periodized program generation
// ---------------------------------------------------------------------------

function buildPeriodizedWorkoutForDay(
  workspaceId: WorkspaceId,
  dayOfWeek: DayOfWeek,
  patterns: MovementPattern[],
  equipment: EquipmentTag[],
  com: CoachOperatingModel,
  profile: ClientProgrammingProfile,
  params: WeekParameters,
  maxSessionLengthMinutes: number
): Workout {
  const baseRange = repRangeForPhilosophy(com.programArchitecture.repRangePhilosophy);
  const [repLow, repHigh] = shiftRepRange(baseRange, params.repRangeShift);
  const baseRpe: RpeValue = com.programArchitecture.proximityToFailure === "0_1_reps_in_reserve" ? 9 : com.programArchitecture.proximityToFailure === "2_4_reps_in_reserve" ? 7 : 8;
  const targetRpe = applyRpeOffset(baseRpe, params.intensityRpeOffset);
  const avoidedTerms = avoidedTermsForProfile(profile, com);

  const usedNames = new Set<string>();
  const exercises: Exercise[] = [];
  let order = 1;
  const maxExercises = Math.max(1, Math.floor(maxSessionLengthMinutes / MINUTES_PER_EXERCISE_BUDGET));
  const fittedPatterns = patterns.slice(0, maxExercises);

  for (const pattern of fittedPatterns) {
    const picked: LibraryExercise | null = pickExercise(pattern, equipment, avoidedTerms, usedNames);
    if (!picked) continue;
    usedNames.add(picked.name);
    const isFirstCompound = picked.isCompound && order === 1;
    const baseWorkingSets = picked.isCompound ? com.programArchitecture.setsPerExerciseMax : com.programArchitecture.setsPerExerciseMin;
    const workingSets = Math.max(1, Math.round(baseWorkingSets * params.volumeMultiplier));
    const warmupSets = isFirstCompound ? 2 : picked.isCompound ? 1 : 0;

    exercises.push({
      id: `ex-${dayOfWeek}-${order}-${picked.name.replace(/\s+/g, "-").toLowerCase()}`,
      order,
      name: picked.name,
      warmupSets,
      workingSets,
      targetRepsLow: repLow,
      targetRepsHigh: repHigh,
      targetRpe,
      restSeconds: picked.isCompound ? 150 : 75,
      tempo: "controlled",
      cue: picked.cue,
      previousPerformance: [],
      prescribedSets: buildPrescribedSets({ warmupSets, workingSets, targetRepsLow: repLow, targetRepsHigh: repHigh, targetRpe }),
    });
    order += 1;
  }

  const estimatedDurationMin = exercises.reduce((sum, e) => sum + (e.warmupSets + e.workingSets) * (e.restSeconds + 45), 0) / 60;

  return {
    id: `workout-${dayOfWeek}-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
    workspaceId,
    name: `${dayOfWeek} session — ${params.phase.label}`,
    dayOfWeek,
    focus: patterns.slice(0, 2).join(" / "),
    estimatedDurationMin: Math.round(Math.min(estimatedDurationMin, 120)),
    warmupOverview: com.programArchitecture.warmupPhilosophy === "minimal" ? "A light first set is your warm-up." : "Ramp up gradually to your first working set.",
    coachNote: params.isDeload ? (params.isReassessmentWeek ? "Final week — deload and reassess how everything felt." : "Deload week — intentionally lighter. Trust the process.") : `${params.phase.label} phase: ${params.phase.purpose}`,
    exercises,
  };
}

export interface BuildFullProgramInput {
  clientId: ClientProfileId;
  workspaceId: WorkspaceId;
  coachId: CoachProfileId;
  profile: ClientProgrammingProfile;
  com: CoachOperatingModel;
  durationWeeks: number;
  nowIso: string;
}

/**
 * The real, heavy generation step — called exactly once, only after a
 * direction is selected (or combined). Every week is built from real
 * per-week periodization parameters (see program-periodization.ts), so the
 * program is never Week 1 cloned N times.
 */
export function buildFullProgramForDirection(direction: ProgramDirectionSummary, input: BuildFullProgramInput): GeneratedTrainingOption {
  const { profile, com, durationWeeks } = input;
  const plan = SPLIT_LIBRARY[direction.splitKey]?.(profile.availableDays.length) ?? SPLIT_LIBRARY.full_body(profile.availableDays.length)!;
  const equipment = equipmentForClient(profile);
  const phases = computeProgramPhases(durationWeeks);

  const weeks: ProgramWeek[] = [];
  for (let weekNumber = 1; weekNumber <= durationWeeks; weekNumber++) {
    const params = computeWeekParameters(weekNumber, durationWeeks, phases, com);
    const days7: ProgramDay[] = DAYS_OF_WEEK_ORDER.map((dayOfWeek) => ({ dayOfWeek, type: "rest" as const }));
    profile.availableDays.slice(0, plan.dayPatterns.length).forEach((dayOfWeek, i) => {
      const idx = days7.findIndex((d) => d.dayOfWeek === dayOfWeek);
      if (idx === -1) return;
      days7[idx] = {
        dayOfWeek,
        type: "training",
        workout: buildPeriodizedWorkoutForDay(input.workspaceId, dayOfWeek, plan.dayPatterns[i], equipment, com, profile, params, profile.maxSessionLengthMinutes),
      };
    });
    weeks.push({ weekNumber, days: days7 });
  }

  const program: ClientAssignedProgram = {
    id: `program-${direction.kind}-${input.clientId}-${Date.now()}`,
    workspaceId: input.workspaceId,
    clientId: input.clientId,
    coachId: input.coachId,
    name: `${direction.label} — ${direction.splitName}`,
    durationWeeks,
    weeks,
    status: "assigned",
    createdAtIso: input.nowIso,
    updatedAtIso: input.nowIso,
  };

  return {
    id: program.id,
    kind: direction.kind,
    label: direction.label,
    splitName: direction.splitName,
    program,
    score: direction.score,
    explanation: direction.explanation,
    constraints: validateFullProgramHardConstraints(program, profile, com),
  };
}

// ---------------------------------------------------------------------------
// Full-program hard-constraint validation (checks every week, not just
// Week 1 — see activation-generation.ts's validateTrainingHardConstraints,
// which stays exactly as-is for backward compatibility with existing
// callers/tests).
// ---------------------------------------------------------------------------

export function validateFullProgramHardConstraints(program: ClientAssignedProgram, profile: ClientProgrammingProfile, com: CoachOperatingModel): ConstraintValidation {
  const equipment = new Set(equipmentForClient(profile));
  const nonNegotiableTerms = com.programArchitecture.nonNegotiables.map((s) => s.toLowerCase());
  const avoidedTerms = com.programArchitecture.exercisesAvoided.map((s) => s.toLowerCase());
  const allTrainingDays = program.weeks.flatMap((w) => w.days.filter((d) => d.type === "training"));

  const checks: ConstraintCheckResult[] = [
    {
      id: "available_days_all_weeks",
      label: "Respects the client's available training days in every week",
      passed: program.weeks.every((w) => w.days.filter((d) => d.type === "training").every((d) => profile.availableDays.includes(d.dayOfWeek))),
    },
    {
      id: "session_duration_all_weeks",
      label: "Respects the client's maximum session length in every week",
      passed: allTrainingDays.every((d) => (d.workout?.estimatedDurationMin ?? 0) <= profile.maxSessionLengthMinutes + 10),
      reason: "A session in at least one week exceeds the client's stated maximum length.",
    },
    {
      id: "equipment_all_weeks",
      label: "Only uses equipment the client has access to, in every week",
      passed: allTrainingDays.every((d) => (d.workout?.exercises ?? []).every((ex) => equipmentTagForExerciseName(ex.name) === undefined || equipment.has(equipmentTagForExerciseName(ex.name)!))),
      reason: "An exercise in at least one week requires equipment outside the client's training environment.",
    },
    {
      id: "coach_non_negotiables_all_weeks",
      label: "Honors the coach's non-negotiable rules in every week",
      passed: nonNegotiableTerms.length === 0 || allTrainingDays.every((d) => (d.workout?.exercises ?? []).every((ex) => !nonNegotiableTerms.some((t) => ex.name.toLowerCase().includes(t)))),
    },
    {
      id: "exercises_avoided_all_weeks",
      label: "Avoids exercises the coach never prescribes, in every week",
      passed: avoidedTerms.length === 0 || allTrainingDays.every((d) => (d.workout?.exercises ?? []).every((ex) => !avoidedTerms.some((t) => ex.name.toLowerCase().includes(t)))),
    },
    {
      id: "movement_restrictions",
      label: "Avoids exercises that conflict with a reported movement restriction",
      passed:
        !profile.hasCurrentInjury ||
        allTrainingDays.every((d) => (d.workout?.exercises ?? []).every((ex) => !profile.injuryBodyAreas.some((area) => exerciseConflictsWithArea(ex.name, area)))),
      reason: "An exercise conflicts with a reported injury/movement restriction.",
    },
    {
      id: "usable_every_week",
      label: "Every training day in every week has a genuinely usable workout",
      passed: program.weeks.every((w) => {
        const trainingDays = w.days.filter((d) => d.type === "training");
        return trainingDays.length > 0 && trainingDays.every((d) => (d.workout?.exercises.length ?? 0) > 0);
      }),
    },
  ];

  return { passed: checks.every((c) => c.passed), checks };
}

export type { ProgramPhase };
