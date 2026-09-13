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
  candidateSplits,
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
export const INJURY_AREA_EXERCISE_CONFLICTS: Record<string, string[]> = {
  knee: ["squat", "lunge", "leg press", "leg extension"],
  shoulder: ["overhead press", "bench press", "pull-up", "lateral raise", "push-up"],
  lower_back: ["deadlift", "row", "back extension"],
  wrist_elbow: ["bench press", "push-up", "curl", "pushdown"],
  hip: ["squat", "lunge", "hip thrust"],
  ankle_foot: ["lunge", "squat"],
  neck: ["overhead press"],
};

export function exerciseConflictsWithArea(exerciseName: string, area: string): boolean {
  const name = exerciseName.toLowerCase();
  return (INJURY_AREA_EXERCISE_CONFLICTS[area] ?? []).some((term) => name.includes(term));
}

/** The same fixed, already-trusted conflict vocabulary above, flattened and
 * deduplicated — never a new medical/diagnostic vocabulary, just every term
 * this codebase already treats as a real, well-known exercise conflict. */
const ALL_INJURY_CONFLICT_TERMS = Array.from(new Set(Object.values(INJURY_AREA_EXERCISE_CONFLICTS).flat()));

/**
 * Phase 7B — finds which of those already-trusted conflict terms appear in
 * a real human's own restriction text (a client's reported injuryRestrictions
 * detail, or a coach's documented limitation from a "Proceed with
 * limitations" health-review decision — see programming-profile.ts's
 * injuryRestrictions field). This is NOT a general free-text/clinical-
 * language parser: it never infers meaning, only checks literal
 * containment of a small fixed term list, exactly the same trust model
 * this file already applies to a coach's own exercisesAvoided free-text
 * list (coach-onboarding-engine.ts's freeTextList) — a human wrote text
 * meant to steer exercise selection, and selection matches on the literal
 * terms, never on inferred intent.
 *
 * This is what lets "No loaded overhead pressing" (a coach's documented
 * limitation) actually stop "Barbell Overhead Press" from being prescribed
 * even when the client's onboarding never checked a "shoulder" injury box —
 * an acute, coach-confirmed restriction reaches generation on its own
 * words, not only via the pre-existing structured injuryBodyAreas path.
 */
export function termsMentionedInRestrictionText(text: string | null): string[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  return ALL_INJURY_CONFLICT_TERMS.filter((term) => lower.includes(term));
}

/** Every real, conservative term to exclude from exercise selection for
 * this client — the coach's own avoided-exercise list, a term per exercise
 * conflicting with a reported injury area, and a term per exercise
 * conflicting with the client/coach's own restriction text. Never a full
 * pattern exclusion (a knee restriction still allows a hinge-pattern
 * hamstring exercise, for instance) — only the specific named conflicts
 * above. */
export function avoidedTermsForProfile(profile: ClientProgrammingProfile, com: CoachOperatingModel): string[] {
  const injuryAreaTerms = profile.hasCurrentInjury ? profile.injuryBodyAreas.flatMap((area) => INJURY_AREA_EXERCISE_CONFLICTS[area] ?? []) : [];
  const restrictionTextTerms = profile.hasCurrentInjury ? termsMentionedInRestrictionText(profile.injuryRestrictions) : [];
  return [...com.programArchitecture.exercisesAvoided, ...injuryAreaTerms, ...restrictionTextTerms];
}

const CARDIO_INTEGRATION_BY_PREFERENCE: Record<ClientProgrammingProfile["cardioPreference"], string> = {
  enjoys_cardio: "2-3x/week dedicated cardio sessions, separate from lifting days where possible.",
  neutral_on_cardio: "1-2x/week light cardio, kept short and optional.",
  avoids_cardio: "Cardio need met incidentally through conditioning finishers, not a dedicated session.",
};

// ---------------------------------------------------------------------------
// Stage A — lightweight direction summaries
// ---------------------------------------------------------------------------

/** A real, distinct description of how each split concentrates work — the
 * primary lever (alongside progression/volume framing) that makes three
 * directions genuinely different structures rather than three labels on
 * the same underlying plan (Phase 5.5A spec Part 5). */
