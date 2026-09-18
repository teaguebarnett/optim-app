// Pure ReviewRequest helpers with no storage dependency — split out from
// lib/coach/review-lifecycle.ts specifically so lib/state.ts (every
// ReviewRequest creation site) can use them without a circular import:
// review-lifecycle.ts itself imports lib/tenancy/client-state-store.ts,
// which imports lib/state.ts.

import type { ReviewRequest, ReviewRequestKind } from "../types";
import type { ClientProfileId, CoachProfileId, WorkspaceId } from "../tenancy/types";

/** Kinds serious enough that a coach must never wave them through with
 * silence — resolving one always requires a concise note (enforced by the
 * Reviews page UI and the Command Center focus surface; this is the single
 * source of truth for which kinds that applies to). Phase 5.4B extends this
 * from pain-report alone to every kind that represents a real pattern or
 * decision, not a routine, self-explanatory event. */
export function requiresResolutionNote(kind: ReviewRequestKind): boolean {
  return (
    kind === "pain-report" ||
    kind === "program-change-request" ||
    kind === "performance-pattern" ||
    kind === "adherence-pattern" ||
    kind === "recovery-deterioration" ||
    kind === "ai-authority-boundary" ||
    kind === "adaptation-proposal" ||
    kind === "client-requested"
  );
}

/** Phase 5.4B — kinds where resolving is a real decision that affects the
 * client, so the item can never move to "resolved" until the client has
 * actually been told something (spec §3's "resolution receipt" gate). A
 * coach can still act and move the item to "waiting" without this — see
 * lib/coach/review-lifecycle.ts's moveReviewToWaiting — but resolving
 * outright requires the notification. Routine/self-contained kinds
 * (technique-flag, schedule-change) and "milestone" (its own prepared-
 * message flow, not a risk decision) are deliberately excluded.
 * "ai-authority-boundary" is also excluded: its one real source today (a
 * Daily Briefing held for review — see lib/coach/briefing-escalation.ts)
 * already has its own real client-facing notification path — publishing
 * the briefing itself — so requiring a SECOND, separate chat message here
 * would just be busywork, not a genuine safety gate. */
export function requiresClientNotificationBeforeResolution(kind: ReviewRequestKind): boolean {
  return (
    kind === "pain-report" ||
    kind === "program-change-request" ||
    kind === "performance-pattern" ||
    kind === "adherence-pattern" ||
    kind === "recovery-deterioration" ||
    // Gate 2C — the client is waiting to hear back; resolving without a
    // real reply relayed to them would silently drop the request they
    // explicitly asked for.
    kind === "client-requested"
  );
}

export function severityForKind(kind: ReviewRequestKind): "high" | "normal" {
  return kind === "pain-report" ||
    kind === "program-change-request" ||
    kind === "performance-pattern" ||
    kind === "adherence-pattern" ||
    kind === "recovery-deterioration" ||
    kind === "ai-authority-boundary"
    ? "high"
    : "normal";
}

/**
 * Idempotent-creation guard: returns the existing review for this exact
 * coach/client/kind/source event, if one already exists, so a caller can
 * skip creating a duplicate. Only ever matches when the candidate carries a
 * real sourceEventId — reviews with no natural underlying event (never
 * re-derived from the same source) are never deduplicated, since there's
 * nothing to dedupe against.
 */
export function findDuplicateReviewRequest(
  existing: ReviewRequest[],
  candidate: {
    workspaceId: WorkspaceId;
    assignedCoachId: CoachProfileId;
    clientId: ClientProfileId;
    kind: ReviewRequestKind;
    sourceEventId?: string;
  }
): ReviewRequest | undefined {
  if (!candidate.sourceEventId) return undefined;
  return existing.find(
    (r) =>
      r.workspaceId === candidate.workspaceId &&
      r.assignedCoachId === candidate.assignedCoachId &&
      r.clientId === candidate.clientId &&
      r.kind === candidate.kind &&
      r.sourceEventId === candidate.sourceEventId
  );
}
