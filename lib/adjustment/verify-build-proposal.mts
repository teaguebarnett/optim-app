// Phase 10B — pure-logic proof of the deterministic adjustment engine.
// Live Supabase/browser E2E covers the actual persisted-draft/review-UI
// path — see scripts/e2e-adjustment-proposals.mts.
//
// Run with: npm run verify:adjustment-proposals

import assert from "node:assert/strict";
import { createDefaultCoachOperatingModel } from "../coach/operating-model.ts";
import { generateProgramDirectionSummaries } from "../coach/program-directions.ts";
import { buildUniversalProgramForDirection, buildPlaceholderProgrammingProfile } from "../coach/universal-program-generation.ts";
import { DAYS_OF_WEEK_ORDER } from "../coach/training.ts";
import { evaluateAdjustmentForFinding, type AdjustmentEngineParams } from "./build-proposal.ts";
import { buildProposalSignature } from "./signature.ts";
import type { ClientStateFinding, FindingType } from "../client-state/types.ts";
import type { RawObservation } from "../client-state/evidence.ts";
import type { ApplicableRule } from "../coach/rule-application.ts";

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

const NOW_ISO = "2026-06-01T00:00:00.000Z";
const CLIENT_ID = "client-1";

const com = createDefaultCoachOperatingModel({ coachId: "coach-1", workspaceId: "workspace-1", nowIso: NOW_ISO, businessName: "Test" });
const profile = buildPlaceholderProgrammingProfile(DAYS_OF_WEEK_ORDER.slice(0, 3)); // Mon/Wed/Fri
const directions = generateProgramDirectionSummaries({ profile, com, durationWeeks: 12 });
const direction = directions.find((d) => d.kind === "best_fit") ?? directions[0];
const generated = buildUniversalProgramForDirection(direction, { clientId: CLIENT_ID, workspaceId: "workspace-1", coachId: "coach-1", profile, com, durationWeeks: 12, nowIso: NOW_ISO });
const activeContent = generated.content;
const ACTIVE_VERSION_ID = "version-1";

function baseFinding(overrides: Partial<ClientStateFinding> & Pick<ClientStateFinding, "domain" | "findingType" | "strength">): ClientStateFinding {
  return {
    clientProfileId: CLIENT_ID,
    analysisWindow: { sinceIso: "2026-05-01", untilIso: "2026-06-01", label: "test" },
    summary: "test summary.",
    supportingEvidenceRefs: [],
    contradictingEvidenceRefs: [],
    reasonClassification: null,
    firstObservedIso: null,
    lastObservedIso: null,
    activeSafetyRestriction: false,
    ...overrides,
  };
}

function baseCtx(overrides: Partial<AdjustmentEngineParams>): AdjustmentEngineParams {
  return {
    finding: baseFinding({ domain: "adherence", findingType: "stable_adherence", strength: "strong" }),
    observations: [],
    activeContent,
    activeProgramVersionId: ACTIVE_VERSION_ID,
    com,
    applicableRules: [],
    avoidedTerms: [],
    currentProgramWeek: 2,
    clientProfileId: CLIENT_ID,
    ...overrides,
  };
}

function obs(overrides: Partial<RawObservation> & Pick<RawObservation, "id" | "metricKey" | "observedAtIso">): RawObservation {
  return { category: "adherence", sourceType: "workout_execution", value: { valueType: "categorical", valueText: "skipped" }, unit: null, sourceRef: null, trainingItemInstanceId: null, ...overrides };
}

console.log("\n1. Insufficient/stable/temporary evidence never proposes anything (A, B, C)\n");

check("A: insufficient strength never proposes anything, regardless of finding type", () => {
  const result = evaluateAdjustmentForFinding(baseCtx({ finding: baseFinding({ domain: "adherence", findingType: "recurring_schedule_conflict", strength: "insufficient" }) }));
  assert.equal(result.outcome, "no_proposal");
  if (result.outcome === "no_proposal") assert.equal(result.noProposal.reason, "insufficient_evidence");
});

check("B: a stable/normal finding never proposes anything", () => {
  const result = evaluateAdjustmentForFinding(baseCtx({ finding: baseFinding({ domain: "adherence", findingType: "stable_adherence", strength: "strong" }) }));
  assert.equal(result.outcome, "no_proposal");
  if (result.outcome === "no_proposal") assert.equal(result.noProposal.reason, "stable_or_normal");
});

check("C: an isolated/illness-related temporary disruption NEVER produces a proposal, at any strength — the central sick-week principle", () => {
  for (const findingType of ["isolated_disruption", "illness_related_disruption"] as FindingType[]) {
    for (const strength of ["emerging", "strong"] as const) {
      const result = evaluateAdjustmentForFinding(baseCtx({ finding: baseFinding({ domain: "adherence", findingType, strength }) }));
      assert.equal(result.outcome, "no_proposal", `${findingType}/${strength} must never propose`);
      if (result.outcome === "no_proposal") assert.equal(result.noProposal.reason, "temporary_disruption");
    }
  }
});