const SPECIALIZATION_EMPHASIS_BY_SPLIT: Record<string, string> = {
  full_body: "Even weekly exposure to every major movement pattern in each session — breadth over specialization.",
  upper_lower: "Concentrated upper- or lower-body emphasis each session, doubling exposure to each half of the body per week.",
  push_pull_legs: "High per-session specialization by movement role (push, pull, or legs) — more volume per pattern, less breadth per day.",
  body_part_split: "Maximum single-muscle-group specialization per session — the most concentrated, least broad structure available.",
  full_body_high_frequency: "Full-body exposure at a higher weekly frequency — more total touches per pattern than a standard full-body split.",
};

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
  /** Phase 5.5A — how this split concentrates weekly work; the primary,
   * real structural differentiator between the three directions (see
   * computeStructuralSignature). */
  specializationEmphasis: string;
  cardioIntegration: string;
  estimatedSessionLengthMin: number;
  whyItFits: string;
  howItReflectsCoach: string;
  tradeoff: string;
  constraintsHonored: string[];
  confidenceNote: string;
  /** Phase 5.5A — a short, comparison-aware sentence explaining this
   * direction's rank relative to the other two (see rankingRationaleFor) —
   * never a generic template that could apply to any client. */
  rankingRationale: string;
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

/** Phase 5.5A — the real basis for judging whether two directions are
 * "effectively duplicates" (spec Part 5): split (which determines
 * specialization/volume distribution) plus periodization/progression
 * framing and cardio integration. Frequency is deliberately excluded —
 * it's a hard client constraint (available days), not a lever OPTIM
 * should vary between directions, so all three sharing it is correct, not
 * a collision. */
export function computeStructuralSignature(summary: Pick<ProgramDirectionSummary, "splitKey" | "specializationEmphasis" | "progressionMethodDescription" | "cardioIntegration">): string {
  return [summary.splitKey, summary.specializationEmphasis, summary.progressionMethodDescription, summary.cardioIntegration].join("::");
}

/** Returns the index pair of the first two directions whose structural
 * signatures collide, or null when all are genuinely distinct. */
export function findDistinctnessCollision(summaries: ProgramDirectionSummary[]): [number, number] | null {
  for (let i = 0; i < summaries.length; i++) {
    for (let j = i + 1; j < summaries.length; j++) {
      if (computeStructuralSignature(summaries[i]) === computeStructuralSignature(summaries[j])) return [i, j];
    }
  }
  return null;
}

function rankingRationaleFor(kind: OptionKind, summary: Pick<ProgramDirectionSummary, "score">, all: Pick<ProgramDirectionSummary, "kind" | "score">[]): string {
  const sorted = [...all].sort((a, b) => b.score.total - a.score.total);
  const rank = sorted.findIndex((s) => s.kind === kind) + 1;
  if (rank === 1) {
    const runnerUp = sorted[1];
    const gap = summary.score.total - (runnerUp?.score.total ?? summary.score.total);
    return `Ranked #1 — the strongest overall match on methodology fit, schedule fit, and adherence likelihood combined (${gap >= 5 ? `a clear margin over the next option` : `a narrow edge over the next option`}).`;
  }
  const leader = sorted[0];
  const gap = leader.score.total - summary.score.total;
  if (kind === "wildcard") return `Ranked #${rank} — an intentional outlier by design, ${gap} points behind the top option on this client's specific profile, worth considering as a deliberate change of approach rather than a default.`;
  return `Ranked #${rank} — a credible option, ${gap} point${gap === 1 ? "" : "s"} behind the top pick, mainly on methodology and schedule fit.`;
}

/**
 * Builds one direction summary for an already-resolved split — the shared
 * step both the initial pass and the distinctness-repair retry (below) use,
 * so a regenerated wildcard is built through the exact same logic as the
 * original three, never a special-cased shortcut.
 */
