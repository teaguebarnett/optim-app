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
import {
  applyResistanceRules,
  applyContinuousRules,
  resolveRulePrecedence,
  reconcileContextMismatches,
  mergeDiagnostics,
  emptyDiagnostics,
  type ApplicableRule,
  type RuleApplicationDiagnostics,
} from "./rule-application.ts";
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
function buildUniversalContinuousSessionForDay(dayOfWeek: DayOfWeek, rules: ApplicableRule[]): { session: Session; diagnostics: RuleApplicationDiagnostics } {
  const baseDurationSeconds = 30 * 60;
  const { durationSeconds, diagnostics } = applyContinuousRules(baseDurationSeconds, rules);
  const item: TrainingItemInstance = {
    id: `cardio-${dayOfWeek}-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
    order: 1,
    name: "Easy Cardio",
    category: "continuous",
    coachCue: "Keep the effort easy and conversational the whole way through.",
    prescription: {
      family: "continuous",
      duration: { seconds: durationSeconds },
      completionTarget: "Easy, conversational effort",
    },
  };
  const block: Block = { id: `block-cardio-${dayOfWeek}`, kind: "straight", order: 1, items: [item] };
  const session: Session = {
    id: `session-cardio-${dayOfWeek}-${Date.now()}`,
    name: `${dayOfWeek} — Easy Cardio`,
    focus: "Aerobic conditioning",
    estimatedDurationMin: Math.round(durationSeconds / 60),
    coachNote: "Low-intensity work — this should feel easy, not a second workout.",
    blocks: [block],
  };
  return { session, diagnostics };
}

/** Phase 11A — "prescribed_for_conditioning" is this coach's own real,
 * stored answer to the SAME program_cardio onboarding question
 * decideContinuousDays already reads — the one real, existing coach
 * methodology signal that clearly and specifically maps to interval/HIIT
 * work (its own onboarding label: "Prescribed for general conditioning,
 * regardless of goal"), never a fabricated new field. HIIT is a
 * prescription FORMAT, never a client goal (spec section 5) — this
 * function only ever decides whether the coach's own general programming
 * style calls for it, completely independent of the client's own
 * primaryGoal. Does not suppress the day-selection logic itself
 * (decideContinuousDays' own schedule-surplus/client-preference reasoning
 * still applies unchanged) — it only decides what CONTENT fills those
 * days. */
function usesIntervalConditioning(com: CoachOperatingModel): boolean {
  return com.programArchitecture.cardioPhilosophy === "prescribed_for_conditioning";
}

/** Phase 11C — "athletic_performance" is this coach's own real, stored
 * answer to "Which goals do you most commonly support?" (see
 * lib/coach/coach-onboarding-questions.ts's practice_common_goals
 * question, which feeds BOTH practice.commonGoals and outcomePriorities) —
 * a genuine, already-collected, coach-PRACTICE-level signal (what this
 * coach's business generally serves), never a per-client goal (spec
 * section 3/22's own "athletic/power coach" framing is exactly this: the
 * coach's overall methodology, not any one client's stated preference —
 * mirrors usesIntervalConditioning's own "coach methodology, not client
 * goal" discipline). Exhaustively audited: no other field in
 * CoachOperatingModel maps to power/plyometric methodology today — this is
 * the one real signal, not a fabricated new one (spec section 23's
 * "document the onboarding gap" escape hatch was considered and rejected
 * here specifically because a real signal already exists). */
function usesAthleticPowerTraining(com: CoachOperatingModel): boolean {
  return com.practice.commonGoals.includes("athletic_performance");
}

/** Phase 11C — "general_then_specific" ("General movement prep, then
 * specific ramp-up") is this coach's own real, stored answer to "What's
 * your warm-up philosophy?" (see lib/coach/coach-onboarding-questions.ts's
 * program_warmup question) — already collected, already read elsewhere for
 * warmupOverview text; this is the first place it also gates real
 * mobility-item generation, not a new field. A coach without this
 * methodology gets no mobility block — never every general-fitness
 * program (spec section 22). */
function usesMobilityWork(com: CoachOperatingModel): boolean {
  return com.programArchitecture.warmupPhilosophy === "general_then_specific";
}

/** A single power/plyometric item — a bounded, sane V1 default (Box Jump,
 * 4 sets x 3 reps, real 2-minute rest — spec section 5's own "sets +
 * reps" pattern), since no coach-configured plyometric progression exists
 * in the current coach operating model yet (same honest "document the
 * capability, do not block execution" posture as buildUniversalIntervalSessionForDay's
 * own doc). Preserves the coach's own qualitative instruction ("Maximum
 * intent... stick each landing") rather than inventing a numeric
 * explosiveness score (spec section 7). Not fed through any rule-
 * application pathway — same reasoning as interval/circuit's own
 * generator functions. */
function buildPowerItem(dayOfWeek: DayOfWeek): TrainingItemInstance {
  return {
    id: `power-${dayOfWeek}-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
    order: 1,
    name: "Box Jump",
    category: "power",
    coachCue: "Maximum intent on the jump — stick each landing before resetting.",
    prescription: {
      family: "power",
      sets: 4,
      reps: { low: 3, high: 3 },
      restSeconds: 120,
    },
  };
}

