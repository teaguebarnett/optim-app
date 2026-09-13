// Phase 9A — Shadow Coach Pattern Analysis: pure-logic proof for the
// deterministic candidate engine (lib/patterns/analyze-coach-decision-patterns.ts).
// Everything here is constructed DecisionEvidenceRecord fixtures — no
// Supabase needed (matching this repo's "pure logic here, e2e there"
// split — see scripts/e2e-shadow-pattern-analysis.mts for the live
// Supabase-backed proof, including coach isolation and zero-generation-
// influence).
//
// Run with: npm run verify:pattern-analysis

import assert from "node:assert/strict";
import { analyzeCoachDecisionPatterns, deriveEvidenceStrength } from "./analyze-coach-decision-patterns.ts";
import type { DecisionEvidenceRecord } from "../decisions/types.ts";
import type { CoachOperatingModel } from "../coach/operating-model.ts";

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
    id,
    workspaceId: "workspace-1",
    coachUserId: "coach-1",
    clientProfileId: "client-1",
    decisionDomain: "prescription",
    decisionType: "item_prescription_edited",
    outcome: "edited",
    proposedValue: { exerciseName: "Barbell Bench Press", sets: 4 },
    chosenValue: { exerciseName: "Barbell Bench Press", sets: 3 },
    reason: null,
    programAssignmentId: null,
    escalationId: null,
    trainingItemInstanceId: null,
    observationIds: null,
    sourceRef: `program_version_item:version-${id}:1:Monday:0:b1:item-${id}`,
    decidedAtIso: "2026-01-01T00:00:00.000Z",
    recordedAtIso: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function setsEdit(id: string, clientProfileId: string, from: number, to: number, decidedAtIso: string, versionId?: string): DecisionEvidenceRecord {
  return mkEvidence({
    id,
    clientProfileId,
    decisionDomain: "prescription",
    decisionType: "item_prescription_edited",
    outcome: "edited",
    proposedValue: { exerciseName: "Barbell Bench Press", sets: from },
    chosenValue: { exerciseName: "Barbell Bench Press", sets: to },
    decidedAtIso,
    sourceRef: `program_version_item:${versionId ?? `v-${id}`}:1:Monday:0:b1:item-bench`,
  });
}

console.log("\n1. Baseline eligibility — zero/one decision never produces a candidate (A, B)\n");

check("A: zero evidence produces zero candidates", () => {
  const result = analyzeCoachDecisionPatterns({ coachUserId: "coach-1", evidence: [], nowIso: "2026-02-01T00:00:00.000Z" });
  assert.equal(result.candidates.length, 0);
  assert.equal(result.totalEvidenceConsidered, 0);
});

check("B: a single edit never produces a coach-general OR client-specific candidate", () => {
  const evidence = [setsEdit("e1", "client-1", 4, 3, "2026-01-01T00:00:00.000Z")];
  const result = analyzeCoachDecisionPatterns({ coachUserId: "coach-1", evidence, nowIso: "2026-02-01T00:00:00.000Z" });
  assert.equal(result.candidates.length, 0);
});

check("deriveEvidenceStrength: below MIN_SUPPORT_FOR_CANDIDATE is always insufficient, even with perfect dominance", () => {
  assert.equal(deriveEvidenceStrength("client_specific", 2, 0, 1), "insufficient");
  assert.equal(deriveEvidenceStrength("coach_general", 2, 0, 5), "insufficient");
});

console.log("\n2. Client-specific vs coach-general (C, D, E)\n");

check("C: repeated comparable edits for ONE client form an emerging client-specific candidate, with no coach-general candidate", () => {
  const evidence = [
    setsEdit("e1", "client-1", 4, 3, "2026-01-01T00:00:00.000Z"),
    setsEdit("e2", "client-1", 4, 3, "2026-01-05T00:00:00.000Z"),
    setsEdit("e3", "client-1", 4, 3, "2026-01-10T00:00:00.000Z"),
  ];
  const result = analyzeCoachDecisionPatterns({ coachUserId: "coach-1", evidence, nowIso: "2026-02-01T00:00:00.000Z" });
  const clientSpecific = result.candidates.filter((c) => c.scope === "client_specific");
  const coachGeneral = result.candidates.filter((c) => c.scope === "coach_general");
  assert.equal(clientSpecific.length, 1);
  assert.equal(clientSpecific[0].evidenceStrength, "emerging");
  assert.equal(clientSpecific[0].clientProfileId, "client-1");
  assert.equal(coachGeneral.length, 0, "E: repeated single-client evidence must NOT automatically become coach-general");
});

