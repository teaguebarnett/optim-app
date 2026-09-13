// Phase 8D — projects the bounded set of structural proposal edits (item
// removal, item addition, session rename, training-day-to-rest conversion)
// into decision evidence. Each is its own decision type/domain (see
// lib/decisions/types.ts's registry) rather than overloading
// item_prescription_edited — these are genuinely different KINDS of
// decision, not parameter tweaks.

import { buildProgramVersionItemEditRef, buildProgramVersionSessionRef, buildProgramVersionDayRef, type DecisionEvidenceInput } from "./types.ts";
import type { TrainingItemPath, SessionPath } from "../training/program-proposal-editing.ts";

export interface ItemRemovedForEvidence {
  workspaceId: string;
  coachUserId: string;
  clientProfileId: string;
  editedVersionId: string;
  path: TrainingItemPath;
  exerciseName: string;
  decidedAtIso: string;
}

/** A removal is a real rejection of that one proposed item — no
 * replacement was chosen (spec section 26's own "do not fabricate a final
 * choice" carried down to item granularity). */
export function projectItemRemovedDecision(input: ItemRemovedForEvidence): DecisionEvidenceInput {
  return {
    workspaceId: input.workspaceId,
    coachUserId: input.coachUserId,
    clientProfileId: input.clientProfileId,
    decisionDomain: "exercise_selection",
    decisionType: "training_item_removed",
    outcome: "rejected",
    proposedValue: { exerciseName: input.exerciseName },
    chosenValue: null,
    trainingItemInstanceId: input.path.itemId,
    sourceRef: buildProgramVersionItemEditRef({ versionId: input.editedVersionId, path: input.path }),
    decidedAtIso: input.decidedAtIso,
  };
}

export interface ItemAddedForEvidence {
  workspaceId: string;
  coachUserId: string;
  clientProfileId: string;
  editedVersionId: string;
  path: TrainingItemPath;
  exerciseName: string;
  category: string;
  decidedAtIso: string;
}

/** An addition is a decision made entirely under the coach's own
 * authority — OPTIM never proposed this item, so there is no
 * proposedValue (matches the "selected" outcome's own rule — spec section
 * 4's HealthReviewDecision precedent). */
export function projectItemAddedDecision(input: ItemAddedForEvidence): DecisionEvidenceInput {
  return {
    workspaceId: input.workspaceId,
    coachUserId: input.coachUserId,
    clientProfileId: input.clientProfileId,
    decisionDomain: "exercise_selection",
    decisionType: "training_item_added",
    outcome: "selected",
    proposedValue: null,
    chosenValue: { exerciseName: input.exerciseName, category: input.category },
    trainingItemInstanceId: input.path.itemId,
    sourceRef: buildProgramVersionItemEditRef({ versionId: input.editedVersionId, path: input.path }),
    decidedAtIso: input.decidedAtIso,
  };
}

export interface SessionRenamedForEvidence {
  workspaceId: string;
  coachUserId: string;
  clientProfileId: string;
  editedVersionId: string;
  path: SessionPath;
  fromName: string;
  toName: string;
  decidedAtIso: string;
}

export function projectSessionRenamedDecision(input: SessionRenamedForEvidence): DecisionEvidenceInput {
  return {
    workspaceId: input.workspaceId,
    coachUserId: input.coachUserId,
    clientProfileId: input.clientProfileId,
    decisionDomain: "program_structure",
    decisionType: "session_renamed",
    outcome: "edited",
    proposedValue: { name: input.fromName },
    chosenValue: { name: input.toName },
    sourceRef: buildProgramVersionSessionRef({ versionId: input.editedVersionId, weekNumber: input.path.weekNumber, dayOfWeek: input.path.dayOfWeek, sessionIndex: input.path.sessionIndex }),
    decidedAtIso: input.decidedAtIso,
  };
}

export interface DayConvertedToRestForEvidence {
  workspaceId: string;
  coachUserId: string;
  clientProfileId: string;
  editedVersionId: string;
  weekNumber: number;
  dayOfWeek: string;
  decidedAtIso: string;
}

/** A real structural override — the coach declined the scheduled training
 * day OPTIM proposed and replaced it with a genuine rest day (never a
 * hidden/emptied training day — spec section 11). */
export function projectDayConvertedToRestDecision(input: DayConvertedToRestForEvidence): DecisionEvidenceInput {
  return {
    workspaceId: input.workspaceId,
    coachUserId: input.coachUserId,
    clientProfileId: input.clientProfileId,
    decisionDomain: "scheduling",
    decisionType: "training_day_converted_to_rest",
    outcome: "overridden",
    proposedValue: { dayType: "training" },
    chosenValue: { dayType: "rest" },
    sourceRef: buildProgramVersionDayRef({ versionId: input.editedVersionId, weekNumber: input.weekNumber, dayOfWeek: input.dayOfWeek }),
    decidedAtIso: input.decidedAtIso,
  };
}
