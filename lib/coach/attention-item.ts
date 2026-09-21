// Phase 6.0D-A — Unified Production Coach Operations Surface.
//
// The shared, source-agnostic "attention item" shape both coach experiences
// render against, plus the two pure mapping functions that produce it —
// split out of lib/production/coach-operations.ts (which is "server-only"
// and needs a real Next.js request to even import, via its Supabase
// adapter's dependency on lib/supabase/server.ts's next/headers usage) so
// this genuinely framework-independent logic is directly unit-testable and
// importable from anywhere, exactly like Phase 6.0C's own
// lib/communications/campaign-personalization.ts split. Exactly one
// implementation of each mapping — lib/production/coach-operations.ts
// imports and uses these, never redefines them.

import { coachThreadLifecycle, type EscalationReason, type EscalationStatus } from "../communications/types.ts";
import type { AttentionQueueItem, AttentionItemKind, HealthReviewStatus } from "./types.ts";

/** A minimal structural shape covering exactly the EscalationView fields
 * (see lib/production/chat.ts) this mapping needs — kept as a local
 * structural type rather than importing EscalationView's real interface so
 * this file never has even a type-only edge toward lib/production/chat.ts
 * (whose OTHER exports are real Supabase-only functions). Any object
 * shaped like this — including a real EscalationView — satisfies it. */
export interface EscalationLike {
  id: string;
  clientProfileId: string;
  clientDisplayName: string;
  sourceMessageBody: string | null;
  reasonCategory: EscalationReason;
  status: EscalationStatus;
  proposedResponse: string | null;
  createdAtIso: string;
  priority: number;
  /** Phase 7B — this specific escalation's own real health-review
   * decision, present only for a pain_or_safety row (see
   * lib/production/chat.ts's EscalationView doc for why this is per-row,
   * not the client-wide aggregate). */
  healthReviewStatus: HealthReviewStatus | null;
  documentedLimitations: string | null;
}

/** The one cross-mode status vocabulary the shared UI renders against.
 * Escalation statuses (pending/proposed/approved/coach_responded/resolved)
 * and demo review statuses (needs_review/in_progress/resolved/...) both
 * collapse onto this — see the two mapping functions below for exactly how. */
export type AttentionItemStatus = "open" | "awaiting_coach" | "coach_responded" | "resolved";

/** One item in either mode's "Needs your attention" queue. Deliberately
 * flat and source-agnostic — a rendering component never needs to know
 * whether this came from a real Supabase escalation or a demo
 * ReviewRequest. `escalationReason`/`escalationStatus` are the one
 * Supabase-specific escape hatch: the actual escalation action functions
 * (approve/edit/respond/resolve/propose-playbook-example — see
 * lib/production/chat.ts) need the real reason category and status to
 * operate, and inventing a parallel demo-side equivalent for those would be
 * exactly the "force demo data into Supabase" this phase's brief forbids —
 * so they're optional, present only for Supabase-sourced items. */
export interface AttentionItem {
  id: string;
  clientId: string;
  clientDisplayName: string;
  /** Human-readable category, e.g. "Pain / safety" or "RPE anomaly" —
   * never the raw enum/kind value. */
  kindLabel: string;
  summary: string;
  /** The client's own message that triggered this item, when there is
   * one — every CHAT-originated Supabase escalation has one; a
   * pain_or_safety escalation created directly from onboarding or a live
   * workout pain report (Phase 7A — see lib/production/onboarding.ts and
   * app/actions/production-safety.ts) has no originating chat message, so
   * this is null for those. Demo review items don't carry the triggering
   * message text in this shape either (see attentionItemFromDemoQueueItem's
   * own doc). */
  sourceMessageBody: string | null;
  /** What OPTIM (or the review pipeline) proposed doing about it, if
   * anything. */
  proposedResponse: string | null;
  status: AttentionItemStatus;
  /** Lower sorts first — reuses each source's own real, already-tested
   * priority ordering (EscalationView.priority mirrors
   * lib/coach/attention-queue.ts's ATTENTION_PRIORITY, and the demo items
   * carry that same ordering directly), never a second invented scale. */
  priority: number;
  createdAtIso: string;
  /** True only for a Supabase escalation with a currently OPEN temporary
   * coach thread (see lib/communications/types.ts's coachThreadLifecycle).
   * Always false for a demo item — the demo prototype has no equivalent
   * temporary-thread concept. */
  hasOpenCoachThread: boolean;
  escalationReason?: EscalationReason;
  escalationStatus?: EscalationStatus;
  /** Phase 7B — present only for a Supabase pain_or_safety escalation; the
   * real coach decision (or lack of one) on THIS specific report — see
   * EscalationLike's own doc. Always undefined for a demo item, matching
   * escalationReason/escalationStatus's own posture. */
  healthReviewStatus?: HealthReviewStatus | null;
  documentedLimitations?: string | null;
  /** Phase 10C — present ONLY for a real, currently-pending Phase 10B
   * adjustment proposal (never for an escalation-sourced item). The one
   * discriminator app/coach/page.tsx uses to render the lightweight
   * discovery/navigation card instead of the full EscalationCard (spec
   * section 8: an attention item is discovery + navigation + status, not
   * a second editor). `versionId` is the exact draft this item points
   * at — never re-derived from a stale reference. */
  adjustmentProposal?: { clientProfileId: string; versionId: string };
}

