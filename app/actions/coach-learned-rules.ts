"use server";

// Phase 9B — Coach-Confirmed Learned Rules: the server-action boundary the
// coach-facing UI calls. Every action here is a thin pass-through to
// lib/production/learned-rules.ts — no business logic lives in this file,
// matching this repo's established app/actions/* convention.

import { getEligibleCandidatesForReview, confirmLearnedRule, recordContextualDisposition, recordRejectedDisposition, getMyLearnedRules, deactivateLearnedRule } from "../../lib/production/learned-rules";
import type { EligibleCandidateSummary, LearnedRuleRecord } from "../../lib/production/learned-rules";
// Note: types are NOT re-exported from this file — a "use server" module's
// exports are all treated as potential server-action references by the
// bundler, and `export type { X } from ...` re-export syntax breaks that
// (confirmed via a real build failure). Components import these types
// directly from lib/production/learned-rules instead.

export async function getEligibleCandidatesForReviewAction(params: { workspaceId: string }): Promise<EligibleCandidateSummary[]> {
  return getEligibleCandidatesForReview(params.workspaceId);
}

export async function confirmLearnedRuleAction(params: { workspaceId: string; candidateSignature: string }): Promise<{ ruleId: string }> {
  return confirmLearnedRule(params);
}

export async function recordContextualDispositionAction(params: { workspaceId: string; candidateSignature: string }): Promise<void> {
  return recordContextualDisposition(params);
}

export async function recordRejectedDispositionAction(params: { workspaceId: string; candidateSignature: string }): Promise<void> {
  return recordRejectedDisposition(params);
}

export async function getMyLearnedRulesAction(params: { workspaceId: string }): Promise<LearnedRuleRecord[]> {
  return getMyLearnedRules(params.workspaceId);
}

export async function deactivateLearnedRuleAction(params: { workspaceId: string; ruleId: string }): Promise<void> {
  return deactivateLearnedRule(params);
}
