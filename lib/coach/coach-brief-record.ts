// Phase 5.4B completion pass — the real, stored/refreshed "OPTIM Coach
// Brief" (spec §6). Distinct from components/coach/coach-brief.tsx (the
// existing full-intake summary, which stays exactly as it was, just gated
// behind "View full intake" now — see app/coach/clients/[clientId]/page.tsx)
// — this is the short, at-most-three-sentence OPERATING brief: what changed
// since the coach last checked, for an active client, or the real
// Activation Brief for a pre-activation one.
//
// Persisted in PlatformState (see platform-store.ts's `coachBriefs`) rather
// than regenerated on every render: each record carries a `checkpoint` —
// the real, raw signal values the brief's content was actually built from.
// resolveActivationBrief/resolveOperatingBrief are pure: given the stored
// record (or null) and the CURRENT real signal values, they decide whether
// anything meaningful actually changed (`changed: true`) and, only then,
// produce a new record — the caller (see hooks/use-coach-brief.ts) persists
// it via one explicit dispatch in a useEffect, never mid-render. Viewing an
// unchanged page is always a no-op: the stored record already reflects
// every event that happened before it was last generated, so nothing is
// ever silently dropped just because a coach opened (or didn't open) the
// page.

import { buildActivationBriefSentences, type ActivationBriefInput } from "./activation-brief.ts";
import type { ReviewRequestKind } from "../types";
import type { ClientLifecycleStatus } from "./types";
import type { ClientProfileId, CoachProfileId, WorkspaceId } from "../tenancy/types";

export type CoachBriefKind = "activation" | "operating";

/** The real, raw signal values a brief's content was built from — stored
 * alongside the brief so the NEXT generation can diff against exactly what
 * the coach already saw, never against a vague "last opened" timestamp. */
export interface OperatingBriefCheckpoint {
  atIso: string;
  unresolvedReviewCount: number;
  mostUrgentUnresolvedReviewId: string | null;
  latestResolvedReviewId: string | null;
  latestClientChatMessageAtIso: string | null;
  latestWorkoutCompletedAtIso: string | null;
  lifecycle: ClientLifecycleStatus;
}

export interface ActivationCheckpoint {
  atIso: string;
  onboardingCompletedAtIso: string | null;
  unmetRequirementId: string | null;
  hasInjuryFlag: boolean;
}

export interface CoachBriefRecord {
  id: string;
  clientId: ClientProfileId;
  workspaceId: WorkspaceId;
  coachId: CoachProfileId;
  kind: CoachBriefKind;
  /** At most three — see buildActivationBriefSentences/
   * buildOperatingBriefSentences. Sentence order is always [current status,
   * meaningful change, action required (or not)]. */
  sentences: string[];
  actionRequired: boolean;
  /** Set only when actionRequired — the real AttentionQueueItem/review this
   * brief's action sentence refers to, so the UI can link straight to it. */
  linkedReviewRequestId?: string;
  operatingCheckpoint?: OperatingBriefCheckpoint;
  activationCheckpoint?: ActivationCheckpoint;
  generatedAtIso: string;
  updatedAtIso: string;
}

export interface ResolveBriefResult {
  record: CoachBriefRecord;
  /** False when the stored record already reflects the current real
   * state — the caller must NOT dispatch a save in that case, so opening
   * the page repeatedly never touches storage or bumps updatedAtIso. */
  changed: boolean;
}

// ---------------------------------------------------------------------------
// Activation brief (pre-activation clients)
// ---------------------------------------------------------------------------

export interface ResolveActivationBriefInput extends ActivationBriefInput {
  clientId: ClientProfileId;
  workspaceId: WorkspaceId;
  coachId: CoachProfileId;
  nowIso: string;
}

export function resolveActivationBrief(stored: CoachBriefRecord | null, input: ResolveActivationBriefInput): ResolveBriefResult {
  const health = input.onboarding?.answers.health_finish;
  const checkpoint: ActivationCheckpoint = {
    atIso: input.nowIso,
    onboardingCompletedAtIso: input.onboarding?.completedAtIso ?? null,
    unmetRequirementId: input.readiness.requirements.find((r) => !r.met)?.id ?? null,
    hasInjuryFlag: health?.hasInjuryHistory === true,
  };

  const priorCheckpoint = stored?.kind === "activation" ? stored.activationCheckpoint : undefined;
  const unchanged =
    !!priorCheckpoint &&
    priorCheckpoint.onboardingCompletedAtIso === checkpoint.onboardingCompletedAtIso &&
    priorCheckpoint.unmetRequirementId === checkpoint.unmetRequirementId &&
    priorCheckpoint.hasInjuryFlag === checkpoint.hasInjuryFlag;

  if (unchanged && stored) return { record: stored, changed: false };

  const sentences = buildActivationBriefSentences(input).slice(0, 3);
  const record: CoachBriefRecord = {
    id: `brief-${input.clientId}`,
    clientId: input.clientId,
    workspaceId: input.workspaceId,
    coachId: input.coachId,
    kind: "activation",
    sentences,
    actionRequired: checkpoint.unmetRequirementId !== null,
    activationCheckpoint: checkpoint,
    generatedAtIso: input.nowIso,
    updatedAtIso: input.nowIso,
  };
  return { record, changed: true };
}

// ---------------------------------------------------------------------------
// Operating brief (active clients)
// ---------------------------------------------------------------------------

