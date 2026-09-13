// Phase 5 — the universal-grammar counterpart of program-directions.ts's
// Stage B (buildFullProgramForDirection). Stage A (generateProgramDirectionSummaries,
// combineDirections) is untouched and fully reused as-is: it never produces
// Workout/Exercise-shaped content in the first place (ProgramDirectionSummary
// is pure description/scoring text), so it's already universal-safe.
//
// This file is the NEW authoring target for real generated content —
// Session/Block/TrainingItemInstance/Prescription, natively, never via
// "generate legacy, then adapt." It reuses the exact same real decision
// logic as the legacy Stage B (repRangeForPhilosophy, pickExercise,
// avoidedTermsForProfile, computeProgramPhases/computeWeekParameters) so
// resistance generation has genuine parity, not a re-derived approximation.
// lib/coach/program-directions.ts's legacy buildFullProgramForDirection
// remains unchanged and still in use by the demo-mode coach program
// composer (app/coach/clients/[clientId]/activate/page.tsx) — this file
// does not replace it, it gives the REAL Supabase-mode production write
// path (see lib/production/programs.ts) a native universal target instead
// of the placeholder single-workout clone it used before this phase.

import {
  avoidedTermsForProfile,
  exerciseConflictsWithArea,
  termsMentionedInRestrictionText,
  type ProgramDirectionSummary,
} from "./program-directions.ts";
import {
  equipmentForClient,
  pickExercise,
  repRangeForPhilosophy,
  SPLIT_LIBRARY,
  MINUTES_PER_EXERCISE_BUDGET,
  equipmentTagForExerciseName,
  type ConstraintCheckResult,
  type ConstraintValidation,
} from "./activation-generation.ts";
import { computeProgramPhases, computeWeekParameters, shiftRepRange, applyRpeOffset, type WeekParameters } from "./program-periodization.ts";
import type { SplitPlan } from "./activation-generation.ts";
import type { ClientProgrammingProfile, CardioPreference, DailyActivityLevel } from "./programming-profile.ts";
import type { CoachOperatingModel } from "./operating-model.ts";
import type { LibraryExercise, MovementPattern, EquipmentTag } from "./exercise-library.ts";
import type { DayOfWeek, RpeValue } from "../types";
import type { ClientProfileId, CoachProfileId, WorkspaceId } from "../tenancy/types";
import { validateUniversalTrainingProgramContent } from "../production/validation.ts";
import type { Block, Prescription, Session, TrainingItemInstance, UniversalProgramDay, UniversalProgramWeek, UniversalTrainingProgramContent } from "../training/types.ts";
import { DAYS_OF_WEEK_ORDER } from "./training.ts";

// ---------------------------------------------------------------------------
// Structural placeholder client context (see this phase's completion report,
// "resistance generation parity" / "issues discovered" sections, for why
// this exists and what remains a deliberate follow-up).
//
// Real per-client Supabase onboarding data is not yet mapped into a
// ClientProgrammingProfile anywhere in this codebase (lib/coach/
// programming-profile.ts's extractClientProgrammingProfile correctly
// REFUSES to run without real onboarding.answers — it never fabricates one,
// by design). Until that real Supabase-side mapping exists (a genuine,
// separate data-plumbing task, not required to migrate the GENERATION
// TARGET SHAPE to the universal grammar — this phase's actual objective),
// the real production write path needs *some* valid, safe profile to
// generate against. This placeholder is that value — never a claim about
// any real client.
//
// The demographic fields required by ClientOnboardingSnapshot (age/sex/
// weightLb/heightTotalInches) are NEVER read by this file's or
// program-directions.ts's/program-periodization.ts's actual generation
// decisions (verified by full read of both files during this phase's
// audit) — they exist here purely because the type requires them
// structurally. "prefer_not_to_say" and neutral filler numbers are used
// rather than inventing a plausible-sounding real answer.
export function buildPlaceholderProgrammingProfile(availableDays: DayOfWeek[]): ClientProgrammingProfile {
  const dailyActivityLevel: DailyActivityLevel = "lightly_active";
  const cardioPreference: CardioPreference = "neutral_on_cardio";
  return {
    // Structurally required, never read by generation logic (see doc above).
    age: 35,
    heightTotalInches: 68,
    weightLb: 170,
    sex: "prefer_not_to_say",
    primaryGoal: "general_fitness",
    secondaryGoals: [],
    trainingExperience: "some_experience",
    hasDietaryRestrictions: false,
    nutritionApproach: "unspecified",
    // Genuinely read by generation logic — conservative, safe-for-any-client
    // defaults, never a stereotype.
    availableDays,
    maxSessionLengthMinutes: 45,
    trainingEnvironment: ["private_gym"],
    recentConsistency: "unknown",
    recentWeeklyFrequency: null,
    trainingNotes: null,
    schedulePredictability: "unknown",
    preferredTrainingTimes: [],
    scheduleContext: null,
    dailyActivityLevel,
    dailyActivityLevelIsAssumed: true,
    typicalSleep: "unknown",
    consistencyObstacles: [],
    coachSupportStyle: [],
    cardioPreference,
    cardioPreferenceIsAssumed: true,
    hasCurrentInjury: false,
    injuryBodyAreas: [],
    injuryRestrictions: null,
    requiresHealthReview: false,
    healthReviewResolved: "no_review_needed",
    primaryGoalOther: null,
  };
}

