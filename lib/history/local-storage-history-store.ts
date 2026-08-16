// localStorage-backed HistoryStore implementation.
//
// Kept in its own storage key(s) — never nested inside AppState's single
// "peak-coaching:state:v1" object — per the backend-readiness requirement
// that an ever-growing history log must not live inside one deeply-nested,
// localStorage-only blob. Two instances of this same class, constructed
// with different storage keys, give the demo-fixture isolation the Phase 4
// decisions require: loading/clearing the fixture instance can never touch
// real live history, and vice versa (see lib/history/demo-fixture.ts).
//
// Honest limitation: this is still localStorage. It is per-browser,
// per-device, has no real multi-tenant enforcement (see lib/tenancy/access.ts
// for the same caveat on the tenancy layer), has no transactional guarantees
// across the small number of read-modify-write steps below, and a
// bytes-quota error truly can lose the write it happens on (compare
// lib/storage.ts's saveState, which fails the same way). This adapter is
// swappable specifically so a real backend can replace it without touching
// any derivation/archival/component code — see lib/history/store.ts.

import type { HistoryScope, DateRange, HistoryStore, PutDailyRecordResult } from "./store";
import type { RecordSource } from "./shared-types";
import type { Correction, DailyRecord, WeeklyReview } from "./types";

interface HistoryStorageShape {
  schemaVersion: number;
  dailyRecords: DailyRecord[];
  corrections: Correction[];
  weeklyReviews: WeeklyReview[];
}

function emptyShape(): HistoryStorageShape {
  // A fresh object every call — never a shared constant, so a caller that
  // mutates its returned arrays (see putDailyRecordIdempotent, etc.) can
  // never leak state into an unrelated read.
  return { schemaVersion: 1, dailyRecords: [], corrections: [], weeklyReviews: [] };
}

/** Minimal Storage-like surface this adapter needs — real callers get real
 * window.localStorage (see resolveDefaultStorage), and lib/history/
 * verify-history.mts injects an in-memory implementation so the store's
 * real idempotency/conflict logic is exercised under Node's test runner,
 * which has no window/localStorage at all. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function resolveDefaultStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    const testKey = "__peak_coaching_history_test__";
    window.localStorage.setItem(testKey, "1");
    window.localStorage.removeItem(testKey);
    return window.localStorage;
  } catch {
    return null;
  }
}

function inScope(scope: HistoryScope, record: { workspaceId: string; clientId: string; enrollmentId: string }): boolean {
  return (
    record.workspaceId === scope.workspaceId &&
    record.clientId === scope.clientId &&
    record.enrollmentId === scope.enrollmentId
  );
}

/** Deep-equal comparison for idempotency, ignoring createdAtIso — repeated
 * archival attempts for the same underlying day legitimately produce a new
 * createdAtIso each time even when every other field matches, and that
 * alone must never count as a conflict. */
function withoutCreatedAt(record: DailyRecord): Omit<DailyRecord, "createdAtIso"> {
  const clone: Partial<DailyRecord> = { ...record };
  delete clone.createdAtIso;
  return clone as Omit<DailyRecord, "createdAtIso">;
}

function dailyRecordsAreEquivalent(a: DailyRecord, b: DailyRecord): boolean {
  return JSON.stringify(withoutCreatedAt(a)) === JSON.stringify(withoutCreatedAt(b));
}

export class LocalStorageHistoryStore implements HistoryStore {
  private readonly storageKey: string;
  private readonly storage: StorageLike | null;

  // Node's --experimental-strip-types (used by lib/history/verify-history
  // .mts and this project's other verify:*.mts scripts) doesn't support
  // TypeScript constructor parameter-property shorthand — see the sibling
  // verify:*.mts scripts, none of which use it either — so fields are
  // declared explicitly above instead.
  constructor(storageKey: string, storage?: StorageLike) {
    this.storageKey = storageKey;
    this.storage = storage ?? resolveDefaultStorage();
  }

  private read(): HistoryStorageShape {
    if (!this.storage) return emptyShape();
    try {
      const raw = this.storage.getItem(this.storageKey);
      if (!raw) return emptyShape();
      const parsed = JSON.parse(raw) as Partial<HistoryStorageShape>;
      return {
        schemaVersion: parsed.schemaVersion ?? 1,
        dailyRecords: Array.isArray(parsed.dailyRecords) ? parsed.dailyRecords : [],
        corrections: Array.isArray(parsed.corrections) ? parsed.corrections : [],
        weeklyReviews: Array.isArray(parsed.weeklyReviews) ? parsed.weeklyReviews : [],
      };
    } catch {
      return emptyShape();
    }
  }

