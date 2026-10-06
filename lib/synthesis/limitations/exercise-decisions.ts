// Gate 4.0C-5 — the coach's per-exercise fit decisions as AUTHORITATIVE
// planning state (not draft edits).
//
// A decision is about ONE exercise for ONE client, never a broader medical
// rule:
//   excluded — "don't program this exercise for this client"; Fitness
//              Reasoner runs exclude it (avoid_exercise), and a revision
//              can never choose it again.
//   cleared  — "it fits the client's confirmed restrictions under exactly
//              these conditions". Valid only while the exercise's
//              eligibility basis (what made it uncertain) is unchanged: a
//              stricter restriction makes the clearance inert, and the
//              exercise is uncertain again (exercise-eligibility.ts).
//
// Stored inside the confirmed structured-limitations record
// (escalations.structured_limitations.exerciseDecisions), append-only: a
// later decision for the same exercise replaces the earlier one's effect,
// a revocation drops it — every entry stays for provenance.

export type ExerciseFitVerdict = "excluded" | "cleared";

export interface ExerciseFitDecisionRecord {
  exerciseId: string;
  exerciseName: string;
  verdict: ExerciseFitVerdict;
  /** cleared: the conditions the coach accepted (shown back, enforced as submaximal minimums). */
  conditions: string[];
  /** cleared: eligibilityBasis() of the exercise under the restrictions the coach evaluated it against. */
  basis?: string;
  source: {
    kind: "proposal_review" | "preflight" | "legacy_draft_decision" | "limitations_card";
    jobId?: string;
    versionId?: string;
    decisionKey?: string;
  };
  decidedBy: string;
  decidedAtIso: string;
  /** Set on a later revocation entry (verdict of the decision being revoked). */
  revoked?: boolean;
}

/** Latest entry per exercise; revocations remove the exercise's decision. Order-independent (by timestamp). */
export function effectiveExerciseDecisions(decisions: ExerciseFitDecisionRecord[] | undefined | null): ExerciseFitDecisionRecord[] {
  const latest = new Map<string, ExerciseFitDecisionRecord>();
  for (const d of [...(decisions ?? [])].sort((a, b) => a.decidedAtIso.localeCompare(b.decidedAtIso))) latest.set(d.exerciseId, d);
  return [...latest.values()].filter((d) => !d.revoked).sort((a, b) => a.exerciseId.localeCompare(b.exerciseId));
}

const SOURCE_KINDS = new Set(["proposal_review", "preflight", "legacy_draft_decision", "limitations_card"]);

/** Strict shape check for one stored entry (exercise existence is checked by the caller against knowledge). */
export function isExerciseFitDecisionRecord(x: unknown): x is ExerciseFitDecisionRecord {
  if (!x || typeof x !== "object") return false;
  const d = x as Partial<ExerciseFitDecisionRecord>;
  return (
    typeof d.exerciseId === "string" &&
    typeof d.exerciseName === "string" &&
    (d.verdict === "excluded" || d.verdict === "cleared") &&
    Array.isArray(d.conditions) &&
    d.conditions.every((c) => typeof c === "string") &&
    (d.verdict !== "cleared" || (typeof d.basis === "string" && d.basis.length > 0 && d.conditions.length > 0)) &&
    !!d.source &&
    SOURCE_KINDS.has(d.source.kind as string) &&
    typeof d.decidedBy === "string" &&
    typeof d.decidedAtIso === "string" &&
    (d.revoked === undefined || typeof d.revoked === "boolean")
  );
}