export interface OperatingBriefInput {
  clientId: ClientProfileId;
  workspaceId: WorkspaceId;
  coachId: CoachProfileId;
  clientFirstName: string;
  lifecycle: ClientLifecycleStatus;
  /** e.g. "Week 8 of 12" — reuses whatever the caller already computed via
   * lib/scheduling/program-timing.ts, never a second timing derivation. */
  programWeekLabel: string | null;
  unresolvedReviews: { id: string; kind: ReviewRequestKind; summary: string }[];
  latestResolvedReview: { id: string; kind: ReviewRequestKind; resolvedAtIso: string } | null;
  latestClientChatMessageAtIso: string | null;
  latestWorkoutCompletedAtIso: string | null;
  latestWorkoutNeedsReview: boolean;
  nowIso: string;
}

const REVIEW_KIND_PHRASE: Partial<Record<ReviewRequestKind, string>> = {
  "pain-report": "a pain report",
  "program-change-request": "a program change request",
  "rpe-anomaly": "an RPE flag",
  "workout-skipped": "a skipped workout",
  "technique-flag": "a technique question",
  "schedule-change": "a schedule change",
  "performance-pattern": "a repeated performance pattern",
  "adherence-pattern": "a repeated adherence pattern",
  "recovery-deterioration": "declining recovery/adherence",
  "ai-authority-boundary": "a briefing held for review",
  milestone: "a milestone",
};

function reviewPhrase(kind: ReviewRequestKind): string {
  return REVIEW_KIND_PHRASE[kind] ?? "a flagged item";
}

function capitalize(text: string): string {
  return text.length > 0 ? text[0].toUpperCase() + text.slice(1) : text;
}

export function resolveOperatingBrief(stored: CoachBriefRecord | null, input: OperatingBriefInput): ResolveBriefResult {
  const mostUrgent = input.unresolvedReviews[0] ?? null;
  const checkpoint: OperatingBriefCheckpoint = {
    atIso: input.nowIso,
    unresolvedReviewCount: input.unresolvedReviews.length,
    mostUrgentUnresolvedReviewId: mostUrgent?.id ?? null,
    latestResolvedReviewId: input.latestResolvedReview?.id ?? null,
    latestClientChatMessageAtIso: input.latestClientChatMessageAtIso,
    latestWorkoutCompletedAtIso: input.latestWorkoutCompletedAtIso,
    lifecycle: input.lifecycle,
  };

  const prior = stored?.kind === "operating" ? stored.operatingCheckpoint : undefined;
  const unchanged =
    !!prior &&
    prior.unresolvedReviewCount === checkpoint.unresolvedReviewCount &&
    prior.mostUrgentUnresolvedReviewId === checkpoint.mostUrgentUnresolvedReviewId &&
    prior.latestResolvedReviewId === checkpoint.latestResolvedReviewId &&
    prior.latestClientChatMessageAtIso === checkpoint.latestClientChatMessageAtIso &&
    prior.latestWorkoutCompletedAtIso === checkpoint.latestWorkoutCompletedAtIso &&
    prior.lifecycle === checkpoint.lifecycle;

  if (unchanged && stored) return { record: stored, changed: false };

  // -- Sentence 1: current status --------------------------------------
  const currentStatus =
    checkpoint.unresolvedReviewCount > 0
      ? `${input.clientFirstName} has ${checkpoint.unresolvedReviewCount} open item${checkpoint.unresolvedReviewCount === 1 ? "" : "s"} needing your review.`
      : input.programWeekLabel
        ? `${input.clientFirstName} is on track in ${input.programWeekLabel}.`
        : `${input.clientFirstName} is active with nothing open right now.`;

  // -- Sentence 2: meaningful change since the prior checkpoint ---------
  let meaningfulChange: string;
  if (prior && mostUrgent && mostUrgent.id !== prior.mostUrgentUnresolvedReviewId) {
    meaningfulChange = `OPTIM flagged ${reviewPhrase(mostUrgent.kind)}: ${mostUrgent.summary}`;
  } else if (prior && input.latestResolvedReview && input.latestResolvedReview.id !== prior.latestResolvedReviewId) {
    meaningfulChange = `You resolved ${reviewPhrase(input.latestResolvedReview.kind)} since you last checked.`;
  } else if (
    prior &&
    input.latestWorkoutCompletedAtIso &&
    input.latestWorkoutCompletedAtIso !== prior.latestWorkoutCompletedAtIso
  ) {
    meaningfulChange = input.latestWorkoutNeedsReview
      ? `${input.clientFirstName} completed a workout that needs a second look.`
      : `${input.clientFirstName} completed their scheduled workout.`;
  } else if (
    prior &&
    input.latestClientChatMessageAtIso &&
    input.latestClientChatMessageAtIso !== prior.latestClientChatMessageAtIso
  ) {
    meaningfulChange = `${input.clientFirstName} sent a new message.`;
  } else if (!prior && mostUrgent) {
    meaningfulChange = `${reviewPhrase(mostUrgent.kind)} is open: ${mostUrgent.summary}`;
  } else if (!prior) {
    meaningfulChange = "This is the first brief generated for this client.";
  } else {
    meaningfulChange = "Nothing meaningful has changed since you last checked.";
  }

  // -- Sentence 3: action required, or not ------------------------------
  const actionRequired = checkpoint.unresolvedReviewCount > 0;
  const actionSentence = actionRequired
    ? mostUrgent
      ? `Review ${reviewPhrase(mostUrgent.kind)} to continue.`
      : "Review the open item to continue."
    : "No action required right now.";

  const record: CoachBriefRecord = {
    id: `brief-${input.clientId}`,
    clientId: input.clientId,
    workspaceId: input.workspaceId,
    coachId: input.coachId,
    kind: "operating",
    sentences: [currentStatus, capitalize(meaningfulChange), actionSentence],
    actionRequired,
    linkedReviewRequestId: mostUrgent?.id,
    operatingCheckpoint: checkpoint,
    generatedAtIso: input.nowIso,
    updatedAtIso: input.nowIso,
  };
  return { record, changed: true };
}
