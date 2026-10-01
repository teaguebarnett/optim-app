// Pure tests for the truthful client-setup gate:
//   - generation prerequisites (confirmed method, completed intake,
//     resolved health review), each blocking independently
//   - approval bypasses (unverified / legacy / forged-looking proposals,
//     prerequisites lost after generation, adjustment proposals)
//   - proposal provenance (what's recorded, with readable client facts)
//   - readable explanations (no raw enums)
//   - timezone validation and source
//   - nutrition duplicate-version detection
// No DB, no network, no browser. Run with: npm run verify:client-setup-gate

import assert from "node:assert/strict";
import { createDefaultCoachOperatingModel } from "./operating-model.ts";
import { confirmMethodology, parseMethodAnswers, type MethodAnswers } from "./methodology.ts";
import { extractClientProgrammingProfile } from "./programming-profile.ts";
import { buildTrainingExplanation, extractClientSnapshot } from "./activation-generation.ts";
import { generateProgramDirectionSummaries } from "./program-directions.ts";
import {
  buildGenerationInputs,
  checkProposalApproval,
  evaluateGenerationPrerequisites,
  hasVerifiedGenerationInputs,
  isUnverifiedFreshProposal,
  type GenerationPrerequisiteResult,
} from "./generation-prerequisites.ts";
import { nutritionTargetsEqual } from "./nutrition-targets-input.ts";
import { parseRejectionReason } from "./proposal-rejection.ts";
import { canonicalTimeZone, resolveTimezoneSource } from "../shared/timezone.ts";
import type { HealthReviewRecord, OnboardingProgress } from "./types";

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

const NOW = "2026-09-29T12:00:00.000Z";
const RAW_ENUM = /\b[a-z]+_[a-z0-9_]+\b/;

const defaultModel = () => createDefaultCoachOperatingModel({ coachId: "coach-1", workspaceId: "ws-1", nowIso: NOW, businessName: "Test" });
const ANSWERS: MethodAnswers = {
  program_splits: ["full_body", "upper_lower"],
  program_frequency: "3_4",
  program_sets_reps: "3_4",
  program_rep_philosophy: "moderate_8_12",
  program_rpe_rir: "rir",
  program_proximity_to_failure: "1_2_reps_in_reserve",
  program_progression: "double_progression",
  program_deload: "6",
  program_warmup: "ramped_warmup_sets",
  program_cardio: "optional_low_intensity_supplemental",
  program_exercises_avoided: "",
  practice_common_goals: ["build_muscle"],
};
function confirmedModel() {
  const parsed = parseMethodAnswers(ANSWERS);
  if (!parsed.ok) throw new Error(parsed.message);
  return confirmMethodology(defaultModel(), parsed.answers, NOW);
}

function completedOnboarding(): OnboardingProgress {
  return {
    clientId: "client-1",
    workspaceId: "ws-1",
    currentStepIndex: 6,
    completedAtIso: "2026-09-28T09:00:00.000Z",
    updatedAtIso: "2026-09-28T09:00:00.000Z",
    answers: {
      about_you: { age: 30, heightFeet: 5, heightInchesRemainder: 10, weightLb: 180, sex: "male" },
      what_you_want: { primaryGoal: "build_muscle" },
      your_week: { availableDays: ["mon", "wed", "fri"], maxSessionLength: "60", trainingEnvironment: ["commercial_gym"] },
      starting_point: { trainingExperience: "comfortable_common", recentConsistency: "fairly_consistent" },
      fuel_recovery: { cardioPreference: "neutral_on_cardio" },
    },
  } as OnboardingProgress;
}
function inProgressOnboarding(): OnboardingProgress {
  const o = completedOnboarding();
  return { ...o, completedAtIso: undefined, currentStepIndex: 2 };
}
function review(status: HealthReviewRecord["status"]): HealthReviewRecord {
  return { clientId: "client-1", workspaceId: "ws-1", status, reasons: ["Reported a current pain/injury"], createdAtIso: NOW, updatedAtIso: NOW };
}

function evaluate(opts: { model?: ReturnType<typeof defaultModel> | null; onboarding?: OnboardingProgress | null; health?: HealthReviewRecord | null }): GenerationPrerequisiteResult {
  const model = opts.model === undefined ? confirmedModel() : opts.model;
  const onboarding = opts.onboarding === undefined ? completedOnboarding() : opts.onboarding;
  return evaluateGenerationPrerequisites({
    playbook: model ? { version: 3, operatingModel: model } : null,
    onboarding,
    intake: extractClientProgrammingProfile(onboarding, opts.health ?? null),
    clientProfileId: "client-1",
  });
}
const ids = (r: GenerationPrerequisiteResult) => (r.ready ? [] : r.missing.map((m) => m.id));

