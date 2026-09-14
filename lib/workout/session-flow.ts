// Phase 4.4B-2 — pure queue/progression logic for the guided live workout.
// Phase 3 (universal training grammar migration) — this is the one place
// "what happens next" is decided for exercise sequencing, so lib/state.ts's
// reducer stays thin and every transition is independently testable.
// Nothing here touches React, routing, or timestamps beyond what's already
// on canonical session state — see lib/state.ts for where these are wired
// into actual reducer cases.
//
// Stable-id navigation only (Phase 4.4B-2 correction): every function here
// works in terms of training-item ids, never array indices, so deferring or
// reordering an item can never corrupt progress the way an index into the
// coach's original array would.
//
// Phase 3 — this module's real internal domain is now the universal
// Session/Block/TrainingItemInstance grammar (lib/training/types.ts), not
// the legacy Workout/Exercise shape (lib/types.ts). lib/state.ts converts a
// resolved legacy Workout into a Session exactly once, at START_WORKOUT (via
// lib/training/legacy-adapter.ts's legacyWorkoutToSession) — every function
// below consumes that already-converted Session, never re-converting or
// reading Workout/Exercise directly. Item identity survives the conversion
// unchanged (TrainingItemInstance.id === the source Exercise.id), so every
// existing id-keyed piece of canonical session state (exerciseQueue,
// exerciseLogs, exerciseWarmups, etc.) continues to mean exactly what it did
// before this phase.

import { canCompleteExercise, absoluteWorkingSetNumbers } from "../workout-analysis.ts";
import type { Block, ExecutionRecord, Session, TrainingItemInstance } from "../training/types.ts";
import type { ExerciseLog, WorkoutSession, WorkoutSessionPhase } from "../types";

/** The next prescribed working-set number this training item still needs
 * resolved (completed with a valid RPE, or skipped) — null once every
 * prescribed working set has been addressed. */
export function firstUnresolvedWorkingSetNumber(item: TrainingItemInstance, log: ExerciseLog | undefined): number | null {
  const workingSetNumbers = absoluteWorkingSetNumbers(item);
  const loggedByNumber = new Map((log?.loggedSets ?? []).map((s) => [s.setNumber, s]));
  for (const setNumber of workingSetNumbers) {
    const logged = loggedByNumber.get(setNumber);
    if (!logged) return setNumber;
    if (logged.status === "completed" && logged.rpe === null) return setNumber;
  }
  return null;
}

/** A training item is resolved once it's either explicitly skipped whole,
 * or:
 *  - resistance: every prescribed working set has been individually
 *    addressed (reuses canCompleteExercise's exact "every prescribed set
 *    addressed, at least one really completed" rule — never a second
 *    competing formula).
 *  - any other family (Phase 4: continuous): a real ExecutionRecord has
 *    been logged — there is no per-set concept to iterate, so one
 *    submission (lib/state.ts's LOG_CONTINUOUS_EXECUTION) fully resolves
 *    it, whether the outcome was "completed" or "partial". `continuousExecution`
 *    is optional and simply ignored for a resistance item. */
export function isExerciseResolved(
  item: TrainingItemInstance,
  log: ExerciseLog | undefined,
  continuousExecution?: ExecutionRecord
): boolean {
  if (!log) return false;
  if (log.status === "skipped") return true;
  if (item.prescription.family !== "resistance") return continuousExecution !== undefined;
  return canCompleteExercise(item, log);
}

/** Tolerant of a missing Session (mirrors every other lookup in this module
 * — a session not yet resolved, or from before this phase, simply has
 * nothing to find). */
export function findTrainingItemById(session: Session | null | undefined, itemId: string | null): TrainingItemInstance | undefined {
  if (!session || !itemId) return undefined;
  for (const block of session.blocks) {
    const found = block.items.find((i) => i.id === itemId);
    if (found) return found;
  }
  return undefined;
}

/** Which Block a given training item belongs to — structural block
 * awareness for the live queue (Phase 3 spec section 5/10): every real
 * workout today converts to one independent item per "straight" block (see
 * lib/training/legacy-adapter.ts), so this is currently always a
 * single-item lookup in practice, but a coach-authored superset/circuit
 * would genuinely group here. Exposed for a future phase to build real
 * grouped-execution UX against — this phase does not change navigation
 * rhythm based on it (see buildInitialFlowState's own doc). */