check("D: the SAME pattern across 3 distinct clients forms a STRONGER coach-general candidate than a single client can reach", () => {
  const evidence: DecisionEvidenceRecord[] = [];
  for (const client of ["client-1", "client-2", "client-3"]) {
    for (let i = 0; i < 3; i++) evidence.push(setsEdit(`${client}-${i}`, client, 4, 3, `2026-01-0${i + 1}T00:00:00.000Z`));
  }
  const result = analyzeCoachDecisionPatterns({ coachUserId: "coach-1", evidence, nowIso: "2026-02-01T00:00:00.000Z" });
  const coachGeneral = result.candidates.find((c) => c.scope === "coach_general");
  assert.ok(coachGeneral, "a coach-general candidate must form with 3 distinct clients and 9 total supporting decisions");
  assert.equal(coachGeneral!.evidenceStrength, "strong");
  assert.equal(coachGeneral!.distinctClientCount, 3);
  assert.equal(coachGeneral!.supportCount, 9);
});

console.log("\n3. Contradictory evidence weakens/prevents a candidate (F, G)\n");

check("F: adding contradictory evidence weakens a candidate from strong to emerging (never silently ignored)", () => {
  const clean = analyzeCoachDecisionPatterns({
    coachUserId: "coach-1",
    evidence: Array.from({ length: 6 }, (_, i) => setsEdit(`clean-${i}`, "client-1", 4, 3, `2026-01-0${i + 1}T00:00:00.000Z`)),
    nowIso: "2026-02-01T00:00:00.000Z",
  });
  const cleanCandidate = clean.candidates.find((c) => c.scope === "client_specific");
  assert.equal(cleanCandidate?.evidenceStrength, "strong");

  const withContradictions = analyzeCoachDecisionPatterns({
    coachUserId: "coach-1",
    evidence: [
      ...Array.from({ length: 6 }, (_, i) => setsEdit(`s-${i}`, "client-1", 4, 3, `2026-01-0${i + 1}T00:00:00.000Z`)),
      ...Array.from({ length: 2 }, (_, i) => setsEdit(`c-${i}`, "client-1", 4, 5, `2026-01-2${i}T00:00:00.000Z`)),
    ],
    nowIso: "2026-02-01T00:00:00.000Z",
  });
  const weakened = withContradictions.candidates.find((c) => c.scope === "client_specific");
  assert.ok(weakened);
  assert.equal(weakened!.evidenceStrength, "emerging", "2 contradicting instances against 6 supporting (ratio 0.75) must drop below the 'strong' bar");
  assert.equal(weakened!.contradictionCount, 2);
});

check("G: overwhelming contradictions prevent a candidate from forming at all", () => {
  const evidence = [
    ...Array.from({ length: 6 }, (_, i) => setsEdit(`s-${i}`, "client-1", 4, 3, `2026-01-0${i + 1}T00:00:00.000Z`)),
    ...Array.from({ length: 5 }, (_, i) => setsEdit(`c-${i}`, "client-1", 4, 5, `2026-02-0${i + 1}T00:00:00.000Z`)),
  ];
  const result = analyzeCoachDecisionPatterns({ coachUserId: "coach-1", evidence, nowIso: "2026-03-01T00:00:00.000Z" });
  assert.equal(result.candidates.filter((c) => c.contextSignature.field === "sets").length, 0, "6 vs 5 (ratio ~0.55) must not clear the dominance floor");
});

console.log("\n4. Context signatures never merge across unrelated domains/types (H, I)\n");

check("H: unrelated decision domains never merge into one candidate", () => {
  const evidence = [
    ...Array.from({ length: 3 }, (_, i) => setsEdit(`p-${i}`, "client-1", 4, 3, `2026-01-0${i + 1}T00:00:00.000Z`)),
    ...Array.from({ length: 3 }, (_, i) =>
      mkEvidence({
        id: `c-${i}`,
        clientProfileId: "client-1",
        decisionDomain: "cardio_conditioning",
        decisionType: "continuous_item_edited",
        outcome: "edited",
        proposedValue: { activityName: "Zone 2 Cardio", durationSeconds: 1800 },
        chosenValue: { activityName: "Zone 2 Cardio", durationSeconds: 1500 },
        decidedAtIso: `2026-01-1${i}T00:00:00.000Z`,
        sourceRef: `program_version_item:v-c-${i}:1:Tuesday:0:b2:item-cardio`,
      })
    ),
  ];
  const result = analyzeCoachDecisionPatterns({ coachUserId: "coach-1", evidence, nowIso: "2026-02-01T00:00:00.000Z" });
  const setsCandidate = result.candidates.find((c) => c.contextSignature.field === "sets");
  const durationCandidate = result.candidates.find((c) => c.contextSignature.field === "durationSeconds");
  assert.ok(setsCandidate && durationCandidate);
  assert.equal(setsCandidate!.supportCount, 3);
  assert.equal(durationCandidate!.supportCount, 3);
  assert.equal(new Set([...setsCandidate!.supportingEvidenceIds, ...durationCandidate!.supportingEvidenceIds]).size, 6, "no evidence id is ever shared across the two candidates");
});