function buildDirectionSummary(kind: OptionKind, splitKey: string, plan: { splitName: string }, input: GenerateDirectionsInput, foundationParams: WeekParameters, peakParams: WeekParameters): ProgramDirectionSummary {
  const { profile, com } = input;
  const days = profile.availableDays.length;
  const exercisesPerDay = Math.max(1, Math.floor(profile.maxSessionLengthMinutes / MINUTES_PER_EXERCISE_BUDGET));
  const estimatedSessionLengthMin = estimateSessionLength(exercisesPerDay, profile);
  const [repLow, repHigh] = repRangeForPhilosophy(com.programArchitecture.repRangePhilosophy);

  const approxVolumeDescription = `${com.programArchitecture.setsPerExerciseMin}-${com.programArchitecture.setsPerExerciseMax} working sets/exercise, scaling ${Math.round(foundationParams.volumeMultiplier * 100)}% → ${Math.round(peakParams.volumeMultiplier * 100)}% across the program.`;
  const approxIntensityDescription = `Rep range ${repLow}-${repHigh}, RPE easing in around the foundation and building toward the peak phase.`;
  const explanation = buildTrainingExplanation(kind, profile, com, plan.splitName);

  return {
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
    specializationEmphasis: SPECIALIZATION_EMPHASIS_BY_SPLIT[splitKey] ?? "A distinct weekly work distribution from the other two directions.",
    cardioIntegration: CARDIO_INTEGRATION_BY_PREFERENCE[profile.cardioPreference],
    estimatedSessionLengthMin,
    whyItFits: explanation.whyItFits,
    howItReflectsCoach: explanation.coachingRulesUsed.join(" "),
    tradeoff: explanation.tradeoff,
    constraintsHonored: constraintsHonoredFor(profile, com),
    confidenceNote: profile.dailyActivityLevelIsAssumed || profile.cardioPreferenceIsAssumed ? "Some inputs were assumed — see the client's programming readiness note." : "Every input below was directly reported by the client.",
    rankingRationale: "", // filled in once all three are known — see below.
    score: scoreTrainingOption(kind, profile, com, splitKey),
    explanation,
  };
}

export function generateProgramDirectionSummaries(input: GenerateDirectionsInput): ProgramDirectionSummary[] {
  const { profile, com, durationWeeks } = input;
  const days = profile.availableDays.length;
  const phases = computeProgramPhases(durationWeeks);
  const foundationParams = computeWeekParameters(phases[0].endWeek, durationWeeks, phases, com);
  const peakParams = computeWeekParameters(phases[phases.length - 1].startWeek, durationWeeks, phases, com);

  // Sequential, exclusion-aware split selection (Phase 5.5A fix) — each
  // kind sees every split already claimed by an earlier one, so
  // strong_alternative and wildcard can never independently land on the
  // same split the way two isolated lookups previously could.
  const bestFitSplit = chooseSplitForKind(days, com, "best_fit");
  const strongAltSplit = chooseSplitForKind(days, com, "strong_alternative", [bestFitSplit.key]);
  const wildcardSplit = chooseSplitForKind(days, com, "wildcard", [bestFitSplit.key, strongAltSplit.key]);

  const summaries: ProgramDirectionSummary[] = [
    buildDirectionSummary("best_fit", bestFitSplit.key, bestFitSplit.plan, input, foundationParams, peakParams),
    buildDirectionSummary("strong_alternative", strongAltSplit.key, strongAltSplit.plan, input, foundationParams, peakParams),
    buildDirectionSummary("wildcard", wildcardSplit.key, wildcardSplit.plan, input, foundationParams, peakParams),
  ];

  // Defense in depth + graceful degradation (spec Part 5: "never display
  // both simply to satisfy a count of three") — the sequential exclusion
  // above should already prevent a collision, but repair one if it still
  // occurs (e.g. a very low day count where the split library only offers
  // one or two genuinely valid structures — a real constraint of the split
  // library, not a bug): retry the later of the two colliding directions
  // against every other real split in the library. When no alternate split
  // exists at all, drop the duplicate outright rather than fabricate a
  // third option — an honest two (or, at the extreme, one) real directions
  // beats a false three every time.
  let collision = findDistinctnessCollision(summaries);
  let guard = 0;
  while (collision && guard < 10) {
    guard++;
    const [, duplicateIndex] = collision;
    const claimedKeys = summaries.map((s) => s.splitKey);
    const alternate = candidateSplits(days, []).find((c) => !claimedKeys.includes(c.key));
    if (alternate) {
      summaries[duplicateIndex] = buildDirectionSummary(summaries[duplicateIndex].kind, alternate.key, alternate.plan, input, foundationParams, peakParams);
    } else {
      summaries.splice(duplicateIndex, 1);
    }
    collision = findDistinctnessCollision(summaries);
  }

  for (const summary of summaries) {
    summary.rankingRationale = rankingRationaleFor(summary.kind, summary, summaries);
  }

  return summaries;
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
    rankingRationale: `A coach-directed combination of the ${primary.label.toLowerCase()} and ${secondary.label.toLowerCase()} directions — not independently ranked.`,
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
        allTrainingDays.every((d) =>
          (d.workout?.exercises ?? []).every(
            (ex) =>
              !profile.injuryBodyAreas.some((area) => exerciseConflictsWithArea(ex.name, area)) &&
              !termsMentionedInRestrictionText(profile.injuryRestrictions).some((t) => ex.name.toLowerCase().includes(t))
          )
        ),
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