// ---------------------------------------------------------------------------
// Continuous-day placement — real context (available days beyond the
// resistance split, the client's own stated cardio preference, and now
// Phase 6B's coach-methodology gate below), never a goal/sex/age-based
// stereotype (spec section 9). No dedicated day exists -> no continuous
// block is generated; honesty over coverage.
// ---------------------------------------------------------------------------

/** Phase 6B — "rarely_used" is this coach's own explicit, real, stored
 * methodology answer to "How do you use cardio in a training program?"
 * (see lib/coach/coach-onboarding-questions.ts's program_cardio question) —
 * a coach's explicit stored rule outranks the client's own soft preference
 * here (spec section 6's authority hierarchy), so continuous work is never
 * added regardless of schedule surplus or how much the client says they
 * enjoy cardio. This was previously dead data: com was never even passed
 * into decideContinuousDays, so a coach's real, configured cardio
 * philosophy had zero effect on generation (spec section 17's own
 * acceptance criterion — coach methodology must actually change output).
 * The other three real cardioPhilosophy values never suppress client
 * preference in the opposite direction — a client's own "avoids_cardio" is
 * about their willingness, not something a coach's general programming
 * style should silently override. */
function decideContinuousDays(profile: ClientProgrammingProfile, com: CoachOperatingModel, resistanceDayCount: number): DayOfWeek[] {
  if (com.programArchitecture.cardioPhilosophy === "rarely_used") return [];
  if (profile.cardioPreference === "avoids_cardio") return [];
  const extraDays = profile.availableDays.slice(resistanceDayCount);
  if (extraDays.length === 0) return [];
  const maxContinuousDays = profile.cardioPreference === "enjoys_cardio" ? Math.min(extraDays.length, 3) : Math.min(extraDays.length, 2);
  return extraDays.slice(0, maxContinuousDays);
}

/** A single continuous item — duration only, plus an honest free-text
 * effort description (completionTarget) rather than a numeric RPE: the
 * shared RpeValue type (6-10) only spans "hard working set" effort levels,
 * with no way to express a genuinely easy/conversational continuous target
 * — see this phase's "issues discovered" section. Never fabricates a
 * heart-rate zone from age (no age-based max-HR formula is used anywhere
 * in this codebase, and this phase does not introduce one). */
