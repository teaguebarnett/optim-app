// Phase 8B — projects a coach's real, explicit health-review decision
// (Phase 7B's lib/production/pain-safety.ts's recordHealthReviewDecision)
// into decision evidence.
//
// The escalations row remains the sole canonical safety record and
// lifecycle — this never duplicates or replaces it, only references it
// (escalationId) and categorizes the evidence clearly as "safety" (spec
// section 27) so a future methodology-learning layer can exclude it from
// general programming-preference reasoning by default, rather than having
// to guess which rows are safety-related after the fact.
//
// outcome is always "selected": a health-review decision is made under the
// coach's own clinical/safety judgment, not by approving, editing, or
// rejecting an OPTIM-authored proposal — there is no proposedValue,
// honestly, because OPTIM never proposed a health-review outcome (Phase 7A/
// 7B's own explicit "coach decision must be explicit, never inferred"
// discipline carries over here).

import { buildHealthReviewDecisionRef, type DecisionEvidenceInput } from "./types.ts";
import type { HealthReviewStatus } from "../coach/types";

export interface HealthReviewDecisionForEvidence {
  workspaceId: string;
  coachUserId: string;
  clientProfileId: string;
  escalationId: string;
  status: HealthReviewStatus;
  documentedLimitations?: string;
  decidedAtIso: string;
}

export function projectHealthReviewDecision(input: HealthReviewDecisionForEvidence): DecisionEvidenceInput {
  return {
    workspaceId: input.workspaceId,
    coachUserId: input.coachUserId,
    clientProfileId: input.clientProfileId,
    decisionDomain: "safety",
    decisionType: "health_review_decision",
    outcome: "selected",
    proposedValue: null,
    chosenValue: { status: input.status, ...(input.documentedLimitations ? { documentedLimitations: input.documentedLimitations } : {}) },
    escalationId: input.escalationId,
    sourceRef: buildHealthReviewDecisionRef({ escalationId: input.escalationId, decidedAtIso: input.decidedAtIso }),
    decidedAtIso: input.decidedAtIso,
  };
}
