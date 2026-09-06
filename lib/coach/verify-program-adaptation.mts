// Phase 5.5 — adaptive progression after assignment (spec Part 7): real
// execution signals (already-existing ReviewRequests) become
// ProgramAdaptationProposals against a client's real, future program weeks
// only, classified by the existing AI-authority resolver and the coach's
// own configured trainingAdjustmentPolicies, and surfaced through the
// existing attention-queue ReviewRequest pipeline — never a second queue.
//
// persistAdaptationProposalReview goes through lib/storage.ts, a no-op
// outside a real browser — polyfill a minimal in-memory window.localStorage
// (same pattern as verify-review-lifecycle.mts / verify-program-composer-
// lifecycle.mts) so its save/load round-trip is actually exercised.

class FakeWindow extends EventTarget {
  localStorage = (() => {
    const store = new Map<string, string>();
    return {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    };
  })();
}
(globalThis as unknown as { window: unknown }).window = new FakeWindow();

import assert from "node:assert/strict";
import {
  detectAdaptationProposals,
  applyAdaptationProposal,
  buildAdaptationReviewRequest,
  persistAdaptationProposalReview,
  type ProgramAdaptationProposal,
} from "./program-adaptation.ts";
import { createDefaultCoachOperatingModel } from "./operating-model.ts";
import { defaultCoachAiAuthoritySettings, type CoachAiAuthoritySettings } from "./ai-authority.ts";
import { createEmptyClientProgram } from "./training.ts";
import { saveClientProgram } from "./program-assignment.ts";
import { loadClientAppState } from "../tenancy/client-state-store.ts";
import { WORKSPACE_OPTIM_ID, COACH_PROFILE_TEAGUE } from "../tenancy/seed.ts";
import type { AdjustmentPolicy } from "./operating-model.ts";
import type { ClientAssignedProgram, ReviewRequest, ReviewRequestKind } from "../types";
import type { ClientProfileId } from "../tenancy/types";

let passed = 0;
let failed = 0;

