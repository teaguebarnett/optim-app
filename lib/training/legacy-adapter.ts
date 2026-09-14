// Phase 2 — Legacy <-> Universal Training Adapter.
//
// A pure, deterministic, side-effect-free domain boundary between
// lib/types.ts's legacy Workout/Exercise/PrescribedSet shape and Phase 1's
// universal Session/Block/TrainingItemInstance/Prescription grammar
// (lib/training/types.ts). Proves the new grammar can losslessly represent
// today's real strength content before any production consumer migrates
// onto it — see lib/training/verify-legacy-adapter.mts for the round-trip
// proof against the app's actual authored fixture (lib/mock-data.ts's
// PUSH_WORKOUT).
//
// Through Phase 4, nothing in this file was imported by any UI, persistence,
// generation, or AI code path — it existed purely as a tested compatibility
// boundary. Phase 5 gives it its first real production consumer: the
// universalProgramToClientAssignedProgram function at the bottom of this
// file is called from app/actions/production-programs.ts's
// getMySupabaseAppStateAction, as a read-side compatibility selector (see
// that function's own doc block, below).
//
// Scope boundary (deliberate, not an oversight): Session/Prescription model
// what is PRESCRIBED, never what was PERFORMED — exactly the separation
// Phase 1 was built to establish. lib/types.ts's Exercise.previousPerformance
// is execution history (what the client did last time), not prescription
// content, so it is intentionally excluded from this boundary in both
// directions: legacyWorkoutToSession never reads it, and
// sessionToLegacyWorkout always reconstructs an empty array rather than
// fabricating history a bare Session never carried. A future phase's
// ExecutionRecord (already defined in lib/training/types.ts) is where that
// data belongs, not here.
//
// workspaceId/dayOfWeek are similarly not modeled on Session — they are
// redundant per-Workout copies in the legacy schema of data that already
// lives one level up (WorkoutSession's own workspaceId, and
// UniversalProgramDay.dayOfWeek on the universal side). Session staying
// clean of them means sessionToLegacyWorkout needs that context passed in
// explicitly by its caller, who always has it (whoever is iterating a
// day/week already knows the day and workspace) — see its `context` param.

import type { CardioOption, CardioTarget, ClientAssignedProgram, DayOfWeek, Exercise, ExerciseBlockType, ProgramDay, ProgramWeek, RpeValue, Workout } from "../types.ts";
import type { WorkspaceId } from "../tenancy/types.ts";
import { buildPrescribedSets } from "../coach/training.ts";
import type { Block, BlockKind, Prescription, Session, TrainingItemInstance, UniversalProgramDay, UniversalProgramWeek, UniversalTrainingProgramContent } from "./types.ts";

/** Thrown when a legacy Workout/Exercise isn't real, complete, assignable
 * strength content this adapter is scoped to convert (an authoring
 * placeholder, or internally inconsistent generated data) — never silently
 * coerced into a partial or fabricated Session. */
export class UnsupportedLegacyWorkoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedLegacyWorkoutError";
  }
}

// ---------------------------------------------------------------------------
// Legacy -> Universal
// ---------------------------------------------------------------------------

/** Mirrors lib/coach/training.ts's own (unexported) isExerciseUsable exactly
 * — "genuinely prescribed, not just a name typed in." Duplicated rather than
 * exported from that legacy-authoring file because this adapter must not
 * grow a dependency the other direction (universal code depending on legacy
 * authoring internals beyond the one genuinely shared, pure generator,
 * buildPrescribedSets, below). */
function isExerciseUsable(exercise: Exercise): boolean {
  return exercise.name.trim().length > 0 && exercise.workingSets > 0 && exercise.targetRepsLow > 0 && exercise.targetRepsHigh >= exercise.targetRepsLow;
}

/** Recovers the one real per-exercise datum lib/types.ts's Exercise has no
 * standalone field for: its working weight. Every real writer in this
 * codebase (lib/coach/training.ts's buildPrescribedSets, lib/mock-data.ts's
 * own equivalent makeSetPrescriptions) generates `prescribedSets` from the
 * exercise's own summary fields plus exactly one uniform working weight —
 * never independently hand-varied per set. This function verifies that
 * invariant actually holds for the given exercise (rather than assuming it)
 * and throws UnsupportedLegacyWorkoutError if it doesn't, so a silently
 * wrong weight is never read from a genuinely irregular record. */
