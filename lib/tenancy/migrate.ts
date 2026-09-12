// Versioned migration for persisted client state.
//
// Phase 1's AppState (version 1) had no workspace/client attribution — it
// implicitly belonged to "the" client at "the" coaching business, because
// Phase 1 only ever supported one of each. Phase 2 (version 2) introduced
// explicit workspaceId/clientId on the day record and its nested workout
// session. Phase 3 (version 3) replaced the countdown-driven workoutWindow
// field with a client-entered dailyTrainingPlan. Each step below is a small,
// additive upgrade — existing localStorage data always migrates forward
// through every step rather than being reset.
//
// This must never throw on malformed/unexpected input — the caller (see
// hooks/use-prototype-state.tsx) falls back to a fresh initial state when
// migration can't make sense of what's stored, which is exactly Phase 1's
// existing "unrecognized stored state" behavior.

import { CLIENT_PROFILE_DEMO, WORKSPACE_OPTIM_ID, resolveAssignedCoachId } from "./seed.ts";
import { buildDemoDefaultProgramEnrollment } from "../scheduling/enrollment.ts";
import { NUTRITION_TARGETS, PUSH_WORKOUT } from "../mock-data.ts";
import { legacyWorkoutToSession } from "../training/legacy-adapter.ts";
import type { AppState } from "../state";

// Phase 3 — the universal counterpart of PUSH_WORKOUT, for the v14->v15
// backfill below. Safe to compute eagerly: PUSH_WORKOUT is real, fully-usable
// content, so this can never throw (see lib/training/verify-legacy-adapter.mts).
const PUSH_SESSION = legacyWorkoutToSession(PUSH_WORKOUT);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function stampWorkspaceAndClient<T extends Record<string, unknown>>(record: T): T {
  return { ...record, workspaceId: WORKSPACE_OPTIM_ID, clientId: CLIENT_PROFILE_DEMO.id };
}

/** v1 -> v2: stamp workspaceId/clientId onto the day record and every
 * independently-addressable nested record (see Phase 2's tenancy model). */
function migrateV1ToV2(stored: Record<string, unknown>): Record<string, unknown> {
  const migrated: Record<string, unknown> = {
    ...stored,
    version: 2,
    workspaceId: WORKSPACE_OPTIM_ID,
    clientId: CLIENT_PROFILE_DEMO.id,
  };

  if (isRecord(stored.workoutSession)) {
    migrated.workoutSession = stampWorkspaceAndClient(stored.workoutSession);
  }
  if (Array.isArray(stored.chatMessages)) {
    migrated.chatMessages = stored.chatMessages.map((m) => (isRecord(m) ? stampWorkspaceAndClient(m) : m));
  }
  if (Array.isArray(stored.reviewRequests)) {
    migrated.reviewRequests = stored.reviewRequests.map((r) => (isRecord(r) ? stampWorkspaceAndClient(r) : r));
  }
  if (isRecord(stored.workoutSession) && Array.isArray((stored.workoutSession as Record<string, unknown>).painReports)) {
    const session = migrated.workoutSession as Record<string, unknown>;
    session.painReports = ((stored.workoutSession as Record<string, unknown>).painReports as unknown[]).map((p) =>
      isRecord(p) ? stampWorkspaceAndClient(p) : p
    );
  }

  return migrated;
}

/** v2 -> v3: drop the retired countdown-driven workoutWindow field and add
 * dailyTrainingPlan. There's no lossless way to translate an old "activated/
 * rescheduled/declined" countdown window into a client-entered training
 * decision — those were two different concepts — so this starts the field
 * at null (no decision made yet) rather than fabricating one. Nothing about
 * the actual workout session, logged sets, or completion status is touched. */
function migrateV2ToV3(stored: Record<string, unknown>): Record<string, unknown> {
  const migrated: Record<string, unknown> = { ...stored, version: 3, dailyTrainingPlan: null };
  delete migrated.workoutWindow;
  return migrated;
}

