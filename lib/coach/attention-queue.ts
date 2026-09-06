// Phase 5.0A — the coach's "Needs attention" queue.
//
// Built strictly from real, already-existing ReviewRequest records (see
// lib/types.ts and every place lib/state.ts's reducer creates one: pain
// reports, RPE anomalies, skipped work, technique flags, and Chat's pain/
// program-change escalations) — never a fabricated notification. Sorted by
// a fixed safety-first priority (pain/injury always first, regardless of
// recency) matching the Phase 5.0A brief's decision-boundary ordering, then
// by recency within the same priority.

import type { ClientProfile, ClientProfileId, CoachProfileId, WorkspaceId } from "../tenancy/types";
import type { ReviewRequest } from "../types";
import type { AttentionItemKind, AttentionQueueItem, HealthReviewRecord, NotificationTier } from "./types";

/**
 * Phase 5.4B completion pass (spec §7) — the three-tier classification.
 * Pure and total: every kind maps to a real tier, no "uncategorized"
 * fallback. `workoutInProgress` is the one piece of live context that can
 * move a pain-report from "immediate" to "action_required" independently
 * of the review record itself — a pain report is only ever a truly live
 * situation while the client's workout session is still actually running;
 * once the session ends (or never started), the exact same report is a
 * real but non-live decision for the next appropriate review, never an
 * automatic after-hours emergency (spec §4).
 */
export function resolveNotificationTier(kind: AttentionItemKind, opts: { workoutInProgress: boolean }): NotificationTier {
  if (kind === "pain-report") return opts.workoutInProgress ? "immediate" : "action_required";
  if (kind === "milestone") return "awareness";
  return "action_required";
}

const NOTIFICATION_TIER_ORDER: Record<NotificationTier, number> = { immediate: 0, action_required: 1, awareness: 2 };

/** Lower = more urgent. Matches the Phase 5.0A decision-boundary ordering:
 * pain/injury always escalates first, then a program/exercise decision
 * awaiting approval, then other flagged work. A pending health review sits
 * at the very front — it's an activation-blocking safety gate, the single
 * most "only Teague can decide this" item the queue ever carries. */
const ATTENTION_PRIORITY: Record<AttentionItemKind, number> = {
  health_review: -1,
  "pain-report": 0,
  "recovery-deterioration": 0.5,
  "ai-authority-boundary": 0.75,
  "program-change-request": 1,
  "performance-pattern": 1.5,
  "adherence-pattern": 1.5,
  "rpe-anomaly": 2,
  "workout-skipped": 2,
  "technique-flag": 3,
  "schedule-change": 4,
  // Never competes with a real decision — rendered in its own "Worth a
  // personal touch" bucket regardless of numeric priority (see
  // attentionBucketForItem below).
  milestone: 10,
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
  /** Every client whose workoutSession.status is currently "in-progress" —
   * see resolveNotificationTier's own doc for why this matters. Omitted
   * (or a client absent from it) is always treated as "not in progress,"
   * never as "unknown -> immediate" — an unknown/missing signal must never
   * default toward the more urgent classification. */
  workoutInProgressClientIds?: Set<ClientProfileId>;
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
      notificationTier: resolveNotificationTier(r.kind, { workoutInProgress: input.workoutInProgressClientIds?.has(r.clientId) ?? false }),
      status: r.status,
      resolutionAction: r.resolutionAction,
      resolutionNote: r.resolutionNote,
      resolvedAtIso: r.resolvedAtIso,
      resolvedByCoachId: r.resolvedByCoachId,
      escalationReason: r.escalationReason,
      optimActionsTaken: r.optimActionsTaken,
      recommendedNextAction: r.recommendedNextAction,
      preparedClientMessage: r.preparedClientMessage,
      waitingOn: r.waitingOn,
      resurfaceAtIso: r.resurfaceAtIso,
      clientNotificationRequired: r.clientNotificationRequired,
      clientNotifiedAtIso: r.clientNotifiedAtIso,
      responseRequiredFromClient: r.responseRequiredFromClient,
      history: r.history,
      resolutionReceipt: r.resolutionReceipt,
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
    notificationTier: resolveNotificationTier("health_review", { workoutInProgress: false }),
    status: "needs_review",
  }));

  return [...healthReviewItems, ...reviewItems].sort(
    (a, b) =>
      NOTIFICATION_TIER_ORDER[a.notificationTier] - NOTIFICATION_TIER_ORDER[b.notificationTier] ||
      a.priority - b.priority ||
      (a.createdAtIso < b.createdAtIso ? 1 : -1)
  );
}

/** The coach's "Needs attention" queue — everything from
 * buildReviewQueueItems that isn't yet resolved. Used for the nav badge and
 * every dashboard "Needs you" widget, which have never shown resolved
 * items. */
export function buildAttentionQueue(input: BuildAttentionQueueInput): AttentionQueueItem[] {
  return buildReviewQueueItems(input).filter((item) => item.status !== "resolved");
}

/**
 * Phase 5.4B — the Command Center's required five-section hierarchy (spec
 * §2) collapses to three real, derivable buckets over this same queue (the
 * other two sections — Daily Briefings, Clients On Track — read from
 * different data entirely, see lib/coach/command-center.ts): a genuinely
 * positive item never mixes with a risk/decision alert (spec §4's Positive
 * attention rule), and a "waiting" item only re-enters the decision surface
 * once its own promised resurface time has actually arrived — reading
 * `resurfaceAtIso` live rather than needing a background job to flip it,
 * since dashboard lifecycle state must stay the one source of truth (spec
 * §9).
 */
export type AttentionBucket = "needs_attention" | "worth_personal_touch" | "waiting";

export function attentionBucketForItem(item: AttentionQueueItem, nowIso: string): AttentionBucket {
  if (item.kind === "milestone") return "worth_personal_touch";
  if (item.status === "waiting") {
    if (item.resurfaceAtIso && item.resurfaceAtIso <= nowIso) return "needs_attention";
    return "waiting";
  }
  return "needs_attention";
}
