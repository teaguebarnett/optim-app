// Phase 8C — projects one real coach edit to a proposed training item
// (lib/training/program-proposal-editing.ts's groupDeltasByItem output)
// into decision evidence — one record per edited item, carrying only the
// fields that actually changed (never the item's full prescription
// snapshot), so untouched fields never generate fake evidence.

import { buildProgramVersionItemEditRef, type DecisionEvidenceInput } from "./types.ts";
import type { TrainingItemPath } from "../training/program-proposal-editing.ts";

export interface PrescriptionEditForEvidence {
  workspaceId: string;
  coachUserId: string;
  clientProfileId: string;
  /** The version id the edit was applied to produce — combined with the
   * item path, this is what makes each real edit's evidence idempotent
   * (re-saving the identical edit never duplicates it) while a genuinely
   * later, different edit to the same item (a new version id) is new
   * evidence. */
  editedVersionId: string;
  path: TrainingItemPath;
  /** True when this item is a continuous-family item (duration/distance/
   * heart rate) rather than resistance (sets/reps/load/RPE) — determines
   * decisionType/domain, never both at once. */
  isContinuous: boolean;
  /** Only the fields that actually differ — see
   * lib/training/program-proposal-editing.ts's groupDeltasByItem. */
  proposedFields: Record<string, unknown>;
  chosenFields: Record<string, unknown>;
  /** true only when the item's own identity (name) changed — a real
   * substitution, not merely a parameter tweak (spec section 11's
   * approved/edited/rejected/OVERRIDDEN example: Overhead Press ->
   * Landmine Press). */
  isSubstitution: boolean;
  decidedAtIso: string;
}

export function projectPrescriptionEditDecision(input: PrescriptionEditForEvidence): DecisionEvidenceInput {
  return {
    workspaceId: input.workspaceId,
    coachUserId: input.coachUserId,
    clientProfileId: input.clientProfileId,
    decisionDomain: input.isContinuous ? "cardio_conditioning" : "prescription",
    decisionType: input.isContinuous ? "continuous_item_edited" : "item_prescription_edited",
    outcome: input.isSubstitution ? "overridden" : "edited",
    proposedValue: input.proposedFields,
    chosenValue: input.chosenFields,
    trainingItemInstanceId: input.path.itemId,
    sourceRef: buildProgramVersionItemEditRef({ versionId: input.editedVersionId, path: input.path }),
    decidedAtIso: input.decidedAtIso,
  };
}