function deriveWorkingWeightLb(exercise: Exercise): number | undefined {
  const working = exercise.prescribedSets.filter((s) => !s.isWarmup);
  if (working.length !== exercise.workingSets) {
    throw new UnsupportedLegacyWorkoutError(
      `Exercise "${exercise.id}": prescribedSets has ${working.length} working entries but workingSets is ${exercise.workingSets} — this adapter only supports prescribedSets generated from the exercise's own summary fields (see lib/coach/training.ts's buildPrescribedSets), never independently hand-varied per-set data.`
    );
  }
  const warmup = exercise.prescribedSets.filter((s) => s.isWarmup);
  if (warmup.length !== exercise.warmupSets) {
    throw new UnsupportedLegacyWorkoutError(
      `Exercise "${exercise.id}": prescribedSets has ${warmup.length} warm-up entries but warmupSets is ${exercise.warmupSets}.`
    );
  }
  const distinctWeights = new Set(working.map((s) => s.prescribedWeightLb));
  if (distinctWeights.size > 1) {
    throw new UnsupportedLegacyWorkoutError(
      `Exercise "${exercise.id}": working sets carry differing prescribedWeightLb values — this adapter only supports a single uniform working weight per exercise, matching every real generator in this codebase.`
    );
  }
  return working[0]?.prescribedWeightLb;
}

function exerciseToTrainingItemInstance(exercise: Exercise): TrainingItemInstance {
  if (!isExerciseUsable(exercise)) {
    throw new UnsupportedLegacyWorkoutError(
      `Exercise "${exercise.id}" is not usable (missing name/workingSets/rep range) — this adapter converts real, assignable strength content only, never a draft/authoring-stub exercise. See lib/coach/training.ts's isExerciseUsable.`
    );
  }
  const workingWeightLb = deriveWorkingWeightLb(exercise);

  const prescription: Prescription = {
    family: "resistance",
    sets: exercise.workingSets,
    warmupSets: exercise.warmupSets,
    reps: { low: exercise.targetRepsLow, high: exercise.targetRepsHigh },
    rpe: exercise.targetRpe,
    restSeconds: exercise.restSeconds,
    tempo: exercise.tempo,
    ...(workingWeightLb !== undefined ? { load: { value: workingWeightLb, unit: "lb" as const } } : {}),
    ...(exercise.warmupInstruction !== undefined ? { warmupInstruction: exercise.warmupInstruction } : {}),
  };

  return {
    id: exercise.id,
    order: exercise.order,
    name: exercise.name,
    category: "resistance",
    coachCue: exercise.cue,
    prescription,
    ...(exercise.approvedSubstituteExerciseId !== undefined ? { substituteItemId: exercise.approvedSubstituteExerciseId } : {}),
  };
}

/** Converts a real, assignable legacy Workout into a universal Session.
 * Throws UnsupportedLegacyWorkoutError (never silently produces a partial or
 * fabricated result) for a Workout that isn't real, complete, current
 * strength content — see the individual checks below for exactly what that
 * means. workspaceId and dayOfWeek are deliberately dropped, not lost — see
 * this module's own header doc for why they don't belong on Session. */
export function legacyWorkoutToSession(workout: Workout): Session {
  if (workout.exercises.length === 0) {
    throw new UnsupportedLegacyWorkoutError(
      `Workout "${workout.id}" has no exercises — an authoring placeholder (see lib/coach/training.ts's createEmptyWorkout), not real assignable content. Nothing for this adapter to convert.`
    );
  }

  const sorted = [...workout.exercises].sort((a, b) => a.order - b.order);
  sorted.forEach((exercise, index) => {
    if (index > 0 && exercise.order <= sorted[index - 1].order) {
      throw new UnsupportedLegacyWorkoutError(
        `Workout "${workout.id}": exercise "${exercise.id}" does not have a strictly increasing order value — this adapter requires unambiguous ordering, matching every real generator in this codebase.`
      );
    }
  });

  const blocks: Block[] = [];
  const blockById = new Map<string, Block>();
  let blockOrder = 0;

  for (const exercise of sorted) {
    const item = exerciseToTrainingItemInstance(exercise);

    if (!exercise.block) {
      blockOrder += 1;
      blocks.push({ id: `block-${exercise.id}`, kind: "straight", order: blockOrder, items: [item] });
      continue;
    }

    const existing = blockById.get(exercise.block.id);
    if (existing) {
      existing.items.push(item);
      continue;
    }

    blockOrder += 1;
    const created: Block = { id: exercise.block.id, kind: exercise.block.type, order: blockOrder, items: [item] };
    blocks.push(created);
    blockById.set(exercise.block.id, created);
  }

  return {
    id: workout.id,
    name: workout.name,
    focus: workout.focus,
    estimatedDurationMin: workout.estimatedDurationMin,
    warmupOverview: workout.warmupOverview,
    coachNote: workout.coachNote,
    blocks,
  };
}

