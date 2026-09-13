// Phase 9A — computes, purely from real coach_decision_evidence rows,
// which time windows a client had an ACTIVE documented safety restriction
// (Phase 7B's "proceed_with_limitations" health-review decision), and
// whether a given OTHER decision's exercise/activity name plausibly falls
// under that restriction — reusing the SAME deterministic term-conflict
// logic (termsMentionedInRestrictionText) this codebase already trusts for
// real-time safety-conflict warnings (lib/coach/program-directions.ts,
// wired into Phase 8D's findRestrictionConflicts). Never a new heuristic,
// never an LLM guess (spec sections 5/16).
//
// Deliberately conservative: only health_review_decision evidence with
// status "proceed_with_limitations" and a real documentedLimitations
// string opens a window; any other status closes it — matching
// lib/production/pain-safety.ts's own "most recent decision wins"
// discipline. A window whose documentedLimitations text doesn't resolve
// to any real conflict term this codebase's own INJURY_AREA_EXERCISE_CONFLICTS
// list recognizes never flags anything — it never falls back to
// "restrict everything for this client."

import { termsMentionedInRestrictionText } from "../coach/program-directions.ts";
import type { DecisionEvidenceRecord } from "../decisions/types.ts";

export interface RestrictionWindow {
  clientProfileId: string;
  startIso: string;
  /** null = still open as of the newest evidence this was computed from. */
  endIso: string | null;
  avoidedTerms: string[];
}

/** Builds every client's real restriction-window history from their own
 * health_review_decision evidence, sorted by decidedAtIso. Each decision
 * with status "proceed_with_limitations" opens (or re-opens, with
 * possibly different terms) a window that the NEXT health_review_decision
 * for that same client closes. */
export function buildRestrictionWindows(evidence: DecisionEvidenceRecord[]): RestrictionWindow[] {
  const byClient = new Map<string, DecisionEvidenceRecord[]>();
  for (const row of evidence) {
    if (row.decisionType !== "health_review_decision") continue;
    const list = byClient.get(row.clientProfileId) ?? [];
    list.push(row);
    byClient.set(row.clientProfileId, list);
  }

  const windows: RestrictionWindow[] = [];
  for (const [clientProfileId, rows] of byClient) {
    const sorted = [...rows].sort((a, b) => a.decidedAtIso.localeCompare(b.decidedAtIso));
    for (let i = 0; i < sorted.length; i++) {
      const row = sorted[i];
      const status = row.chosenValue?.status;
      if (status !== "proceed_with_limitations") continue;
      const limitations = typeof row.chosenValue?.documentedLimitations === "string" ? (row.chosenValue.documentedLimitations as string) : null;
      const avoidedTerms = termsMentionedInRestrictionText(limitations);
      if (avoidedTerms.length === 0) continue;
      const next = sorted[i + 1];
      windows.push({ clientProfileId, startIso: row.decidedAtIso, endIso: next ? next.decidedAtIso : null, avoidedTerms });
    }
  }
  return windows;
}

function isWithinWindow(iso: string, window: RestrictionWindow): boolean {
  if (iso < window.startIso) return false;
  if (window.endIso !== null && iso >= window.endIso) return false;
  return true;
}

/** True when this decision's own exercise/activity name (proposed OR
 * chosen — either side of a substitution can be the restricted one)
 * overlaps a term from a restriction window that was open for this SAME
 * client at the time of this decision. Never checks any other client's
 * restrictions, and never flags a decision this client's own real
 * evidence gives no reason to flag. */
export function isPossiblySafetyInfluenced(decision: DecisionEvidenceRecord, windows: RestrictionWindow[]): boolean {
  const relevant = windows.filter((w) => w.clientProfileId === decision.clientProfileId && isWithinWindow(decision.decidedAtIso, w));
  if (relevant.length === 0) return false;
  const names = [decision.proposedValue?.exerciseName, decision.proposedValue?.activityName, decision.chosenValue?.exerciseName, decision.chosenValue?.activityName]
    .filter((n): n is string => typeof n === "string")
    .map((n) => n.toLowerCase());
  if (names.length === 0) return false;
  return relevant.some((w) => w.avoidedTerms.some((term) => names.some((name) => name.includes(term))));
}