function buildUniversalContinuousSessionForDay(dayOfWeek: DayOfWeek): Session {
  const durationMin = 30;
  const item: TrainingItemInstance = {
    id: `cardio-${dayOfWeek}-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
    order: 1,
    name: "Easy Cardio",
    category: "continuous",
    coachCue: "Keep the effort easy and conversational the whole way through.",
    prescription: {
      family: "continuous",
      duration: { seconds: durationMin * 60 },
      completionTarget: "Easy, conversational effort",
    },
  };
  const block: Block = { id: `block-cardio-${dayOfWeek}`, kind: "straight", order: 1, items: [item] };
  return {
    id: `session-cardio-${dayOfWeek}-${Date.now()}`,
    name: `${dayOfWeek} — Easy Cardio`,
    focus: "Aerobic conditioning",
    estimatedDurationMin: durationMin,
    coachNote: "Low-intensity work — this should feel easy, not a second workout.",
    blocks: [block],
  };
}

// ---------------------------------------------------------------------------
// Resistance-day generation — the exact same decision logic as
// program-directions.ts's buildPeriodizedWorkoutForDay (rep range, RPE,
// working sets, warm-up sets, rest, exercise selection), emitting
// TrainingItemInstance/Prescription natively instead of Exercise.
// ---------------------------------------------------------------------------

function buildUniversalResistanceSessionForDay(
  dayOfWeek: DayOfWeek,
  patterns: MovementPattern[],
  equipment: EquipmentTag[],
  com: CoachOperatingModel,
  profile: ClientProgrammingProfile,
  params: WeekParameters,
  maxSessionLengthMinutes: number
): Session {
  const baseRange = repRangeForPhilosophy(com.programArchitecture.repRangePhilosophy);
  const [repLow, repHigh] = shiftRepRange(baseRange, params.repRangeShift);
  const baseRpe: RpeValue = com.programArchitecture.proximityToFailure === "0_1_reps_in_reserve" ? 9 : com.programArchitecture.proximityToFailure === "2_4_reps_in_reserve" ? 7 : 8;
  const targetRpe = applyRpeOffset(baseRpe, params.intensityRpeOffset);
  const avoidedTerms = avoidedTermsForProfile(profile, com);

  const usedNames = new Set<string>();
  const items: TrainingItemInstance[] = [];
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
    const restSeconds = picked.isCompound ? 150 : 75;

    const prescription: Prescription = {
      family: "resistance",
      sets: workingSets,
      warmupSets,
      reps: { low: repLow, high: repHigh },
      rpe: targetRpe,
      restSeconds,
      tempo: "controlled",
    };

    items.push({
      id: `item-${dayOfWeek}-${order}-${picked.name.replace(/\s+/g, "-").toLowerCase()}`,
      order,
      name: picked.name,
      category: "resistance",
      coachCue: picked.cue,
      prescription,
    });
    order += 1;
  }

  const blocks: Block[] = items.map((item, i) => ({ id: `block-${item.id}`, kind: "straight", order: i + 1, items: [item] }));

  const estimatedDurationMin =
    items.reduce((sum, item) => {
      const p = item.prescription;
      return sum + ((p.warmupSets ?? 0) + (p.sets ?? 0)) * ((p.restSeconds ?? 0) + 45);
    }, 0) / 60;

  return {
    id: `session-${dayOfWeek}-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
    name: `${dayOfWeek} session — ${params.phase.label}`,
    focus: patterns.slice(0, 2).join(" / "),
    estimatedDurationMin: Math.round(Math.min(estimatedDurationMin, 120)),
    warmupOverview: com.programArchitecture.warmupPhilosophy === "minimal" ? "A light first set is your warm-up." : "Ramp up gradually to your first working set.",
    coachNote: params.isDeload ? (params.isReassessmentWeek ? "Final week — deload and reassess how everything felt." : "Deload week — intentionally lighter. Trust the process.") : `${params.phase.label} phase: ${params.phase.purpose}`,
    blocks,
  };
}

/** Resolves a real split plan for a POSSIBLY-REDUCED day count (see
 * buildUniversalProgramForDirection's resistanceDayCount below) — the
 * direction's own splitKey was only ever proven valid against the client's
 * full availableDays.length by generateProgramDirectionSummaries, not
 * against a smaller resistance-day target, so this re-resolves it safely
 * and falls back exactly the way activation-generation.ts's own
 * chooseSplitForKind does for a day count no listed split supports (e.g. 1
 * day) — full body, manually built, never a thrown error over a plan
 * lookup miss. */
function resolveSplitPlanForDayCount(splitKey: string, days: number): SplitPlan {
  const plan = SPLIT_LIBRARY[splitKey]?.(days) ?? SPLIT_LIBRARY.full_body(days);
  if (plan) return plan;
  return { splitName: "Full body", dayPatterns: Array.from({ length: days }, () => ["squat", "hinge", "push_horizontal", "pull_horizontal", "core"]) };
}

// ---------------------------------------------------------------------------
// Top-level: the universal counterpart of buildFullProgramForDirection.
// ---------------------------------------------------------------------------

export interface BuildUniversalProgramInput {
  clientId: ClientProfileId;
  workspaceId: WorkspaceId;
  coachId: CoachProfileId;
  profile: ClientProgrammingProfile;
  com: CoachOperatingModel;
  durationWeeks: number;
  nowIso: string;
}

export interface GeneratedUniversalProgram {
  content: UniversalTrainingProgramContent;
  constraints: ConstraintValidation;
}

/** Every real hard constraint program-directions.ts's own
 * validateFullProgramHardConstraints checks, generalized to read
 * Session/Block/TrainingItemInstance instead of Workout/Exercise — the two
 * validators must never disagree about what counts as a violation. */
