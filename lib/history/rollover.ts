// Date rollover and daily archival — replaces the pre-4.1 behavior (see
// hooks/use-prototype-state.tsx's old hydration effect) of silently
// discarding a previous day's live state with clearState() when the stored
// date doesn't match today. Now: archive-then-confirm-then-reset, and never
// destroy live state if archival can't be confirmed.
//
// Idempotency key: a DailyRecord's own id already encodes
// (workspaceId, clientId, enrollmentId, dateIso, source) — see
// lib/history/types.ts's buildDailyRecordId — so a repeated rollover
// attempt for the same day (e.g. React effect double-invocation, or a
// crash-and-retry) naturally converges on the HistoryStore's own
// already-exists/conflict handling rather than needing separate guarding
// here.

import { buildDailyRecordFromLiveState } from "./build-daily-record.ts";
import { getLiveHistoryStore } from "./local-storage-history-store.ts";
import { createInitialState } from "../state.ts";
import type { AppState } from "../state";
import type { HistoryStore } from "./store";

export interface RolloverResult {
  nextState: AppState;
  archived: boolean;
  /** Set whenever something diagnosable happened (a conflict, an
   * unconfirmed write, or a backward clock/timezone move) — always also
   * logged via console.warn/error, mirroring lib/tenancy/context.ts's
   * TenancyAccessError as this app's only existing diagnostic channel
   * beyond the console (there is no toast/banner system to extend here
   * without adding UI surface area beyond Phase 4.1's scope). */
  diagnostic?: string;
}

function logDiagnostic(level: "warn" | "error", message: string): void {
  if (typeof console === "undefined") return;
  console[level](`[history/rollover] ${message}`);
}

/**
 * Called once at hydration with the migrated stored state and today's real
 * client-local date. If they already match, this is a no-op. If the stored
 * date is in the past, the stale live day is archived (idempotently,
 * conflict-safe) before a fresh day begins — archival failure or conflict
 * never discards the live state; it's preserved as-is and the condition is
 * surfaced via console diagnostics for a developer to notice. If the stored
 * date is somehow in the future (backward clock/timezone change), the state
 * is preserved untouched rather than archived-as-complete or reset.
 */
export function resolveRollover(stored: AppState, todayIso: string, store: HistoryStore = getLiveHistoryStore()): RolloverResult {
  if (stored.dateIso === todayIso) {
    return { nextState: stored, archived: false };
  }

  if (stored.dateIso > todayIso) {
    const diagnostic = `Stored state's date (${stored.dateIso}) is after today (${todayIso}) — preserving as-is rather than archiving or resetting.`;
    logDiagnostic("warn", diagnostic);
    return { nextState: stored, archived: false, diagnostic };
  }

  // Forward rollover. Only one live day ever exists at a time, so only
  // `stored.dateIso` itself is archived here — any calendar days between it
  // and today were never captured live and have no record to archive. That
  // gap is an honest absence, never fabricated as a "missed" DailyRecord
  // (see Phase 4.1 §5's multi-day-absence handling).
  const attempted = buildDailyRecordFromLiveState(stored, stored.programEnrollment, "live");
  const scope = { workspaceId: stored.workspaceId, clientId: stored.clientId, enrollmentId: stored.programEnrollment.id };
  const putResult = store.putDailyRecordIdempotent(attempted);

  if (putResult.status === "conflict") {
    const diagnostic = `Archival conflict for ${stored.dateIso}: a different record already exists at this key. Live state was preserved rather than discarded.`;
    logDiagnostic("error", diagnostic);
    return { nextState: stored, archived: false, diagnostic };
  }

  const confirmed = store.confirmDailyRecordPersisted(scope, stored.dateIso, "live");
  if (!confirmed) {
    const diagnostic = `Archival for ${stored.dateIso} could not be confirmed persisted. Live state was preserved rather than discarded.`;
    logDiagnostic("error", diagnostic);
    return { nextState: stored, archived: false, diagnostic };
  }

  // Every per-client config field a coach can now set (program enrollment,
  // nutrition targets, check-in schedule) must survive a day rollover
  // unchanged — a coach's explicit configuration is never silently reset
  // just because the calendar day advanced. Only the day's own daily
  // fields (meals, workout, morning weight, cardio) actually start fresh.
  const fresh = createInitialState({ workspaceId: stored.workspaceId, clientId: stored.clientId, primaryCoachId: stored.primaryCoachId });
  const nextState: AppState = {
    ...fresh,
    dateIso: todayIso,
    programEnrollment: stored.programEnrollment,
    nutritionTargets: stored.nutritionTargets,
    checkInSchedule: stored.checkInSchedule,
  };
  return { nextState, archived: true };
}