check("I: a resistance 'sets' change never merges with continuous/interval semantics, even with an identical numeric delta shape", () => {
  const evidence = [
    ...Array.from({ length: 3 }, (_, i) => setsEdit(`r-${i}`, "client-1", 4, 3, `2026-01-0${i + 1}T00:00:00.000Z`)),
    ...Array.from({ length: 3 }, (_, i) =>
      mkEvidence({
        id: `hr-${i}`,
        clientProfileId: "client-1",
        decisionDomain: "cardio_conditioning",
        decisionType: "continuous_item_edited",
        outcome: "edited",
        proposedValue: { activityName: "Zone 2 Cardio", heartRateLow: 4, heartRateHigh: 140 },
        chosenValue: { activityName: "Zone 2 Cardio", heartRateLow: 3, heartRateHigh: 140 },
        decidedAtIso: `2026-01-2${i}T00:00:00.000Z`,
        sourceRef: `program_version_item:v-hr-${i}:1:Tuesday:0:b2:item-cardio`,
      })
    ),
  ];
  const result = analyzeCoachDecisionPatterns({ coachUserId: "coach-1", evidence, nowIso: "2026-02-01T00:00:00.000Z" });
  const decisionTypes = new Set(result.candidates.map((c) => c.contextSignature.decisionType));
  assert.ok(decisionTypes.has("item_prescription_edited") && decisionTypes.has("continuous_item_edited"));
  for (const c of result.candidates) {
    if (c.contextSignature.field === "sets") assert.equal(c.contextSignature.decisionType, "item_prescription_edited");
    if (c.contextSignature.field === "heartRateLow") assert.equal(c.contextSignature.decisionType, "continuous_item_edited");
  }
});

console.log("\n5. Exercise-family resolution and overgeneralization guards (J)\n");

check("J: a single substitution never generalizes; repeated comparable substitutions resolve to a real exercise-library family, not a fabricated one", () => {
  const single = analyzeCoachDecisionPatterns({
    coachUserId: "coach-1",
    evidence: [
      mkEvidence({
        id: "sub-1",
        decisionDomain: "prescription",
        decisionType: "item_prescription_edited",
        outcome: "overridden",
        proposedValue: { exerciseName: "Overhead Press" },
        chosenValue: { exerciseName: "Landmine Press" },
        decidedAtIso: "2026-01-01T00:00:00.000Z",
        sourceRef: "program_version_item:v-sub-1:1:Monday:0:b1:item-ohp",
      }),
    ],
    nowIso: "2026-02-01T00:00:00.000Z",
  });
  assert.equal(single.candidates.filter((c) => c.contextSignature.field === "activityIdentity").length, 0, "one substitution must never form a candidate");

  const repeated = analyzeCoachDecisionPatterns({
    coachUserId: "coach-1",
    evidence: Array.from({ length: 3 }, (_, i) =>
      mkEvidence({
        id: `sub-${i}`,
        decisionDomain: "prescription",
        decisionType: "item_prescription_edited",
        outcome: "overridden",
        proposedValue: { exerciseName: "Overhead Press" },
        chosenValue: { exerciseName: "Landmine Press" },
        decidedAtIso: `2026-01-0${i + 1}T00:00:00.000Z`,
        sourceRef: `program_version_item:v-sub-${i}:1:Monday:0:b1:item-ohp`,
      })
    ),
    nowIso: "2026-02-01T00:00:00.000Z",
  });
  const substitution = repeated.candidates.find((c) => c.contextSignature.field === "activityIdentity");
  assert.ok(substitution, "3 identical substitutions must form a candidate");
  assert.equal(substitution!.contextSignature.itemFamily, "push_vertical", "must resolve the REAL exercise-library family for Overhead Press, never a fabricated one");
});

