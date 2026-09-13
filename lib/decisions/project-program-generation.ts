// Phase 8B — projects the real, currently-only production program decision
// point (app/actions/production-programs.ts's createPublishAndAssignProgramAction)
// into decision evidence.
//
// Production today has no coach review/edit step between generation and
// going live — generate, publish, and assign all happen atomically in one
// action (see this phase's own decision-point audit). That means every
// real call IS, honestly, an "approved unchanged" decision: the coach
// chose to generate a program with these parameters for this client, and
// the result went live exactly as generated, with nothing to compare it
// against. This file does not pretend otherwise — outcome is always
// "approved," proposedValue and chosenValue are always identical, because
// that is the real, current shape of this decision. A future coach
// review-and-edit UI would let a caller supply a genuinely different
// chosenValue; that caller does not exist yet (documented in this phase's
// completion report as a gap, not fabricated here).

import { buildProgramVersionDecisionRef, type DecisionEvidenceInput } from "./types.ts";

export interface ProgramGenerationDecisionInput {
  workspaceId: string;
  coachUserId: string;
  clientProfileId: string;
  versionId: string;
  programAssignmentId: string;
  durationWeeks: number;
  directionLabel: string;
  rationale: string;
  decidedAtIso: string;
}

export function projectProgramGenerationDecision(input: ProgramGenerationDecisionInput): DecisionEvidenceInput {
  const value = { durationWeeks: input.durationWeeks, directionLabel: input.directionLabel, rationale: input.rationale };
  return {
    workspaceId: input.workspaceId,
    coachUserId: input.coachUserId,
    clientProfileId: input.clientProfileId,
    decisionDomain: "program_structure",
    decisionType: "program_generated",
    outcome: "approved",
    proposedValue: value,
    chosenValue: value,
    programAssignmentId: input.programAssignmentId,
    sourceRef: buildProgramVersionDecisionRef(input.versionId),
    decidedAtIso: input.decidedAtIso,
  };
}
