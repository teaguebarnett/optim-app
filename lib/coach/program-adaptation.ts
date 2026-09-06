// Phase 5.5 — adaptive progression after assignment (spec Part 7).
//
// Turns REAL execution signals already captured as ReviewRequests
// (rpe-anomaly, performance-pattern, adherence-pattern,
// recovery-deterioration, pain-report — created by lib/state.ts and
// lib/coach/attention-escalation.ts, both left untouched here) into
// ProgramAdaptationProposals against a client's real, assigned
// ClientAssignedProgram.
//
// Two orthogonal, both-reused decisions:
//   - "May OPTIM apply this alone?" — lib/coach/ai-authority.ts's existing
//     resolveAiAction, never a parallel authority system. Pain/injury and
//     any "major" (structural) change always escalate regardless of level,
//     exactly like every other AI action category.
//   - "What should the change be, and why?" — the coach's OWN configured
//     lib/coach/operating-model.ts trainingAdjustmentPolicies, looked up by
//     the real onboarding scenario id (e.g. scn_rpe_higher_than_expected).
//     A coach who never configured a given scenario still gets an honest,
//     conservative proposal rather than a fabricated "coach preference."
//
// Never a second notification queue — every proposal surfaces as a real
// ReviewRequest of kind "adaptation-proposal" through the existing
// Command Center / attention-queue pipeline (buildAdaptationReviewRequest).
// Never touches a completed or historical week — every proposal, and every
// auto-applied change, is validated to affect only weeks strictly after the
// client's current program week (see detectAdaptationProposals /
// applyAdaptationProposal's own guards).

import { resolveAiAction, type AiActionCategory, type AiActionScope, type CoachAiAuthoritySettings } from "./ai-authority.ts";
import { applyProgramRevision, type RevisionChange, type RevisionPlan } from "./program-revision.ts";
import { findDuplicateReviewRequest, severityForKind } from "./review-support.ts";
import { loadClientAppState, saveClientAppState } from "../tenancy/client-state-store.ts";
import type { AdjustmentPolicy, CoachOperatingModel } from "./operating-model.ts";
import type { EquipmentTag } from "./exercise-library.ts";
import type { ClientAssignedProgram, ReviewRequest, ReviewRequestKind, ReviewSeverity } from "../types";
import type { ClientProfileId, CoachProfileId, WorkspaceId } from "../tenancy/types";

const ADAPTATION_SIGNAL_KINDS = ["rpe-anomaly", "performance-pattern", "adherence-pattern", "recovery-deterioration", "pain-report"] as const;
export type AdaptationSignalKind = (typeof ADAPTATION_SIGNAL_KINDS)[number];

/** The real onboarding scenario id (coach-onboarding-questions.ts) each
 * signal is evaluated against. rpe-anomaly/performance-pattern default to
 * the "higher than expected" scenario: individual ReviewRequests created
 * today (lib/state.ts) don't yet carry a structured over/under-performance
 * direction, only a free-text summary — an honest, disclosed scope
 * decision (see this phase's final report) rather than a fabricated one. */
const SCENARIO_ID_FOR_SIGNAL: Record<AdaptationSignalKind, string> = {
  "rpe-anomaly": "scn_rpe_higher_than_expected",
  "performance-pattern": "scn_rpe_higher_than_expected",
  "adherence-pattern": "scn_missed_multiple_workouts",
  "recovery-deterioration": "scn_missed_multiple_workouts",
  "pain-report": "scn_pain",
};

export type ProgramAdaptationStatus = "awaiting_coach_approval" | "auto_applied" | "approved" | "dismissed";

export interface ProgramAdaptationProposal {
  id: string;
  clientId: ClientProfileId;
  workspaceId: WorkspaceId;
  coachId: CoachProfileId;
  signalKind: AdaptationSignalKind;
  /** The real ReviewRequest this proposal was derived from — also this
   * proposal's dedup key (see detectAdaptationProposals): one proposal per
   * source event, ever. */
  sourceReviewRequestId: string;
  signalSummary: string;
  scenarioPolicyId: string;
  /** Always strictly greater than the current week at generation time —
   * never a past or in-progress week (spec: "against future, uncompleted
   * sessions only"). */
  affectedWeeks: number[];
  proposedChangeSummary: string;
  reasoning: string;
  confidence: number;
  aiMayExecute: boolean;
  requiresCoachApproval: boolean;
  status: ProgramAdaptationStatus;
  createdAtIso: string;
  resolvedAtIso?: string;
  appliedChanges?: RevisionChange[];
}

function resolveScenarioPolicy(com: CoachOperatingModel, scenarioId: string): AdjustmentPolicy | null {
  return com.trainingAdjustmentPolicies.find((p) => p.id === scenarioId) ?? null;
}