/** v3 -> v4 (Phase 4.1): adds programEnrollment, replacing
 * ClientProfile.programWeek/programTotalWeeks as a hand-set display value
 * with a real, derivable enrollment. The new enrollment's startDateIso is
 * reverse-derived so it reports the SAME program week the client was
 * already seeing (CLIENT_PROFILE_DEMO.programWeek) evaluated against
 * today's real date — never reset to Week 1, and never depending on a
 * hardcoded calendar date (buildDemoDefaultProgramEnrollment always reads
 * the real current instant). Idempotent by construction: this step only
 * ever runs when `working.version === 3`, so already-migrated (v4) data is
 * never touched a second time and never gets a second, different
 * enrollment. */
function migrateV3ToV4(stored: Record<string, unknown>): Record<string, unknown> {
  return { ...stored, version: 4, programEnrollment: buildDemoDefaultProgramEnrollment() };
}

/** v4 -> v5 (Phase 4.2 correction): corrects the stale durationWeeks a v4
 * programEnrollment was always built with. Schema version 4 never had any
 * coach-configuration UI for program duration, so every v4 enrollment's
 * durationWeeks is necessarily the old default (16, copied at the time from
 * ClientProfile.programTotalWeeks — see lib/scheduling/enrollment.ts) —
 * version 4 is itself the provenance marker this correction is scoped
 * through, per the "do not identify the prototype enrollment through a
 * brittle client name or one-off ID" requirement. Only durationWeeks is
 * touched — startDateIso (and therefore the derived current week), all
 * history, corrections, weekly reviews, and check-in data are untouched.
 * The `=== 16` guard is an extra, deliberately conservative safety net: if
 * a v4 enrollment somehow already carries a different value, this step
 * leaves it alone rather than assuming it's the stale default.
 * Idempotent by construction: this step only ever runs when
 * `working.version === 4`, so a real future coach-configured 16-week
 * enrollment (created once schema version has already moved past 4) can
 * never be silently reverted to 12 by a repeat hydration. */
function migrateV4ToV5(stored: Record<string, unknown>): Record<string, unknown> {
  const migrated: Record<string, unknown> = { ...stored, version: 5 };
  const enrollment = stored.programEnrollment;
  if (isRecord(enrollment) && enrollment.durationWeeks === 16) {
    migrated.programEnrollment = {
      ...enrollment,
      durationWeeks: 12,
      updatedAtIso: new Date().toISOString(),
    };
  }
  return migrated;
}

/** True once every prescribed working set for this exercise has a logged
 * entry (completed or skipped) — the same "resolved" idea
 * lib/workout/session-flow.ts's isExerciseResolved formalizes, reimplemented
 * minimally here so migration never has to import the live app's action
 * types. Used only to reconstruct an honest queue/order for old data. */
function isLegacyExerciseResolved(log: Record<string, unknown>): boolean {
  if (log.status === "completed" || log.status === "skipped") return true;
  return false;
}

/**
 * v5 -> v6 (Phase 4.4B-2): replaces the fragile `currentExerciseIndex`
 * array-index pointer with the guided live-flow's stable-id shape
 * (currentExerciseId, exerciseQueue, actualExerciseOrder,
 * deferredExerciseIds, currentSetNumber, phase, sessionWarmup,
 * exerciseWarmups, events, restStartedAtIso). Every new field is derived
 * conservatively from what the old session already really recorded —
 * nothing here fabricates performance data or invents history that didn't
 * happen:
 *
 * - currentExerciseId comes from indexing the real PUSH_WORKOUT.exercises
 *   array with the old currentExerciseIndex (every pre-4.4B-2 session was
 *   always modeled against PUSH_WORKOUT specifically — see
 *   lib/state.ts's createInitialWorkoutSession).
 * - exerciseQueue/actualExerciseOrder are reconstructed from each
 *   exercise's real logged status in the coach's real authored order —
 *   the closest honest approximation available, since actual-order
 *   telemetry didn't exist before this phase.
 * - A session already in progress has its warm-ups retroactively marked
 *   completed for any exercise already touched (so migration never
 *   regresses someone mid-workout into a warm-up gate they'd already
 *   effectively passed under the old flat UI) — untouched exercises start
 *   "not-started," a real and honest state.
 * - restStartedAtIso is left unset (unknown for old data) rather than
 *   guessed, so the very next logged set simply has no logIntervalSeconds
 *   (see lib/types.ts — a diagnostic log interval, never presented as rest),
 *   exactly like a legitimate first-set-of-session case.
 */
