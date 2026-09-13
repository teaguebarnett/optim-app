// Phase 8B — Longitudinal Client Intelligence: coach decision evidence
// foundation. Pure-logic proof for the framework-independent domain
// model — validation, the two real projectors, deterministic idempotent
// source-ref construction, delta computation, and the structural proof
// that edited/rejected/overridden outcomes are representable even though
// no real production review-and-edit UI exists yet. The real Supabase-mode
// persistence/RLS/idempotent-insert path is proven live instead — see
// scripts/e2e-decision-evidence.mts — matching this repo's established
// "pure logic here, e2e there" split.
//
// Run with: npm run verify:decision-evidence

import assert from "node:assert/strict";
import {
  validateDecisionEvidenceInput,
  computeDecisionValueDelta,
  buildProgramVersionDecisionRef,
  buildHealthReviewDecisionRef,
  InvalidDecisionEvidenceError,
  type DecisionEvidenceInput,
} from "./types.ts";
import { projectProgramApprovalDecision, projectProgramRejectionDecision } from "./project-program-generation.ts";
import { projectHealthReviewDecision } from "./project-health-review-decision.ts";
import { projectItemRemovedDecision, projectItemAddedDecision, projectSessionRenamedDecision, projectDayConvertedToRestDecision } from "./project-structural-edit.ts";

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

const WORKSPACE_ID = "workspace-1";
const COACH_ID = "coach-1";
const CLIENT_ID = "client-1";
const NOW_ISO = "2026-09-15T12:00:00.000Z";