function describeProposedChange(signalKind: AdaptationSignalKind, policy: AdjustmentPolicy | null): string {
  if (policy?.preferredAction?.trim()) return policy.preferredAction.trim();
  switch (signalKind) {
    case "rpe-anomaly":
    case "performance-pattern":
      return "Reduce next week's working sets by roughly 15% and RPE targets by 1, matching the effort actually demonstrated.";
    case "adherence-pattern":
      return "Reduce next week's session count or per-session volume to better match recent real attendance.";
    case "recovery-deterioration":
      return "Pause planned progression and hold or reduce next week's volume until recovery signals improve.";
    case "pain-report":
      return "Avoid loading the reported area next week and substitute a pain-free alternative pending your review.";
  }
}

export interface DetectAdaptationProposalsInput {
  clientId: ClientProfileId;
  workspaceId: WorkspaceId;
  coachId: CoachProfileId;
  /** This client's full, real review-request history. */
  reviewRequests: ReviewRequest[];
  /** Every adaptation proposal ever generated for this client — used only
   * for deduplication (never re-proposing the same source event). */
  existingProposals: ProgramAdaptationProposal[];
  assignedProgram: ClientAssignedProgram | null;
  currentWeekNumber: number;
  com: CoachOperatingModel;
  authoritySettings: CoachAiAuthoritySettings;
  nowIso: string;
  nextId: () => string;
}

/**
 * Pure: scans this client's real, already-created ReviewRequest signals for
 * ones that (a) match a real adaptation-eligible kind, (b) are still
 * unresolved, (c) haven't already produced a proposal, and (d) can target a
 * genuinely future, uncompleted program week. Returns zero or more new
 * proposals — never mutates the program itself, and never proposes a
 * change once the program has no future weeks left to change.
 */
export function detectAdaptationProposals(input: DetectAdaptationProposalsInput): ProgramAdaptationProposal[] {
  if (!input.assignedProgram) return [];
  const nextWeek = input.currentWeekNumber + 1;
  if (nextWeek > input.assignedProgram.durationWeeks) return [];

  const alreadyProposed = new Set(input.existingProposals.map((p) => p.sourceReviewRequestId));
  const candidates = input.reviewRequests.filter(
    (r) =>
      r.workspaceId === input.workspaceId &&
      r.clientId === input.clientId &&
      r.status === "needs_review" &&
      (ADAPTATION_SIGNAL_KINDS as readonly string[]).includes(r.kind) &&
      !alreadyProposed.has(r.id)
  );

  return candidates.map((review) => buildProposalForSignal(review, input, nextWeek));
}

function buildProposalForSignal(review: ReviewRequest, input: DetectAdaptationProposalsInput, nextWeek: number): ProgramAdaptationProposal {
  const signalKind = review.kind as AdaptationSignalKind;
  const scenarioId = SCENARIO_ID_FOR_SIGNAL[signalKind];
  const policy = resolveScenarioPolicy(input.com, scenarioId);

  // Safety rules first, exactly like every other AI-authority consumer:
  // pain/injury always escalates; a "major" (structural, multi-signal)
  // change always escalates regardless of configured level.
  const isPain = signalKind === "pain-report";
  const isMajor = signalKind === "recovery-deterioration";
  const category: AiActionCategory = isPain ? "pain_or_injury" : "training_change";
  const scope: AiActionScope = isMajor ? "major" : "routine";
  const disposition = resolveAiAction(input.authoritySettings, input.clientId, category, scope, "training_adjustment");

  const dispositionAllowsAutoExecute = disposition === "auto_execute";
  const alwaysEscalates = policy?.alwaysEscalates ?? false;
  const requiresCoachApproval = isPain || isMajor || alwaysEscalates || !dispositionAllowsAutoExecute;
  const aiMayExecute = !requiresCoachApproval;

  const reasoning = policy?.rationale?.trim()
    ? policy.rationale.trim()
    : policy
      ? `Following your own configured approach for this scenario: ${policy.preferredAction}`
      : "No configured coaching preference for this exact scenario — proposing a conservative, reversible adjustment pending your review.";

  return {
    id: input.nextId(),
    clientId: input.clientId,
    workspaceId: input.workspaceId,
    coachId: input.coachId,
    signalKind,
    sourceReviewRequestId: review.id,
    signalSummary: review.summary,
    scenarioPolicyId: scenarioId,
    affectedWeeks: [nextWeek],
    proposedChangeSummary: describeProposedChange(signalKind, policy),
    reasoning,
    confidence: policy ? 0.7 : 0.4,
    aiMayExecute,
    requiresCoachApproval,
    status: aiMayExecute ? "auto_applied" : "awaiting_coach_approval",
    createdAtIso: input.nowIso,
  };
}

