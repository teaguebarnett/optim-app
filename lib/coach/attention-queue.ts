// Phase 5.0A — the coach's "Needs attention" queue.
//
// Built strictly from real, already-existing ReviewRequest records (see
// lib/types.ts and every place lib/state.ts's reducer creates one: pain
// reports, RPE anomalies, skipped work, technique flags, and Chat's pain/
// program-change escalations) — never a fabricated notification. Sorted by
// a fixed safety-first priority (pain/injury always first, regardless of
// recency) matching the Phase 5.0A brief's decision-boundary ordering, then
// by recency within the same priority.

import type { ClientProfile, CoachProfileId, WorkspaceId } from "../tenancy/types";
import type { ReviewRequest } from "../types";
import type { AttentionItemKind, AttentionQueueItem, HealthReviewRecord } from "./types";

/** Lower = more urgent. Matches the Phase 5.0A decision-boundary ordering:
 * pain/injury always escalates first, then a program/exercise decision
 * awaiting approval, then other flagged work. A pending health review sits
 * at the very front — it's an activation-blocking safety gate, the single
 * most "only Teague can decide this" item the queue ever carries. */
const ATTENTION_PRIORITY: Record<AttentionItemKind, number> = {
  health_review: -1,
  "pain-report": 0,
  "program-change-request": 1,
  "rpe-anomaly": 2,
  "workout-skipped": 2,
  "technique-flag": 3,
  "schedule-change": 4,
};

export interface BuildAttentionQueueInput {
  workspaceId: WorkspaceId;
  coachId: CoachProfileId;
  reviewRequests: ReviewRequest[];
  clients: ClientProfile[];
  /** Already scoped to this coach's own clients/workspace by the caller —
   * see hooks/use-coach-data.ts, since a HealthReviewRecord carries no
   * assignedCoachId of its own to filter on the way a ReviewRequest does. */
  healthReviews?: HealthReviewRecord[];
}

/**
 * Every one of this exact coach's own review requests inside this exact
 * workspace — every status, not just unresolved — so the Reviews page's
 * Needs review / In progress / Resolved tabs (see
 * app/coach/reviews/page.tsx) all read from one place. A coach must never
 * see another workspace's clients or review requests, and never another
 * coach's, even inside the same workspace (see lib/tenancy/access.ts's
 * scopeClientOwnedRecords for the equivalent rule applied elsewhere).
 */
export function buildReviewQueueItems(input: BuildAttentionQueueInput): AttentionQueueItem[] {
  const clientsById = new Map(input.clients.map((c) => [c.id, c]));

  const reviewItems: AttentionQueueItem[] = input.reviewRequests
    .filter((r) => r.workspaceId === input.workspaceId && r.assignedCoachId === input.coachId)
    .map((r) => ({
      reviewRequestId: r.id,
      workspaceId: r.workspaceId,
      clientId: r.clientId,
      clientName: clientsById.get(r.clientId)?.name ?? "Unknown client",
      assignedCoachId: r.assignedCoachId,
      kind: r.kind,
      summary: r.summary,
      createdAtIso: r.createdAtIso,
      updatedAtIso: r.updatedAtIso,
      priority: ATTENTION_PRIORITY[r.kind],
      severity: r.severity,
      status: r.status,
      resolutionAction: r.resolutionAction,
      resolutionNote: r.resolutionNote,
      resolvedAtIso: r.resolvedAtIso,
      resolvedByCoachId: r.resolvedByCoachId,
    }));

  // Only ever surfaced while unresolved (see use-coach-data.ts's
  // unresolvedHealthReviews) — its own real lifecycle lives on the
  // HealthReviewRecord, resolved through the client detail page, so it
  // always reads "needs_review" here rather than tracking a second copy of
  // that lifecycle.
  const healthReviewItems: AttentionQueueItem[] = (input.healthReviews ?? []).map((r) => ({
    reviewRequestId: `health-review-${r.clientId}`,
    workspaceId: r.workspaceId,
    clientId: r.clientId,
    clientName: clientsById.get(r.clientId)?.name ?? "Unknown client",
    assignedCoachId: input.coachId,
    kind: "health_review",
    summary: r.reasons[0] ?? "Intake flagged something worth a look before activation.",
    reasons: r.reasons,
    createdAtIso: r.createdAtIso,
    updatedAtIso: r.createdAtIso,
    priority: ATTENTION_PRIORITY.health_review,
    severity: "high",
    status: "needs_review",
  }));

  return [...healthReviewItems, ...reviewItems].sort((a, b) => a.priority - b.priority || (a.createdAtIso < b.createdAtIso ? 1 : -1));
}

/** The coach's "Needs attention" queue — everything from
 * buildReviewQueueItems that isn't yet resolved. Used for the nav badge and
 * every dashboard "Needs you" widget, which have never shown resolved
 * items. */
export function buildAttentionQueue(input: BuildAttentionQueueInput): AttentionQueueItem[] {
  return buildReviewQueueItems(input).filter((item) => item.status !== "resolved");
}