export interface CoachAttentionInbox {
  workspaceId: string;
  coachDisplayName: string;
  /** The real account id backing this coach — in Supabase mode the actual
   * auth.users id, in demo mode the seeded coach's own id. Added so
   * app/coach/layout.tsx can pass a real, stable per-account id down to
   * CoachShell's theme persistence (lib/shared/theme-preference.ts scopes
   * a stored appearance choice to exactly this id) — see coach-shell.tsx's
   * own doc on why the Supabase-mode render branch needs it. */
  coachUserId: string;
  open: AttentionItem[];
  resolved: AttentionItem[];
}

/** Phase 10C — the one shared merge/sort behind the "open" queue: reuses
 * each item's own already-established priority number (never a second
 * invented scale), lower first, real creation time as the tiebreaker —
 * the exact same rule lib/production/chat.ts's getWorkspaceEscalations
 * already sorts escalations by. Pure so this ordering (spec section 4:
 * "do not let an ordinary schedule adjustment outrank a pain escalation")
 * is directly unit-testable without a real Supabase-mode request. */
export function mergeAttentionItems(...groups: AttentionItem[][]): AttentionItem[] {
  return groups.flat().sort((a, b) => a.priority - b.priority || b.createdAtIso.localeCompare(a.createdAtIso));
}

export const ESCALATION_REASON_LABELS: Record<EscalationReason, string> = {
  pain_or_safety: "Pain / safety",
  plan_change: "Plan change",
  out_of_authority: "Outside OPTIM's authority",
  unresolved_uncertainty: "Unresolved uncertainty",
  conflicting_information: "Conflicting information",
  adherence_or_sensitive: "Adherence / sensitive",
  explicit_request: "Client asked for you",
};

/** Phase 10C — sorts after every real escalation reason (the highest,
 * i.e. least urgent, real Supabase escalation priority today is
 * unresolved_uncertainty at 2 — see lib/production/chat.ts's own
 * ESCALATION_PRIORITY) so a pending adjustment proposal NEVER outranks a
 * genuine safety/pain/uncertainty review (spec section 4's one hard
 * requirement), while still surfacing as a real, undismissed item in the
 * same queue. Matches the demo prototype's own pre-existing
 * "adaptation-proposal" concept in spirit (lib/coach/attention-queue.ts's
 * ATTENTION_PRIORITY already reserved a slot for exactly this idea) —
 * this is the first phase to actually wire a real Supabase-mode item into
 * that slot. */
export const ADJUSTMENT_PROPOSAL_PRIORITY = 2.5;

/** One real, structural fact about a pending Phase 10B adjustment
 * proposal — deliberately NOT the full ProgramProposalReviewView (this is
 * a discovery/navigation shape, not the review surface itself — spec
 * section 8). */
export interface PendingAdjustmentProposalLike {
  versionId: string;
  clientProfileId: string;
  clientDisplayName: string;
  /** e.g. "Schedule adjustment" — already a plain, human label (see
   * lib/production/adjustment-proposals.ts's adjustmentTypeLabel), never
   * the raw AdjustmentProposalType enum value. */
  adjustmentTypeLabel: string;
  /** The proposal's own already-bounded, product-safe rationale (spec
   * section 5/6) — reused verbatim, never rewritten into a stronger or
   * different claim. */
  rationale: string;
  createdAtIso: string;
}

