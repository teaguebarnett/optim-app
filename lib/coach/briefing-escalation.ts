// Phase 5.4B — the one real trigger for the "ai-authority-boundary" review
// kind (spec §3's "AI low-confidence/authority-boundary event" category):
// a Daily Briefing held for review (see lib/coach/daily-briefing.ts's
// shouldHoldBriefingForReview) is exactly OPTIM reaching a boundary it
// won't cross alone, so it also surfaces in the unified attention queue —
// not just the Command Center's own separate Daily Briefings section —
// giving the coach one place that shows every kind of decision waiting on
// them. Idempotent via the same sourceEventId-keyed dedup every other
// review creation site already uses.

import { loadClientAppState, saveClientAppState } from "../tenancy/client-state-store.ts";
import { findDuplicateReviewRequest, severityForKind } from "./review-support.ts";
import type { DailyBriefingRecord } from "./daily-briefing.ts";
import type { ReviewRequest } from "../types";
import type { ClientProfileId } from "../tenancy/types";

/**
 * Creates a real "ai-authority-boundary" ReviewRequest for a held-for-
 * review briefing, if one doesn't already exist for this exact briefing —
 * a no-op (returns false) once it does, so calling this on every render
 * that shows a held briefing is always safe.
 */
export function ensureBriefingBoundaryReview(clientId: ClientProfileId, briefing: DailyBriefingRecord, nowIso: string): boolean {
  if (briefing.status !== "held_for_review") return false;
  const appState = loadClientAppState(clientId);
  if (!appState) return false;

  const candidate = {
    workspaceId: briefing.workspaceId,
    clientId,
    assignedCoachId: briefing.coachId,
    kind: "ai-authority-boundary" as const,
    sourceEventId: briefing.id,
  };
  if (findDuplicateReviewRequest(appState.reviewRequests, candidate)) return false;

  const review: ReviewRequest = {
    id: `review-briefing-${briefing.id}`,
    ...candidate,
    severity: severityForKind("ai-authority-boundary"),
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
    summary: `Today's briefing is held for review: ${briefing.heldForReviewReason ?? "needs your confirmation"}.`,
    status: "needs_review",
    resolved: false,
    escalationReason: briefing.heldForReviewReason,
    optimActionsTaken: ["Generated a draft briefing but withheld it from the client."],
    recommendedNextAction: "Review and approve today's briefing before it reaches the client.",
    clientNotificationRequired: false,
  };

  saveClientAppState(clientId, { ...appState, reviewRequests: [...appState.reviewRequests, review] });
  return true;
}