function migrateV5ToV6(stored: Record<string, unknown>): Record<string, unknown> {
  const migrated: Record<string, unknown> = { ...stored, version: 6 };
  const session = stored.workoutSession;
  if (!isRecord(session)) return migrated;

  const exerciseIds = PUSH_WORKOUT.exercises.map((e) => e.id);
  const rawIndex = typeof session.currentExerciseIndex === "number" ? session.currentExerciseIndex : 0;
  const logs = isRecord(session.exerciseLogs) ? session.exerciseLogs : {};
  const status = session.status;

  const resolvedIds = exerciseIds.filter((id) => isRecord(logs[id]) && isLegacyExerciseResolved(logs[id] as Record<string, unknown>));
  const touchedIds = exerciseIds.filter((id) => {
    const log = logs[id];
    return isRecord(log) && log.status !== "not-started";
  });

  let currentExerciseId: string | null = exerciseIds[rawIndex] ?? exerciseIds[0] ?? null;
  let exerciseQueue = exerciseIds.filter((id) => !resolvedIds.includes(id));
  if (currentExerciseId && resolvedIds.includes(currentExerciseId)) {
    // The old index pointed at an exercise that's actually already
    // resolved (e.g. session fully completed) — fall back to whatever's
    // still open, or null if nothing is.
    currentExerciseId = exerciseQueue[0] ?? null;
  } else if (currentExerciseId && !exerciseQueue.includes(currentExerciseId)) {
    exerciseQueue = [currentExerciseId, ...exerciseQueue];
  }

  const exerciseWarmups: Record<string, unknown> = {};
  for (const id of exerciseIds) {
    exerciseWarmups[id] = touchedIds.includes(id) ? { status: "completed" } : { status: "not-started" };
  }

  const startedAtIso = typeof session.startedAtIso === "string" ? session.startedAtIso : undefined;
  const completedAtIso = typeof session.completedAtIso === "string" ? session.completedAtIso : undefined;
  const events: Array<{ type: string; atIso: string }> = [];
  if (startedAtIso) events.push({ type: "started", atIso: startedAtIso });
  if (completedAtIso && (status === "completed" || status === "ended-early" || status === "skipped")) {
    events.push({ type: "completed", atIso: completedAtIso });
  }

  const phase = status === "not-started" ? "session-warmup" : currentExerciseId ? "set-ready" : "session-summary";

  const migratedSession: Record<string, unknown> = { ...session };
  delete migratedSession.currentExerciseIndex;
  migratedSession.currentExerciseId = currentExerciseId;
  migratedSession.exerciseQueue = status === "not-started" ? exerciseIds : exerciseQueue;
  migratedSession.actualExerciseOrder = status === "not-started" ? [] : touchedIds;
  migratedSession.deferredExerciseIds = [];
  migratedSession.lastResolvedExerciseId = null;
  migratedSession.currentSetNumber = null;
  migratedSession.phase = phase;
  migratedSession.sessionWarmup = status === "not-started" ? { status: "not-started" } : { status: "completed" };
  migratedSession.exerciseWarmups = exerciseWarmups;
  migratedSession.events = events;

  migrated.workoutSession = migratedSession;
  return migrated;
}

/** v6 -> v7: adds checkInSchedule, the client-side boundary for the future
 * coach-controlled check-in system (see lib/state.ts's AppState doc). No
 * coach-facing assignment UI exists yet, so every pre-v7 client — having
 * never had a real coach assignment to begin with — starts this at null
 * (no check-in card) rather than fabricating one from the old always-on
 * default weekly schedule. */
function migrateV6ToV7(stored: Record<string, unknown>): Record<string, unknown> {
  return { ...stored, version: 7, checkInSchedule: null };
}