// ---------------------------------------------------------------------------
// Universal -> Legacy
// ---------------------------------------------------------------------------

export interface LegacyCompatibilityResult {
  compatible: boolean;
  /** Human-readable, field-specific reason the session cannot be represented
   * in the legacy model — present iff compatible is false. */
  reason?: string;
}

const LEGACY_COMPATIBLE_BLOCK_KINDS: readonly BlockKind[] = ["straight", "superset", "circuit"];

function blockCompatibilityReason(block: Block): string | undefined {
  if (!LEGACY_COMPATIBLE_BLOCK_KINDS.includes(block.kind)) {
    return `Block "${block.id}" has kind "${block.kind}", which has no equivalent in the legacy ExerciseBlockType ("straight"/"superset"/"circuit" only).`;
  }
  if (block.name !== undefined) return `Block "${block.id}" has a name ("${block.name}") — legacy has nowhere to store a block-level display name.`;
  if (block.rounds !== undefined) return `Block "${block.id}" prescribes rounds (${block.rounds}) — legacy has nowhere to store block-level rounds.`;
  if (block.restBetweenItemsSeconds !== undefined)
    return `Block "${block.id}" prescribes restBetweenItemsSeconds — legacy has nowhere to store it.`;
  if (block.restBetweenRoundsSeconds !== undefined)
    return `Block "${block.id}" prescribes restBetweenRoundsSeconds — legacy has nowhere to store it.`;
  if (block.timeCapSeconds !== undefined) return `Block "${block.id}" prescribes a timeCapSeconds — legacy has nowhere to store it.`;
  if (block.completionRule !== undefined) return `Block "${block.id}" prescribes a completionRule — legacy has nowhere to store it.`;
  if (block.terminationMode !== undefined) return `Block "${block.id}" prescribes a terminationMode ("${block.terminationMode}") — legacy has nowhere to store it.`;
  if (block.cadenceSeconds !== undefined) return `Block "${block.id}" prescribes a cadenceSeconds — legacy has nowhere to store it.`;
  if (block.kind === "straight" && block.items.length !== 1) {
    return `Block "${block.id}" is kind "straight" with ${block.items.length} items — legacy's independent (unlinked) exercises are always exactly one item per block.`;
  }
  return undefined;
}

