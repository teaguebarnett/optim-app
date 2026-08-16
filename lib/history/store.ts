// HistoryStore — the boundary between "domain/derivation code" and "how
// history is actually persisted." Every read/write in this app should go
// through an implementation of this interface rather than touching
// localStorage (or a future API) directly, so swapping the backing store
// later (e.g. for a real database-backed API) never requires touching
// derivation logic, archival logic, or components.
//
// Design decision — synchronous, not async: the Phase 4.1 spec asks for an
// async interface "if compatible with the repository... without forcing
// unnecessary churn." This repository's entire persistence layer (see
// lib/storage.ts, used by hooks/use-prototype-state.tsx's hydration effect)
// is synchronous localStorage access with no Promise anywhere in the render
// path. Making HistoryStore's methods return Promises here would force every
// caller — the hydration effect, the rollover/archival logic, every future
// component read — into async state management for a store whose only real
// implementation (localStorage) is inherently synchronous. That is exactly
// the "unnecessary churn" the spec says to avoid. A later real backend swap
// would introduce a *new* adapter implementing (a then-async version of)
// this interface at that time — this interface itself is the seam that
// makes that swap possible, not a guess at today's transport.
//
// Every method requires an explicit HistoryScope — there is no "get all
// history" operation, so no future real backend implementation is ever
// tempted to expose an unscoped query.

import type { RecordSource } from "./shared-types";
import type { ProgramEnrollmentId } from "../scheduling/types";
import type { ClientProfileId, WorkspaceId } from "../tenancy/types";
import type { Correction, DailyRecord, WeeklyReview } from "./types";

export interface HistoryScope {
  workspaceId: WorkspaceId;
  clientId: ClientProfileId;
  enrollmentId: ProgramEnrollmentId;
}

export interface DateRange {
  fromDateIso: string;
  toDateIso: string;
}

export type PutDailyRecordResult =
  | { status: "created"; record: DailyRecord }
  /** The exact same record (aside from its own createdAtIso) already
   * existed — a safe, idempotent no-op. Repeated rollover attempts for the
   * same day rely on this rather than erroring. */
  | { status: "already-exists"; record: DailyRecord }
  /** A record already exists at this (workspace, client, enrollment, date,
   * source) key with genuinely different content. The store never silently
   * overwrites — the caller must decide how to surface/resolve this. */
  | { status: "conflict"; existing: DailyRecord; attempted: DailyRecord };

export interface HistoryStore {
  getDailyRecord(scope: HistoryScope, dateIso: string, source: RecordSource): DailyRecord | null;
  listDailyRecords(scope: HistoryScope, range: DateRange, source: RecordSource): DailyRecord[];
  /** Idempotent, conflict-detecting write — see PutDailyRecordResult. */
  putDailyRecordIdempotent(record: DailyRecord): PutDailyRecordResult;
  /** Read-back confirmation that a record really was persisted — used by
   * archival's confirm-then-reset step rather than trusting the write call
   * alone succeeded. */
  confirmDailyRecordPersisted(scope: HistoryScope, dateIso: string, source: RecordSource): boolean;

  appendCorrection(correction: Correction): Correction;
  listCorrections(scope: HistoryScope, dateIso?: string): Correction[];

  getWeeklyReview(scope: HistoryScope, weekStartDateIso: string): WeeklyReview | null;
  putWeeklyReview(review: WeeklyReview): WeeklyReview;
  listWeeklyReviews(scope: HistoryScope): WeeklyReview[];

  /** Removes every record belonging to `scope` from this store instance.
   * Used only by the dev-only demo-fixture reset control (see
   * lib/history/demo-fixture.ts) — never exposed as a general "delete
   * history" action in the live client experience. */
  clearScope(scope: HistoryScope): void;
}