export function findBlockForItem(session: Session, itemId: string): Block | undefined {
  return session.blocks.find((b) => b.items.some((i) => i.id === itemId));
}

/** Tolerant lookup by BLOCK id (as opposed to findTrainingItemById's
 * lookup by ITEM id) — see isCircuitBlock's own doc for why a circuit
 * needs this: its id, not any one item's id, is what actually occupies a
 * flat-queue slot. */
export function findBlockById(session: Session | null | undefined, blockId: string | null): Block | undefined {
  if (!session || !blockId) return undefined;
  return session.blocks.find((b) => b.id === blockId);
}

/** Phase 11B — a real, repeating multi-item group (spec section 3: "a
 * circuit is a BLOCK behavior"). Requires `rounds` to be genuinely set,
 * not merely `kind === "circuit"` with no repetition — mirrors
 * lib/workout/interval.ts's totalIntervalRounds' own "rounds must be a
 * real, positive number" discipline; a `kind: "circuit"` block with no
 * rounds set has nothing to actually repeat and is left to plain flat
 * per-item navigation instead (the same posture superset already has). */
export function isCircuitBlock(block: Block): boolean {
  // Phase 11D — a genuine AMRAP deliberately has no `rounds` at all (see
  // Block.terminationMode's own doc: "as many rounds as possible" has no
  // real target to set) but is every bit as real a repeating circuit block
  // as a fixed-round one — its own terminationMode is what makes it real,
  // not a round count that doesn't exist.
  if (block.kind === "circuit" && block.terminationMode === "time_cap") return true;
  return block.kind === "circuit" && block.rounds !== undefined && block.rounds > 0;
}

/** Phase 11D — a real, repeating cadence-window group (spec section 9:
 * "the method must understand cadence window... current minute/window").
 * Requires both a real positive cadence and a real positive window count,
 * mirroring isCircuitBlock's own "must have something real to repeat"
 * discipline — a `kind: "emom"` block missing either is left to plain flat
 * per-item navigation instead (same posture as an under-specified circuit
 * or superset). */
export function isEmomBlock(block: Block): boolean {
  return block.kind === "emom" && block.cadenceSeconds !== undefined && block.cadenceSeconds > 0 && block.rounds !== undefined && block.rounds > 0;
}

export interface InitialFlowState {
  exerciseQueue: string[];
  currentExerciseId: string;
  actualExerciseOrder: string[];
}

/**
 * The queue/current-item shape a brand-new session starts in — the coach's
 * own authored order, untouched: blocks in `block.order`, items within each
 * block in `item.order`. For every real strength workout today (each
 * exercise its own independent "straight" block, per the legacy adapter),
 * this produces the exact same sequence as the pre-Phase-3 flat
 * `workout.exercises` order.
 *
 * Grouped items (a real coach-authored superset) land consecutively in this
 * queue, since they share one block — the structural grouping survives
 * navigation. What this deliberately does NOT do, for a superset: cycle
 * A1 -> A2 -> rest -> next round, or otherwise change resolution rhythm for
 * a grouped block. No real current content uses superset grouping
 * (confirmed in the Phase 0/2 audits, still true as of Phase 11B's own
 * audit), so there is no live behavior to preserve here.
 *
 * Phase 11B — a real circuit block (isCircuitBlock: `kind: "circuit"` with
 * real `rounds`) is the one exception: it occupies exactly ONE queue slot
 * (the block's own id, never any one item's id — see findBlockById),
 * because the whole group of items is ONE repeating execution unit, not N
 * independently-resolvable ones. Its own internal round/item cycling is
 * tracked separately in WorkoutSession.circuitProgress and only resolves
 * this one queue slot once the entire circuit (every round) is done — see
 * lib/state.ts's FINALIZE_CIRCUIT_EXECUTION, mirroring exactly how a
 * multi-round interval item occupies one queue slot for its own duration.
 */
export function buildInitialFlowState(session: Session): InitialFlowState {
  const exerciseQueue = session.blocks
    .slice()
    .sort((a, b) => a.order - b.order)
    .flatMap((block) =>
      isCircuitBlock(block) || isEmomBlock(block)
        ? [block.id]
        : block.items
            .slice()
            .sort((a, b) => a.order - b.order)
            .map((item) => item.id)
    );
  const currentExerciseId = exerciseQueue[0];
  return { exerciseQueue, currentExerciseId, actualExerciseOrder: currentExerciseId ? [currentExerciseId] : [] };
}