export function validateUniversalProgramHardConstraints(
  content: UniversalTrainingProgramContent,
  profile: ClientProgrammingProfile,
  com: CoachOperatingModel
): ConstraintValidation {
  const equipment = new Set(equipmentForClient(profile));
  const nonNegotiableTerms = com.programArchitecture.nonNegotiables.map((s) => s.toLowerCase());
  const avoidedTerms = com.programArchitecture.exercisesAvoided.map((s) => s.toLowerCase());
  const allTrainingDays = content.weeks.flatMap((w) => w.days.filter((d) => d.type === "training"));
  const resistanceItems = (day: UniversalProgramDay) => (day.sessions ?? []).flatMap((s) => s.blocks.flatMap((b) => b.items)).filter((i) => i.category === "resistance");

  const checks: ConstraintCheckResult[] = [
    {
      id: "available_days_all_weeks",
      label: "Respects the client's available training days in every week",
      passed: content.weeks.every((w) => w.days.filter((d) => d.type === "training").every((d) => profile.availableDays.includes(d.dayOfWeek))),
    },
    {
      id: "session_duration_all_weeks",
      label: "Respects the client's maximum session length in every week",
      passed: allTrainingDays.every((d) => (d.sessions ?? []).every((s) => s.estimatedDurationMin <= profile.maxSessionLengthMinutes + 10)),
      reason: "A session in at least one week exceeds the client's stated maximum length.",
    },
    {
      id: "equipment_all_weeks",
      label: "Only uses equipment the client has access to, in every week",
      passed: allTrainingDays.every((d) => resistanceItems(d).every((item) => equipmentTagForExerciseName(item.name) === undefined || equipment.has(equipmentTagForExerciseName(item.name)!))),
      reason: "An exercise in at least one week requires equipment outside the client's training environment.",
    },
    {
      id: "coach_non_negotiables_all_weeks",
      label: "Honors the coach's non-negotiable rules in every week",
      passed: nonNegotiableTerms.length === 0 || allTrainingDays.every((d) => resistanceItems(d).every((item) => !nonNegotiableTerms.some((t) => item.name.toLowerCase().includes(t)))),
    },
    {
      id: "exercises_avoided_all_weeks",
      label: "Avoids exercises the coach never prescribes, in every week",
      passed: avoidedTerms.length === 0 || allTrainingDays.every((d) => resistanceItems(d).every((item) => !avoidedTerms.some((t) => item.name.toLowerCase().includes(t)))),
    },
    {
      id: "movement_restrictions_all_weeks",
      label: "Avoids exercises that conflict with a reported movement restriction, in every week",
      passed:
        !profile.hasCurrentInjury ||
        allTrainingDays.every((d) =>
          resistanceItems(d).every(
            (item) =>
              !profile.injuryBodyAreas.some((area) => exerciseConflictsWithArea(item.name, area)) &&
              !termsMentionedInRestrictionText(profile.injuryRestrictions).some((t) => item.name.toLowerCase().includes(t))
          )
        ),
      reason: "An exercise conflicts with a reported injury/movement restriction.",
    },
    {
      id: "usable_every_week",
      label: "Every training day in every week has a genuinely usable session",
      passed: content.weeks.every((w) => {
        const trainingDays = w.days.filter((d) => d.type === "training");
        return trainingDays.length > 0 && trainingDays.every((d) => (d.sessions ?? []).length > 0 && (d.sessions ?? []).every((s) => s.blocks.length > 0));
      }),
    },
    {
      id: "only_executable_families",
      label: "Only generates families the client execution engine can currently run (resistance, continuous)",
      passed: content.weeks.every((w) =>
        w.days.every((d) => (d.sessions ?? []).every((s) => s.blocks.every((b) => b.items.every((i) => i.category === "resistance" || i.category === "continuous"))))
      ),
      reason: "Generated an execution family the live client engine cannot yet run.",
    },
  ];

  return { passed: checks.every((c) => c.passed), checks };
}

/**
 * The real, heavy universal generation step — the direct universal-output
 * counterpart of program-directions.ts's buildFullProgramForDirection.
 * Reuses the exact same periodization/rep-range/RPE/exercise-selection
 * decisions (via the same shared pure helpers) so resistance content has
 * genuine parity, while emitting Session/Block/TrainingItemInstance
 * natively. Always validates before returning — a caller must never persist
 * or activate the result without checking `constraints.passed` and trusting
 * that validateUniversalTrainingProgramContent already succeeded (it throws
 * InvalidPersistedContentError here if the structural shape is ever wrong,
 * which should only be reachable by a genuine bug in this function itself).
 */
/** Phase 6B — a concise, real coach-review rationale (spec section 30),
 * built entirely from fields ProgramDirectionSummary already computed —
 * never a separate, independently-drifting description, and never a giant
 * reasoning dump. Explains WHAT was chosen and WHY in the client's/coach's
 * own real terms (split, schedule, coach-methodology fit, any continuous
 * placement), not "AI chose this." */