// ---------------------------------------------------------------------------
// Auto-apply path (small numeric adjustments only, gated by AI authority)
// ---------------------------------------------------------------------------

export interface ApplyAdaptationProposalInput {
  program: ClientAssignedProgram;
  proposal: ProgramAdaptationProposal;
  currentWeekNumber: number;
  equipment: EquipmentTag[];
}

export interface ApplyAdaptationProposalResult {
  revisedProgram: ClientAssignedProgram;
  changes: RevisionChange[];
}

/**
 * The one real write path for a proposal OPTIM is permitted to apply on its
 * own. Refuses outright if the proposal itself isn't flagged
 * aiMayExecute, or if it targets anything at or before the client's
 * current week — never trusts the caller alone. Reuses
 * program-revision.ts's own current-and-future-only "reduce_week_fatigue"
 * application rather than a parallel mutation path.
 */
export function applyAdaptationProposal(input: ApplyAdaptationProposalInput): ApplyAdaptationProposalResult {
  if (!input.proposal.aiMayExecute) throw new Error("This proposal requires coach approval — it cannot be auto-applied.");
  if (input.proposal.affectedWeeks.some((w) => w <= input.currentWeekNumber)) {
    throw new Error("Refusing to auto-apply a change to a completed or current week.");
  }
  const plan: RevisionPlan = {
    kind: "reduce_week_fatigue",
    targetWeeks: input.proposal.affectedWeeks,
    summary: input.proposal.proposedChangeSummary,
  };
  return applyProgramRevision(input.program, plan, input.currentWeekNumber, input.equipment);
}

// ---------------------------------------------------------------------------
// Surfacing through the EXISTING attention queue (never a second queue)
// ---------------------------------------------------------------------------

function severityForProposal(proposal: ProgramAdaptationProposal): ReviewSeverity {
  return proposal.signalKind === "pain-report" || proposal.signalKind === "recovery-deterioration" ? "high" : severityForKind("adaptation-proposal");
}

/** Wraps a proposal as a real ReviewRequest of kind "adaptation-proposal" —
 * the SAME queue every other coach attention item flows through (Command
 * Center / attention-queue.ts), never a second surface. */
export function buildAdaptationReviewRequest(proposal: ProgramAdaptationProposal, nowIso: string, nextId: () => string): ReviewRequest {
  const kind: ReviewRequestKind = "adaptation-proposal";
  return {
    id: nextId(),
    workspaceId: proposal.workspaceId,
    clientId: proposal.clientId,
    assignedCoachId: proposal.coachId,
    kind,
    severity: severityForProposal(proposal),
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
    summary: proposal.proposedChangeSummary,
    status: "needs_review",
    resolved: false,
    sourceEventId: proposal.id,
    escalationReason: proposal.reasoning,
    optimActionsTaken:
      proposal.status === "auto_applied"
        ? [`Applied automatically: ${proposal.proposedChangeSummary}`]
        : ["Prepared this change for your review — nothing has been applied to the program yet."],
    recommendedNextAction: proposal.status === "auto_applied" ? "Review the applied change — you can revise or undo it." : "Approve, adjust, or dismiss this proposed change.",
    clientNotificationRequired: false,
    responseRequiredFromClient: false,
  };
}

/**
 * The one real write path that makes a proposal actually visible in the
 * coach's existing attention queue: appends a real ReviewRequest directly
 * into this client's own AppState (same direct-write convention as
 * briefing-escalation.ts's ensureBriefingBoundaryReview — coach and client
 * data live in separate stores, so this can't go through a client-side
 * reducer dispatch). Idempotent via the same sourceEventId dedup every
 * other review-creation site uses; safe to call for a proposal that was
 * already surfaced. Returns the review it created, or null if nothing was
 * written (no client AppState yet, or already surfaced).
 */
export function persistAdaptationProposalReview(proposal: ProgramAdaptationProposal, nowIso: string, nextId: () => string): ReviewRequest | null {
  const appState = loadClientAppState(proposal.clientId);
  if (!appState) return null;

  const candidate = { workspaceId: proposal.workspaceId, clientId: proposal.clientId, assignedCoachId: proposal.coachId, kind: "adaptation-proposal" as const, sourceEventId: proposal.id };
  if (findDuplicateReviewRequest(appState.reviewRequests, candidate)) return null;

  const review = buildAdaptationReviewRequest(proposal, nowIso, nextId);
  saveClientAppState(proposal.clientId, { ...appState, reviewRequests: [...appState.reviewRequests, review] });
  return review;
}
