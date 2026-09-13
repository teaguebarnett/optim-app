// Phase 9B — pure-logic proof for the eligibility gate and deterministic
// candidate-signature functions (lib/patterns/eligibility.ts,
// lib/patterns/candidate-signature.ts). Persistence/confirmation lifecycle
// is proven live — see scripts/e2e-coach-learned-rules.mts — matching this
// repo's established "pure logic here, e2e there" split.
//
// Run with: npm run verify:rule-domain

import assert from "node:assert/strict";
import { analyzeCoachDecisionPatterns } from "./analyze-coach-decision-patterns.ts";
import { isCandidateEligibleForConfirmation, buildRuleBehavior } from "./eligibility.ts";
import { computeCandidateSignature } from "./candidate-signature.ts";
import type { DecisionEvidenceRecord } from "../decisions/types.ts";

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

let seq = 0;
function mkEvidence(overrides: Partial<DecisionEvidenceRecord> = {}): DecisionEvidenceRecord {
  seq += 1;
  const id = overrides.id ?? `ev-${seq}`;
  return {
    id, workspaceId: "workspace-1", coachUserId: "coach-1", clientProfileId: "client-1", decisionDomain: "prescription", decisionType: "item_prescription_edited", outcome: "edited",
    proposedValue: { exerciseName: "Barbell Bench Press", sets: 4 }, chosenValue: { exerciseName: "Barbell Bench Press", sets: 3 },
    reason: null, programAssignmentId: null, escalationId: null, trainingItemInstanceId: null, observationIds: null,
    sourceRef: `program_version_item:version-${id}:1:Monday:0:b1:item-${id}`, decidedAtIso: "2026-01-01T00:00:00.000Z", recordedAtIso: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function setsEdit(id: string, clientProfileId: string, from: number, to: number, decidedAtIso: string): DecisionEvidenceRecord {
  return mkEvidence({ id, clientProfileId, proposedValue: { exerciseName: "Barbell Bench Press", sets: from }, chosenValue: { exerciseName: "Barbell Bench Press", sets: to }, decidedAtIso });
}

console.log("\n1. Eligibility gate\n");

check("an emerging candidate is never eligible for confirmation, even with a real evidence trail", () => {
  const evidence = Array.from({ length: 3 }, (_, i) => setsEdit(`e-${i}`, "client-1", 4, 3, `2026-01-0${i + 1}T00:00:00.000Z`));
  const result = analyzeCoachDecisionPatterns({ coachUserId: "coach-1", evidence, nowIso: "2026-02-01T00:00:00.000Z" });
  const candidate = result.candidates.find((c) => c.scope === "client_specific");
  assert.ok(candidate && candidate.evidenceStrength === "emerging");
  assert.equal(isCandidateEligibleForConfirmation(candidate!), false);
});

check("a strong candidate is eligible for confirmation", () => {
  const evidence: DecisionEvidenceRecord[] = [];
  for (const client of ["client-1", "client-2", "client-3"]) {
    for (let i = 0; i < 3; i++) evidence.push(setsEdit(`${client}-${i}`, client, 4, 3, `2026-01-0${i + 1}T00:00:00.000Z`));
  }
  const result = analyzeCoachDecisionPatterns({ coachUserId: "coach-1", evidence, nowIso: "2026-02-01T00:00:00.000Z" });
  const candidate = result.candidates.find((c) => c.scope === "coach_general");
  assert.ok(candidate && candidate.evidenceStrength === "strong");
  assert.equal(isCandidateEligibleForConfirmation(candidate!), true);
});

check("a strong but possibly-safety-influenced candidate is never eligible, even client-specific", () => {
  const healthReview = mkEvidence({
    id: "hr-1", clientProfileId: "client-1", decisionDomain: "safety", decisionType: "health_review_decision", outcome: "selected", proposedValue: null,
    chosenValue: { status: "proceed_with_limitations", documentedLimitations: "No loaded overhead pressing." }, escalationId: "escalation-1", decidedAtIso: "2025-12-01T00:00:00.000Z", sourceRef: "escalation_decision:escalation-1:2025-12-01T00:00:00.000Z",
  });
  const subs = Array.from({ length: 3 }, (_, i) =>
    mkEvidence({
      id: `sub-${i}`, clientProfileId: "client-1", outcome: "overridden", proposedValue: { exerciseName: "Overhead Press" }, chosenValue: { exerciseName: "Landmine Press" },
      decidedAtIso: `2026-01-0${i + 1}T00:00:00.000Z`, sourceRef: `program_version_item:v-sub-${i}:1:Monday:0:b1:item-ohp`,
    })
  );
  const result = analyzeCoachDecisionPatterns({ coachUserId: "coach-1", evidence: [healthReview, ...subs], nowIso: "2026-02-01T00:00:00.000Z" });
  const candidate = result.candidates.find((c) => c.scope === "client_specific" && c.contextSignature.field === "activityIdentity");
  assert.ok(candidate && candidate.possibleSafetyInfluence === true);
  assert.equal(isCandidateEligibleForConfirmation(candidate!), false);
});

check("buildRuleBehavior preserves the real decisionType and dominant comparison key, nothing else invented", () => {
  const evidence = Array.from({ length: 3 }, (_, i) => setsEdit(`e-${i}`, "client-1", 4, 3, `2026-01-0${i + 1}T00:00:00.000Z`));
  const result = analyzeCoachDecisionPatterns({ coachUserId: "coach-1", evidence, nowIso: "2026-02-01T00:00:00.000Z" });
  const candidate = result.candidates.find((c) => c.scope === "client_specific")!;
  const behavior = buildRuleBehavior(candidate);
  assert.deepEqual(behavior, { decisionType: "item_prescription_edited", comparisonKey: "decrease" });
});

console.log("\n2. Candidate signature — stable identity, never a raw evidence-id list\n");

check("the signature is stable as supporting evidence grows for the same conceptual candidate", () => {
  const evidenceRun1 = Array.from({ length: 3 }, (_, i) => setsEdit(`e-${i}`, "client-1", 4, 3, `2026-01-0${i + 1}T00:00:00.000Z`));
  const evidenceRun2 = [...evidenceRun1, setsEdit("e-extra", "client-1", 4, 3, "2026-01-10T00:00:00.000Z")];
  const run1 = analyzeCoachDecisionPatterns({ coachUserId: "coach-1", evidence: evidenceRun1, nowIso: "2026-02-01T00:00:00.000Z" });
  const run2 = analyzeCoachDecisionPatterns({ coachUserId: "coach-1", evidence: evidenceRun2, nowIso: "2026-02-01T00:00:00.000Z" });
  const c1 = run1.candidates.find((c) => c.scope === "client_specific")!;
  const c2 = run2.candidates.find((c) => c.scope === "client_specific")!;
  assert.equal(computeCandidateSignature(c1), computeCandidateSignature(c2));
  assert.notEqual(c1.supportCount, c2.supportCount, "sanity: the evidence set genuinely did grow between the two runs");
});

check("two genuinely different candidates (different field) never collide on signature", () => {
  const evidence = [
    ...Array.from({ length: 3 }, (_, i) => setsEdit(`s-${i}`, "client-1", 4, 3, `2026-01-0${i + 1}T00:00:00.000Z`)),
    ...Array.from({ length: 3 }, (_, i) => mkEvidence({ id: `r-${i}`, clientProfileId: "client-1", proposedValue: { exerciseName: "Barbell Bench Press", rpe: 9 }, chosenValue: { exerciseName: "Barbell Bench Press", rpe: 8 }, decidedAtIso: `2026-02-0${i + 1}T00:00:00.000Z` })),
  ];
  const result = analyzeCoachDecisionPatterns({ coachUserId: "coach-1", evidence, nowIso: "2026-03-01T00:00:00.000Z" });
  const setsCandidate = result.candidates.find((c) => c.contextSignature.field === "sets")!;
  const rpeCandidate = result.candidates.find((c) => c.contextSignature.field === "rpe")!;
  assert.notEqual(computeCandidateSignature(setsCandidate), computeCandidateSignature(rpeCandidate));
});

check("two different qualitative substitution pairs never collide on signature, even sharing direction 'qualitative_change'", () => {
  const evidence = [
    ...Array.from({ length: 3 }, (_, i) => mkEvidence({ id: `a-${i}`, clientProfileId: "client-1", outcome: "overridden", proposedValue: { exerciseName: "Overhead Press" }, chosenValue: { exerciseName: "Landmine Press" }, decidedAtIso: `2026-01-0${i + 1}T00:00:00.000Z`, sourceRef: `program_version_item:v-a-${i}:1:Monday:0:b1:item-ohp` })),
    ...Array.from({ length: 3 }, (_, i) => mkEvidence({ id: `b-${i}`, clientProfileId: "client-1", outcome: "overridden", proposedValue: { exerciseName: "Barbell Back Squat" }, chosenValue: { exerciseName: "Leg Press" }, decidedAtIso: `2026-02-0${i + 1}T00:00:00.000Z`, sourceRef: `program_version_item:v-b-${i}:1:Wednesday:0:b1:item-squat` })),
  ];
  const result = analyzeCoachDecisionPatterns({ coachUserId: "coach-1", evidence, nowIso: "2026-03-01T00:00:00.000Z" });
  const candidates = result.candidates.filter((c) => c.contextSignature.field === "activityIdentity" && c.scope === "client_specific");
  assert.equal(candidates.length, 2);
  assert.notEqual(computeCandidateSignature(candidates[0]), computeCandidateSignature(candidates[1]));
});

check("client-specific candidates for the SAME context but different clients never collide on signature", () => {
  const evidence = [...Array.from({ length: 3 }, (_, i) => setsEdit(`c1-${i}`, "client-1", 4, 3, `2026-01-0${i + 1}T00:00:00.000Z`)), ...Array.from({ length: 3 }, (_, i) => setsEdit(`c2-${i}`, "client-2", 4, 3, `2026-01-0${i + 1}T00:00:00.000Z`))];
  const result = analyzeCoachDecisionPatterns({ coachUserId: "coach-1", evidence, nowIso: "2026-02-01T00:00:00.000Z" });
  const clientCandidates = result.candidates.filter((c) => c.scope === "client_specific");
  assert.equal(clientCandidates.length, 2);
  assert.notEqual(computeCandidateSignature(clientCandidates[0]), computeCandidateSignature(clientCandidates[1]));
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
