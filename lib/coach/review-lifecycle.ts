// Phase 5.2 — the review resolution lifecycle.
//
// A ReviewRequest (lib/types.ts) is never silently dismissed. Opening its
// detail view shows full context but never changes its status; only a
// deliberate action does — "Start review" (needs_review -> in_progress) or
// a final outcome ("Reviewed — no change needed" / "Resolve review", both
// -> resolved). Resolving removes it from the default queue but the record
// itself is never deleted — see reopenReviewRequest, and
// app/coach/reviews/page.tsx's Resolved tab.
//
// Every mutation here writes directly into the target client's own AppState
// (see lib/tenancy/client-state-store.ts) rather than through the per-client
// reducer in lib/state.ts — a coach must be able to resolve any of their
// clients' reviews regardless of which client this browser currently "acts
// as," exactly the same reasoning lib/coach/setup.ts's applyCoachSetup
// already follows for program/nutrition setup.

import { loadClientAppState, saveClientAppState } from "../tenancy/client-state-store.ts";
import type { AppState } from "../state";
import type { ReviewRequest, ReviewResolutionAction } from "../types";
import type { ClientProfileId, CoachProfileId } from "../tenancy/types";

export { requiresResolutionNote, severityForKind, findDuplicateReviewRequest } from "./review-support.ts";

function mutateReviewRequest(clientId: ClientProfileId, reviewId: string, mutate: (review: ReviewRequest) => ReviewRequest): boolean {
  const appState = loadClientAppState(clientId);
  if (!appState) return false;
  let found = false;
  const reviewRequests = appState.reviewRequests.map((r) => {
    if (r.id !== reviewId) return r;
    found = true;
    return mutate(r);
  });
  if (!found) return false;
  const next: AppState = { ...appState, reviewRequests };
  saveClientAppState(clientId, next);
  return true;
}

/** needs_review -> in_progress. A no-op (returns true without changing
 * anything) if the review is already past needs_review, so re-clicking
 * "Start review" — or navigating away and back — can never move a resolved
 * review backward. */
export function startReviewRequest(clientId: ClientProfileId, reviewId: string, nowIso: string): boolean {
  return mutateReviewRequest(clientId, reviewId, (r) =>
    r.status === "needs_review" ? { ...r, status: "in_progress", updatedAtIso: nowIso } : r
  );
}

export interface ResolveReviewRequestInput {
  clientId: ClientProfileId;
  reviewId: string;
  resolutionAction: ReviewResolutionAction;
  resolutionNote?: string;
  resolvedByCoachId: CoachProfileId;
  nowIso: string;
}

/** -> resolved, with the coach's deliberately chosen final outcome. Never
 * sends a client message and never touches anything outside this one
 * review record. */
export function resolveReviewRequest(input: ResolveReviewRequestInput): boolean {
  return mutateReviewRequest(input.clientId, input.reviewId, (r) => ({
    ...r,
    status: "resolved",
    resolved: true,
    resolutionAction: input.resolutionAction,
    resolutionNote: input.resolutionNote,
    resolvedAtIso: input.nowIso,
    resolvedByCoachId: input.resolvedByCoachId,
    updatedAtIso: input.nowIso,
  }));
}

/** resolved -> needs_review. Clears the resolution fields rather than
 * leaving a stale outcome/note attached to a review that's open again. */
export function reopenReviewRequest(clientId: ClientProfileId, reviewId: string, nowIso: string): boolean {
  return mutateReviewRequest(clientId, reviewId, (r) => ({
    ...r,
    status: "needs_review",
    resolved: false,
    resolutionAction: undefined,
    resolutionNote: undefined,
    resolvedAtIso: undefined,
    resolvedByCoachId: undefined,
    updatedAtIso: nowIso,
  }));
}