/** v7 -> v8 (OPTIM Chat V1): every ChatMessage and ReviewRequest now carries
 * assignedCoachId — see lib/types.ts's doc on both fields. A pre-v8 record
 * predates that field entirely, so this backfills it from the same real
 * client->coach assignment resolveAssignedCoachId reads everywhere else
 * (never a hardcoded coach), rather than leaving it undefined. Every pre-v8
 * chat message was, by construction, already fully sent (there was no
 * "sending"/"failed" concept yet), so deliveryState backfills to "sent" —
 * never fabricating a pending/failed send that never really happened. */
function migrateV7ToV8(stored: Record<string, unknown>): Record<string, unknown> {
  const migrated: Record<string, unknown> = { ...stored, version: 8 };
  const clientId = typeof stored.clientId === "string" ? stored.clientId : CLIENT_PROFILE_DEMO.id;
  const assignedCoachId = resolveAssignedCoachId(clientId);

  if (Array.isArray(stored.chatMessages)) {
    migrated.chatMessages = stored.chatMessages.map((m) =>
      isRecord(m) ? { deliveryState: "sent", ...m, assignedCoachId } : m
    );
  }
  if (Array.isArray(stored.reviewRequests)) {
    migrated.reviewRequests = stored.reviewRequests.map((r) => (isRecord(r) ? { ...r, assignedCoachId } : r));
  }

  return migrated;
}

/** v8 -> v9 (Phase 5.0B — coach-controlled nutrition targets): adds
 * nutritionTargets, replacing lib/mock-data.ts's NUTRITION_TARGETS as a
 * single global constant with a real per-client value a coach sets during
 * setup (see lib/coach/setup.ts). Every pre-v9 record — the seeded demo
 * client's included — was always implicitly using that same global
 * constant, so backfilling it here preserves its exact existing behavior;
 * only a client a coach configures AFTER this phase ever gets a different
 * value, written directly by that setup flow rather than through migration. */
function migrateV8ToV9(stored: Record<string, unknown>): Record<string, unknown> {
  return { ...stored, version: 9, nutritionTargets: { ...NUTRITION_TARGETS } };
}

/** v9 -> v10 (Phase 5.0B — coach-created clients in Chat): adds
 * primaryCoachId, resolved once here and carried forward from then on
 * instead of being re-derived via resolveAssignedCoachId on every reducer
 * action that stamps a new ChatMessage/ReviewRequest (see
 * lib/state.ts's AppState.primaryCoachId doc — that repeated re-derivation
 * is exactly what crashed Chat for a newly activated, coach-created client,
 * since resolveAssignedCoachId only knows the compile-time seed roster).
 * Every record stored before this phase belongs to a seed client (the
 * multi-client system this backfills for didn't exist yet), so
 * resolveAssignedCoachId always succeeds here. */
function migrateV9ToV10(stored: Record<string, unknown>): Record<string, unknown> {
  const clientId = typeof stored.clientId === "string" ? stored.clientId : CLIENT_PROFILE_DEMO.id;
  return { ...stored, version: 10, primaryCoachId: resolveAssignedCoachId(clientId) };
}

/** v10 -> v11 (Phase 5.2 — review resolution lifecycle): every existing
 * ReviewRequest gets an explicit status/severity/updatedAtIso instead of
 * only the original `resolved` boolean — derived from that same boolean, so
 * a previously-open or previously-resolved item's meaning never changes,
 * and no history is lost. */
function migrateV10ToV11(stored: Record<string, unknown>): Record<string, unknown> {
  const reviewRequests = Array.isArray(stored.reviewRequests)
    ? stored.reviewRequests.map((r) => {
        if (!isRecord(r)) return r;
        const resolved = r.resolved === true;
        const createdAtIso = typeof r.createdAtIso === "string" ? r.createdAtIso : new Date().toISOString();
        return {
          ...r,
          status: resolved ? "resolved" : "needs_review",
          severity: r.kind === "pain-report" ? "high" : "normal",
          updatedAtIso: createdAtIso,
        };
      })
    : stored.reviewRequests;
  return { ...stored, version: 11, reviewRequests };
}