check("recurring_unexplained_skips never proposes a specific structural change — the cause is ambiguous", () => {
  const result = evaluateAdjustmentForFinding(baseCtx({ finding: baseFinding({ domain: "adherence", findingType: "recurring_unexplained_skips", strength: "strong" }) }));
  assert.equal(result.outcome, "no_proposal");
  if (result.outcome === "no_proposal") assert.equal(result.noProposal.reason, "ambiguous_evidence");
});

console.log("\n2. Recurring schedule conflict → eligible, bounded, current-block-only proposal (E, F)\n");

function scheduleConflictObservations(dayOfWeek: "Wednesday", weeks: string[]): RawObservation[] {
  return weeks.map((dateIso, i) => obs({ id: `obs-${i}`, metricKey: "session_status", observedAtIso: `${dateIso}T18:00:00.000Z` }));
}

check("E: a clear, single-day recurring schedule conflict produces an eligible schedule_redistribution proposal", () => {
  // 2026-05-06, 05-13, 05-20 are all real Wednesdays.
  const observations = scheduleConflictObservations("Wednesday", ["2026-05-06", "2026-05-13", "2026-05-20"]);
  const finding = baseFinding({ domain: "adherence", findingType: "recurring_schedule_conflict", strength: "strong", supportingEvidenceRefs: observations.map((o) => o.id) });
  const result = evaluateAdjustmentForFinding(baseCtx({ finding, observations }));
  assert.equal(result.outcome, "proposal");
  if (result.outcome === "proposal") {
    assert.equal(result.proposal.adjustmentType, "schedule_redistribution");
    assert.equal(result.proposal.scope, "current_block");
    assert.ok(result.proposal.changeDescriptions.length > 0);
    assert.ok(result.proposal.changeDescriptions.every((c) => c.dayOfWeek === "Wednesday"));
  }
});

check("scattered days (no dominant day-of-week) never produce a schedule proposal — evidence must be specific enough", () => {
  const observations = [obs({ id: "o1", metricKey: "session_status", observedAtIso: "2026-05-04T18:00:00.000Z" }), obs({ id: "o2", metricKey: "session_status", observedAtIso: "2026-05-13T18:00:00.000Z" }), obs({ id: "o3", metricKey: "session_status", observedAtIso: "2026-05-22T18:00:00.000Z" })];
  const finding = baseFinding({ domain: "adherence", findingType: "recurring_schedule_conflict", strength: "strong", supportingEvidenceRefs: observations.map((o) => o.id) });
  const result = evaluateAdjustmentForFinding(baseCtx({ finding, observations }));
  assert.equal(result.outcome, "no_proposal");
  if (result.outcome === "no_proposal") assert.equal(result.noProposal.reason, "ambiguous_evidence");
});

check("F: the schedule proposal only touches weeks in the current block — untouched weeks (before/after the block) remain byte-identical to the active content", () => {
  const observations = scheduleConflictObservations("Wednesday", ["2026-05-06", "2026-05-13", "2026-05-20"]);
  const finding = baseFinding({ domain: "adherence", findingType: "recurring_schedule_conflict", strength: "strong", supportingEvidenceRefs: observations.map((o) => o.id) });
  const result = evaluateAdjustmentForFinding(baseCtx({ finding, observations, currentProgramWeek: 2 }));
  assert.equal(result.outcome, "proposal");
  if (result.outcome === "proposal") {
    const touchedWeeks = new Set(result.proposal.changeDescriptions.map((c) => c.weekNumber));
    const lastTouchedWeek = Math.max(...touchedWeeks);
    // Every week AFTER the touched block must remain byte-identical to the original active content.
    for (const week of result.proposal.content.weeks) {
      if (week.weekNumber > lastTouchedWeek) {
        const originalWeek = activeContent.weeks.find((w) => w.weekNumber === week.weekNumber);
        assert.deepEqual(week, originalWeek, `week ${week.weekNumber} (outside the current block) must be untouched`);
      }
    }
    assert.ok(!touchedWeeks.has(1), "week 1 (before the current program week) must never be touched — long-term/past weeks are preserved");
  }
});

console.log("\n3. Repeated under-completion → bounded volume/continuous-duration reduction (G, K)\n");

