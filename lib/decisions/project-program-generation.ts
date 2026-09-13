// Phase 8C — projects the real program PROPOSAL lifecycle
// (app/actions/production-programs.ts's createProgramProposalAction /
// approveProgramProposalAction / rejectProgramProposalAction) into
// whole-program-level decision evidence.
//
// Exactly one of these two functions ever fires per real proposal, and
// each is keyed (via sourceRef) to the ORIGINAL proposal's own version id
// — never the possibly-edited final version's id — so a proposal that gets
// edited several times before a decision still produces exactly one
// program-level evidence row, matching the real coach_decision_evidence
// unique constraint (coach_user_id, source_ref, decision_type) and this
// phase's own "retry never duplicates" requirement.
//
// Item-level edit evidence (what specifically the coach changed) is a
// SEPARATE, finer-grained record — see project-prescription-edit.ts — this
// file only ever records the proposal's own overall fate: approved
// (unchanged), edited (approved, but at least one item was changed along
// the way), or rejected.

import { buildProgramVersionDecisionRef, type DecisionEvidenceInput } from "./types.ts";

export interface ProgramProposalSummary {
  durationWeeks: number;
  directionLabel: string;
  rationale: string;
}

export interface ProgramApprovalDecisionInput {
  workspaceId: string;
  coachUserId: string;
  clientProfileId: string;
  /** Always the ORIGINAL proposal's version id (version_number === 1 in
   * its program family) — never the id of whatever version was actually
   * approved after edits. This is what makes the idempotency key stable
   * across an editing session. */
  originalVersionId: string;
  programAssignmentId: string;
  proposedSummary: ProgramProposalSummary;
  chosenSummary: ProgramProposalSummary;
  /** True whenever at least one item-level edit happened before this
   * approval — never re-derived from proposedSummary/chosenSummary
   * equality, since top-level fields (durationWeeks/directionLabel/
   * rationale) never change from an item edit and would otherwise make an
   * edited approval look identical to an unchanged one. */
  wasEdited: boolean;
  decidedAtIso: string;
}

export function projectProgramApprovalDecision(input: ProgramApprovalDecisionInput): DecisionEvidenceInput {
  return {
    workspaceId: input.workspaceId,
    coachUserId: input.coachUserId,
    clientProfileId: input.clientProfileId,
    decisionDomain: "program_structure",
    decisionType: "program_generated",
    outcome: input.wasEdited ? "edited" : "approved",
    proposedValue: { ...input.proposedSummary },
    chosenValue: { ...input.chosenSummary },
    programAssignmentId: input.programAssignmentId,
    sourceRef: buildProgramVersionDecisionRef(input.originalVersionId),
    decidedAtIso: input.decidedAtIso,
  };
}

export interface ProgramRejectionDecisionInput {
  workspaceId: string;
  coachUserId: string;
  clientProfileId: string;
  originalVersionId: string;
  proposedSummary: ProgramProposalSummary;
  /** Optional, structured-or-free-text quick reason — never required
   * (spec section 15: "do not force friction"). */
  reason?: string;
  decidedAtIso: string;
}

/** A rejection never fabricates a chosenValue (spec section 13/26) — this
 * proposal simply never became active. It does not mean the coach rejects
 * this methodology generally; it means this specific proposal, in this
 * specific context, wasn't right. */
export function projectProgramRejectionDecision(input: ProgramRejectionDecisionInput): DecisionEvidenceInput {
  return {
    workspaceId: input.workspaceId,
    coachUserId: input.coachUserId,
    clientProfileId: input.clientProfileId,
    decisionDomain: "program_structure",
    decisionType: "program_generated",
    outcome: "rejected",
    proposedValue: { ...input.proposedSummary },
    chosenValue: null,
    reason: input.reason,
    sourceRef: buildProgramVersionDecisionRef(input.originalVersionId),
    decidedAtIso: input.decidedAtIso,
  };
}