function itemCompatibilityReason(item: TrainingItemInstance): string | undefined {
  if (item.category !== "resistance") return `Item "${item.id}" has category "${item.category}" — legacy Exercise only ever represents resistance work.`;
  const p = item.prescription;
  if (p.family !== "resistance") return `Item "${item.id}"'s prescription family is "${p.family}", not "resistance".`;
  if (p.sets === undefined) return `Item "${item.id}" has no prescribed working sets — legacy Exercise.workingSets is required.`;
  if (p.reps === undefined) return `Item "${item.id}" has no prescribed rep range — legacy Exercise.targetRepsLow/High is required.`;
  if (p.rpe === undefined) return `Item "${item.id}" has no prescribed RPE — legacy Exercise.targetRpe is required, and legacy has no RIR field to substitute.`;
  if (p.restSeconds === undefined) return `Item "${item.id}" has no prescribed rest — legacy Exercise.restSeconds is required.`;
  if (p.rir !== undefined) return `Item "${item.id}" prescribes RIR (${p.rir}) — legacy has no RIR field, only RPE.`;
  if (p.load !== undefined) {
    if (p.load.unit !== "lb") return `Item "${item.id}"'s load unit is "${p.load.unit}" — legacy prescribedWeightLb is pounds-only.`;
    if (p.load.percent1rm !== undefined) return `Item "${item.id}" prescribes a %1RM (${p.load.percent1rm}) — legacy has no %1RM field.`;
  }
  if (p.duration !== undefined) return `Item "${item.id}" prescribes a duration — legacy Exercise has no duration field (continuous work is not representable).`;
  if (p.distance !== undefined) return `Item "${item.id}" prescribes a distance — legacy Exercise has no distance field.`;
  if (p.pace !== undefined) return `Item "${item.id}" prescribes a pace — legacy Exercise has no pace field.`;
  if (p.heartRate !== undefined) return `Item "${item.id}" prescribes a heart-rate target — legacy Exercise has no heart-rate field.`;
  if (p.power !== undefined) return `Item "${item.id}" prescribes power (watts) — legacy Exercise has no power field.`;
  if (p.rounds !== undefined) return `Item "${item.id}" prescribes item-level rounds — legacy has no equivalent field.`;
  if (p.workInterval !== undefined) return `Item "${item.id}" prescribes a work interval — legacy Exercise has no interval fields.`;
  if (p.recoveryInterval !== undefined) return `Item "${item.id}" prescribes a recovery interval — legacy Exercise has no interval fields.`;
  if (p.recoveryDistance !== undefined) return `Item "${item.id}" prescribes a distance-based recovery — legacy Exercise has no interval fields.`;
  if (p.amrap !== undefined) return `Item "${item.id}" prescribes AMRAP — legacy Exercise has no AMRAP field.`;
  if (p.completionTarget !== undefined) return `Item "${item.id}" prescribes a completion target — legacy Exercise has no equivalent field.`;
  if (p.side !== undefined) return `Item "${item.id}" prescribes a side (${p.side}) — legacy Exercise has no side/laterality field.`;
  if (p.cadence !== undefined) return `Item "${item.id}" prescribes a cadence — legacy Exercise has no cadence field.`;
  return undefined;
}

/** The explicit representability rule (Phase 2 spec section 5): determines
 * whether a universal Session can be faithfully represented by the legacy
 * Workout/Exercise model with zero semantic loss, and — critically — says
 * exactly why not when it can't, rather than a bare boolean. Every reason a
 * real Session could fail is enumerated here; nothing is a fragile
 * approximation like "if block.kind !== straight, reject." */
export function checkSessionLegacyCompatibility(session: Session): LegacyCompatibilityResult {
  if (session.blocks.length === 0) {
    return { compatible: false, reason: `Session "${session.id}" has no blocks.` };
  }

  const allOrders = session.blocks.flatMap((b) => b.items.map((i) => i.order));
  if (new Set(allOrders).size !== allOrders.length) {
    return { compatible: false, reason: `Session "${session.id}" has items with duplicate order values — legacy exercise order must be unambiguous.` };
  }

  for (const block of session.blocks) {
    const blockReason = blockCompatibilityReason(block);
    if (blockReason) return { compatible: false, reason: blockReason };
    for (const item of block.items) {
      const itemReason = itemCompatibilityReason(item);
      if (itemReason) return { compatible: false, reason: itemReason };
    }
  }

  return { compatible: true };
}

/** Converts ONE resistance TrainingItemInstance into its legacy Exercise
 * representation, independent of whether the REST of the session it lives
 * in is legacy-representable as a whole. Unlike sessionToLegacyWorkout
 * (below — the whole-session persistence/compatibility boundary, gated by
 * checkSessionLegacyCompatibility), this narrower per-item building block
 * checks only THIS item's own compatibility (itemCompatibilityReason) and
 * ignores block-level structure entirely (rounds, superset/circuit
 * grouping), always producing a plain unblocked Exercise — safe because its
 * only caller (Phase 6A's live workout page, rendering the resistance
 * panels' `exercise` prop from a universal Session whose OTHER items may be
 * non-resistance, so the session as a whole can never produce a legacy
 * Workout) never reads Exercise.block. Returns null (never throws, never a
 * partial/garbled Exercise) when this one item doesn't carry everything
 * legacy Exercise requires. */