check("G: repeated resistance under-completion (repeated skips) produces a bounded volume_reduction proposal", () => {
  const itemId = "item-Monday-1-barbell-bench-press";
  const observations = ["2026-05-04", "2026-05-11", "2026-05-18"].map((d, i) => obs({ id: `o${i}`, metricKey: "exercise_status", observedAtIso: `${d}T18:00:00.000Z`, trainingItemInstanceId: itemId, value: { valueType: "categorical", valueText: "skipped" } }));
  const finding = baseFinding({ domain: "prescription_completion", findingType: "repeated_under_completion", strength: "strong", supportingEvidenceRefs: observations.map((o) => o.id) });
  const result = evaluateAdjustmentForFinding(baseCtx({ finding, observations }));
  assert.equal(result.outcome, "proposal");
  if (result.outcome === "proposal") {
    assert.equal(result.proposal.adjustmentType, "volume_reduction");
    assert.ok(result.proposal.changeDescriptions.every((c) => /sets →/.test(c.description)));
  }
});

check("K: repeated continuous under-completion produces a bounded continuous_duration_reduction proposal", () => {
  const observations = ["2026-05-05", "2026-05-12", "2026-05-19"].map((d, i) => obs({ id: `o${i}`, metricKey: "performed_as_prescribed", observedAtIso: `${d}T18:00:00.000Z`, value: { valueType: "boolean", valueBoolean: false } }));
  const finding = baseFinding({ domain: "prescription_completion", findingType: "repeated_under_completion", strength: "strong", supportingEvidenceRefs: observations.map((o) => o.id) });
  const result = evaluateAdjustmentForFinding(baseCtx({ finding, observations, currentProgramWeek: 2 }));
  // This client's schedule (Mon/Wed/Fri, no continuous day unless surplus exists) may or may not include continuous work — assert the engine either proposes a real bounded continuous change, or honestly reports no_compatible_action (never crashes, never a fake proposal).
  if (result.outcome === "proposal") {
    assert.equal(result.proposal.adjustmentType, "continuous_duration_reduction");
    assert.ok(result.proposal.changeDescriptions.every((c) => /min →/.test(c.description)));
  } else {
    assert.equal(result.noProposal.reason, "no_compatible_action");
  }
});

console.log("\n4. Performance improvement never causes an aggressive proposal (J)\n");

check("J: performance_improving never produces a proposal — no automatic progression jump", () => {
  const result = evaluateAdjustmentForFinding(baseCtx({ finding: baseFinding({ domain: "training_performance", findingType: "performance_improving", strength: "strong" }) }));
  assert.equal(result.outcome, "no_proposal");
  if (result.outcome === "no_proposal") assert.equal(result.noProposal.reason, "stable_or_normal");
});

check("performance_inconsistent never produces a proposal — direction is ambiguous by definition", () => {
  const result = evaluateAdjustmentForFinding(baseCtx({ finding: baseFinding({ domain: "training_performance", findingType: "performance_inconsistent", strength: "strong" }) }));
  assert.equal(result.outcome, "no_proposal");
  if (result.outcome === "no_proposal") assert.equal(result.noProposal.reason, "ambiguous_evidence");
});

console.log("\n5. Resistance decline: bounded intensity reduction, methodology bound respected (I, P)\n");

function declineObservations(itemId: string): RawObservation[] {
  return ["2026-05-04", "2026-05-11", "2026-05-18"].map((d, i) => obs({ id: `o${i}`, metricKey: "rpe", observedAtIso: `${d}T18:00:00.000Z`, trainingItemInstanceId: itemId, value: { valueType: "numeric", valueNumeric: 9 } }));
}

check("I: comparable resistance decline (strong evidence) produces a bounded intensity_reduction proposal by default", () => {
  const itemId = "item-Monday-1-barbell-bench-press";
  const observations = declineObservations(itemId);
  const finding = baseFinding({ domain: "training_performance", findingType: "performance_declining", strength: "strong", supportingEvidenceRefs: observations.map((o) => o.id) });
  const result = evaluateAdjustmentForFinding(baseCtx({ finding, observations }));
  assert.equal(result.outcome, "proposal");
  if (result.outcome === "proposal") {
    assert.equal(result.proposal.adjustmentType, "intensity_reduction");
    assert.ok(result.proposal.changeDescriptions.every((c) => /RPE \d+ → \d+/.test(c.description)));
  }
});

console.log("\n6. Confirmed learned rule refines HOW, not WHETHER (Q)\n");

check("Q: a confirmed 'reduce sets' rule for the matching family shifts the SAME decline finding to volume_reduction instead of intensity_reduction", () => {
  const itemId = "item-Monday-1-barbell-bench-press";
  const observations = declineObservations(itemId);
  const finding = baseFinding({ domain: "training_performance", findingType: "performance_declining", strength: "strong", supportingEvidenceRefs: observations.map((o) => o.id) });
  const rule: ApplicableRule = { id: "rule-1", scope: "coach_general", clientProfileId: null, decisionDomain: "prescription", decisionType: "item_prescription_edited", field: "sets", itemFamily: "push_horizontal", direction: "decrease" };
  const result = evaluateAdjustmentForFinding(baseCtx({ finding, observations, applicableRules: [rule] }));
  assert.equal(result.outcome, "proposal");
  if (result.outcome === "proposal") {
    assert.equal(result.proposal.adjustmentType, "volume_reduction");
    assert.deepEqual(result.proposal.learnedRuleIdsUsed, ["rule-1"]);
  }
});