  private write(shape: HistoryStorageShape): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(this.storageKey, JSON.stringify(shape));
    } catch {
      // Storage full or blocked mid-session — fail silently, same contract
      // as lib/storage.ts's saveState.
    }
  }

  getDailyRecord(scope: HistoryScope, dateIso: string, source: RecordSource): DailyRecord | null {
    const shape = this.read();
    return (
      shape.dailyRecords.find((r) => inScope(scope, r) && r.dateIso === dateIso && r.source === source) ?? null
    );
  }

  listDailyRecords(scope: HistoryScope, range: DateRange, source: RecordSource): DailyRecord[] {
    const shape = this.read();
    return shape.dailyRecords
      .filter(
        (r) =>
          inScope(scope, r) &&
          r.source === source &&
          r.dateIso >= range.fromDateIso &&
          r.dateIso <= range.toDateIso
      )
      .sort((a, b) => (a.dateIso < b.dateIso ? -1 : a.dateIso > b.dateIso ? 1 : 0));
  }

  putDailyRecordIdempotent(record: DailyRecord): PutDailyRecordResult {
    const shape = this.read();
    const existingIndex = shape.dailyRecords.findIndex((r) => r.id === record.id);
    if (existingIndex === -1) {
      shape.dailyRecords.push(record);
      this.write(shape);
      return { status: "created", record };
    }
    const existing = shape.dailyRecords[existingIndex];
    if (dailyRecordsAreEquivalent(existing, record)) {
      return { status: "already-exists", record: existing };
    }
    return { status: "conflict", existing, attempted: record };
  }

  confirmDailyRecordPersisted(scope: HistoryScope, dateIso: string, source: RecordSource): boolean {
    return this.getDailyRecord(scope, dateIso, source) !== null;
  }

  appendCorrection(correction: Correction): Correction {
    const shape = this.read();
    if (!shape.corrections.some((c) => c.id === correction.id)) {
      shape.corrections.push(correction);
      this.write(shape);
    }
    return correction;
  }

  listCorrections(scope: HistoryScope, dateIso?: string): Correction[] {
    const shape = this.read();
    return shape.corrections.filter(
      (c) => inScope(scope, c) && (dateIso === undefined || c.effectiveDateIso === dateIso)
    );
  }

  getWeeklyReview(scope: HistoryScope, weekStartDateIso: string): WeeklyReview | null {
    const shape = this.read();
    return (
      shape.weeklyReviews.find((w) => inScope(scope, w) && w.weekStartDateIso === weekStartDateIso) ?? null
    );
  }

  putWeeklyReview(review: WeeklyReview): WeeklyReview {
    const shape = this.read();
    const existingIndex = shape.weeklyReviews.findIndex((w) => w.id === review.id);
    if (existingIndex === -1) {
      shape.weeklyReviews.push(review);
    } else {
      shape.weeklyReviews[existingIndex] = review;
    }
    this.write(shape);
    return review;
  }

  listWeeklyReviews(scope: HistoryScope): WeeklyReview[] {
    const shape = this.read();
    return shape.weeklyReviews.filter((w) => inScope(scope, w));
  }

  clearScope(scope: HistoryScope): void {
    const shape = this.read();
    this.write({
      schemaVersion: shape.schemaVersion,
      dailyRecords: shape.dailyRecords.filter((r) => !inScope(scope, r)),
      corrections: shape.corrections.filter((c) => !inScope(scope, c)),
      weeklyReviews: shape.weeklyReviews.filter((w) => !inScope(scope, w)),
    });
  }
}

// ---------------------------------------------------------------------------
// The two store instances this app ever needs — separate keys, same class.
// ---------------------------------------------------------------------------

export const LIVE_HISTORY_STORAGE_KEY = "peak-coaching:history:v1";
export const FIXTURE_HISTORY_STORAGE_KEY = "peak-coaching:history-fixture:v1";

let liveStoreSingleton: LocalStorageHistoryStore | null = null;
export function getLiveHistoryStore(): LocalStorageHistoryStore {
  if (!liveStoreSingleton) liveStoreSingleton = new LocalStorageHistoryStore(LIVE_HISTORY_STORAGE_KEY);
  return liveStoreSingleton;
}

let fixtureStoreSingleton: LocalStorageHistoryStore | null = null;
export function getFixtureHistoryStore(): LocalStorageHistoryStore {
  if (!fixtureStoreSingleton) fixtureStoreSingleton = new LocalStorageHistoryStore(FIXTURE_HISTORY_STORAGE_KEY);
  return fixtureStoreSingleton;
}
