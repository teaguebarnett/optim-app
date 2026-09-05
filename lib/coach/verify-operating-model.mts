// Phase 5.4A — Coach Operating Model: versioning, provenance, and
// confirmation-gating tests. Pure data/logic only — no generative AI
// service exists in this repository (see the final report).

import assert from "node:assert/strict";
import {
  coachConfirmedProvenance,
  coachSelectedProvenance,
  createDefaultCoachOperatingModel,
  defaultProvenance,
  inferredProvenance,
  isCoachOperatingModelConfirmed,
  lowConfidenceQuestionIds,
  type CoachOperatingModel,
} from "./operating-model.ts";
import { platformReducer, createInitialPlatformState } from "./platform-store.ts";
import { getActiveCoachOperatingModel, getCoachOperatingModelVersions } from "./repository.ts";
import { WORKSPACE_OPTIM_ID, COACH_PROFILE_TEAGUE, COACH_PROFILE_ALEX } from "../tenancy/seed.ts";

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

function baseModel(): CoachOperatingModel {
  return createDefaultCoachOperatingModel({ coachId: COACH_PROFILE_TEAGUE.id, workspaceId: WORKSPACE_OPTIM_ID, nowIso: "2026-01-01T00:00:00.000Z", businessName: "OPTIM" });
}

console.log("\n1. Honest defaults — every leaf has a real value, provenance is explicit\n");

check("createDefaultCoachOperatingModel never leaves a field blank/undefined for any domain", () => {
  const model = baseModel();
  assert.ok(model.practice.successDefinition.length > 0);
  assert.ok(model.programArchitecture.preferredSplits.length > 0);
  assert.ok(model.nutritionPhilosophy.proteinTargetGramsPerLbBodyweight > 0);
  assert.ok(model.communication.tone.length > 0);
  assert.ok(model.safety.painResponsePolicy.length > 0);
  assert.ok(model.operationalContext.timeZone.length > 0);
  assert.equal(model.version, 1);
  assert.equal(model.status, "draft");
});

check("A fresh model has zero provenance entries — nothing is falsely marked as coach-reviewed", () => {
  const model = baseModel();
  assert.deepEqual(model.provenance, {});
});

console.log("\n2. Provenance and confirmation gating\n");

check("An inferred value is never treated as confirmed until confirmInference-equivalent provenance is set explicitly", () => {
  const model = baseModel();
  model.provenance.program_sets_reps = inferredProvenance(0.7, "Based on 5 saved templates.", "2026-01-01T00:00:00.000Z");
  assert.equal(isCoachOperatingModelConfirmed(model, ["program_sets_reps"]), false);
  model.provenance.program_sets_reps = coachConfirmedProvenance("2026-01-02T00:00:00.000Z", "Confirmed by coach.");
  assert.equal(isCoachOperatingModelConfirmed(model, ["program_sets_reps"]), true);
});

check("coach_selected provenance also satisfies confirmation — a coach answering directly needs no separate confirm step", () => {
  const model = baseModel();
  model.provenance.practice_success_definition = coachSelectedProvenance("2026-01-01T00:00:00.000Z");
  assert.equal(isCoachOperatingModelConfirmed(model, ["practice_success_definition"]), true);
});

check("A required question with no provenance entry at all is honestly unconfirmed", () => {
  const model = baseModel();
  assert.equal(isCoachOperatingModelConfirmed(model, ["never_answered"]), false);
});

check("lowConfidenceQuestionIds surfaces every optim_default entry and nothing coach-confirmed", () => {
  const model = baseModel();
  model.provenance.a = defaultProvenance("2026-01-01T00:00:00.000Z");
  model.provenance.b = coachConfirmedProvenance("2026-01-01T00:00:00.000Z");
  model.provenance.c = inferredProvenance(0.4, "low confidence inference", "2026-01-01T00:00:00.000Z");
  const low = lowConfidenceQuestionIds(model, 0.6);
  assert.ok(low.includes("a"));
  assert.ok(low.includes("c"));
  assert.ok(!low.includes("b"));
});

console.log("\n3. Versioning through PlatformState — never a silent overwrite of history\n");

check("Saving a new active version marks the previous active version superseded, never deletes it", () => {
  let state = createInitialPlatformState();
  const v1 = { ...baseModel(), version: 1, status: "active" as const, createdAtIso: "2026-01-01T00:00:00.000Z", activatedAtIso: "2026-01-01T00:00:00.000Z" };
  state = platformReducer(state, { type: "SAVE_COACH_OPERATING_MODEL", model: v1 });
  assert.equal(getActiveCoachOperatingModel(state, COACH_PROFILE_TEAGUE.id)!.version, 1);

  const v2 = { ...baseModel(), version: 2, status: "active" as const, createdAtIso: "2026-02-01T00:00:00.000Z", activatedAtIso: "2026-02-01T00:00:00.000Z" };
  state = platformReducer(state, { type: "SAVE_COACH_OPERATING_MODEL", model: v2 });

  const versions = getCoachOperatingModelVersions(state, COACH_PROFILE_TEAGUE.id);
  assert.equal(versions.length, 2);
  const oldV1 = versions.find((m) => m.version === 1)!;
  assert.equal(oldV1.status, "superseded");
  assert.equal(oldV1.supersededByVersion, 2);
  assert.equal(getActiveCoachOperatingModel(state, COACH_PROFILE_TEAGUE.id)!.version, 2);
});

check("A draft save never supersedes the currently active version", () => {
  let state = createInitialPlatformState();
  const v1 = { ...baseModel(), version: 1, status: "active" as const };
  state = platformReducer(state, { type: "SAVE_COACH_OPERATING_MODEL", model: v1 });
  const draft = { ...baseModel(), version: 2, status: "draft" as const };
  state = platformReducer(state, { type: "SAVE_COACH_OPERATING_MODEL", model: draft });
  assert.equal(getActiveCoachOperatingModel(state, COACH_PROFILE_TEAGUE.id)!.version, 1);
  assert.equal(getCoachOperatingModelVersions(state, COACH_PROFILE_TEAGUE.id).find((m) => m.version === 1)!.status, "active");
});

check("No active model exists for a coach who has never saved one — never a silent default methodology", () => {
  const state = createInitialPlatformState();
  assert.equal(getActiveCoachOperatingModel(state, COACH_PROFILE_TEAGUE.id), null);
});

console.log("\n4. Multi-coach isolation\n");

check("Two coaches' Coach Operating Models never share or overwrite each other's versions", () => {
  let state = createInitialPlatformState();
  const teagueModel = { ...baseModel(), coachId: COACH_PROFILE_TEAGUE.id, version: 1, status: "active" as const };
  const alexModel = { ...baseModel(), coachId: COACH_PROFILE_ALEX.id, version: 1, status: "active" as const, communication: { ...baseModel().communication, tone: "alex_tone" } };
  state = platformReducer(state, { type: "SAVE_COACH_OPERATING_MODEL", model: teagueModel });
  state = platformReducer(state, { type: "SAVE_COACH_OPERATING_MODEL", model: alexModel });

  assert.equal(getActiveCoachOperatingModel(state, COACH_PROFILE_TEAGUE.id)!.communication.tone, "encouraging_direct");
  assert.equal(getActiveCoachOperatingModel(state, COACH_PROFILE_ALEX.id)!.communication.tone, "alex_tone");
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
