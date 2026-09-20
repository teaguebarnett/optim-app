// Phase 5.0A — the coach's "Needs attention" queue.
//
// Built strictly from real, already-existing ReviewRequest records (see
// lib/types.ts and every place lib/state.ts's reducer creates one: pain
// reports, RPE anomalies, skipped work, technique flags, and Chat's pain/
// program-change escalations) — never a fabricated notification. Sorted by
// a fixed safety-first priority (pain/injury always first, regardless of
// recency) matching the Phase 5.0A brief's decision-boundary ordering, then
// by recency within the same priority.

import { latestGenerationForClient, type ActivationGenerationRecord } from "./activation-lifecycle.ts";
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
  plan_approval: -0.9,
  "pain-report": 0,
  "recovery-deterioration": 0.5,
  "ai-authority-boundary": 0.75,
  // A client's own deliberate request to talk — ranked just ahead of a
  // routine program-change ask, since it's a direct, personal ask rather
  // than a detected pattern.
  "client-requested": 0.9,
  "program-change-request": 1,
  "adaptation-proposal": 1.25,
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
  /** Phase 5.6A.3 — every activation-generation record scoped to this
   * coach's own clients in this workspace, used only to synthesize a
   * "plan_approval" item for whichever client's OWN LATEST record is
   * sitting at "ready_for_review" or "revision_prepared" — a real,
   * generated plan genuinely waiting on the coach's own explicit approval,
   * never a fabricated reminder. A client whose latest record has already
   * moved to "activated" (or hasn't been generated at all yet) never gets
   * one. */
  activationGenerations?: ActivationGenerationRecord[];
  /** This client's own real intended start date (see
   * lib/coach/types.ts's ClientIntendedProgram), when the coach has set
   * one — used only to name the real date in the plan_approval item's
   * summary; the item still appears (with honest, date-free copy) when
   * absent, never a fabricated date. */
  intendedStartDateIsoByClientId?: ReadonlyMap<ClientProfileId, string>;
}

function formatCalendarDateLabel(dateIso: string): string {
  // Constructing from an explicit local midnight (never `new Date(dateIso)`
  // alone) — a bare YYYY-MM-DD string parses as UTC midnight, which can
  // display as the PREVIOUS calendar day in any negative-UTC-offset
  // timezone. See this phase's brief: "Avoid UTC parsing that can shift a
  // YYYY-MM-DD value."
  return new Date(`${dateIso}T00:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
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
      nutritionContext: r.nutritionContext,
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

  // Phase 5.6A.3 — a real, already-generated plan sitting unapproved is a
  // genuine coach decision, exactly like an unresolved health review, and
  // now gets the same first-class treatment instead of having no
  // representation in this queue at all. One item per client, only for
  // that client's OWN LATEST generation (never a stale superseded attempt),
  // and only while it's genuinely awaiting approval.
  const generationsByClient = new Map<ClientProfileId, ActivationGenerationRecord[]>();
  for (const record of input.activationGenerations ?? []) {
    if (record.workspaceId !== input.workspaceId) continue;
    const forClient = generationsByClient.get(record.clientId) ?? [];
    forClient.push(record);
    generationsByClient.set(record.clientId, forClient);
  }
  const planApprovalItems: AttentionQueueItem[] = [];
  for (const [clientId, records] of generationsByClient) {
    const latest = latestGenerationForClient(records, clientId);
    if (!latest || (latest.state !== "ready_for_review" && latest.state !== "revision_prepared")) continue;
    const clientName = clientsById.get(clientId)?.name ?? "Unknown client";
    const firstName = clientName.split(" ")[0];
    const startDateIso = input.intendedStartDateIsoByClientId?.get(clientId);
    const summary = startDateIso
      ? `Review the training, nutrition, and launch details before ${firstName}'s plan begins ${formatCalendarDateLabel(startDateIso)}.`
      : `Review the training, nutrition, and launch details before ${firstName}'s plan begins.`;
    planApprovalItems.push({
      reviewRequestId: `plan-approval-${clientId}`,
      workspaceId: input.workspaceId,
      clientId,
      clientName,
      assignedCoachId: input.coachId,
      kind: "plan_approval",
      summary,
      createdAtIso: latest.updatedAtIso,
      updatedAtIso: latest.updatedAtIso,
      priority: ATTENTION_PRIORITY.plan_approval,
      severity: "high",
      notificationTier: resolveNotificationTier("plan_approval", { workoutInProgress: false }),
      status: "needs_review",
    });
  }

  return [...healthReviewItems, ...planApprovalItems, ...reviewItems].sort(
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

/**
 * Gate 3C originally, generalized in Gate 4C — the exact action a resolved
 * review actually took, derived from its own existing resolution state
 * rather than a separate tracked flag. "Reviewed" comes straight from
 * resolutionAction; "Approved" is only ever true for the one whatChanged
 * string components/coach/nutrition-review-detail-sheet.tsx's own
 * handleApprove writes (nothing else ever produces that exact prefix), and
 * that distinction (Approved vs Corrected) only means anything when a real
 * OPTIM-proposed nutrition swap existed to approve or decline in the first
 * place — see nutritionContext. A generic kind (pain-report, RPE anomaly,
 * workout-skipped, technique-flag, client-requested, etc.) never had such a
 * proposal, so calling it "Corrected" would be its own false implication;
 * "Resolved" is the one honest word for "the coach handled this," with no
 * approval/correction distinction implied. Moved here (out of the
 * nutrition-specific lib/coach/nutrition-authoring.ts) because this is now
 * the generic wording helper both components/coach/review-detail-sheet.tsx
 * and components/coach/nutrition-review-detail-sheet.tsx render from.
 */
export function resolutionOutcomeVerb(
  item: Pick<AttentionQueueItem, "resolutionAction" | "resolutionReceipt" | "nutritionContext">
): "Approved" | "Corrected" | "Resolved" | "Reviewed" {
  if (item.resolutionAction === "reviewed_no_change") return "Reviewed";
  if (!item.nutritionContext) return "Resolved";
  return item.resolutionReceipt?.whatChanged.startsWith("Approved:") ? "Approved" : "Corrected";
}