/** v11 -> v12 (Phase 5.2 — coach-authored training protocols): adds
 * AppState.assignedProgram, always undefined until a coach explicitly
 * assigns one (see lib/coach/training.ts) — nothing else changes, and
 * resolveWorkoutAvailabilityForDay's fallback to the global demo catalog
 * means a client with no assignedProgram behaves exactly as before. */
function migrateV11ToV12(stored: Record<string, unknown>): Record<string, unknown> {
  return { ...stored, version: 12 };
}

/** v12 -> v13 (Phase 5.4B): adds the once-per-day entrance-sequence tracker
 * and the consecutive-clean-workout streak counter — both brand-new daily
 * fields with no prior equivalent, so every existing stored day starts
 * fresh (never having "seen" the entrance sequence for whatever date is
 * already stored, and with a zero streak) rather than needing any real data
 * carried forward. */
function migrateV12ToV13(stored: Record<string, unknown>): Record<string, unknown> {
  return { ...stored, version: 13, dailyEntrance: { lastSeenLocalDateIso: null }, consecutiveCleanWorkouts: 0 };
}

/** v13 -> v14 (Phase 5.5A): adds the optional real, complete
 * assignedNutritionPlan (see AppState's own doc) — undefined/omitted for
 * every already-stored client, exactly matching how assignedProgram was
 * introduced as an omitted optional field rather than a required one with
 * an invented default. `nutritionTargets` itself is untouched, so every
 * existing client's real numbers survive this migration unchanged. */
function migrateV13ToV14(stored: Record<string, unknown>): Record<string, unknown> {
  return { ...stored, version: 14 };
}

/** v14 -> v15 (Assigned-Program Live Workout Engine) — adds
 * WorkoutSession.resolvedWorkout, the frozen prescription snapshot every
 * real reducer case now reads instead of the global PUSH_WORKOUT constant
 * (see lib/state.ts's START_WORKOUT). Every session ever created before this
 * version really was built against PUSH_WORKOUT specifically (there was no
 * other possible source — see the v5->v6 migration's identical reasoning
 * above), so a session that had actually started (anything but
 * "not-started") honestly backfills resolvedWorkout: PUSH_WORKOUT. A session
 * that never started gets the same genuinely-empty shell a brand-new one
 * would (see createInitialWorkoutSession) — its old exerciseLogs/
 * exerciseWarmups were only ever the untouched not-started placeholders
 * anyway, so clearing them loses no real data.
 *
 * Phase 3 addition — also backfills the new resolvedSession alongside
 * resolvedWorkout, same reasoning: the universal engine (lib/workout/
 * session-flow.ts) now navigates a live session by resolvedSession, so an
 * already-in-progress pre-v15 session needs it populated too, not just left
 * to resolvedSession's own "missing means null" tolerance — a session this
 * old that's still genuinely in progress when it's opened again should keep
 * working, not silently stall on its next navigation action. */
function migrateV14ToV15(stored: Record<string, unknown>): Record<string, unknown> {
  const migrated: Record<string, unknown> = { ...stored, version: 15 };
  const session = stored.workoutSession;
  if (!isRecord(session)) return migrated;

  if (session.status === "not-started") {
    migrated.workoutSession = {
      ...session,
      workoutId: "",
      resolvedWorkout: null,
      resolvedSession: null,
      exerciseLogs: {},
      exerciseWarmups: {},
    };
  } else {
    migrated.workoutSession = {
      ...session,
      workoutId: typeof session.workoutId === "string" && session.workoutId ? session.workoutId : PUSH_WORKOUT.id,
      resolvedWorkout: PUSH_WORKOUT,
      resolvedSession: PUSH_SESSION,
    };
  }
  return migrated;
}

/**
 * Upgrades raw localStorage content (of unknown/any prior shape) to the
 * current AppState (version 10), stepping through every intermediate
 * version in order. Returns null when the input isn't a recognized AppState
 * at all, so the caller can safely fall back to a fresh state instead of
 * hydrating garbage.
 */