export function trainingItemToLegacyExercise(item: TrainingItemInstance): Exercise | null {
  if (itemCompatibilityReason(item)) return null;
  const p = item.prescription;
  const warmupSets = p.warmupSets ?? 0;
  const workingSets = p.sets as number;
  const targetRepsLow = p.reps!.low;
  const targetRepsHigh = p.reps!.high;
  const targetRpe = p.rpe as RpeValue;
  const workingWeightLb = p.load?.value;

  return {
    id: item.id,
    order: item.order,
    name: item.name,
    warmupSets,
    workingSets,
    targetRepsLow,
    targetRepsHigh,
    targetRpe,
    restSeconds: p.restSeconds as number,
    tempo: p.tempo ?? "",
    cue: item.coachCue ?? "",
    // Deliberately empty, never fabricated — see this module's header doc:
    // execution history is out of scope for a Session/Prescription boundary.
    previousPerformance: [],
    prescribedSets: buildPrescribedSets({ warmupSets, workingSets, targetRepsLow, targetRepsHigh, targetRpe, workingWeightLb }),
    ...(item.substituteItemId !== undefined ? { approvedSubstituteExerciseId: item.substituteItemId } : {}),
    ...(p.warmupInstruction !== undefined ? { warmupInstruction: p.warmupInstruction } : {}),
  };
}

/** Converts a universal Session back into a legacy Workout ONLY when
 * checkSessionLegacyCompatibility says it can be represented with zero
 * semantic loss — returns null otherwise (never a best-effort/lossy
 * flattening). `context` supplies the two fields a legacy Workout requires
 * that Session deliberately does not model — see this module's header doc. */
export function sessionToLegacyWorkout(session: Session, context: { workspaceId: WorkspaceId; dayOfWeek: DayOfWeek }): Workout | null {
  const compatibility = checkSessionLegacyCompatibility(session);
  if (!compatibility.compatible) return null;

  const entries: { blockKind: BlockKind; blockId: string; item: TrainingItemInstance }[] = [];
  for (const block of session.blocks) {
    for (const item of block.items) {
      entries.push({ blockKind: block.kind, blockId: block.id, item });
    }
  }
  entries.sort((a, b) => a.item.order - b.item.order);

  // checkSessionLegacyCompatibility above already proved every item here
  // passes itemCompatibilityReason, so trainingItemToLegacyExercise can
  // never return null in this whole-session context — the block-level
  // grouping metadata (superset/circuit) it deliberately omits is added
  // back on here, since sessionToLegacyWorkout (unlike the per-item helper)
  // needs it.
  const exercises: Exercise[] = entries.map(({ blockKind, blockId, item }) => ({
    ...trainingItemToLegacyExercise(item)!,
    ...(blockKind !== "straight" ? { block: { id: blockId, type: blockKind as Exclude<ExerciseBlockType, "straight"> } } : {}),
  }));

  return {
    id: session.id,
    workspaceId: context.workspaceId,
    name: session.name,
    dayOfWeek: context.dayOfWeek,
    focus: session.focus,
    estimatedDurationMin: session.estimatedDurationMin,
    warmupOverview: session.warmupOverview ?? "",
    coachNote: session.coachNote ?? "",
    exercises,
  };
}

// ---------------------------------------------------------------------------
// Phase 4 — the existing daily-cardio-card concept bridge.
//
// lib/types.ts's CardioTarget/CardioOption/CardioPrescription/CardioLog
// (AppState.cardio, AppState.dailyTrainingPlan.cardioTarget) are a
// completely separate system from WorkoutSession/session-flow.ts — a single
// independent "log today's cardio" card on the Today screen, never part of
// the guided multi-phase workout engine. Phase 4's actual deliverable (a
// live Session containing a continuous TrainingItemInstance, executed
// through session-flow.ts) is a NEW capability alongside that card, not a
// replacement for it — merging the daily card's UI/reducer onto the Session
// engine would be a real, unrelated redesign of an already-working screen,
// explicitly out of this phase's scope (spec section 19: "do not redesign
// unrelated training pages").
//
// What IS in scope, per spec section 5 ("where they represent the same
// concept... migrate/adapt them toward the universal grammar... temporary
// adapters are acceptable"): proving the two concepts are structurally
// compatible. CardioTarget's activity/durationMin/heartRateRange is exactly
// a continuous-family Prescription's name/duration/heartRate — this
// one-directional, pure mapping is that proof. It has no caller in the
// daily-cardio-card code path (that card's own AppState.cardio/
// dailyTrainingPlan.cardioTarget/CardioLog remain entirely legacy and
// unmigrated in this phase, by deliberate choice, not oversight) — it exists
// so a future phase CAN unify them without re-deriving this mapping, and so
// this Phase 0 audit finding has a real, tested answer rather than staying
// merely observed.

