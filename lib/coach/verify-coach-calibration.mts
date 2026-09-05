// Phase 5.4A corrective pass — coach-calibration status, change-summary,
// the "Autonomous" relabel, and the guarantee that saving a new Coach
// Operating Model version never touches client-owned data. The slider's
// own drag/snap/keyboard/touch behavior is a real DOM interaction concern
// with no unit-test infrastructure in this codebase (every verify:*.mts
// script here is a pure-Node data/logic test, never a rendered-DOM one) —
// that behavior is covered by live, real-browser Playwright verification
// instead (see this pass's final report), not faked here.

import assert from "node:assert/strict";
import { AI_AUTHORITY_LEVELS, AI_AUTHORITY_LEVEL_LABELS, resolveAiActionDisposition, type AiAuthorityLevel } from "./ai-authority.ts";
import { allRequiredVisibleQuestionIds, resolveCoachCalibrationStatus, summarizeCoachOperatingModelChanges, type CoachOnboardingProgress } from "./coach-onboarding-engine.ts";
import { coachConfirmedProvenance, coachSelectedProvenance, createDefaultCoachOperatingModel, defaultProvenance, inferredProvenance, type CoachOperatingModel } from "./operating-model.ts";
import { createInitialPlatformState, platformReducer } from "./platform-store.ts";
import { WORKSPACE_OPTIM_ID, COACH_PROFILE_TEAGUE } from "../tenancy/seed.ts";

let passed = 0;
let failed = 0;