function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ok  - ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL  - ${name}`);
    console.log(`        ${(err as Error).message}`);
    failed++;
  }
}

const CLIENT_ID = "client-adaptation-test" as ClientProfileId;
let nextIdCounter = 0;
const nextId = () => `id-${++nextIdCounter}`;

function com() {
  return createDefaultCoachOperatingModel({ coachId: COACH_PROFILE_TEAGUE.id, workspaceId: WORKSPACE_OPTIM_ID, nowIso: "2026-01-01T00:00:00.000Z", businessName: "OPTIM Test Studio" });
}

function comWithPolicy(policy: Partial<AdjustmentPolicy> & { id: string }) {
  const base = com();
  const fullPolicy: AdjustmentPolicy = {
    domain: "training",
    trigger: "test trigger",
    preferredAction: "Reduce next week's volume by 15%.",
    acceptableAlternatives: [],
    alwaysEscalates: false,
    aiMayExecute: true,
    requiresCoachApproval: false,
    source: "coach_selected",
    confidence: 0.9,
    ...policy,
  };
  return { ...base, trainingAdjustmentPolicies: [fullPolicy] };
}

function authorityAtLevel(level: "advisor" | "copilot" | "ai_led" | "review_only"): CoachAiAuthoritySettings {
  const settings = defaultCoachAiAuthoritySettings(COACH_PROFILE_TEAGUE.id, WORKSPACE_OPTIM_ID, "2026-01-01T00:00:00.000Z");
  return { ...settings, global: { ...settings.global, level } };
}

function reviewRequest(kind: ReviewRequestKind, id: string, summary: string): ReviewRequest {
  return {
    id,
    workspaceId: WORKSPACE_OPTIM_ID,
    clientId: CLIENT_ID,
    assignedCoachId: COACH_PROFILE_TEAGUE.id,
    kind,
    severity: "normal",
    createdAtIso: "2026-02-01T00:00:00.000Z",
    updatedAtIso: "2026-02-01T00:00:00.000Z",
    summary,
    status: "needs_review",
    resolved: false,
  };
}

function program(durationWeeks: number): ClientAssignedProgram {
  return createEmptyClientProgram({ clientId: CLIENT_ID, workspaceId: WORKSPACE_OPTIM_ID, coachId: COACH_PROFILE_TEAGUE.id, name: "Adaptation test program", durationWeeks, nowIso: "2026-01-01T00:00:00.000Z" });
}

console.log("\n1. detectAdaptationProposals — real signals, future weeks only, deduplicated\n");

check("No assigned program yields no proposals — never invents a target to change", () => {
  const proposals = detectAdaptationProposals({
    clientId: CLIENT_ID,
    workspaceId: WORKSPACE_OPTIM_ID,
    coachId: COACH_PROFILE_TEAGUE.id,
    reviewRequests: [reviewRequest("rpe-anomaly", "rr-1", "RPE worth a look")],
    existingProposals: [],
    assignedProgram: null,
    currentWeekNumber: 1,
    com: com(),
    authoritySettings: authorityAtLevel("copilot"),
    nowIso: "2026-02-01T00:00:00.000Z",
    nextId,
  });
  assert.equal(proposals.length, 0);
});

check("An eligible signal on an active program produces a proposal targeting only the NEXT week, never the current one", () => {
  const proposals = detectAdaptationProposals({
    clientId: CLIENT_ID,
    workspaceId: WORKSPACE_OPTIM_ID,
    coachId: COACH_PROFILE_TEAGUE.id,
    reviewRequests: [reviewRequest("rpe-anomaly", "rr-2", "RPE worth a look")],
    existingProposals: [],
    assignedProgram: program(12),
    currentWeekNumber: 3,
    com: com(),
    authoritySettings: authorityAtLevel("copilot"),
    nowIso: "2026-02-01T00:00:00.000Z",
    nextId,
  });
  assert.equal(proposals.length, 1);
  assert.deepEqual(proposals[0]!.affectedWeeks, [4]);
  assert.ok(proposals[0]!.affectedWeeks.every((w) => w > 3));
});

check("A resolved review request is never turned into a proposal", () => {
  const resolved = { ...reviewRequest("rpe-anomaly", "rr-3", "RPE worth a look"), status: "resolved" as const, resolved: true };
  const proposals = detectAdaptationProposals({
    clientId: CLIENT_ID,
    workspaceId: WORKSPACE_OPTIM_ID,
    coachId: COACH_PROFILE_TEAGUE.id,
    reviewRequests: [resolved],
    existingProposals: [],
    assignedProgram: program(12),
    currentWeekNumber: 3,
    com: com(),
    authoritySettings: authorityAtLevel("copilot"),
    nowIso: "2026-02-01T00:00:00.000Z",
    nextId,
  });
  assert.equal(proposals.length, 0);
});

check("A signal that already produced a proposal is never proposed a second time (deduplicated by source event)", () => {
  const review = reviewRequest("rpe-anomaly", "rr-4", "RPE worth a look");
  const existing: ProgramAdaptationProposal[] = [
    {
      id: "prop-existing",
      clientId: CLIENT_ID,
      workspaceId: WORKSPACE_OPTIM_ID,
      coachId: COACH_PROFILE_TEAGUE.id,
      signalKind: "rpe-anomaly",
      sourceReviewRequestId: "rr-4",
      signalSummary: "RPE worth a look",
      scenarioPolicyId: "scn_rpe_higher_than_expected",
      affectedWeeks: [4],
      proposedChangeSummary: "already proposed",
      reasoning: "already proposed",
      confidence: 0.5,
      aiMayExecute: false,
      requiresCoachApproval: true,
      status: "awaiting_coach_approval",
      createdAtIso: "2026-01-15T00:00:00.000Z",
    },
  ];
  const proposals = detectAdaptationProposals({
    clientId: CLIENT_ID,
    workspaceId: WORKSPACE_OPTIM_ID,
    coachId: COACH_PROFILE_TEAGUE.id,
    reviewRequests: [review],
    existingProposals: existing,
    assignedProgram: program(12),
    currentWeekNumber: 3,
    com: com(),
    authoritySettings: authorityAtLevel("copilot"),
    nowIso: "2026-02-01T00:00:00.000Z",
    nextId,
  });
  assert.equal(proposals.length, 0);
});

check("No future weeks left in the program (signal on the final week) produces no proposal", () => {
  const proposals = detectAdaptationProposals({
    clientId: CLIENT_ID,
    workspaceId: WORKSPACE_OPTIM_ID,
    coachId: COACH_PROFILE_TEAGUE.id,
    reviewRequests: [reviewRequest("rpe-anomaly", "rr-5", "RPE worth a look")],
    existingProposals: [],
    assignedProgram: program(12),
    currentWeekNumber: 12,
    com: com(),
    authoritySettings: authorityAtLevel("copilot"),
    nowIso: "2026-02-01T00:00:00.000Z",
    nextId,
  });
  assert.equal(proposals.length, 0);
});

console.log("\n2. AI-authority boundaries — reuses the real existing resolver, never a parallel system\n");

check("At Advisor/Copilot level, a routine RPE-anomaly proposal is never auto-applied — it always awaits coach approval", () => {
  const proposals = detectAdaptationProposals({
    clientId: CLIENT_ID,
    workspaceId: WORKSPACE_OPTIM_ID,
    coachId: COACH_PROFILE_TEAGUE.id,
    reviewRequests: [reviewRequest("rpe-anomaly", "rr-6", "RPE worth a look")],
    existingProposals: [],
    assignedProgram: program(12),
    currentWeekNumber: 3,
    com: comWithPolicy({ id: "scn_rpe_higher_than_expected" }),
    authoritySettings: authorityAtLevel("copilot"),
    nowIso: "2026-02-01T00:00:00.000Z",
    nextId,
  });
  assert.equal(proposals[0]!.aiMayExecute, false);
  assert.equal(proposals[0]!.requiresCoachApproval, true);
  assert.equal(proposals[0]!.status, "awaiting_coach_approval");
});

check("At the Autonomous (review_only) level, a routine RPE-anomaly proposal IS eligible for auto-apply", () => {
  const proposals = detectAdaptationProposals({
    clientId: CLIENT_ID,
    workspaceId: WORKSPACE_OPTIM_ID,
    coachId: COACH_PROFILE_TEAGUE.id,
    reviewRequests: [reviewRequest("rpe-anomaly", "rr-7", "RPE worth a look")],
    existingProposals: [],
    assignedProgram: program(12),
    currentWeekNumber: 3,
    com: comWithPolicy({ id: "scn_rpe_higher_than_expected" }),
    authoritySettings: authorityAtLevel("review_only"),
    nowIso: "2026-02-01T00:00:00.000Z",
    nextId,
  });
  assert.equal(proposals[0]!.aiMayExecute, true);
  assert.equal(proposals[0]!.requiresCoachApproval, false);
  assert.equal(proposals[0]!.status, "auto_applied");
});

check("A recovery-deterioration (structural/major) signal ALWAYS requires coach approval, even at the Autonomous level", () => {
  const proposals = detectAdaptationProposals({
    clientId: CLIENT_ID,
    workspaceId: WORKSPACE_OPTIM_ID,
    coachId: COACH_PROFILE_TEAGUE.id,
    reviewRequests: [reviewRequest("recovery-deterioration", "rr-8", "Adherence and RPE both declining")],
    existingProposals: [],
    assignedProgram: program(12),
    currentWeekNumber: 3,
    com: comWithPolicy({ id: "scn_missed_multiple_workouts" }),
    authoritySettings: authorityAtLevel("review_only"),
    nowIso: "2026-02-01T00:00:00.000Z",
    nextId,
  });
  assert.equal(proposals[0]!.aiMayExecute, false);
  assert.equal(proposals[0]!.requiresCoachApproval, true);
});

check("A pain-report ALWAYS requires coach approval and is never auto-applied, regardless of authority level — the absolute safety override", () => {
  const proposals = detectAdaptationProposals({
    clientId: CLIENT_ID,
    workspaceId: WORKSPACE_OPTIM_ID,
    coachId: COACH_PROFILE_TEAGUE.id,
    reviewRequests: [reviewRequest("pain-report", "rr-9", "Client reported knee pain")],
    existingProposals: [],
    assignedProgram: program(12),
    currentWeekNumber: 3,
    com: comWithPolicy({ id: "scn_pain", alwaysEscalates: true }),
    authoritySettings: authorityAtLevel("review_only"),
    nowIso: "2026-02-01T00:00:00.000Z",
    nextId,
  });
  assert.equal(proposals[0]!.aiMayExecute, false);
  assert.equal(proposals[0]!.requiresCoachApproval, true);
  assert.ok(!/diagnos|emergency/i.test(proposals[0]!.proposedChangeSummary), "pain proposal language must stay non-diagnostic, non-emergency");
});

check("A coach's own configured preferredAction for a scenario shapes the proposed change — never a generic template when a real coach preference exists", () => {
  const proposals = detectAdaptationProposals({
    clientId: CLIENT_ID,
    workspaceId: WORKSPACE_OPTIM_ID,
    coachId: COACH_PROFILE_TEAGUE.id,
    reviewRequests: [reviewRequest("rpe-anomaly", "rr-10", "RPE worth a look")],
    existingProposals: [],
    assignedProgram: program(12),
    currentWeekNumber: 3,
    com: comWithPolicy({ id: "scn_rpe_higher_than_expected", preferredAction: "Swap the top set to a back-off set instead of cutting volume." }),
    authoritySettings: authorityAtLevel("copilot"),
    nowIso: "2026-02-01T00:00:00.000Z",
    nextId,
  });
  assert.equal(proposals[0]!.proposedChangeSummary, "Swap the top set to a back-off set instead of cutting volume.");
});

check("No configured policy for a scenario still produces an honest, conservative proposal — never a fabricated coach preference", () => {
  const proposals = detectAdaptationProposals({
    clientId: CLIENT_ID,
    workspaceId: WORKSPACE_OPTIM_ID,
    coachId: COACH_PROFILE_TEAGUE.id,
    reviewRequests: [reviewRequest("rpe-anomaly", "rr-11", "RPE worth a look")],
    existingProposals: [],
    assignedProgram: program(12),
    currentWeekNumber: 3,
    com: com(),
    authoritySettings: authorityAtLevel("copilot"),
    nowIso: "2026-02-01T00:00:00.000Z",
    nextId,
  });
  assert.ok(proposals[0]!.proposedChangeSummary.length > 0);
  assert.equal(proposals[0]!.confidence < 0.7, true);
});

console.log("\n3. applyAdaptationProposal — the narrow auto-apply write path\n");

check("Refuses to auto-apply a proposal that requires coach approval", () => {
  const proposal: ProgramAdaptationProposal = {
    id: "prop-a",
    clientId: CLIENT_ID,
    workspaceId: WORKSPACE_OPTIM_ID,
    coachId: COACH_PROFILE_TEAGUE.id,
    signalKind: "rpe-anomaly",
    sourceReviewRequestId: "rr-12",
    signalSummary: "RPE worth a look",
    scenarioPolicyId: "scn_rpe_higher_than_expected",
    affectedWeeks: [4],
    proposedChangeSummary: "Reduce next week's volume.",
    reasoning: "test",
    confidence: 0.5,
    aiMayExecute: false,
    requiresCoachApproval: true,
    status: "awaiting_coach_approval",
    createdAtIso: "2026-02-01T00:00:00.000Z",
  };
  assert.throws(() => applyAdaptationProposal({ program: program(12), proposal, currentWeekNumber: 3, equipment: ["barbell", "dumbbell", "bodyweight"] }));
});

check("Refuses to auto-apply a change targeting the current or a past week, even if flagged aiMayExecute", () => {
  const proposal: ProgramAdaptationProposal = {
    id: "prop-b",
    clientId: CLIENT_ID,
    workspaceId: WORKSPACE_OPTIM_ID,
    coachId: COACH_PROFILE_TEAGUE.id,
    signalKind: "rpe-anomaly",
    sourceReviewRequestId: "rr-13",
    signalSummary: "RPE worth a look",
    scenarioPolicyId: "scn_rpe_higher_than_expected",
    affectedWeeks: [3],
    proposedChangeSummary: "Reduce this week's volume.",
    reasoning: "test",
    confidence: 0.9,
    aiMayExecute: true,
    requiresCoachApproval: false,
    status: "auto_applied",
    createdAtIso: "2026-02-01T00:00:00.000Z",
  };
  assert.throws(() => applyAdaptationProposal({ program: program(12), proposal, currentWeekNumber: 3, equipment: ["barbell", "dumbbell", "bodyweight"] }));
});

check("A legitimate auto-apply changes only the proposal's affected future week, leaving every earlier week byte-for-byte identical", () => {
  const basedProgram = program(12);
  const proposal: ProgramAdaptationProposal = {
    id: "prop-c",
    clientId: CLIENT_ID,
    workspaceId: WORKSPACE_OPTIM_ID,
    coachId: COACH_PROFILE_TEAGUE.id,
    signalKind: "rpe-anomaly",
    sourceReviewRequestId: "rr-14",
    signalSummary: "RPE worth a look",
    scenarioPolicyId: "scn_rpe_higher_than_expected",
    affectedWeeks: [4],
    proposedChangeSummary: "Reduce next week's volume.",
    reasoning: "test",
    confidence: 0.9,
    aiMayExecute: true,
    requiresCoachApproval: false,
    status: "auto_applied",
    createdAtIso: "2026-02-01T00:00:00.000Z",
  };
  const { revisedProgram } = applyAdaptationProposal({ program: basedProgram, proposal, currentWeekNumber: 3, equipment: ["barbell", "dumbbell", "bodyweight"] });
  assert.deepEqual(revisedProgram.weeks[0], basedProgram.weeks[0]);
  assert.deepEqual(revisedProgram.weeks[2], basedProgram.weeks[2]);
});

console.log("\n4. buildAdaptationReviewRequest — surfaces through the EXISTING attention queue, never a second one\n");

check("Produces a real ReviewRequest of kind 'adaptation-proposal' carrying the proposal's own reasoning and linking back via sourceEventId", () => {
  const proposal: ProgramAdaptationProposal = {
    id: "prop-d",
    clientId: CLIENT_ID,
    workspaceId: WORKSPACE_OPTIM_ID,
    coachId: COACH_PROFILE_TEAGUE.id,
    signalKind: "adherence-pattern",
    sourceReviewRequestId: "rr-15",
    signalSummary: "3 missed sessions in 14 days",
    scenarioPolicyId: "scn_missed_multiple_workouts",
    affectedWeeks: [5],
    proposedChangeSummary: "Reduce next week's session count.",
    reasoning: "Repeated missed sessions suggest the current frequency doesn't fit right now.",
    confidence: 0.6,
    aiMayExecute: false,
    requiresCoachApproval: true,
    status: "awaiting_coach_approval",
    createdAtIso: "2026-02-01T00:00:00.000Z",
  };
  const review = buildAdaptationReviewRequest(proposal, "2026-02-01T00:00:00.000Z", nextId);
  assert.equal(review.kind, "adaptation-proposal");
  assert.equal(review.sourceEventId, "prop-d");
  assert.equal(review.status, "needs_review");
  assert.equal(review.escalationReason, proposal.reasoning);
  assert.equal(review.summary, proposal.proposedChangeSummary);
});

console.log("\n5. persistAdaptationProposalReview — the real write into the client's own attention queue\n");

check("Writes a real ReviewRequest into the client's own AppState, idempotently", () => {
  const clientId = "client-adaptation-persist-test" as ClientProfileId;
  saveClientProgram(clientId, WORKSPACE_OPTIM_ID, COACH_PROFILE_TEAGUE.id, program(12));
  const before = loadClientAppState(clientId)!;
  const proposal: ProgramAdaptationProposal = {
    id: "prop-persist-1",
    clientId,
    workspaceId: WORKSPACE_OPTIM_ID,
    coachId: COACH_PROFILE_TEAGUE.id,
    signalKind: "adherence-pattern",
    sourceReviewRequestId: "rr-persist-1",
    signalSummary: "3 missed sessions",
    scenarioPolicyId: "scn_missed_multiple_workouts",
    affectedWeeks: [5],
    proposedChangeSummary: "Reduce next week's session count.",
    reasoning: "Repeated missed sessions.",
    confidence: 0.6,
    aiMayExecute: false,
    requiresCoachApproval: true,
    status: "awaiting_coach_approval",
    createdAtIso: "2026-02-01T00:00:00.000Z",
  };

  const first = persistAdaptationProposalReview(proposal, "2026-02-01T00:00:00.000Z", nextId);
  assert.ok(first);
  const afterFirst = loadClientAppState(clientId)!;
  assert.equal(afterFirst.reviewRequests.length, before.reviewRequests.length + 1);
  assert.equal(afterFirst.reviewRequests.at(-1)?.kind, "adaptation-proposal");

  const second = persistAdaptationProposalReview(proposal, "2026-02-01T00:01:00.000Z", nextId);
  assert.equal(second, null);
  const afterSecond = loadClientAppState(clientId)!;
  assert.equal(afterSecond.reviewRequests.length, afterFirst.reviewRequests.length);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