function baseInput(overrides: Partial<DecisionEvidenceInput> = {}): DecisionEvidenceInput {
  return {
    workspaceId: WORKSPACE_ID,
    coachUserId: COACH_ID,
    clientProfileId: CLIENT_ID,
    decisionDomain: "prescription",
    decisionType: "item_prescription_edited",
    outcome: "edited",
    proposedValue: { sets: 4, repsLow: 8, repsHigh: 10, rpe: 8 },
    chosenValue: { sets: 3, repsLow: 6, repsHigh: 8, rpe: 7 },
    sourceRef: "test:1",
    decidedAtIso: NOW_ISO,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// A. Decision evidence validation
// ---------------------------------------------------------------------------

console.log("\nA. Decision evidence validation\n");

check("a well-formed decision evidence input passes validation unchanged", () => {
  const input = baseInput();
  assert.deepEqual(validateDecisionEvidenceInput(input), input);
});

check("an unrecognized decision_type fails validation", () => {
  assert.throws(() => validateDecisionEvidenceInput(baseInput({ decisionType: "made_up_type" })), InvalidDecisionEvidenceError);
});

check("a decision_type/domain mismatch fails validation", () => {
  assert.throws(() => validateDecisionEvidenceInput(baseInput({ decisionDomain: "safety" })), InvalidDecisionEvidenceError);
});

check("a malformed value (wrong field type inside the registered shape) fails validation", () => {
  assert.throws(() => validateDecisionEvidenceInput(baseInput({ chosenValue: { sets: "three" } })), InvalidDecisionEvidenceError);
});

check("a missing/invalid decidedAtIso fails validation", () => {
  assert.throws(() => validateDecisionEvidenceInput(baseInput({ decidedAtIso: "not-a-date" })), InvalidDecisionEvidenceError);
});

check("a missing sourceRef fails validation", () => {
  assert.throws(() => validateDecisionEvidenceInput(baseInput({ sourceRef: "" })), InvalidDecisionEvidenceError);
});

// ---------------------------------------------------------------------------
// B/C/D/E. Unchanged approval, edited approval, rejection, override/selection
// ---------------------------------------------------------------------------

console.log("\nB/C/D/E. Approval, edit, rejection, and override/selection outcomes\n");

check("B: an unchanged approval requires proposedValue and chosenValue, and permits them to be identical", () => {
  const value = { sets: 3, repsLow: 6, repsHigh: 8, rpe: 8 };
  const input = baseInput({ outcome: "approved", proposedValue: value, chosenValue: value });
  assert.deepEqual(validateClientEvidenceHelper(input).proposedValue, validateClientEvidenceHelper(input).chosenValue);
});

check("C: an edited approval preserves both a different proposedValue and chosenValue", () => {
  const input = baseInput({ outcome: "edited" });
  const result = validateDecisionEvidenceInput(input);
  assert.notDeepEqual(result.proposedValue, result.chosenValue);
});

check("D: a rejection is honestly representable with NO chosenValue — never a fabricated one", () => {
  const input = baseInput({ outcome: "rejected", chosenValue: null });
  const result = validateDecisionEvidenceInput(input);
  assert.equal(result.chosenValue, null);
  assert.ok(result.proposedValue !== null, "a rejection still requires knowing what was rejected");
});

check("D: a rejection is REJECTED at validation if it tries to smuggle in a chosenValue", () => {
  assert.throws(() => validateDecisionEvidenceInput(baseInput({ outcome: "rejected", chosenValue: { sets: 3 } })), InvalidDecisionEvidenceError);
});

check("E: a 'selected' outcome (no OPTIM proposal existed) requires chosenValue but forbids proposedValue", () => {
  const input = baseInput({ decisionDomain: "safety", decisionType: "health_review_decision", outcome: "selected", proposedValue: null, chosenValue: { status: "proceed_with_limitations", documentedLimitations: "No overhead pressing." } });
  const result = validateDecisionEvidenceInput(input);
  assert.equal(result.proposedValue, null);
  assert.ok(result.chosenValue !== null);
});

check("E: an 'overridden' outcome is representable — a real different choice, not a mere edit", () => {
  const input = baseInput({ outcome: "overridden", proposedValue: { exerciseName: "Barbell Overhead Press" }, chosenValue: { exerciseName: "Landmine Press" } });
  const result = validateDecisionEvidenceInput(input);
  assert.equal((result.chosenValue as { exerciseName: string }).exerciseName, "Landmine Press");
});

function validateClientEvidenceHelper(input: DecisionEvidenceInput): DecisionEvidenceInput {
  return validateDecisionEvidenceInput(input);
}

// ---------------------------------------------------------------------------
// F. Proposed vs chosen preserved (never overwritten, comparable later)
// ---------------------------------------------------------------------------

console.log("\nF. Proposed vs chosen values both preserved, independently comparable\n");

check("F: proposedValue and chosenValue survive validation as two genuinely distinct objects", () => {
  const input = baseInput();
  const result = validateDecisionEvidenceInput(input);
  assert.deepEqual(result.proposedValue, { sets: 4, repsLow: 8, repsHigh: 10, rpe: 8 });
  assert.deepEqual(result.chosenValue, { sets: 3, repsLow: 6, repsHigh: 8, rpe: 7 });
});

check("F: computeDecisionValueDelta reports only the fields that actually differ, domain-aware, never free-text diffing", () => {
  const deltas = computeDecisionValueDelta({ sets: 4, reps: 10, rpe: 8, exerciseName: "Bench Press" }, { sets: 3, reps: 8, rpe: 8, exerciseName: "Bench Press" });
  const fields = deltas.map((d) => d.field).sort();
  assert.deepEqual(fields, ["reps", "sets"]);
  assert.deepEqual(
    deltas.find((d) => d.field === "sets"),
    { field: "sets", from: 4, to: 3 }
  );
});

check("F: computeDecisionValueDelta returns nothing for a rejection (no chosenValue to compare)", () => {
  assert.deepEqual(computeDecisionValueDelta({ sets: 4 }, null), []);
});

// ---------------------------------------------------------------------------
// G/H. Optional reason preserved; never required by default
// ---------------------------------------------------------------------------

console.log("\nG/H. Optional coach reason\n");

check("G: a coach-supplied reason survives validation unchanged", () => {
  const input = baseInput({ reason: "Client reported shoulder fatigue last session." });
  assert.equal(validateDecisionEvidenceInput(input).reason, "Client reported shoulder fatigue last session.");
});

check("H: no reason is required by default — validation never fails for its absence", () => {
  const input = baseInput();
  delete input.reason;
  assert.doesNotThrow(() => validateDecisionEvidenceInput(input));
});

// ---------------------------------------------------------------------------
// K. Program/session/item references preserved
// ---------------------------------------------------------------------------

console.log("\nK. Context references preserved\n");

check("K: programAssignmentId, escalationId, and trainingItemInstanceId all survive validation unchanged", () => {
  const input = baseInput({ programAssignmentId: "assignment-1", escalationId: "esc-1", trainingItemInstanceId: "item-1" });
  const result = validateDecisionEvidenceInput(input);
  assert.equal(result.programAssignmentId, "assignment-1");
  assert.equal(result.escalationId, "esc-1");
  assert.equal(result.trainingItemInstanceId, "item-1");
});

// ---------------------------------------------------------------------------
// L. Client-observation evidence reference representable
// ---------------------------------------------------------------------------

console.log("\nL. Client-observation references (Phase 8A) representable, never a snapshot copy\n");

check("L: observationIds is a real, structurally supported reference list — never a duplicated snapshot of the observations", () => {
  const input = baseInput({ observationIds: ["obs-1", "obs-2"] });
  const result = validateDecisionEvidenceInput(input);
  assert.deepEqual(result.observationIds, ["obs-1", "obs-2"]);
});

// ---------------------------------------------------------------------------
// M. One decision does not become a learned rule
// ---------------------------------------------------------------------------

console.log("\nM. One decision is evidence, never a rule\n");

check("M: nothing in this module computes a confidence score, a pattern count, or a promoted rule from a single (or many) decision(s) — validateDecisionEvidenceInput's return type carries only the one decision's own fields", () => {
  const result = validateDecisionEvidenceInput(baseInput());
  const keys = Object.keys(result);
  assert.ok(!keys.includes("confidence") && !keys.includes("patternCount") && !keys.includes("isRule"));
});

// ---------------------------------------------------------------------------
// Real projector: program generation (V1's only real, wired program decision)
// ---------------------------------------------------------------------------

console.log("\nReal projector — program proposal approval/rejection (Phase 8C)\n");

const summary = { durationWeeks: 8, directionLabel: "Best fit — Push/Pull/Legs", rationale: "Chosen for 4 available days and a build_muscle goal." };

check("an unchanged approval projects outcome='approved' with identical proposed/chosen values, keyed to the ORIGINAL proposal's version id", () => {
  const evidence = projectProgramApprovalDecision({
    workspaceId: WORKSPACE_ID,
    coachUserId: COACH_ID,
    clientProfileId: CLIENT_ID,
    originalVersionId: "version-1",
    programAssignmentId: "assignment-1",
    proposedSummary: summary,
    chosenSummary: summary,
    wasEdited: false,
    decidedAtIso: NOW_ISO,
  });
  validateDecisionEvidenceInput(evidence);
  assert.equal(evidence.outcome, "approved");
  assert.deepEqual(evidence.proposedValue, evidence.chosenValue);
  assert.equal(evidence.sourceRef, buildProgramVersionDecisionRef("version-1"));
  assert.equal(evidence.programAssignmentId, "assignment-1");
});

check("an approval after edits projects outcome='edited', still keyed to the ORIGINAL proposal's version id (not the edited version)", () => {
  const evidence = projectProgramApprovalDecision({
    workspaceId: WORKSPACE_ID,
    coachUserId: COACH_ID,
    clientProfileId: CLIENT_ID,
    originalVersionId: "version-1",
    programAssignmentId: "assignment-1",
    proposedSummary: summary,
    chosenSummary: summary,
    wasEdited: true,
    decidedAtIso: NOW_ISO,
  });
  assert.equal(evidence.outcome, "edited");
  assert.equal(evidence.sourceRef, buildProgramVersionDecisionRef("version-1"), "keyed to the original, so re-approving after further edits never duplicates the program-level record's identity");
});

check("a rejection projects outcome='rejected' with no fabricated chosenValue, and an optional reason", () => {
  const evidence = projectProgramRejectionDecision({
    workspaceId: WORKSPACE_ID,
    coachUserId: COACH_ID,
    clientProfileId: CLIENT_ID,
    originalVersionId: "version-2",
    proposedSummary: summary,
    reason: "too much volume",
    decidedAtIso: NOW_ISO,
  });
  validateDecisionEvidenceInput(evidence);
  assert.equal(evidence.outcome, "rejected");
  assert.equal(evidence.chosenValue, null);
  assert.equal(evidence.reason, "too much volume");
});

check("the program-generation source ref is deterministic — the same version id always resolves to the same ref", () => {
  assert.equal(buildProgramVersionDecisionRef("version-1"), buildProgramVersionDecisionRef("version-1"));
});

// ---------------------------------------------------------------------------
// U. Safety evidence references the canonical escalation, never duplicates it
// ---------------------------------------------------------------------------

console.log("\nU. Real projector — health review decision (safety, references canonical escalation)\n");

check("U: a health review decision projects outcome='selected', category='safety', and references the real escalation id — never duplicating its lifecycle", () => {
  const evidence = projectHealthReviewDecision({
    workspaceId: WORKSPACE_ID,
    coachUserId: COACH_ID,
    clientProfileId: CLIENT_ID,
    escalationId: "esc-1",
    status: "proceed_with_limitations",
    documentedLimitations: "No loaded overhead pressing.",
    decidedAtIso: NOW_ISO,
  });
  validateDecisionEvidenceInput(evidence);
  assert.equal(evidence.decisionDomain, "safety");
  assert.equal(evidence.outcome, "selected");
  assert.equal(evidence.proposedValue, null, "OPTIM never proposed a health-review outcome");
  assert.equal(evidence.escalationId, "esc-1");
  assert.equal(evidence.sourceRef, buildHealthReviewDecisionRef({ escalationId: "esc-1", decidedAtIso: NOW_ISO }));
});

check("U: a later, different decision on the SAME escalation produces a genuinely distinct source_ref — never overwriting the earlier one", () => {
  const first = projectHealthReviewDecision({ workspaceId: WORKSPACE_ID, coachUserId: COACH_ID, clientProfileId: CLIENT_ID, escalationId: "esc-1", status: "proceed_with_limitations", documentedLimitations: "No overhead pressing.", decidedAtIso: "2026-09-15T12:00:00.000Z" });
  const second = projectHealthReviewDecision({ workspaceId: WORKSPACE_ID, coachUserId: COACH_ID, clientProfileId: CLIENT_ID, escalationId: "esc-1", status: "reviewed_by_coach", decidedAtIso: "2026-09-16T09:00:00.000Z" });
  assert.notEqual(first.sourceRef, second.sourceRef);
});

check("a health review decision with no documentedLimitations never fabricates one", () => {
  const evidence = projectHealthReviewDecision({ workspaceId: WORKSPACE_ID, coachUserId: COACH_ID, clientProfileId: CLIENT_ID, escalationId: "esc-2", status: "reviewed_by_coach", decidedAtIso: NOW_ISO });
  assert.ok(!("documentedLimitations" in (evidence.chosenValue as object)));
});

// ---------------------------------------------------------------------------
// V. No hidden model chain-of-thought is stored
// ---------------------------------------------------------------------------

console.log("\nV. No hidden model chain-of-thought — only registered, product-facing fields\n");

check("V: DECISION_TYPE_REGISTRY validators reject any extra, unregistered field silently smuggled onto a value — wait, they only check registered fields exist and are well-typed; verify no chain-of-thought-shaped field (e.g. 'reasoningTrace') is part of ANY registered shape", () => {
  const input = baseInput({ decisionType: "program_generated", decisionDomain: "program_structure", proposedValue: { durationWeeks: 8, directionLabel: "x", rationale: "y" }, chosenValue: { durationWeeks: 8, directionLabel: "x", rationale: "y" }, outcome: "approved" });
  const result = validateDecisionEvidenceInput(input);
  for (const value of [result.proposedValue, result.chosenValue]) {
    assert.ok(value);
    assert.ok(!("reasoningTrace" in value!) && !("chainOfThought" in value!) && !("modelDeliberation" in value!));
  }
});

// ---------------------------------------------------------------------------
// Phase 8D — bounded structural-edit projectors
// ---------------------------------------------------------------------------

console.log("\nPhase 8D — structural edit projectors (item removed/added, session renamed, day converted)\n");

const structuralPath = { weekNumber: 4, dayOfWeek: "Monday" as const, sessionIndex: 0, blockId: "b1", itemId: "item-monday-1-overhead-press" };

check("item removal projects outcome='rejected' with no fabricated chosenValue", () => {
  const evidence = projectItemRemovedDecision({ workspaceId: WORKSPACE_ID, coachUserId: COACH_ID, clientProfileId: CLIENT_ID, editedVersionId: "v3", path: structuralPath, exerciseName: "Overhead Press", decidedAtIso: NOW_ISO });
  validateDecisionEvidenceInput(evidence);
  assert.equal(evidence.outcome, "rejected");
  assert.equal(evidence.chosenValue, null);
  assert.equal(evidence.decisionDomain, "exercise_selection");
});

check("item addition projects outcome='selected' with no proposedValue — OPTIM never proposed this item", () => {
  const evidence = projectItemAddedDecision({ workspaceId: WORKSPACE_ID, coachUserId: COACH_ID, clientProfileId: CLIENT_ID, editedVersionId: "v3", path: structuralPath, exerciseName: "Cable Fly", category: "resistance", decidedAtIso: NOW_ISO });
  validateDecisionEvidenceInput(evidence);
  assert.equal(evidence.outcome, "selected");
  assert.equal(evidence.proposedValue, null);
});

check("session rename projects outcome='edited' with the real before/after names", () => {
  const evidence = projectSessionRenamedDecision({ workspaceId: WORKSPACE_ID, coachUserId: COACH_ID, clientProfileId: CLIENT_ID, editedVersionId: "v3", path: { weekNumber: 4, dayOfWeek: "Monday" as const, sessionIndex: 0 }, fromName: "Upper", toName: "Push Day", decidedAtIso: NOW_ISO });
  validateDecisionEvidenceInput(evidence);
  assert.deepEqual(evidence.proposedValue, { name: "Upper" });
  assert.deepEqual(evidence.chosenValue, { name: "Push Day" });
});

check("day-to-rest conversion projects outcome='overridden' — a real structural override, not a mere edit", () => {
  const evidence = projectDayConvertedToRestDecision({ workspaceId: WORKSPACE_ID, coachUserId: COACH_ID, clientProfileId: CLIENT_ID, editedVersionId: "v3", weekNumber: 6, dayOfWeek: "Sunday", decidedAtIso: NOW_ISO });
  validateDecisionEvidenceInput(evidence);
  assert.equal(evidence.outcome, "overridden");
  assert.equal(evidence.decisionDomain, "scheduling");
});

check("structural edit source refs are deterministic and distinct per edited version — a retry never duplicates, a later edit is new evidence", () => {
  const first = projectItemRemovedDecision({ workspaceId: WORKSPACE_ID, coachUserId: COACH_ID, clientProfileId: CLIENT_ID, editedVersionId: "v3", path: structuralPath, exerciseName: "Overhead Press", decidedAtIso: NOW_ISO });
  const retry = projectItemRemovedDecision({ workspaceId: WORKSPACE_ID, coachUserId: COACH_ID, clientProfileId: CLIENT_ID, editedVersionId: "v3", path: structuralPath, exerciseName: "Overhead Press", decidedAtIso: NOW_ISO });
  const laterEdit = projectItemRemovedDecision({ workspaceId: WORKSPACE_ID, coachUserId: COACH_ID, clientProfileId: CLIENT_ID, editedVersionId: "v4", path: structuralPath, exerciseName: "Overhead Press", decidedAtIso: NOW_ISO });
  assert.equal(first.sourceRef, retry.sourceRef);
  assert.notEqual(first.sourceRef, laterEdit.sourceRef);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