/** Structural proof that CardioTarget (the daily cardio card's own
 * prescription shape) is representable as a continuous-family Prescription —
 * see this section's header for exactly what is and isn't migrated by this
 * function's existence. Never called by the daily cardio card itself in
 * this phase. */
export function cardioTargetToContinuousPrescription(target: CardioTarget): Prescription {
  return {
    family: "continuous",
    duration: { seconds: target.durationMin * 60 },
    heartRate: { low: target.heartRateRangeLow, high: target.heartRateRangeHigh },
  };
}

/** Same proof for a single coach-approved CardioOption (the richer, per-
 * option shape a CardioPrescription lists several of) — heart-rate range is
 * optional on CardioOption, unlike CardioTarget, so it's only carried across
 * when actually present, never fabricated. */
export function cardioOptionToContinuousPrescription(option: CardioOption): Prescription {
  const prescription: Prescription = {
    family: "continuous",
    duration: { seconds: option.targetDurationMin * 60 },
  };
  if (option.heartRateRangeLow !== undefined && option.heartRateRangeHigh !== undefined) {
    prescription.heartRate = { low: option.heartRateRangeLow, high: option.heartRateRangeHigh };
  }
  return prescription;
}

// ---------------------------------------------------------------------------
// Phase 5 — program-level read compatibility for the existing legacy-typed
// client bootstrap (AppState.assignedProgram: ClientAssignedProgram — see
// lib/state.ts). This is NOT the generation authoring path (real generation
// now targets the universal grammar natively — see
// lib/coach/universal-program-generation.ts) — it exists purely so a
// genuinely universal program that HAPPENS to be fully legacy-representable
// (pure resistance, one session per day) can still bootstrap and execute
// through today's unmodified demo-shaped client engine, exactly mirroring
// Phase 3's resolvedWorkout/resolvedSession coexistence philosophy one
// level up (a compatibility READ selector at the program-bootstrap
// boundary, not a permanent generation design).
//
// IMPORTANT TYPE-SAFETY NOTE this function exists to close: because every
// field that actually differs between ClientAssignedProgram and
// UniversalTrainingProgramContent (schemaVersion, ProgramDay.workout vs.
// UniversalProgramDay.sessions) is optional on at least one side,
// TypeScript's structural typing does NOT flag assigning a
// UniversalTrainingProgramContent directly to a ClientAssignedProgram-typed
// variable as an error — it silently "succeeds" while producing a
// ProgramDay with no real workout content. Never assign
// TrainingProgramVersionContent to a ClientAssignedProgram-typed field
// without going through this function (or an explicit schemaVersion check)
// first.
export function universalProgramToClientAssignedProgram(content: UniversalTrainingProgramContent): ClientAssignedProgram | null {
  const weeks: ProgramWeek[] = [];
  for (const week of content.weeks) {
    const days: ProgramDay[] = [];
    for (const day of week.days) {
      if (day.type === "rest") {
        days.push({ dayOfWeek: day.dayOfWeek, type: "rest" });
        continue;
      }
      // A legacy day can hold exactly one Workout — a universal day with
      // more than one session (e.g. an AM/PM split) has no legacy
      // equivalent, so the whole program is reported as not representable
      // rather than silently dropping a session.
      if (!day.sessions || day.sessions.length !== 1) return null;
      const workout = sessionToLegacyWorkout(day.sessions[0], { workspaceId: content.workspaceId, dayOfWeek: day.dayOfWeek });
      if (!workout) return null;
      days.push({ dayOfWeek: day.dayOfWeek, type: "training", workout });
    }
    weeks.push({ weekNumber: week.weekNumber, days });
  }

  return {
    id: content.id,
    workspaceId: content.workspaceId,
    clientId: content.clientId,
    coachId: content.coachId,
    sourceTemplateId: content.sourceTemplateId,
    name: content.name,
    durationWeeks: content.durationWeeks,
    weeks,
    status: content.status,
    createdAtIso: content.createdAtIso,
    updatedAtIso: content.updatedAtIso,
  };
}