console.log("\n7. Explicit methodology outranks everything (P)\n");

check("P: reducing sets below the coach's own configured minimum is never proposed — explicit methodology wins", () => {
  const itemId = "item-Monday-1-barbell-bench-press";
  const observations = ["2026-05-04", "2026-05-11", "2026-05-18"].map((d, i) => obs({ id: `o${i}`, metricKey: "exercise_status", observedAtIso: `${d}T18:00:00.000Z`, trainingItemInstanceId: itemId, value: { valueType: "categorical", valueText: "skipped" } }));
  const finding = baseFinding({ domain: "prescription_completion", findingType: "repeated_under_completion", strength: "strong", supportingEvidenceRefs: observations.map((o) => o.id) });
  const tightCom = createDefaultCoachOperatingModel({ coachId: "coach-1", workspaceId: "workspace-1", nowIso: NOW_ISO, businessName: "Test" });
  tightCom.programArchitecture.setsPerExerciseMin = 999; // impossible to satisfy — forces the conflict deterministically
  const result = evaluateAdjustmentForFinding(baseCtx({ finding, observations, com: tightCom }));
  assert.equal(result.outcome, "no_proposal");
  if (result.outcome === "no_proposal") assert.equal(result.noProposal.reason, "explicit_methodology_conflict");
});

console.log("\n8. Safety restriction blocks an otherwise-eligible proposal (M)\n");

check("M: a proposal whose current content already violates an avoided term never surfaces as valid", () => {
  const observations = scheduleConflictObservations("Wednesday", ["2026-05-06", "2026-05-13", "2026-05-20"]);
  const finding = baseFinding({ domain: "adherence", findingType: "recurring_schedule_conflict", strength: "strong", supportingEvidenceRefs: observations.map((o) => o.id) });
  // An avoided term matching something already present anywhere else in
  // the program (e.g. every generated program includes squats) forces
  // findRestrictionConflicts to trip, proving the safety gate actually
  // runs on the ADJUSTED draft, not just the touched fields.
  const result = evaluateAdjustmentForFinding(baseCtx({ finding, observations, avoidedTerms: ["squat"] }));
  assert.equal(result.outcome, "no_proposal");
  if (result.outcome === "no_proposal") assert.equal(result.noProposal.reason, "safety_restriction_conflict");
});

console.log("\n9. No active program (no_active_program)\n");

check("no active program week resolves to no_active_program, never a crash", () => {
  const result = evaluateAdjustmentForFinding(baseCtx({ currentProgramWeek: null, finding: baseFinding({ domain: "adherence", findingType: "recurring_schedule_conflict", strength: "strong" }) }));
  assert.equal(result.outcome, "no_proposal");
  if (result.outcome === "no_proposal") assert.equal(result.noProposal.reason, "no_active_program");
});

console.log("\n10. Signature determinism and stability (V, W)\n");

check("V/W: the same inputs always produce the same proposal signature; a different active version produces a different one", () => {
  const sigA = buildProposalSignature({ clientProfileId: CLIENT_ID, activeProgramVersionId: "v1", findingDomain: "adherence", findingType: "recurring_schedule_conflict", affectedTargetKey: "Wednesday", direction: "convert_to_rest" });
  const sigB = buildProposalSignature({ clientProfileId: CLIENT_ID, activeProgramVersionId: "v1", findingDomain: "adherence", findingType: "recurring_schedule_conflict", affectedTargetKey: "Wednesday", direction: "convert_to_rest" });
  const sigC = buildProposalSignature({ clientProfileId: CLIENT_ID, activeProgramVersionId: "v2", findingDomain: "adherence", findingType: "recurring_schedule_conflict", affectedTargetKey: "Wednesday", direction: "convert_to_rest" });
  assert.equal(sigA, sigB);
  assert.notEqual(sigA, sigC);
});

console.log("\n11. The active program content is never mutated by evaluation (X)\n");

check("X: evaluating an adjustment never mutates the input active content object", () => {
  const before = JSON.stringify(activeContent);
  const observations = scheduleConflictObservations("Wednesday", ["2026-05-06", "2026-05-13", "2026-05-20"]);
  const finding = baseFinding({ domain: "adherence", findingType: "recurring_schedule_conflict", strength: "strong", supportingEvidenceRefs: observations.map((o) => o.id) });
  evaluateAdjustmentForFinding(baseCtx({ finding, observations }));
  assert.equal(JSON.stringify(activeContent), before);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
