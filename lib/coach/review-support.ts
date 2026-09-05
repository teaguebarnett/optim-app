// Pure ReviewRequest helpers with no storage dependency — split out from
// lib/coach/review-lifecycle.ts specifically so lib/state.ts (every
// ReviewRequest creation site) can use them without a circular import:
// review-lifecycle.ts itself imports lib/tenancy/client-state-store.ts,
// which imports lib/state.ts.

import type { ReviewRequest, ReviewRequestKind } from "../types";
import type { ClientProfileId, CoachProfileId, WorkspaceId } from "../tenancy/types";

/** Pain/injury/health/safety reviews are the one kind a coach must never
 * wave through with silence — resolving one always requires a concise note
 * (enforced by the Reviews page UI; this is the single source of truth for
 * which kinds that applies to). */
export function requiresResolutionNote(kind: ReviewRequestKind): boolean {
  return kind === "pain-report";
}

export function severityForKind(kind: ReviewRequestKind): "high" | "normal" {
  return kind === "pain-report" ? "high" : "normal";
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