console.log("generation prerequisites");
check("confirmed method + completed intake + no review -> ready", () => assert.equal(evaluate({}).ready, true));
check("bootstrapped default method blocks, linking to Settings", () => {
  const r = evaluate({ model: defaultModel() });
  assert.deepEqual(ids(r), ["coach_method"]);
  assert.equal(!r.ready && r.missing[0].href, null);
});
check("no playbook at all blocks", () => assert.deepEqual(ids(evaluate({ model: null })), ["coach_method"]));
check("Invited client (no intake) blocks — no placeholder client", () => {
  const r = evaluate({ onboarding: null });
  assert.deepEqual(ids(r), ["client_intake"]);
  assert.match(!r.ready ? r.missing[0].message : "", /hasn't started intake/);
});
check("intake in progress blocks", () => {
  const r = evaluate({ onboarding: inProgressOnboarding() });
  assert.deepEqual(ids(r), ["client_intake"]);
  assert.match(!r.ready ? r.missing[0].message : "", /hasn't finished intake/);
});
check("the reported scenario (defaults + Invited) reports BOTH problems", () => assert.deepEqual(ids(evaluate({ model: defaultModel(), onboarding: null })), ["coach_method", "client_intake"]));
check("an open health review blocks, linking to reviews", () => {
  const r = evaluate({ health: review("review_needed") });
  assert.deepEqual(ids(r), ["health_review"]);
  assert.equal(!r.ready && r.missing[0].href, "/coach/escalations");
});
check("a resolved health review does not block", () => assert.equal(evaluate({ health: review("reviewed_by_coach") }).ready, true));

console.log("provenance");
function inputs() {
  const r = evaluate({});
  if (!r.ready) throw new Error("expected ready");
  return buildGenerationInputs({ playbookVersion: 3, operatingModel: confirmedModel(), onboarding: completedOnboarding(), profile: r.profile, assumptions: r.assumptions, nowIso: NOW });
}
check("records the confirmed method's playbook version and confirmation time", () => {
  const g = inputs();
  assert.equal(g.coachMethod.playbookVersion, 3);
  assert.equal(g.coachMethod.confirmedAtIso, NOW);
});
check("records the intake source and its completion time", () => {
  const g = inputs();
  assert.equal(g.clientIntake.source, "client_onboarding");
  assert.equal(g.clientIntake.completedAtIso, "2026-09-28T09:00:00.000Z");
  assert.equal(g.clientIntake.healthReview, "not_required");
});
check("client facts use intake wording — no raw enums, no invented tier", () => {
  const g = inputs();
  const text = g.clientIntake.summary.map((f) => `${f.label}: ${f.value}`).join(" | ");
  assert.doesNotMatch(text, RAW_ENUM, text);
  assert.doesNotMatch(text, /intermediate/i);
  assert.ok(g.clientIntake.summary.length >= 4, text);
});
check("method summary is readable", () => {
  const text = inputs().coachMethod.summary.map((f) => f.value).join(" | ");
  assert.doesNotMatch(text, RAW_ENUM, text);
});
check("buildGenerationInputs refuses an unconfirmed method", () => {
  const r = evaluate({});
  if (!r.ready) throw new Error("expected ready");
  assert.throws(() => buildGenerationInputs({ playbookVersion: 1, operatingModel: defaultModel(), onboarding: completedOnboarding(), profile: r.profile, assumptions: [], nowIso: NOW }));
});
check("buildGenerationInputs refuses incomplete intake", () => {
  const r = evaluate({});
  if (!r.ready) throw new Error("expected ready");
  assert.throws(() => buildGenerationInputs({ playbookVersion: 3, operatingModel: confirmedModel(), onboarding: inProgressOnboarding(), profile: r.profile, assumptions: [], nowIso: NOW }));
});

console.log("approval bypasses");
const ready = evaluate({});
check("a verified proposal with prerequisites still met can be approved", () => assert.deepEqual(checkProposalApproval({ generationInputs: inputs() }, ready), { ok: true }));
check("a legacy proposal (no generationInputs) cannot be approved", () => {
  const r = checkProposalApproval({}, ready);
  assert.equal(r.ok, false);
  assert.match(!r.ok ? r.message : "", /Reject it and generate a new one/);
});
check("a malformed generationInputs record cannot be approved", () => {
  assert.equal(checkProposalApproval({ generationInputs: { version: 1 } }, ready).ok, false);
  assert.equal(checkProposalApproval({ generationInputs: { ...inputs(), clientIntake: { ...inputs().clientIntake, source: "placeholder" } } }, ready).ok, false);
});
check("a verified proposal can't be approved after the method is no longer confirmed", () => assert.equal(checkProposalApproval({ generationInputs: inputs() }, evaluate({ model: defaultModel() })).ok, false));
check("a verified proposal can't be approved while a health review is open", () => assert.equal(checkProposalApproval({ generationInputs: inputs() }, evaluate({ health: review("review_needed") })).ok, false));
check("adjustment proposals stay under the active-plan check, not these prerequisites", () => assert.deepEqual(checkProposalApproval({ adjustmentProvenance: { activeProgramVersionId: "v1" } }, evaluate({ model: defaultModel(), onboarding: null })), { ok: true }));
check("hasVerifiedGenerationInputs is false for legacy content", () => assert.equal(hasVerifiedGenerationInputs({}), false));

console.log("readable explanation");
check("training explanation has no raw enums or invented tier", () => {
  const snap = extractClientSnapshot(completedOnboarding());
  if ("missing" in snap) throw new Error("fixture incomplete");
  const e = buildTrainingExplanation("best_fit", snap.snapshot, confirmedModel(), "Full Body");
  const text = [e.whyItFits, ...e.clientFactsUsed, ...e.coachingRulesUsed].join(" | ");
  assert.doesNotMatch(text, RAW_ENUM, text);
  assert.doesNotMatch(text, /intermediate/i, text);
});
check("direction summaries name assumptions explicitly (no vague 'see the note')", () => {
  const r = evaluate({});
  if (!r.ready) throw new Error("expected ready");
  const profile = { ...r.profile, dailyActivityLevelIsAssumed: true };
  const [best] = generateProgramDirectionSummaries({ profile, com: confirmedModel(), durationWeeks: 4 });
  assert.match(best.confidenceNote ?? "", /Assumed \(not answered in intake\):/);
  assert.doesNotMatch(best.confidenceNote ?? "", /readiness note/);
});

console.log("timezone validation");
check("a real IANA zone is accepted", () => assert.equal(canonicalTimeZone("America/Chicago"), "America/Chicago"));
check("case is canonicalized", () => assert.equal(canonicalTimeZone("america/chicago"), "America/Chicago"));
check("UTC is accepted only as an explicit choice", () => assert.equal(canonicalTimeZone("UTC"), "UTC"));
for (const bad of ["", "   ", "Central", "Not/AZone", "+05:00", "-06:00", "GMT+5 please"]) {
  check(`rejects ${JSON.stringify(bad)}`, () => assert.equal(canonicalTimeZone(bad), null));
}
check("rejects non-strings", () => assert.equal(canonicalTimeZone(42), null));
check("keeping the client's detected zone stays client_detected", () => assert.equal(resolveTimezoneSource({ timezone: "America/Denver", timezone_source: "client_detected" }, "America/Denver"), "client_detected"));
check("changing the client's detected zone becomes coach_override", () => assert.equal(resolveTimezoneSource({ timezone: "America/Denver", timezone_source: "client_detected" }, "America/Chicago"), "coach_override"));
check("a first choice with no prior source is coach_override", () => assert.equal(resolveTimezoneSource(null, "America/Chicago"), "coach_override"));
check("the schema's unconfirmed 'UTC' default is never treated as client_detected", () => assert.equal(resolveTimezoneSource({ timezone: "UTC", timezone_source: null }, "UTC"), "coach_override"));

console.log("nutrition save/version behavior");
const T = { calories: 2400, proteinG: 180, carbsG: 250, fatG: 75 };
check("identical targets are detected (no duplicate version)", () => assert.equal(nutritionTargetsEqual(T, { ...T }), true));
check("any changed value is a real change", () => {
  for (const k of Object.keys(T) as Array<keyof typeof T>) assert.equal(nutritionTargetsEqual(T, { ...T, [k]: T[k] + 1 }), false, k);
});

console.log("proposal rejection");
check("the reason is optional: blank means no reason", () => assert.equal(parseRejectionReason(""), undefined));
check("a missing reason field means no reason", () => assert.equal(parseRejectionReason(null), undefined));
check("a known reason is kept", () => assert.equal(parseRejectionReason("too_much_volume"), "too_much_volume"));
check("the legacy-proposal reason is accepted", () => assert.equal(parseRejectionReason("inputs_unverified"), "inputs_unverified"));
check("an unknown/forged reason is dropped, not an error", () => assert.equal(parseRejectionReason("<script>"), undefined));
check("a legacy unverified draft is cleared on rejection", () => assert.equal(isUnverifiedFreshProposal({}), true));
check("a verified draft is never cleared as a duplicate", () => assert.equal(isUnverifiedFreshProposal({ generationInputs: inputs() }), false));
check("an adjustment draft is never cleared as a duplicate", () => assert.equal(isUnverifiedFreshProposal({ adjustmentProvenance: { activeProgramVersionId: "v1" } }), false));
check("rejection needs no prerequisites: the legacy proposal is rejectable even with defaults + no intake", () => {
  // Approval is refused in that state, but the reject path has no gate.
  assert.equal(checkProposalApproval({}, evaluate({ model: defaultModel(), onboarding: null })).ok, false);
  assert.equal(isUnverifiedFreshProposal({}), true);
});
check("recorded rationale and 'why this plan' are kept when provided", () => {
  const r = evaluate({});
  if (!r.ready) throw new Error("expected ready");
  const g = buildGenerationInputs({ playbookVersion: 3, operatingModel: confirmedModel(), onboarding: completedOnboarding(), profile: r.profile, assumptions: [], nowIso: NOW, rationale: "Full Body fits 3 days.", whyThisPlan: ["Closest to your method.", "Trade-off: less variety."] });
  assert.equal(g.rationale, "Full Body fits 3 days.");
  assert.deepEqual(g.whyThisPlan, ["Closest to your method.", "Trade-off: less variety."]);
  assert.equal(hasVerifiedGenerationInputs({ generationInputs: g }), true);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