function buildGenerationRationale(direction: ProgramDirectionSummary, resistanceDayCount: number, continuousDays: DayOfWeek[]): string {
  const lines: string[] = [
    `${direction.splitName} (${resistanceDayCount}x/week) — ${direction.whyItFits}`,
    direction.howItReflectsCoach,
    direction.rankingRationale,
  ];
  if (continuousDays.length > 0) {
    lines.push(`Added ${continuousDays.length} continuous-work day${continuousDays.length === 1 ? "" : "s"} (${continuousDays.join(", ")}) — real schedule surplus beyond the resistance split, matching the client's own stated cardio preference.`);
  }
  if (direction.confidenceNote) lines.push(direction.confidenceNote);
  return lines.filter((l) => l && l.trim().length > 0).join(" ");
}

export function buildUniversalProgramForDirection(direction: ProgramDirectionSummary, input: BuildUniversalProgramInput): GeneratedUniversalProgram {
  const { profile, com, durationWeeks } = input;
  // Phase 5 fix — resistance days are capped at the coach's own stated
  // typical frequency ceiling (ProgramArchitectureProfile.
  // typicalFrequencyDaysMax), never simply every day the client says
  // they're available. Before this, resistanceDayCount was always derived
  // from the split plan's own dayPatterns.length, which every SPLIT_LIBRARY
  // factory sizes to exactly availableDays.length — so decideContinuousDays
  // below could never see a real surplus day, and mixed resistance +
  // continuous generation was structurally impossible regardless of
  // client's cardio preference or schedule. A client who reports more
  // available days than the coach's methodology actually programs
  // resistance work on has real surplus days that decideContinuousDays can
  // legitimately place cardio on — a coach-methodology-driven bound, not a
  // demographic assumption.
  const resistanceDayCount = Math.max(1, Math.min(profile.availableDays.length, com.programArchitecture.typicalFrequencyDaysMax));
  const plan = resolveSplitPlanForDayCount(direction.splitKey, resistanceDayCount);
  const equipment = equipmentForClient(profile);
  const phases = computeProgramPhases(durationWeeks);
  const continuousDays = decideContinuousDays(profile, com, resistanceDayCount);

  const weeks: UniversalProgramWeek[] = [];
  for (let weekNumber = 1; weekNumber <= durationWeeks; weekNumber++) {
    const params = computeWeekParameters(weekNumber, durationWeeks, phases, com);
    const days: UniversalProgramDay[] = DAYS_OF_WEEK_ORDER.map((dayOfWeek): UniversalProgramDay => ({ dayOfWeek, type: "rest" }));

    profile.availableDays.slice(0, resistanceDayCount).forEach((dayOfWeek, i) => {
      const idx = days.findIndex((d) => d.dayOfWeek === dayOfWeek);
      if (idx === -1) return;
      days[idx] = {
        dayOfWeek,
        type: "training",
        sessions: [buildUniversalResistanceSessionForDay(dayOfWeek, plan.dayPatterns[i], equipment, com, profile, params, profile.maxSessionLengthMinutes)],
      };
    });

    continuousDays.forEach((dayOfWeek) => {
      const idx = days.findIndex((d) => d.dayOfWeek === dayOfWeek);
      if (idx === -1 || days[idx].type === "training") return; // never overwrite a resistance day
      days[idx] = { dayOfWeek, type: "training", sessions: [buildUniversalContinuousSessionForDay(dayOfWeek)] };
    });

    weeks.push({ weekNumber, days });
  }

  const content: UniversalTrainingProgramContent = {
    schemaVersion: 2,
    id: `program-${direction.kind}-${input.clientId}-${Date.now()}`,
    workspaceId: input.workspaceId,
    clientId: input.clientId,
    coachId: input.coachId,
    name: `${direction.label} — ${direction.splitName}`,
    durationWeeks,
    weeks,
    generationRationale: buildGenerationRationale(direction, resistanceDayCount, continuousDays),
    status: "assigned",
    createdAtIso: input.nowIso,
    updatedAtIso: input.nowIso,
  };

  // Fail safe, before this content can ever reach a caller that might
  // persist or activate it (spec section 5/23) — a genuine bug in this
  // generator throws InvalidPersistedContentError here, loudly, rather than
  // silently producing malformed content someone downstream has to catch.
  validateUniversalTrainingProgramContent(content);

  return { content, constraints: validateUniversalProgramHardConstraints(content, profile, com) };
}