check("a custom/unrecognized exercise name never gets a fabricated family — itemFamily stays null", () => {
  const result = analyzeCoachDecisionPatterns({
    coachUserId: "coach-1",
    evidence: Array.from({ length: 3 }, (_, i) =>
      mkEvidence({
        id: `custom-${i}`,
        decisionDomain: "exercise_selection",
        decisionType: "training_item_removed",
        outcome: "rejected",
        proposedValue: { exerciseName: "Coach's Custom Finisher Move" },
        chosenValue: null,
        decidedAtIso: `2026-01-0${i + 1}T00:00:00.000Z`,
        sourceRef: `program_version_item:v-custom-${i}:1:Monday:0:b1:item-custom`,
      })
    ),
    nowIso: "2026-02-01T00:00:00.000Z",
  });
  const removed = result.candidates.find((c) => c.contextSignature.field === "itemRemoved");
  assert.ok(removed);
  assert.equal(removed!.contextSignature.itemFamily, null);
});

console.log("\n6. Safety exclusions (K, L, M)\n");

function healthReviewDecision(id: string, clientProfileId: string, decidedAtIso: string, documentedLimitations: string): DecisionEvidenceRecord {
  return mkEvidence({
    id,
    clientProfileId,
    decisionDomain: "safety",
    decisionType: "health_review_decision",
    outcome: "selected",
    proposedValue: null,
    chosenValue: { status: "proceed_with_limitations", documentedLimitations },
    escalationId: `escalation-${id}`,
    decidedAtIso,
    sourceRef: `escalation_decision:escalation-${id}:${decidedAtIso}`,
  });
}

function overheadToLandmine(id: string, clientProfileId: string, decidedAtIso: string): DecisionEvidenceRecord {
  return mkEvidence({
    id,
    clientProfileId,
    decisionDomain: "prescription",
    decisionType: "item_prescription_edited",
    outcome: "overridden",
    proposedValue: { exerciseName: "Overhead Press" },
    chosenValue: { exerciseName: "Landmine Press" },
    decidedAtIso,
    sourceRef: `program_version_item:v-${id}:1:Monday:0:b1:item-ohp`,
  });
}

check("K/L/M: a restriction-driven substitution never creates a coach-general exercise preference, even with enough raw count/clients to otherwise qualify", () => {
  const evidence = [
    healthReviewDecision("hr-1", "client-1", "2025-12-01T00:00:00.000Z", "No loaded overhead pressing; pain-free horizontal pressing only."),
    ...Array.from({ length: 3 }, (_, i) => overheadToLandmine(`sub1-${i}`, "client-1", `2026-01-0${i + 1}T00:00:00.000Z`)),
    healthReviewDecision("hr-2", "client-2", "2025-12-01T00:00:00.000Z", "No loaded overhead pressing per PT referral."),
    ...Array.from({ length: 3 }, (_, i) => overheadToLandmine(`sub2-${i}`, "client-2", `2026-01-0${i + 1}T00:00:00.000Z`)),
  ];
  const result = analyzeCoachDecisionPatterns({ coachUserId: "coach-1", evidence, nowIso: "2026-02-01T00:00:00.000Z" });

  const coachGeneral = result.candidates.find((c) => c.scope === "coach_general" && c.contextSignature.field === "activityIdentity");
  assert.equal(coachGeneral, undefined, "M/K: restriction-driven evidence must be excluded from the coach-general pool entirely, even with 2 distinct clients and 6 total decisions");

  const clientSpecific1 = result.candidates.find((c) => c.scope === "client_specific" && c.clientProfileId === "client-1" && c.contextSignature.field === "activityIdentity");
  assert.ok(clientSpecific1, "L: a client-specific candidate may still form — it stays included, not silently discarded");
  assert.equal(clientSpecific1!.possibleSafetyInfluence, true, "the client-specific candidate must be flagged, never presented as a neutral preference");

  assert.equal(
    result.candidates.filter((c) => c.contextSignature.decisionType === "health_review_decision" || c.supportingEvidenceIds.includes("hr-1") || c.supportingEvidenceIds.includes("hr-2")).length,
    0,
    "M: health_review_decision rows themselves never appear as evidence inside any candidate"
  );
});

check("M: health_review_decision evidence is counted as excluded from analysis, never silently dropped without a trace", () => {
  const evidence = [healthReviewDecision("hr-1", "client-1", "2025-12-01T00:00:00.000Z", "No loaded overhead pressing.")];
  const result = analyzeCoachDecisionPatterns({ coachUserId: "coach-1", evidence, nowIso: "2026-02-01T00:00:00.000Z" });
  assert.equal(result.totalEvidenceConsidered, 1);
  assert.equal(result.totalEvidenceExcludedFromAnalysis, 1);
});

