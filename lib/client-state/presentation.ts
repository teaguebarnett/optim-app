// Phase 10A — the ONE deterministic filter deciding which Phase 9D
// findings are worth a coach's attention (spec section 11). Not every
// ClientStateFinding deserves UI: insufficient evidence, stable/normal
// states, and the recovery domain (no real production signal source yet —
// spec section 10/37) are all deliberately excluded here, once, so no
// component has to re-derive "is this finding worth showing." This is
// presentation filtering, never a second interpretation engine — it
// never changes a finding's type/strength/summary, only decides whether
// and in what order to show it.

import type { ClientStateAnalysis, ClientStateFinding, FindingType } from "./types.ts";

/** Finding types that represent a genuinely current, non-stable state —
 * the only ones ever worth a coach's attention (spec section 9: "quiet
 * when there is nothing meaningful"). Every domain's own "stable"/
 * "consistent"/"insufficient_evidence" outcome is deliberately absent —
 * those are the common case and must never spam the coach. */
const NOTABLE_FINDING_TYPES: ReadonlySet<FindingType> = new Set<FindingType>([
  "isolated_disruption",
  "illness_related_disruption",
  "recurring_schedule_conflict",
  "recurring_unexplained_skips",
  "performance_improving",
  "performance_declining",
  "performance_inconsistent",
  "repeated_under_completion",
]);

/** Simple, deterministic, documented priority — never an opaque AI score
 * (spec section 25/30). Repeated/recurring patterns outrank isolated
 * ones; a real performance direction outranks nothing running under it;
 * strength is the tiebreaker within the same finding type. */
const TYPE_PRIORITY: Partial<Record<FindingType, number>> = {
  recurring_schedule_conflict: 6,
  recurring_unexplained_skips: 6,
  repeated_under_completion: 5,
  performance_declining: 4,
  performance_improving: 4,
  performance_inconsistent: 3,
  illness_related_disruption: 2,
  isolated_disruption: 1,
};
const STRENGTH_PRIORITY = { strong: 2, emerging: 1, insufficient: 0 } as const;

export interface PresentedFinding {
  finding: ClientStateFinding;
  /** Maps to visual weight only — never a numeric score shown to the
   * coach (spec section 12/30). A temporary/isolated event is
   * deliberately never "notable" — spec section 7/38: it must never read
   * like an emergency. */
  prominence: "notable" | "worth-watching";
}

const MAX_FINDINGS_SHOWN = 3;

/** The one place a coach-facing surface decides what to show. Bounded
 * (spec section 25/26: "do not show an endless feed"), quiet by default
 * (returns [] far more often than not — every stable/insufficient
 * finding, which is the common case, is filtered out here). */
export function selectFindingsForCoachUI(analysis: ClientStateAnalysis): PresentedFinding[] {
  return analysis.findings
    .filter((f) => f.domain !== "recovery")
    .filter((f) => NOTABLE_FINDING_TYPES.has(f.findingType))
    .filter((f) => f.strength !== "insufficient")
    .sort((a, b) => rank(b) - rank(a))
    .slice(0, MAX_FINDINGS_SHOWN)
    .map((finding) => ({
      finding,
      // "notable" only for a repeated/recurring pattern with strong
      // evidence (spec section 8's own developing-trend example) — a
      // single-window temporary disruption is always "worth-watching" at
      // most, never styled as urgent (spec section 7).
      prominence: finding.strength === "strong" && (finding.findingType === "recurring_schedule_conflict" || finding.findingType === "recurring_unexplained_skips" || finding.findingType === "repeated_under_completion") ? "notable" : "worth-watching",
    }));
}

function rank(f: ClientStateFinding): number {
  return (TYPE_PRIORITY[f.findingType] ?? 0) * 10 + STRENGTH_PRIORITY[f.strength];
}