export function attentionItemFromAdjustmentProposal(proposal: PendingAdjustmentProposalLike): AttentionItem {
  return {
    id: `adjustment:${proposal.versionId}`,
    clientId: proposal.clientProfileId,
    clientDisplayName: proposal.clientDisplayName,
    kindLabel: proposal.adjustmentTypeLabel,
    summary: proposal.rationale,
    sourceMessageBody: null,
    proposedResponse: null,
    status: "open",
    priority: ADJUSTMENT_PROPOSAL_PRIORITY,
    createdAtIso: proposal.createdAtIso,
    hasOpenCoachThread: false,
    adjustmentProposal: { clientProfileId: proposal.clientProfileId, versionId: proposal.versionId },
  };
}

function escalationStatusToAttentionStatus(status: EscalationStatus): AttentionItemStatus {
  if (status === "pending" || status === "proposed") return "open";
  if (status === "approved") return "awaiting_coach";
  if (status === "coach_responded") return "coach_responded";
  return "resolved";
}

export function attentionItemFromEscalation(escalation: EscalationLike): AttentionItem {
  const label = ESCALATION_REASON_LABELS[escalation.reasonCategory] ?? escalation.reasonCategory;
  return {
    id: escalation.id,
    clientId: escalation.clientProfileId,
    clientDisplayName: escalation.clientDisplayName,
    kindLabel: label,
    // Phase 7A — a non-chat-originated escalation (onboarding/live-workout
    // pain report) has no sourceMessageBody at all, but DOES carry a real,
    // specific proposedResponse (what OPTIM actually recorded — see
    // lib/production/onboarding.ts / app/actions/production-safety.ts) —
    // showing that instead of the bare generic reason label is strictly
    // more informative and never fabricated, so it's checked first.
    summary: escalation.sourceMessageBody ?? escalation.proposedResponse ?? label,
    sourceMessageBody: escalation.sourceMessageBody,
    proposedResponse: escalation.proposedResponse,
    status: escalationStatusToAttentionStatus(escalation.status),
    priority: escalation.priority,
    createdAtIso: escalation.createdAtIso,
    hasOpenCoachThread: coachThreadLifecycle(escalation.status) === "open",
    escalationReason: escalation.reasonCategory,
    escalationStatus: escalation.status,
    healthReviewStatus: escalation.healthReviewStatus,
    documentedLimitations: escalation.documentedLimitations,
  };
}

export const DEMO_ATTENTION_KIND_LABELS: Record<AttentionItemKind, string> = {
  health_review: "Health review",
  plan_approval: "Plan approval",
  "pain-report": "Pain report",
  "recovery-deterioration": "Recovery deterioration",
  "ai-authority-boundary": "AI authority boundary",
  "program-change-request": "Program change request",
  "adaptation-proposal": "Adaptation proposal",
  "performance-pattern": "Performance pattern",
  "adherence-pattern": "Adherence pattern",
  "rpe-anomaly": "RPE anomaly",
  "workout-skipped": "Workout skipped",
  "technique-flag": "Technique flag",
  "schedule-change": "Schedule change",
  milestone: "Milestone",
  "client-requested": "Wants to talk",
};

/** Exported so the demo dashboard COULD render through the shared shape in
 * a future phase without redefining this mapping — not currently called by
 * app/coach/page.tsx's demo branch, which keeps its own rich, already-tested
 * presentation (DecisionFocusSurface, PersonalTouchList, ...) untouched. See
 * lib/production/coach-operations.ts's own module doc for why. */
export function attentionItemFromDemoQueueItem(item: AttentionQueueItem): AttentionItem {
  return {
    id: item.reviewRequestId,
    clientId: item.clientId,
    clientDisplayName: item.clientName,
    kindLabel: DEMO_ATTENTION_KIND_LABELS[item.kind] ?? item.kind,
    summary: item.summary,
    // The demo ReviewRequest model doesn't carry a separate "triggering
    // client message" field distinct from its own summary — never invented.
    sourceMessageBody: null,
    proposedResponse: item.preparedClientMessage ?? null,
    status: item.status === "resolved" ? "resolved" : "open",
    priority: item.priority,
    createdAtIso: item.createdAtIso,
    hasOpenCoachThread: false,
  };
}