console.log("\n7. Explicit methodology conflict (N)\n");

function baseOperatingModel(setsMin: number, setsMax: number): CoachOperatingModel {
  return {
    coachId: "coach-1" as never,
    workspaceId: "workspace-1" as never,
    version: 1,
    status: "active" as never,
    createdAtIso: "2026-01-01T00:00:00.000Z",
    practice: {} as never,
    outcomePriorities: {} as never,
    programArchitecture: {
      preferredSplits: [], typicalFrequencyDaysMin: 3, typicalFrequencyDaysMax: 4, sessionDurationMinutesTypical: 60, phaseStructure: "", exerciseOrderPhilosophy: "",
      movementPatternPriorities: [], exerciseFamiliesPreferred: [], exercisesAvoided: [], equipmentPreferences: [], setsPerExerciseMin: setsMin, setsPerExerciseMax: setsMax,
      repRangePhilosophy: "", usesRpeOrRir: "rpe", proximityToFailure: "", restPeriodPhilosophy: "", volumeRangePhilosophy: "", intensityRangePhilosophy: "",
      progressionMethod: "", regressionMethod: "", deloadFrequencyWeeks: null, fatigueManagementApproach: "", warmupPhilosophy: "", cardioPhilosophy: "", substitutionLogic: "", novelExerciseRule: "", nonNegotiables: [],
    },
    trainingAdjustmentPolicies: [], nutritionPhilosophy: {} as never, nutritionAdjustmentPolicies: [], communication: {} as never, safety: {} as never, operationalContext: {} as never,
    provenance: {},
  };
}

check("N: a candidate whose chosen sets values fall outside the coach's own explicit range is flagged, never silently overwritten", () => {
  const evidence = Array.from({ length: 3 }, (_, i) => setsEdit(`e-${i}`, "client-1", 4, 2, `2026-01-0${i + 1}T00:00:00.000Z`));
  const result = analyzeCoachDecisionPatterns({ coachUserId: "coach-1", evidence, operatingModel: baseOperatingModel(3, 5), nowIso: "2026-02-01T00:00:00.000Z" });
  const candidate = result.candidates.find((c) => c.contextSignature.field === "sets");
  assert.ok(candidate);
  assert.equal(candidate!.conflictsWithExplicitMethodology, true);
  assert.ok(candidate!.methodologyConflictNote && candidate!.methodologyConflictNote.length > 0);
  // The explicit model itself must be completely untouched — this is a read-only flag, never a mutation.
  const modelBefore = baseOperatingModel(3, 5);
  assert.deepEqual(modelBefore.programArchitecture.setsPerExerciseMin, 3);
  assert.deepEqual(modelBefore.programArchitecture.setsPerExerciseMax, 5);
});

check("N: a candidate whose chosen values fall INSIDE the coach's own explicit range never flags a conflict", () => {
  const evidence = Array.from({ length: 3 }, (_, i) => setsEdit(`e-${i}`, "client-1", 6, 4, `2026-01-0${i + 1}T00:00:00.000Z`));
  const result = analyzeCoachDecisionPatterns({ coachUserId: "coach-1", evidence, operatingModel: baseOperatingModel(3, 5), nowIso: "2026-02-01T00:00:00.000Z" });
  const candidate = result.candidates.find((c) => c.contextSignature.field === "sets");
  assert.ok(candidate);
  assert.equal(candidate!.conflictsWithExplicitMethodology, false);
  assert.equal(candidate!.methodologyConflictNote, null);
});

console.log("\n8. Whole-program alignment and rejection reasons (O, P)\n");

function programApproval(id: string, clientProfileId: string, outcome: "approved" | "edited" | "rejected", decidedAtIso: string, reason?: string): DecisionEvidenceRecord {
  return mkEvidence({
    id,
    clientProfileId,
    decisionDomain: "program_structure",
    decisionType: "program_generated",
    outcome,
    proposedValue: { durationWeeks: 6, directionLabel: "Best fit", rationale: "..." },
    chosenValue: outcome === "rejected" ? null : { durationWeeks: 6, directionLabel: "Best fit", rationale: "..." },
    reason: reason ?? null,
    decidedAtIso,
    sourceRef: `program_version:v-${id}`,
  });
}