export function migrateStoredState(stored: unknown): AppState | null {
  if (!isRecord(stored)) return null;

  let working: Record<string, unknown> = stored;

  if (working.version === 1) {
    working = migrateV1ToV2(working);
  }
  if (working.version === 2 && typeof working.workspaceId === "string" && typeof working.clientId === "string") {
    working = migrateV2ToV3(working);
  }
  if (working.version === 3 && typeof working.workspaceId === "string" && typeof working.clientId === "string") {
    working = migrateV3ToV4(working);
  }
  if (
    working.version === 4 &&
    typeof working.workspaceId === "string" &&
    typeof working.clientId === "string" &&
    isRecord(working.programEnrollment)
  ) {
    working = migrateV4ToV5(working);
  }

  if (
    working.version === 5 &&
    typeof working.workspaceId === "string" &&
    typeof working.clientId === "string" &&
    isRecord(working.programEnrollment)
  ) {
    working = migrateV5ToV6(working);
  }

  if (
    working.version === 6 &&
    typeof working.workspaceId === "string" &&
    typeof working.clientId === "string" &&
    isRecord(working.programEnrollment)
  ) {
    working = migrateV6ToV7(working);
  }

  if (
    working.version === 7 &&
    typeof working.workspaceId === "string" &&
    typeof working.clientId === "string" &&
    isRecord(working.programEnrollment)
  ) {
    working = migrateV7ToV8(working);
  }

  if (
    working.version === 8 &&
    typeof working.workspaceId === "string" &&
    typeof working.clientId === "string" &&
    isRecord(working.programEnrollment)
  ) {
    working = migrateV8ToV9(working);
  }

  if (
    working.version === 9 &&
    typeof working.workspaceId === "string" &&
    typeof working.clientId === "string" &&
    isRecord(working.programEnrollment) &&
    isRecord(working.nutritionTargets)
  ) {
    working = migrateV9ToV10(working);
  }

  if (
    working.version === 10 &&
    typeof working.workspaceId === "string" &&
    typeof working.clientId === "string" &&
    typeof working.primaryCoachId === "string" &&
    isRecord(working.programEnrollment) &&
    isRecord(working.nutritionTargets)
  ) {
    working = migrateV10ToV11(working);
  }

  if (
    working.version === 11 &&
    typeof working.workspaceId === "string" &&
    typeof working.clientId === "string" &&
    typeof working.primaryCoachId === "string" &&
    isRecord(working.programEnrollment) &&
    isRecord(working.nutritionTargets)
  ) {
    working = migrateV11ToV12(working);
  }

  if (
    working.version === 12 &&
    typeof working.workspaceId === "string" &&
    typeof working.clientId === "string" &&
    typeof working.primaryCoachId === "string" &&
    isRecord(working.programEnrollment) &&
    isRecord(working.nutritionTargets)
  ) {
    working = migrateV12ToV13(working);
  }

  if (
    working.version === 13 &&
    typeof working.workspaceId === "string" &&
    typeof working.clientId === "string" &&
    typeof working.primaryCoachId === "string" &&
    isRecord(working.programEnrollment) &&
    isRecord(working.nutritionTargets)
  ) {
    working = migrateV13ToV14(working);
  }

  if (
    working.version === 14 &&
    typeof working.workspaceId === "string" &&
    typeof working.clientId === "string" &&
    typeof working.primaryCoachId === "string" &&
    isRecord(working.programEnrollment) &&
    isRecord(working.nutritionTargets)
  ) {
    working = migrateV14ToV15(working);
  }

  if (
    working.version === 15 &&
    typeof working.workspaceId === "string" &&
    typeof working.clientId === "string" &&
    typeof working.primaryCoachId === "string" &&
    isRecord(working.programEnrollment) &&
    isRecord(working.nutritionTargets)
  ) {
    return working as unknown as AppState;
  }

  // Unrecognized shape (corrupt data, a future version this build doesn't
  // know about, etc.) — let the caller fall back to a fresh state rather
  // than hydrating something we can't interpret.
  return null;
}