/** A single mobility item — a bounded, sane V1 default (90/90 Hip
 * Rotation, a dynamic, warm-up-appropriate movement-prep drill — spec
 * section 13's own "reps" pattern, with real "/ side" semantics via
 * Prescription.side, spec section 14). Same "document the gap, do not
 * block execution" posture and "no rule-application pathway" reasoning as
 * buildPowerItem above. */
function buildMobilityItem(dayOfWeek: DayOfWeek): TrainingItemInstance {
  return {
    id: `mobility-${dayOfWeek}-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
    order: 1,
    name: "90/90 Hip Rotation",
    category: "mobility",
    coachCue: "Move through the full range on both sides — control, not speed.",
    prescription: {
      family: "mobility",
      sets: 1,
      reps: { low: 8, high: 8 },
      side: "alternating",
    },
  };
}

/** A single interval item — a bounded, sane V1 default (6 rounds, 30s work
 * / 90s recovery) since no coach-configured work:rest ratio or interval
 * frequency exists in the current coach operating model yet (spec section
 * 19: "if existing coach model lacks sufficient interval methodology,
 * document this for later onboarding work — do not block execution
 * architecture unnecessarily"). Not fed through applyContinuousRules or any
 * other rule-application pathway — Phase 9C's learned-rule system was never
 * designed with interval in mind, and broadening it is explicitly out of
 * this phase's scope (spec section 26). */
function buildUniversalIntervalSessionForDay(dayOfWeek: DayOfWeek): { session: Session; diagnostics: RuleApplicationDiagnostics } {
  const rounds = 6;
  const workSeconds = 30;
  const recoverySeconds = 90;
  const item: TrainingItemInstance = {
    id: `interval-${dayOfWeek}-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
    order: 1,
    name: "Interval Conditioning",
    category: "interval",
    coachCue: "Max effort on every work interval — use the full recovery between rounds.",
    prescription: {
      family: "interval",
      rounds,
      workInterval: { seconds: workSeconds },
      recoveryInterval: { seconds: recoverySeconds },
      rpe: 8,
    },
  };
  const block: Block = { id: `block-interval-${dayOfWeek}`, kind: "interval", order: 1, items: [item] };
  const session: Session = {
    id: `session-interval-${dayOfWeek}-${Date.now()}`,
    name: `${dayOfWeek} — Interval Conditioning`,
    focus: "Anaerobic conditioning",
    estimatedDurationMin: Math.round((rounds * (workSeconds + recoverySeconds)) / 60),
    coachNote: "Conditioning work — push hard on every work interval, use the recovery to reset.",
    blocks: [block],
  };
  return { session, diagnostics: emptyDiagnostics() };
}

/** Phase 11B — a real, repeating circuit block: a bounded, sane V1 default
 * (3 rounds, 3 bodyweight/equipment-free items) since — same honest gap as
 * interval above — no coach-configured circuit structure (which items,
 * which rep/duration targets, round count) exists in the current coach
 * operating model yet. Bodyweight-only deliberately: this generator has no
 * per-client equipment context available at this call site (equipmentForClient
 * is resolved once, outside these day-builders, for resistance selection
 * only), so a default circuit must never assume equipment a client may not
 * have — see buildPlaceholderProgrammingProfile's own "never a stereotype,
 * never an unconfirmed assumption" discipline. Not fed through any
 * rule-application pathway, for the exact same reason as interval's own
 * function above. */
