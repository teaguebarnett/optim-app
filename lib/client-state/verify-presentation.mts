// Phase 10A — pure-logic proof of the coach-facing presentation filter
// (lib/client-state/presentation.ts). Live browser/Supabase E2E covers the
// actual rendered UI — see scripts/e2e-coach-intelligence-surfaces.mts.
//
// Run with: npm run verify:client-state-presentation

import assert from "node:assert/strict";
import { selectFindingsForCoachUI } from "./presentation.ts";
import type { ClientStateAnalysis, ClientStateFinding, FindingType } from "./types.ts";

let passed = 0;
let failed = 0;
function check(description: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`  ok  - ${description}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL  - ${description}`);
    console.error(`        ${err instanceof Error ? err.message : String(err)}`);
  }
}

function finding(overrides: Partial<ClientStateFinding> & { domain: ClientStateFinding["domain"]; findingType: FindingType; strength: ClientStateFinding["strength"] }): ClientStateFinding {
  return {
    clientProfileId: "client-1",
    analysisWindow: { sinceIso: "2026-01-01", untilIso: "2026-01-14", label: "test window" },
    summary: "test summary",
    supportingEvidenceRefs: [],
    contradictingEvidenceRefs: [],
    reasonClassification: null,
    firstObservedIso: null,
    lastObservedIso: null,
    activeSafetyRestriction: false,
    ...overrides,
  };
}

function analysis(findings: ClientStateFinding[]): ClientStateAnalysis {
  return { clientProfileId: "client-1", analyzedAtIso: "2026-01-14T00:00:00.000Z", findings };
}

console.log("\n1. Quiet by default (A, G)\n");

check("A: an all-insufficient/stable analysis (the real all-domain default) produces an empty, quiet result", () => {
  const result = selectFindingsForCoachUI(
    analysis([
      finding({ domain: "adherence", findingType: "insufficient_evidence", strength: "insufficient" }),
      finding({ domain: "training_performance", findingType: "insufficient_evidence", strength: "insufficient" }),
      finding({ domain: "continuous_performance", findingType: "insufficient_evidence", strength: "insufficient" }),
      finding({ domain: "prescription_completion", findingType: "insufficient_evidence", strength: "insufficient" }),
      finding({ domain: "recovery", findingType: "insufficient_evidence", strength: "insufficient" }),
    ])
  );
  assert.deepEqual(result, []);
});

check("G: stable_adherence never appears in the coach-facing selection, even with strong strength", () => {
  const result = selectFindingsForCoachUI(analysis([finding({ domain: "adherence", findingType: "stable_adherence", strength: "strong" })]));
  assert.deepEqual(result, []);
});

check("performance_stable and consistent_completion are likewise excluded (the common/normal case stays quiet)", () => {
  const result = selectFindingsForCoachUI(analysis([finding({ domain: "training_performance", findingType: "performance_stable", strength: "strong" }), finding({ domain: "prescription_completion", findingType: "consistent_completion", strength: "strong" })]));
  assert.deepEqual(result, []);
});

console.log("\n2. Meaningful findings surface (B, E, F, I, J)\n");

check("B: an illness-related temporary disruption is included", () => {
  const result = selectFindingsForCoachUI(analysis([finding({ domain: "adherence", findingType: "illness_related_disruption", strength: "emerging" })]));
  assert.equal(result.length, 1);
  assert.equal(result[0].finding.findingType, "illness_related_disruption");
});

check("E: a recurring schedule conflict is included", () => {
  const result = selectFindingsForCoachUI(analysis([finding({ domain: "adherence", findingType: "recurring_schedule_conflict", strength: "strong" })]));
  assert.equal(result.length, 1);
});

check("F: repeated unexplained skips surface", () => {
  const result = selectFindingsForCoachUI(analysis([finding({ domain: "adherence", findingType: "recurring_unexplained_skips", strength: "emerging" })]));
  assert.equal(result.length, 1);
});

check("I/J: a real performance finding (resistance or continuous) is included only when the domain actually returned one", () => {
  const result = selectFindingsForCoachUI(analysis([finding({ domain: "training_performance", findingType: "performance_declining", strength: "emerging" }), finding({ domain: "continuous_performance", findingType: "insufficient_evidence", strength: "insufficient" })]));
  assert.equal(result.length, 1);
  assert.equal(result[0].finding.domain, "training_performance");
});

console.log("\n3. Temporary disruption is never styled as urgent (C)\n");

check("C: illness_related_disruption and isolated_disruption are never 'notable' (urgent) prominence, even at strong strength", () => {
  const result = selectFindingsForCoachUI(analysis([finding({ domain: "adherence", findingType: "illness_related_disruption", strength: "strong" }), finding({ domain: "adherence", findingType: "isolated_disruption", strength: "strong" })]));
  assert.ok(result.every((r) => r.prominence === "worth-watching"));
});

check("a strong recurring pattern IS 'notable' — the one case allowed slightly more visual weight", () => {
  const result = selectFindingsForCoachUI(analysis([finding({ domain: "adherence", findingType: "recurring_schedule_conflict", strength: "strong" })]));
  assert.equal(result[0].prominence, "notable");
});

console.log("\n4. Recovery is never surfaced regardless of type/strength (H)\n");

check("H: even a hypothetical non-insufficient recovery finding is never surfaced — the domain is excluded outright, not just its common outcome", () => {
  const result = selectFindingsForCoachUI(analysis([finding({ domain: "recovery", findingType: "insufficient_evidence", strength: "strong" })]));
  assert.deepEqual(result, []);
});

console.log("\n5. Bounded, deterministic ordering (no opaque AI score)\n");

check("results are capped at 3 even when every domain returns a notable finding", () => {
  const result = selectFindingsForCoachUI(
    analysis([
      finding({ domain: "adherence", findingType: "recurring_schedule_conflict", strength: "strong" }),
      finding({ domain: "training_performance", findingType: "performance_declining", strength: "strong" }),
      finding({ domain: "continuous_performance", findingType: "performance_improving", strength: "strong" }),
      finding({ domain: "prescription_completion", findingType: "repeated_under_completion", strength: "strong" }),
    ])
  );
  assert.equal(result.length, 3);
});

check("a recurring/repeated pattern ranks above an isolated one, deterministically, every time", () => {
  const result = selectFindingsForCoachUI(analysis([finding({ domain: "adherence", findingType: "isolated_disruption", strength: "emerging" }), finding({ domain: "adherence", findingType: "recurring_unexplained_skips", strength: "emerging" })]));
  assert.equal(result[0].finding.findingType, "recurring_unexplained_skips");
});

check("the exact same input always produces the exact same output (deterministic, no randomness)", () => {
  const input = analysis([finding({ domain: "adherence", findingType: "recurring_schedule_conflict", strength: "strong" }), finding({ domain: "training_performance", findingType: "performance_declining", strength: "emerging" })]);
  const a = selectFindingsForCoachUI(input);
  const b = selectFindingsForCoachUI(input);
  assert.deepEqual(a, b);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