export interface QueueAdvanceResult {
  currentExerciseId: string | null;
  exerciseQueue: string[];
  actualExerciseOrder: string[];
  deferredExerciseIds: string[];
  lastResolvedExerciseId: string | null;
  phase: WorkoutSessionPhase;
  currentSetNumber: number | null;
}

function appendIfNew(order: string[], id: string | null): string[] {
  if (!id || order.includes(id)) return order;
  return [...order, id];
}

/**
 * Called once the CURRENT training item has just become resolved (its final
 * working set was logged/skipped, or it was explicitly skipped whole).
 * Pops it from the queue and hands off to whatever remains — the next
 * not-yet-attempted or previously-deferred item, or the session summary
 * once nothing remains. Never used for a defer (see deferCurrentExercise) —
 * a deferred item is requeued, not resolved.
 *
 * Operates purely on WorkoutSession's own id-keyed bookkeeping — genuinely
 * agnostic to whether those ids came from a legacy Exercise[] or a universal
 * Session's items, so nothing here needed to change for Phase 3.
 */
export function advanceAfterExerciseResolved(session: WorkoutSession): QueueAdvanceResult {
  const resolvedId = session.currentExerciseId;
  const remainingQueue = session.exerciseQueue.filter((id) => id !== resolvedId);
  const nextId = remainingQueue[0] ?? null;
  return {
    currentExerciseId: nextId,
    exerciseQueue: remainingQueue,
    actualExerciseOrder: appendIfNew(session.actualExerciseOrder, nextId),
    deferredExerciseIds: session.deferredExerciseIds.filter((id) => id !== resolvedId),
    lastResolvedExerciseId: resolvedId,
    phase: nextId ? "exercise-transition" : "session-summary",
    currentSetNumber: null,
  };
}

/**
 * Moves the current training item ("Do later") to the back of the queue
 * instead of resolving it. The session naturally returns to it once every
 * other queued item has been resolved, since it's still in exerciseQueue —
 * just at the end. A no-op (besides bookkeeping) when it's the only item
 * left, since there's nowhere else to go — callers should avoid offering
 * "Do later" in that case.
 *
 * Same id-only bookkeeping as advanceAfterExerciseResolved above — no change
 * needed for Phase 3.
 */
export function deferCurrentExercise(session: WorkoutSession): QueueAdvanceResult {
  const currentId = session.currentExerciseId;
  if (!currentId) {
    return {
      currentExerciseId: session.currentExerciseId,
      exerciseQueue: session.exerciseQueue,
      actualExerciseOrder: session.actualExerciseOrder,
      deferredExerciseIds: session.deferredExerciseIds,
      lastResolvedExerciseId: session.lastResolvedExerciseId,
      phase: session.phase,
      currentSetNumber: session.currentSetNumber,
    };
  }
  const withoutCurrent = session.exerciseQueue.filter((id) => id !== currentId);
  const requeued = [...withoutCurrent, currentId];
  const nextId = withoutCurrent[0] ?? currentId;
  const deferredExerciseIds = session.deferredExerciseIds.includes(currentId)
    ? session.deferredExerciseIds
    : [...session.deferredExerciseIds, currentId];

  if (nextId === currentId) {
    // Only item left in the queue — nothing to hand off to.
    return {
      currentExerciseId: currentId,
      exerciseQueue: requeued,
      actualExerciseOrder: session.actualExerciseOrder,
      deferredExerciseIds,
      lastResolvedExerciseId: session.lastResolvedExerciseId,
      phase: session.phase,
      currentSetNumber: session.currentSetNumber,
    };
  }

  return {
    currentExerciseId: nextId,
    exerciseQueue: requeued,
    actualExerciseOrder: appendIfNew(session.actualExerciseOrder, nextId),
    deferredExerciseIds,
    // Deferred (not resolved) — the transition surface checks
    // deferredExerciseIds to tell these apart and show "you'll come back to
    // this" rather than completion-style copy.
    lastResolvedExerciseId: currentId,
    phase: "exercise-transition",
    currentSetNumber: null,
  };
}