function buildUniversalCircuitSessionForDay(dayOfWeek: DayOfWeek): { session: Session; diagnostics: RuleApplicationDiagnostics } {
  const rounds = 3;
  const items: TrainingItemInstance[] = [
    {
      id: `circuit-${dayOfWeek}-squat-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
      order: 1,
      name: "Bodyweight Squat",
      category: "resistance",
      coachCue: "Full range of motion, controlled tempo.",
      prescription: { family: "resistance", reps: { low: 15, high: 15 } },
    },
    {
      id: `circuit-${dayOfWeek}-pushup-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
      order: 2,
      name: "Push-Up",
      category: "resistance",
      coachCue: "Full range of motion — knees down is fine.",
      prescription: { family: "resistance", reps: { low: 12, high: 12 } },
    },
    {
      id: `circuit-${dayOfWeek}-mountainclimber-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
      order: 3,
      name: "Mountain Climbers",
      category: "continuous",
      coachCue: "Quick, controlled pace — drive the knees.",
      prescription: { family: "continuous", duration: { seconds: 30 } },
    },
  ];
  const block: Block = { id: `block-circuit-${dayOfWeek}`, kind: "circuit", order: 1, name: "Conditioning Circuit", rounds, restBetweenItemsSeconds: 15, restBetweenRoundsSeconds: 90, items };
  const session: Session = {
    id: `session-circuit-${dayOfWeek}-${Date.now()}`,
    name: `${dayOfWeek} — Conditioning Circuit`,
    focus: "Anaerobic conditioning",
    estimatedDurationMin: Math.round((rounds * (items.length * 45 + 90)) / 60),
    coachNote: "Move with control through each round — quality over speed.",
    blocks: [block],
  };
  return { session, diagnostics: emptyDiagnostics() };
}

/** Phase 11D — a bounded, sane V1 AMRAP default (spec section 41's own
 * acceptance-shaped example: bodyweight items, a real time cap, genuinely
 * unbounded rounds — `rounds` deliberately absent, `terminationMode:
 * "time_cap"`, see Block.terminationMode's own doc). Same "document the
 * capability, do not block execution" posture and "no rule-application
 * pathway" reasoning as buildUniversalCircuitSessionForDay immediately
 * above — bodyweight-only since this generator call site has no
 * per-client equipment context available. */
function buildUniversalAmrapSessionForDay(dayOfWeek: DayOfWeek): { session: Session; diagnostics: RuleApplicationDiagnostics } {
  const timeCapSeconds = 12 * 60;
  const items: TrainingItemInstance[] = [
    {
      id: `amrap-${dayOfWeek}-squat-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
      order: 1,
      name: "Goblet Squat",
      category: "resistance",
      coachCue: "Full depth, controlled tempo.",
      prescription: { family: "resistance", reps: { low: 8, high: 8 } },
    },
    {
      id: `amrap-${dayOfWeek}-pushup-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
      order: 2,
      name: "Push-Up",
      category: "resistance",
      coachCue: "Full range of motion — knees down is fine.",
      prescription: { family: "resistance", reps: { low: 10, high: 10 } },
    },
    {
      id: `amrap-${dayOfWeek}-bike-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
      order: 3,
      name: "Assault Bike",
      category: "continuous",
      coachCue: "Steady, sustainable pace — this repeats for the whole time cap.",
      prescription: { family: "continuous", duration: { seconds: 30 } },
    },
  ];
  const block: Block = { id: `block-amrap-${dayOfWeek}`, kind: "circuit", order: 1, name: "Conditioning AMRAP", terminationMode: "time_cap", timeCapSeconds, items };
  const session: Session = {
    id: `session-amrap-${dayOfWeek}-${Date.now()}`,
    name: `${dayOfWeek} — Conditioning AMRAP`,
    focus: "Anaerobic conditioning",
    estimatedDurationMin: Math.round(timeCapSeconds / 60),
    coachNote: "Move at a sustainable pace — the goal is consistent rounds, not a fast start that fades.",
    blocks: [block],
  };
  return { session, diagnostics: emptyDiagnostics() };
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
  maxSessionLengthMinutes: number,
  rules: ApplicableRule[]
): { session: Session; diagnostics: RuleApplicationDiagnostics } {
  const baseRange = repRangeForPhilosophy(com.programArchitecture.repRangePhilosophy);
  const [baseRepLow, baseRepHigh] = shiftRepRange(baseRange, params.repRangeShift);
  const baseRpe: RpeValue = com.programArchitecture.proximityToFailure === "0_1_reps_in_reserve" ? 9 : com.programArchitecture.proximityToFailure === "2_4_reps_in_reserve" ? 7 : 8;
  const baseTargetRpe = applyRpeOffset(baseRpe, params.intensityRpeOffset);
  const avoidedTerms = avoidedTermsForProfile(profile, com);

  const usedNames = new Set<string>();
  const items: TrainingItemInstance[] = [];
  const itemDiagnostics: RuleApplicationDiagnostics[] = [];
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

    // Rules only ever nudge a base value that explicit methodology/
    // periodization already computed — the item's own resolved
    // MovementPattern (`pattern`) IS the same "item family" concept Phase
    // 9A/9B's exercise-family resolution produces (see
    // lib/patterns/exercise-family.ts), so no separate lookup is needed
    // here: pickExercise itself guarantees picked.pattern === pattern.
    const { result: nudged, diagnostics } = applyResistanceRules(
      { sets: workingSets, repsLow: baseRepLow, repsHigh: baseRepHigh, rpe: baseTargetRpe, restSeconds, warmupSets },
      pattern,
      rules,
      com
    );
    itemDiagnostics.push(diagnostics);

    const prescription: Prescription = {
      family: "resistance",
      sets: nudged.sets,
      warmupSets: nudged.warmupSets,
      reps: { low: nudged.repsLow, high: nudged.repsHigh },
      rpe: nudged.rpe,
      restSeconds: nudged.restSeconds,
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

  const session: Session = {
    id: `session-${dayOfWeek}-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
    name: `${dayOfWeek} session — ${params.phase.label}`,
    focus: patterns.slice(0, 2).join(" / "),
    estimatedDurationMin: Math.round(Math.min(estimatedDurationMin, 120)),
    warmupOverview: com.programArchitecture.warmupPhilosophy === "minimal" ? "A light first set is your warm-up." : "Ramp up gradually to your first working set.",
    coachNote: params.isDeload ? (params.isReassessmentWeek ? "Final week — deload and reassess how everything felt." : "Deload week — intentionally lighter. Trust the process.") : `${params.phase.label} phase: ${params.phase.purpose}`,
    blocks,
  };
  return { session, diagnostics: mergeDiagnostics(itemDiagnostics) };
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
  /** Phase 9C — the coach's real, ACTIVE, coach-confirmed learned rules
   * already scoped to this exact coach+client (see
   * lib/production/rule-resolution.ts) — never a PatternCandidate, never
   * fetched by this pure function itself. Optional and defaults to empty:
   * a coach/client with no learned rules yet must generate IDENTICALLY to
   * pre-Phase-9C behavior (spec section 36's own regression requirement) —
   * every existing caller that doesn't pass this continues to work
   * unchanged. */
  applicableRules?: ApplicableRule[];
}

export interface GeneratedUniversalProgram {
  content: UniversalTrainingProgramContent;
  constraints: ConstraintValidation;
  /** Phase 9C — bounded, auditable provenance: which real active rules
   * were actually used to shape this proposal, and which were considered
   * but skipped, with one honest categorical reason each (spec section
   * 14/30/39). Always present (empty when applicableRules was empty/absent)
   * so callers never need to null-check it. */
  ruleApplication: RuleApplicationDiagnostics;
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
      // Phase 11A — "interval" added: the live client engine now has a real,
      // tested round/phase execution path for it (lib/state.ts's
      // BEGIN_INTERVAL_EXECUTION/ADVANCE_INTERVAL_PHASE/FINALIZE_INTERVAL_EXECUTION,
      // lib/workout/interval.ts, components/workout/live/interval-*-panel.tsx)
      // — this gate exists specifically to prevent generation from ever
      // outrunning what the client can actually execute, so it moves in
      // lockstep with that real capability, never ahead of it.
      id: "only_executable_families",
      label: "Only generates families the client execution engine can currently run (resistance, continuous, interval, power, mobility)",
      passed: content.weeks.every((w) =>
        w.days.every((d) =>
          (d.sessions ?? []).every((s) =>
            s.blocks.every((b) => b.items.every((i) => i.category === "resistance" || i.category === "continuous" || i.category === "interval" || i.category === "power" || i.category === "mobility"))
          )
        )
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
/** Phase 6B/11A — a concise, real coach-review rationale (spec section 30),
 * built entirely from fields ProgramDirectionSummary already computed —
 * never a separate, independently-drifting description, and never a giant
 * reasoning dump. Explains WHAT was chosen and WHY in the client's/coach's
 * own real terms (split, schedule, coach-methodology fit, any continuous/
 * interval placement), not "AI chose this." */
function buildGenerationRationale(
  direction: ProgramDirectionSummary,
  resistanceDayCount: number,
  continuousDays: DayOfWeek[],
  isIntervalConditioning: boolean,
  includesPower: boolean,
  includesMobility: boolean
): string {
  const lines: string[] = [
    `${direction.splitName} (${resistanceDayCount}x/week) — ${direction.whyItFits}`,
    direction.howItReflectsCoach,
    direction.rankingRationale,
  ];
  if (continuousDays.length > 0) {
    if (isIntervalConditioning) {
      // Phase 11B/11D — honestly names EVERY format actually present (the
      // first conditioning day is interval, the second is circuit, any
      // further one is AMRAP — see the real day-building loop above),
      // never a blanket "interval" label that would misdescribe a
      // circuit/AMRAP day.
      const intervalDays = continuousDays.slice(0, 1);
      const circuitDays = continuousDays.slice(1, 2);
      const amrapDays = continuousDays.slice(2);
      lines.push(`Added ${intervalDays.length} interval-conditioning day${intervalDays.length === 1 ? "" : "s"} (${intervalDays.join(", ")}) — real schedule surplus beyond the resistance split, matching this coach's own stored conditioning methodology.`);
      if (circuitDays.length > 0) {
        lines.push(`Added ${circuitDays.length} conditioning-circuit day${circuitDays.length === 1 ? "" : "s"} (${circuitDays.join(", ")}) — additional real schedule surplus, for format variety within the same conditioning methodology.`);
      }
      if (amrapDays.length > 0) {
        lines.push(`Added ${amrapDays.length} conditioning-AMRAP day${amrapDays.length === 1 ? "" : "s"} (${amrapDays.join(", ")}) — additional real schedule surplus, for further format variety within the same conditioning methodology.`);
      }
    } else {
      lines.push(`Added ${continuousDays.length} continuous-work day${continuousDays.length === 1 ? "" : "s"} (${continuousDays.join(", ")}) — real schedule surplus beyond the resistance split, matching the client's own stated cardio preference.`);
    }
  }
  if (includesMobility) lines.push(`Added mobility movement-prep to the first training day — matches this coach's own stored warm-up methodology.`);
  if (includesPower) lines.push(`Added a power/plyometric finisher to the first training day — matches this coach's own stored practice focus on athletic performance.`);
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

  // Phase 9C — resolved ONCE per generation call, never re-derived per
  // item/day (spec section 8: "centralize it"). `effective` already has
  // client-specific-over-coach-general precedence applied; `precedenceSkips`
  // and unsupported-family skips are already known before a single session
  // is built.
  const { effective: effectiveRules, skipped: precedenceSkips } = resolveRulePrecedence(input.applicableRules ?? []);
  const sessionDiagnostics: RuleApplicationDiagnostics[] = [];

  const weeks: UniversalProgramWeek[] = [];
  for (let weekNumber = 1; weekNumber <= durationWeeks; weekNumber++) {
    const params = computeWeekParameters(weekNumber, durationWeeks, phases, com);
    const days: UniversalProgramDay[] = DAYS_OF_WEEK_ORDER.map((dayOfWeek): UniversalProgramDay => ({ dayOfWeek, type: "rest" }));

    profile.availableDays.slice(0, resistanceDayCount).forEach((dayOfWeek, i) => {
      const idx = days.findIndex((d) => d.dayOfWeek === dayOfWeek);
      if (idx === -1) return;
      const { session, diagnostics } = buildUniversalResistanceSessionForDay(dayOfWeek, plan.dayPatterns[i], equipment, com, profile, params, profile.maxSessionLengthMinutes, effectiveRules);
      sessionDiagnostics.push(diagnostics);
      // Phase 11C — power (a finisher block, appended after the resistance
      // work) and mobility (a warm-up block, prepended before it) are each
      // added to the FIRST resistance day only — a real, bounded, honest
      // addition (spec section 22: "do not insert into every program"),
      // never every training day, and only when this coach's own real,
      // stored methodology signal actually calls for it (see
      // usesAthleticPowerTraining/usesMobilityWork's own docs).
      let blocks = session.blocks;
      if (i === 0 && usesMobilityWork(com)) {
        const mobilityItem = buildMobilityItem(dayOfWeek);
        blocks = [{ id: `block-${mobilityItem.id}`, kind: "warmup", order: 0, items: [mobilityItem] }, ...blocks];
      }
      if (i === 0 && usesAthleticPowerTraining(com)) {
        const powerItem = buildPowerItem(dayOfWeek);
        const nextOrder = Math.max(0, ...blocks.map((b) => b.order)) + 1;
        blocks = [...blocks, { id: `block-${powerItem.id}`, kind: "straight", order: nextOrder, items: [powerItem] }];
      }
      days[idx] = { dayOfWeek, type: "training", sessions: [{ ...session, blocks }] };
    });

    continuousDays.forEach((dayOfWeek, conditioningIndex) => {
      const idx = days.findIndex((d) => d.dayOfWeek === dayOfWeek);
      if (idx === -1 || days[idx].type === "training") return; // never overwrite a resistance day
      // Phase 11A/11B — the SAME real schedule-surplus days decideContinuousDays
      // already selected get real conditioning content instead of easy
      // continuous cardio, but ONLY for a coach whose own stored
      // methodology (cardioPhilosophy === "prescribed_for_conditioning")
      // calls for it — never every coach, and never a client-goal-driven
      // decision (spec section 5's "do not encode goal = HIIT").
      //
      // Phase 11B — no real coach-collected signal distinguishes "wants
      // intervals" from "wants circuits" beyond this one shared
      // methodology field (a genuine, documented onboarding gap — spec
      // section 23's own explicit escape hatch for exactly this case), so
      // rather than fabricate an arbitrary split or let circuit silently
      // compete with interval's own already-shipped, already-tested
      // trigger, the FIRST conditioning-eligible day keeps Phase 11A's
      // exact existing behavior (interval — byte-for-byte regression
      // safe), and any FURTHER conditioning day(s) get circuit instead —
      // a deterministic, reproducible choice that gives a
      // conditioning-focused coach with real schedule surplus genuine
      // format variety, never a coin flip.
      //
      // Phase 11D — the SAME extension, one more step: no real
      // coach-collected signal distinguishes "wants circuits" from "wants
      // AMRAP" either (the identical, already-documented onboarding gap —
      // still the ONE real signal doing the work, never a fabricated new
      // one), so a THIRD conditioning day gets a genuine AMRAP instead of
      // a second circuit — deterministic, reproducible, never randomly
      // inserted (spec section 31: "do not randomly place AMRAPs/EMOMs
      // into programs" — this is gated on the exact same real methodology
      // signal every other conditioning format already requires).
      const { session, diagnostics } = !usesIntervalConditioning(com)
        ? buildUniversalContinuousSessionForDay(dayOfWeek, effectiveRules)
        : conditioningIndex === 0
          ? buildUniversalIntervalSessionForDay(dayOfWeek)
          : conditioningIndex === 1
            ? buildUniversalCircuitSessionForDay(dayOfWeek)
            : buildUniversalAmrapSessionForDay(dayOfWeek);
      sessionDiagnostics.push(diagnostics);
      days[idx] = { dayOfWeek, type: "training", sessions: [session] };
    });

    weeks.push({ weekNumber, days });
  }

  const ruleApplication = reconcileContextMismatches(effectiveRules, mergeDiagnostics([{ appliedRuleIds: [], skippedRules: precedenceSkips }, ...sessionDiagnostics]));

  const content: UniversalTrainingProgramContent = {
    schemaVersion: 2,
    id: `program-${direction.kind}-${input.clientId}-${Date.now()}`,
    workspaceId: input.workspaceId,
    clientId: input.clientId,
    coachId: input.coachId,
    name: `${direction.label} — ${direction.splitName}`,
    durationWeeks,
    weeks,
    generationRationale: buildGenerationRationale(direction, resistanceDayCount, continuousDays, usesIntervalConditioning(com), usesAthleticPowerTraining(com), usesMobilityWork(com)),
    directionLabel: direction.label,
    status: "assigned",
    createdAtIso: input.nowIso,
    updatedAtIso: input.nowIso,
  };

  // Fail safe, before this content can ever reach a caller that might
  // persist or activate it (spec section 5/23) — a genuine bug in this
  // generator throws InvalidPersistedContentError here, loudly, rather than
  // silently producing malformed content someone downstream has to catch.
  validateUniversalTrainingProgramContent(content);

  return { content, constraints: validateUniversalProgramHardConstraints(content, profile, com), ruleApplication };
}