function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ok  - ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL  - ${name}`);
    console.log(`        ${(err as Error).message}`);
    failed++;
  }
}

function model(): CoachOperatingModel {
  return createDefaultCoachOperatingModel({ coachId: COACH_PROFILE_TEAGUE.id, workspaceId: WORKSPACE_OPTIM_ID, nowIso: "2026-01-01T00:00:00.000Z", businessName: "OPTIM" });
}

console.log("\n1. \"Autonomous\" relabel — display text changed, underlying behavior and persisted values did not\n");

check("The most autonomous level is labeled 'Autonomous', never the old ambiguous 'Review only'", () => {
  assert.equal(AI_AUTHORITY_LEVEL_LABELS.review_only, "Autonomous");
});

check("The underlying AiAuthorityLevel value is still 'review_only' — every already-persisted record and existing test stays valid", () => {
  assert.deepEqual(AI_AUTHORITY_LEVELS, ["advisor", "copilot", "ai_led", "review_only"]);
});

check("Safety escalation (pain/injury/out-of-bounds) is unaffected by the relabel — still escalates at every level including the renamed one", () => {
  for (const level of AI_AUTHORITY_LEVELS as AiAuthorityLevel[]) {
    assert.equal(resolveAiActionDisposition(level, "pain_or_injury"), "escalate");
  }
  assert.equal(resolveAiActionDisposition("review_only", "training_change", "major"), "escalate");
});

console.log("\n2. Coach calibration status — an active model is not automatically \"confirmed\"\n");

check("No progress and no active model -> not_started", () => {
  assert.equal(resolveCoachCalibrationStatus({ activeModel: null, progress: null }), "not_started");
});

check("Real in-progress answers with no completedAtIso and no active model -> in_progress", () => {
  const progress: CoachOnboardingProgress = { coachId: COACH_PROFILE_TEAGUE.id, workspaceId: WORKSPACE_OPTIM_ID, answers: { practice_success_definition: "x" }, updatedAtIso: "2026-01-01T00:00:00.000Z" };
  assert.equal(resolveCoachCalibrationStatus({ activeModel: null, progress }), "in_progress");
});

check("An active model whose required questions are only optim_default/inferred -> inferred_unconfirmed, NEVER calibrated", () => {
  const m = { ...model(), status: "active" as const, provenance: { practice_success_definition: defaultProvenance("2026-01-01T00:00:00.000Z") } };
  const progress: CoachOnboardingProgress = { coachId: COACH_PROFILE_TEAGUE.id, workspaceId: WORKSPACE_OPTIM_ID, answers: {}, completedAtIso: "2026-01-01T00:00:00.000Z", updatedAtIso: "2026-01-01T00:00:00.000Z" };
  const status = resolveCoachCalibrationStatus({ activeModel: m, progress });
  assert.notEqual(status, "calibrated");
  assert.equal(status, "inferred_unconfirmed");
});

check("An active model with an inferred (not yet coach-confirmed) required answer -> inferred_unconfirmed", () => {
  const m = { ...model(), status: "active" as const, provenance: { practice_success_definition: inferredProvenance(0.6, "guessed", "2026-01-01T00:00:00.000Z") } };
  const progress: CoachOnboardingProgress = { coachId: COACH_PROFILE_TEAGUE.id, workspaceId: WORKSPACE_OPTIM_ID, answers: { practice_success_definition: "x" }, completedAtIso: "2026-01-01T00:00:00.000Z", updatedAtIso: "2026-01-01T00:00:00.000Z" };
  assert.equal(resolveCoachCalibrationStatus({ activeModel: m, progress }), "inferred_unconfirmed");
});

check("An active model whose EVERY required question is coach_selected -> calibrated", () => {
  const answers = { nutrition_offered: false }; // honestly prunes the nutrition chapters' required questions out of scope
  const requiredIds = allRequiredVisibleQuestionIds(answers);
  const nowIso = "2026-01-01T00:00:00.000Z";
  const m = { ...model(), status: "active" as const, provenance: Object.fromEntries(requiredIds.map((id) => [id, coachSelectedProvenance(nowIso)])) };
  const progress: CoachOnboardingProgress = { coachId: COACH_PROFILE_TEAGUE.id, workspaceId: WORKSPACE_OPTIM_ID, answers, completedAtIso: nowIso, updatedAtIso: nowIso };
  assert.equal(resolveCoachCalibrationStatus({ activeModel: m, progress }), "calibrated");
});

check("coach_confirmed provenance (an inference the coach explicitly confirmed) also satisfies calibration for that question", () => {
  const answers = { nutrition_offered: false };
  const requiredIds = allRequiredVisibleQuestionIds(answers);
  const nowIso = "2026-01-01T00:00:00.000Z";
  const provenance = Object.fromEntries(requiredIds.map((id, i) => [id, i === 0 ? coachConfirmedProvenance(nowIso, "Confirmed from inference.") : coachSelectedProvenance(nowIso)]));
  const m = { ...model(), status: "active" as const, provenance };
  const progress: CoachOnboardingProgress = { coachId: COACH_PROFILE_TEAGUE.id, workspaceId: WORKSPACE_OPTIM_ID, answers, completedAtIso: nowIso, updatedAtIso: nowIso };
  assert.equal(resolveCoachCalibrationStatus({ activeModel: m, progress }), "calibrated");
});

console.log("\n3. Change summary — a real, honest diff before a re-confirmation\n");

check("No previous active model -> no change summary (first-time confirmation)", () => {
  assert.deepEqual(summarizeCoachOperatingModelChanges(null, model()), []);
});

check("An identical model reports no changed domains", () => {
  const m = model();
  assert.deepEqual(summarizeCoachOperatingModelChanges(m, { ...m }), []);
});

check("A real change to program architecture is detected and named", () => {
  const prev = model();
  const next = { ...prev, programArchitecture: { ...prev.programArchitecture, preferredSplits: ["push_pull_legs"] } };
  const changes = summarizeCoachOperatingModelChanges(prev, next);
  assert.ok(changes.includes("Program architecture"));
  assert.equal(changes.length, 1, "an unrelated domain must not be falsely reported as changed");
});

check("A real change to safety boundaries is detected and named, independently of other domains", () => {
  const prev = model();
  const next = { ...prev, safety: { ...prev.safety, absoluteOverrideRules: ["Never program behind-the-neck presses."] } };
  const changes = summarizeCoachOperatingModelChanges(prev, next);
  assert.deepEqual(changes, ["Safety boundaries"]);
});

console.log("\n4. Saving a new Coach Operating Model version never touches client-owned data\n");

check("SAVE_COACH_OPERATING_MODEL only ever writes to coachOperatingModels — clients, lifecycles, and activation generations are untouched", () => {
  let state = createInitialPlatformState();
  state = {
    ...state,
    clients: [{ id: "client-untouched" as never, workspaceId: WORKSPACE_OPTIM_ID, name: "Untouched Client", goal: "build_muscle", programWeek: 3, programTotalWeeks: 12, avatarInitials: "UC", previousWeightLb: 150, primaryCoachId: COACH_PROFILE_TEAGUE.id }],
    lifecycles: [{ clientId: "client-untouched" as never, workspaceId: WORKSPACE_OPTIM_ID, status: "active", updatedAtIso: "2026-01-01T00:00:00.000Z" }],
  };
  const before = { clients: state.clients, lifecycles: state.lifecycles, activationGenerations: state.activationGenerations };

  const v1 = { ...model(), version: 1, status: "active" as const };
  state = platformReducer(state, { type: "SAVE_COACH_OPERATING_MODEL", model: v1 });
  const v2 = { ...model(), version: 2, status: "active" as const, programArchitecture: { ...v1.programArchitecture, preferredSplits: ["body_part_split"] } };
  state = platformReducer(state, { type: "SAVE_COACH_OPERATING_MODEL", model: v2 });

  assert.equal(state.clients, before.clients, "clients array reference must be unchanged (untouched, not just deep-equal)");
  assert.equal(state.lifecycles, before.lifecycles, "lifecycles array reference must be unchanged");
  assert.equal(state.activationGenerations, before.activationGenerations, "activationGenerations array reference must be unchanged");
  assert.equal(state.clients[0].programWeek, 3, "the real client record itself must be byte-for-byte untouched");
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