// ---------------------------------------------------------------------------
// Phase 6A — the FORWARD counterpart of universalProgramToClientAssignedProgram
// above: every historical schemaVersion-1 (legacy, schemaVersion-less)
// program a real Supabase client might still be assigned converts into the
// universal grammar at the read boundary (see lib/production/programs.ts's
// getClientProgramContext), so real client execution has exactly ONE
// canonical shape to consume — Session — regardless of which schema the
// persisted content actually is. This is the read-side mirror of
// legacyWorkoutToSession (per-day), lifted to whole-program scope exactly
// the way sessionToLegacyWorkout's whole-program counterpart above already
// is. Never used as a generation/authoring target — real generation targets
// the universal grammar natively (lib/coach/universal-program-generation.ts).
// ---------------------------------------------------------------------------

/**
 * Converts a real legacy ClientAssignedProgram into its universal
 * UniversalTrainingProgramContent representation, day by day, via
 * legacyWorkoutToSession — the exact same per-day conversion Phase 2 proved
 * lossless. Throws UnsupportedLegacyWorkoutError (never returns a partial or
 * best-effort program) if any single training day's Workout can't convert —
 * callers must treat that as "this program can't be safely resolved right
 * now" (see getClientProgramContext's own try/catch), never patch over the
 * gap with a fabricated day.
 */
export function legacyProgramToUniversalProgram(program: ClientAssignedProgram): UniversalTrainingProgramContent {
  const weeks: UniversalProgramWeek[] = program.weeks.map((week) => {
    const days: UniversalProgramDay[] = week.days.map((day): UniversalProgramDay => {
      if (day.type === "rest") return { dayOfWeek: day.dayOfWeek, type: "rest" };
      // A "training" day with no real workout behind it is a genuine
      // authoring gap (see lib/mock-data.ts's WorkoutAvailability.isUnavailable
      // for the same concept on the legacy read side) — never silently
      // reinterpreted as an intentional rest day, which would misrepresent
      // what was actually scheduled.
      if (!day.workout) throw new UnsupportedLegacyWorkoutError(`Week ${week.weekNumber}, ${day.dayOfWeek} is a training day with no real workout assigned — cannot convert to a universal session.`);
      return { dayOfWeek: day.dayOfWeek, type: "training", sessions: [legacyWorkoutToSession(day.workout)] };
    });
    return { weekNumber: week.weekNumber, days };
  });

  return {
    schemaVersion: 2,
    id: program.id,
    workspaceId: program.workspaceId,
    clientId: program.clientId,
    coachId: program.coachId,
    sourceTemplateId: program.sourceTemplateId,
    name: program.name,
    durationWeeks: program.durationWeeks,
    weeks,
    status: program.status,
    createdAtIso: program.createdAtIso,
    updatedAtIso: program.updatedAtIso,
  };
}

/**
 * The one, centralized schemaVersion dispatch for the universal client read
 * model (spec: "compatibility belongs at the read boundary, not scattered
 * across UI components") — schemaVersion 2 content passes through
 * completely untouched (identity-preserving: never round-tripped through
 * the legacy shape first, per this phase's explicit "avoid universal ->
 * legacy -> universal" requirement); schemaVersion-1 (legacy) content is
 * forward-converted via legacyProgramToUniversalProgram. Returns null,
 * never a partial/fabricated program, when legacy content exists but
 * genuinely can't convert (a real authoring gap) — see that function's own
 * doc. lib/production/programs.ts's getClientProgramContext is this
 * function's one real caller.
 */
export function resolveUniversalProgramContent(content: ClientAssignedProgram | UniversalTrainingProgramContent): UniversalTrainingProgramContent | null {
  if ("schemaVersion" in content && content.schemaVersion === 2) return content;
  try {
    return legacyProgramToUniversalProgram(content);
  } catch (err) {
    if (err instanceof UnsupportedLegacyWorkoutError) return null;
    throw err;
  }
}