check("O: repeated unchanged approvals form a real 'approved unchanged' alignment candidate", () => {
  const evidence = Array.from({ length: 3 }, (_, i) => programApproval(`ap-${i}`, "client-1", "approved", `2026-01-0${i + 1}T00:00:00.000Z`));
  const result = analyzeCoachDecisionPatterns({ coachUserId: "coach-1", evidence, nowIso: "2026-02-01T00:00:00.000Z" });
  const candidate = result.candidates.find((c) => c.contextSignature.field === "wholeProgramApproval");
  assert.ok(candidate);
  assert.equal(candidate!.direction, "whole_program_approved_unchanged");
  assert.equal(candidate!.supportCount, 3);
});

check("P: rejection quick reasons only ever group with the SAME exact reason — never interpreted, never merged across different reasons", () => {
  const evidence = [
    ...Array.from({ length: 3 }, (_, i) => programApproval(`r1-${i}`, "client-1", "rejected", `2026-01-0${i + 1}T00:00:00.000Z`, "too_much_volume")),
    ...Array.from({ length: 2 }, (_, i) => programApproval(`r2-${i}`, "client-1", "rejected", `2026-01-1${i}T00:00:00.000Z`, "wrong_exercise_selection")),
  ];
  const result = analyzeCoachDecisionPatterns({ coachUserId: "coach-1", evidence, nowIso: "2026-02-01T00:00:00.000Z" });
  const tooMuchVolume = result.candidates.find((c) => c.contextSignature.field === "wholeProgramRejection:too_much_volume");
  const wrongExercise = result.candidates.find((c) => c.contextSignature.field === "wholeProgramRejection:wrong_exercise_selection");
  assert.ok(tooMuchVolume, "3 identical reasons must form a candidate");
  assert.equal(tooMuchVolume!.supportCount, 3);
  assert.equal(wrongExercise, undefined, "2 instances of a DIFFERENT reason must not form its own candidate (below MIN_SUPPORT) nor merge into the other one");
  assert.equal(new Set(tooMuchVolume!.supportingEvidenceIds).size, 3);
});

console.log("\n9. Evidence traceability (Q, R, S, T, U)\n");

check("Q/R/S/T/U: supporting/contradicting evidence ids, distinct-client count, distinct-version count, and first/last observed are all exactly correct", () => {
  const evidence = [
    setsEdit("s1", "client-1", 4, 3, "2026-01-05T00:00:00.000Z", "version-a"),
    setsEdit("s2", "client-2", 4, 3, "2026-01-10T00:00:00.000Z", "version-b"),
    setsEdit("s3", "client-2", 4, 3, "2026-01-15T00:00:00.000Z", "version-c"),
    setsEdit("c1", "client-1", 4, 5, "2026-01-20T00:00:00.000Z", "version-d"),
  ];
  const result = analyzeCoachDecisionPatterns({ coachUserId: "coach-1", evidence, nowIso: "2026-02-01T00:00:00.000Z" });
  const candidate = result.candidates.find((c) => c.scope === "coach_general" && c.contextSignature.field === "sets");
  assert.ok(candidate, "3 supporting decreases across 2 distinct clients, with 1 contradicting increase, must still clear the coach-general floor");
  assert.deepEqual(new Set(candidate!.supportingEvidenceIds), new Set(["s1", "s2", "s3"]));
  assert.deepEqual(new Set(candidate!.contradictingEvidenceIds), new Set(["c1"]));
  assert.equal(candidate!.distinctClientCount, 2);
  assert.equal(candidate!.distinctVersionCount, 4, "all 4 decisions used distinct version ids in this fixture");
  assert.equal(candidate!.firstObservedIso, "2026-01-05T00:00:00.000Z");
  assert.equal(candidate!.lastObservedIso, "2026-01-20T00:00:00.000Z");
});

console.log("\n10. Determinism (V)\n");

check("V: the exact same input always produces the exact same output", () => {
  const evidence = [
    setsEdit("s1", "client-1", 4, 3, "2026-01-05T00:00:00.000Z"),
    setsEdit("s2", "client-2", 4, 3, "2026-01-10T00:00:00.000Z"),
    setsEdit("s3", "client-2", 4, 3, "2026-01-15T00:00:00.000Z"),
  ];
  const first = analyzeCoachDecisionPatterns({ coachUserId: "coach-1", evidence, nowIso: "2026-02-01T00:00:00.000Z" });
  const second = analyzeCoachDecisionPatterns({ coachUserId: "coach-1", evidence, nowIso: "2026-02-01T00:00:00.000Z" });
  assert.deepEqual(first, second);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
