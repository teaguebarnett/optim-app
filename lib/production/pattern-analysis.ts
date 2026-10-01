// Phase 9A — Shadow Coach Pattern Analysis: the real Supabase-mode
// read boundary. This is deliberately a thin wrapper — the entire analysis
// engine (lib/patterns/analyze-coach-decision-patterns.ts) is pure and
// framework-independent; this file's only job is to authenticate the
// caller, fetch their OWN real evidence and (optionally) their own real
// approved Playbook, and hand both to the pure engine.
//
// READ-ONLY, no UI wiring (spec section 31 — this is a developer/test
// diagnostic surface, not a coach-facing page), and never imported by any
// generation path — see this phase's completion report section 15 for the
// repo-wide proof.
//
// Security (spec section 36): coach isolation is not reimplemented here —
// getMyDecisionEvidence() is already scoped by
// coach_decision_evidence_select's RLS policy (coach_user_id = auth.uid()),
// so this function structurally cannot return another coach's evidence
// regardless of what workspaceId is passed. requireCoachAuthority below
// only confirms the caller holds a real staff role in the named
// workspace — the same authorization every other production read in this
// codebase already requires — never a broader grant.

import "server-only";
import { getAuthenticatedContext, requireWorkspaceRole, isWorkspaceStaffRole } from "./auth";
import { UnauthorizedError } from "./errors";
import { getMyDecisionEvidence } from "./decision-evidence.ts";
import { getOwnCoachIntelligence } from "./coach-brain.ts";
import { analyzeCoachDecisionPatterns } from "../patterns/analyze-coach-decision-patterns.ts";
import type { PatternAnalysisResult } from "../patterns/types.ts";

async function requireCoachAuthority(workspaceId: string) {
  const ctx = await getAuthenticatedContext();
  const membership = requireWorkspaceRole(ctx, workspaceId, ["workspace_owner", "platform_admin", "coach"]);
  if (!isWorkspaceStaffRole(membership.role)) throw new UnauthorizedError();
  return ctx;
}

/** Runs shadow pattern analysis over the CALLING coach's own real decision
 * evidence. Every candidate produced is traceable back to real,
 * already-persisted coach_decision_evidence rows — nothing here writes,
 * mutates, or persists anything of its own. */
export async function analyzeMyCoachPatterns(workspaceId: string): Promise<PatternAnalysisResult> {
  const ctx = await requireCoachAuthority(workspaceId);
  const evidence = await getMyDecisionEvidence();
  // Gate 3 — conflicts are judged against the coach's OWN confirmed method.
  void workspaceId;
  const intelligence = await getOwnCoachIntelligence();
  return analyzeCoachDecisionPatterns({
    coachUserId: ctx.userId,
    evidence,
    operatingModel: intelligence.method?.operatingModel ?? null,
  });
}
