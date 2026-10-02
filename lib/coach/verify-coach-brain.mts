// Gate 3 / 3.1 — Coach Brain pure rules (lib/coach/coach-brain.ts). The
// answer fixtures are generated from the real v2 question bank (every
// required question that applies, explicitly answered), so these checks
// track the interview's actual content rather than a hand-copied list.

import assert from "node:assert/strict";
import {
  liveCalibrationChapters,
  requiredCalibrationQuestionIds,
  calibrationReadiness,
  buildMethodFromCalibration,
  CalibrationIncompleteError,
  conservativeAuthorityConfig,
  CONSERVATIVE_AUTHORITY_LEVEL,
  knowledgeSourceOf,
  isCoachAuthoredSource,
  noConfirmedBrainIntelligence,
  hasConfirmedMethod,
  methodAsPlaybookContent,
  systemDefaultPlaybookContent,
  methodDraftStaleness,
  draftMethodVersionIdOf,
  type ConfirmedCoachMethod,
} from "./coach-brain.ts";
import { createDefaultCoachOperatingModel } from "./operating-model.ts";
import { confirmMethodology, getMethodologyConfirmation, GENERATION_METHOD_QUESTION_IDS, parseMethodAnswers } from "./methodology.ts";
import { DEFAULT_AI_AUTHORITY_LEVEL, AI_AUTHORITY_LEVELS, AI_AUTHORITY_LEVEL_LIVE_DESCRIPTIONS } from "./ai-authority.ts";
import { buildSystemPrompt, UNCONFIRMED_METHOD_POLICY, type AssistantContextSnapshot } from "../ai/context.ts";
import { answerAllRequired } from "./calibration/fixtures.ts";
import { ALL_CALIBRATION_ITEMS, CHAPTER_ORDER, answerKeyOf } from "./calibration/questions.ts";
import { buildCalibrationContext, isApplicableItem } from "./calibration/engine.ts";
import type { CalibrationAnswers } from "./calibration/types.ts";

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

const NOW = "2026-10-01T12:00:00.000Z";
const COACH_A = "coach-a";
const COACH_B = "coach-b";
const WS = "ws-1";

const SCOPE: CalibrationAnswers = { coaching_areas: ["strength", "physique"], experience_levels: ["intermediate"], client_modifiers: ["none"], nutrition_scope: "full", practice_goals: ["build_muscle", "get_stronger"] };

function build(answers: CalibrationAnswers, opts: { coachUserId?: string; authorityConfirmed?: boolean } = {}) {
  return buildMethodFromCalibration({
    answers,
    aiAuthority: conservativeAuthorityConfig(),
    aiAuthorityConfirmed: opts.authorityConfirmed ?? true,
    coachUserId: opts.coachUserId ?? COACH_A,
    workspaceId: WS,
    businessName: "OPTIM",
    methodVersion: 1,
    nowIso: NOW,
  });
}

const FULL = answerAllRequired(SCOPE);

console.log("\n1. What counts as calibrated\n");

check("an empty calibration is not ready: areas aren't confirmed, authority isn't confirmed", () => {
  const r = calibrationReadiness({ answers: {}, aiAuthorityConfirmed: false });
  assert.equal(r.ready, false);
  assert.ok(r.unansweredQuestionIds.includes("coaching_areas"));
  assert.equal(r.authorityUnconfirmed, true);
});

check("every required question that applies answered + authority explicitly confirmed → ready", () => {
  const r = calibrationReadiness({ answers: FULL, aiAuthorityConfirmed: true });
  assert.deepEqual(r.unansweredQuestionIds, []);
  assert.equal(r.ready, true);
});

check("all answered but authority never confirmed → NOT ready (no silent authority)", () => {
  const r = calibrationReadiness({ answers: FULL, aiAuthorityConfirmed: false });
  assert.equal(r.ready, false);
  assert.equal(r.authorityUnconfirmed, true);
});

check("a single missing required answer blocks confirmation", () => {
  const id = requiredCalibrationQuestionIds(FULL).find((k) => k.startsWith("t_"))!;
  const partial = { ...FULL };
  delete partial[id];
  const r = calibrationReadiness({ answers: partial, aiAuthorityConfirmed: true });
  assert.ok(r.unansweredQuestionIds.includes(id));
  assert.throws(() => build(partial), CalibrationIncompleteError);
});

check("an empty list is not an answer", () => {
  const r = calibrationReadiness({ answers: { ...FULL, t_effort_metric: [] }, aiAuthorityConfirmed: true });
  assert.equal(r.ready, false);
});

check("a carried-over answer flagged for confirmation blocks confirming until looked at", () => {
  const r = calibrationReadiness({ answers: { ...FULL, __needsConfirmation: ["t_session_length"] }, aiAuthorityConfirmed: true });
  assert.equal(r.ready, false);
  assert.deepEqual(r.needsConfirmation, ["t_session_length"]);
});

console.log("\n2. Scope comes only from the coach's confirmed areas\n");

check("before areas are confirmed, only Step 0 exists", () => {
  assert.deepEqual(liveCalibrationChapters({}), ["your_coaching"]);
});

check("confirmed areas assemble the chapters; authority and review always apply", () => {
  const chapters = liveCalibrationChapters(FULL);
  for (const c of ["your_coaching", "training", "strength", "physique", "nutrition", "voice", "safety", "ai_authority", "review"]) assert.ok(chapters.includes(c as never), c);
  for (const c of ["endurance", "sport_performance", "integration", "general_fitness"]) assert.ok(!chapters.includes(c as never), c);
});

console.log("\n3. Mapping explicit answers → confirmed method, with provenance\n");

check("confirmed method: active, versioned, owned by the confirming coach", () => {
  const { operatingModel, aiAuthority } = build(FULL);
  assert.equal(operatingModel.status, "active");
  assert.equal(operatingModel.activatedAtIso, NOW);
  assert.equal(operatingModel.version, 1);
  assert.equal(operatingModel.coachId, COACH_A);
  assert.equal(aiAuthority.coachId, COACH_A);
  assert.equal(operatingModel.calibration?.schema, 2);
});

check("every answered question carries coach provenance (calibration_answer)", () => {
  const { operatingModel } = build(FULL);
  const ctx = buildCalibrationContext(FULL);
  for (const key of requiredCalibrationQuestionIds(FULL)) {
    const id = ALL_CALIBRATION_ITEMS.find((q) => q.kind !== "group" && answerKeyOf(q) === key && isApplicableItem(q, ctx))?.id ?? key;
    const p = operatingModel.provenance[id];
    assert.ok(p && isCoachAuthoredSource(knowledgeSourceOf(p.source)), key);
  }
});

check("a question the coach never answered has NO provenance — unknown, never an implied rule", () => {
  const { operatingModel } = build(FULL);
  assert.equal(operatingModel.provenance.t_rest_periods, undefined);
  assert.equal(operatingModel.provenance.sit_low_sleep, undefined);
  assert.ok(Object.values(operatingModel.provenance).every((p) => isCoachAuthoredSource(knowledgeSourceOf(p.source))));
});

check("the calibration-confirmed method satisfies program generation's method gate", () => {
  const { operatingModel } = build(FULL);
  assert.equal(getMethodologyConfirmation(operatingModel).confirmed, true);
});

check("ranges are stored truthfully in the Brain (never collapsed)", () => {
  const answers = { ...FULL, t_session_length: { min: 60, max: 75, unit: "min" } };
  const { operatingModel } = build(answers);
  assert.deepEqual(operatingModel.calibration?.answers.t_session_length, { min: 60, max: 75, unit: "min" });
  // The legacy single field is NOT set from a range (exact-or-none).
  assert.equal(operatingModel.programArchitecture.sessionDurationMinutesTypical, 60 === 60 ? createDefaultCoachOperatingModel({ coachId: "x", workspaceId: "y", nowIso: NOW, businessName: "z" }).programArchitecture.sessionDurationMinutesTypical : -1);
});

console.log("\n4. Defaults and legacy configuration never count\n");

check("OPTIM's default model is not confirmed and its provenance is system_default", () => {
  const model = createDefaultCoachOperatingModel({ coachId: COACH_A, workspaceId: WS, nowIso: NOW, businessName: "OPTIM" });
  assert.equal(getMethodologyConfirmation(model).confirmed, false);
  for (const p of Object.values(model.provenance)) assert.equal(knowledgeSourceOf(p.source), "system_default");
});

check("legacy 12-field confirmation is NOT calibration", () => {
  const legacyAnswers = { program_splits: ["full_body"], program_frequency: "3_4", program_sets_reps: "3_4", program_rep_philosophy: "moderate_8_12", program_rpe_rir: "rir", program_proximity_to_failure: "1_2_reps_in_reserve", program_progression: "double_progression", program_deload: "6", program_warmup: "minimal", program_cardio: "rarely_used", program_exercises_avoided: "", practice_common_goals: ["build_muscle"] };
  const parsed = parseMethodAnswers(Object.fromEntries(GENERATION_METHOD_QUESTION_IDS.map((id) => [id, (legacyAnswers as Record<string, unknown>)[id] ?? ""])) as never);
  assert.ok(parsed.ok, parsed.ok ? "" : parsed.message);
  const base = createDefaultCoachOperatingModel({ coachId: COACH_A, workspaceId: WS, nowIso: NOW, businessName: "OPTIM" });
  const legacy = confirmMethodology(base, (parsed as { ok: true; answers: Parameters<typeof confirmMethodology>[1] }).answers, NOW);
  assert.equal(getMethodologyConfirmation(legacy).confirmed, true);
  const r = calibrationReadiness({ answers: legacyAnswers as never, aiAuthorityConfirmed: false });
  assert.equal(r.ready, false);
  assert.throws(() => build(legacyAnswers as never));
});

check("inferred values are never coach-authored", () => {
  assert.equal(isCoachAuthoredSource(knowledgeSourceOf("inferred")), false);
  assert.equal(isCoachAuthoredSource(knowledgeSourceOf("optim_default")), false);
  assert.equal(isCoachAuthoredSource(knowledgeSourceOf("coach_selected")), true);
  assert.equal(isCoachAuthoredSource(knowledgeSourceOf("coach_confirmed")), true);
});

console.log("\n5. Authority — never silently broad\n");

check("calibration starts at Advisor; the legacy Copilot default is never assumed", () => {
  assert.equal(CONSERVATIVE_AUTHORITY_LEVEL, "advisor");
  assert.notEqual(CONSERVATIVE_AUTHORITY_LEVEL, DEFAULT_AI_AUTHORITY_LEVEL);
  assert.deepEqual(conservativeAuthorityConfig(), { level: "advisor", domainOverrides: {} });
});

check("an explicit coach choice is kept exactly", () => {
  const { aiAuthority } = buildMethodFromCalibration({ answers: FULL, aiAuthority: { level: "copilot", domainOverrides: { nutrition: "advisor" } }, aiAuthorityConfirmed: true, coachUserId: COACH_A, workspaceId: WS, businessName: "OPTIM", methodVersion: 1, nowIso: NOW });
  assert.deepEqual(aiAuthority.global, { level: "copilot", domainOverrides: { nutrition: "advisor" } });
});

console.log("\n6. No confirmed Brain → conservative, honest intelligence\n");

check("no Brain: no method, Advisor authority labelled system_default, no learning", () => {
  const intel = noConfirmedBrainIntelligence({ owner: { coachUserId: COACH_A, workspaceId: WS }, ownerResolution: "primary_coach", calibrationState: "in_progress", nowIso: NOW });
  assert.equal(intel.method, null);
  assert.equal(hasConfirmedMethod(intel), false);
  assert.equal(intel.authority.source, "system_default");
  assert.equal(intel.authority.settings.global.level, "advisor");
  assert.deepEqual(intel.learning, { confirmedPatternRules: [], inferredTendencies: [] });
});

check("a client with no primary coach resolves to no owner — never a guessed coach", () => {
  const intel = noConfirmedBrainIntelligence({ owner: null, ownerResolution: "no_primary_coach", calibrationState: "not_started", nowIso: NOW });
  assert.equal(intel.owner, null);
  assert.equal(intel.ownerResolution, "no_primary_coach");
});

check("system-default chat content is Advisor and carries only optim_default provenance", () => {
  const content = systemDefaultPlaybookContent({ workspaceId: WS, nowIso: NOW, businessName: "OPTIM" });
  assert.equal(content.aiAuthority.global.level, "advisor");
  assert.ok(Object.values(content.operatingModel.provenance).every((p) => p.source === "optim_default"));
  assert.equal(content.examples.length, 0);
});

check("confirmed-method content comes only from the confirmed version", () => {
  const { operatingModel, aiAuthority } = build(FULL);
  const method: ConfirmedCoachMethod = { versionId: "v1", version: 1, source: "calibration", confirmedAtIso: NOW, operatingModel, aiAuthority };
  const content = methodAsPlaybookContent(method);
  assert.equal(content.operatingModel, operatingModel);
  assert.equal(content.aiAuthority, aiAuthority);
});

console.log("\n6b. Chat with no confirmed Brain\n");

const SNAPSHOT: AssistantContextSnapshot = {
  clientDisplayName: "Jo Park",
  coachDisplayName: "Alex",
  hasActiveProgram: true,
  hasActiveNutritionAssignment: false,
  programWeekLabel: "Week 3 of 8",
  todayFocusLabel: null,
  goalSummary: null,
  nutritionTargetsSummary: null,
  recentTrainingSummary: null,
  safetyFlags: [],
  priorCoachResolutions: [],
  authoritySummary: "Advisor",
  hasOpenEscalation: false,
};

check("no confirmed method: the prompt restricts OPTIM and never presents defaults as the coach's methodology", () => {
  const prompt = buildSystemPrompt(systemDefaultPlaybookContent({ workspaceId: WS, nowIso: NOW, businessName: "OPTIM" }), { ...SNAPSHOT, coachMethodConfirmed: false });
  assert.ok(prompt.includes(UNCONFIRMED_METHOD_POLICY));
  assert.ok(!prompt.includes("this coach's own methodology"));
  assert.match(prompt, /escalate to the coach/);
});

check("confirmed method: the prompt follows the coach's own playbook (unchanged behavior)", () => {
  const { operatingModel, aiAuthority } = build(FULL);
  const method: ConfirmedCoachMethod = { versionId: "v1", version: 1, source: "calibration", confirmedAtIso: NOW, operatingModel, aiAuthority };
  const prompt = buildSystemPrompt(methodAsPlaybookContent(method), { ...SNAPSHOT, coachMethodConfirmed: true });
  assert.ok(prompt.includes("this coach's own methodology"));
  assert.ok(!prompt.includes(UNCONFIRMED_METHOD_POLICY));
});

console.log("\n7. Coach isolation (pure)\n");

check("Coach A's confirmed method is owned by A; building B's from B's answers never mixes", () => {
  const a = build(FULL, { coachUserId: COACH_A });
  const bAnswers = answerAllRequired({ ...SCOPE, t_splits: { base: ["upper_lower"], varies: "no" } });
  const b = build(bAnswers, { coachUserId: COACH_B });
  assert.equal(a.operatingModel.coachId, COACH_A);
  assert.equal(b.operatingModel.coachId, COACH_B);
  assert.notEqual(a.operatingModel, b.operatingModel);
  assert.deepEqual(a.operatingModel.programArchitecture.preferredSplits, ["full_body"]);
  assert.deepEqual(b.operatingModel.programArchitecture.preferredSplits, ["upper_lower"]);
});

console.log("\n8. Stale-draft protection\n");

check("a draft with no recorded method version is stale", () => {
  const s = methodDraftStaleness(undefined, "v2");
  assert.equal(s.stale, true);
  assert.equal(s.stale && s.reason, "no_method_version");
});

check("a draft prepared under an older version is stale after the method changes", () => {
  const s = methodDraftStaleness("v1", "v2");
  assert.equal(s.stale && s.reason, "method_changed");
});

check("a draft prepared under the active version is not stale", () => {
  assert.deepEqual(methodDraftStaleness("v2", "v2"), { stale: false });
});

check("with no active method at all, any draft is stale", () => {
  assert.equal(methodDraftStaleness("v1", null).stale, true);
});

// Legacy rows come back from the database as plain JSON — parse them the same way.
type DraftContent = Parameters<typeof draftMethodVersionIdOf>[0];
const fromDb = (row: object): DraftContent => JSON.parse(JSON.stringify(row)) as DraftContent;

check("a pre-Gate-3 fresh draft (generation inputs without a method version) is stale and cannot be approved", () => {
  const legacy = fromDb({ generationInputs: { coachMethod: { confirmedAtIso: "2026-09-01T00:00:00.000Z" } } });
  assert.equal(draftMethodVersionIdOf(legacy), undefined);
  const s = methodDraftStaleness(draftMethodVersionIdOf(legacy), "v1");
  assert.equal(s.stale && s.reason, "no_method_version");
});

check("a pre-Gate-3 draft with no generation inputs at all is stale", () => {
  assert.equal(methodDraftStaleness(draftMethodVersionIdOf({}), "v1").stale, true);
});

check("a pre-Gate-3 adjustment draft (provenance without a method version) is stale", () => {
  const legacy = fromDb({ adjustmentProvenance: { activeProgramVersionId: "pv1" }, generationInputs: { coachMethod: { methodVersionId: "v1" } } });
  assert.equal(draftMethodVersionIdOf(legacy), undefined, "adjustments read their own provenance, never the base program's inputs");
  assert.equal(methodDraftStaleness(draftMethodVersionIdOf(legacy), "v1").stale, true);
});

check("current drafts resolve their recorded method version", () => {
  assert.equal(draftMethodVersionIdOf({ generationInputs: { coachMethod: { methodVersionId: "v3" } } }), "v3");
  assert.equal(draftMethodVersionIdOf({ adjustmentProvenance: { methodVersionId: "v3" } }), "v3");
  assert.deepEqual(methodDraftStaleness(draftMethodVersionIdOf({ adjustmentProvenance: { methodVersionId: "v3" } }), "v3"), { stale: false });
});

check("live authority descriptions never claim autonomy production doesn't have", () => {
  for (const level of AI_AUTHORITY_LEVELS) {
    const text = AI_AUTHORITY_LEVEL_LIVE_DESCRIPTIONS[level];
    assert.ok(text && text.length > 0, `${level} has a live description`);
    assert.doesNotMatch(text, /execut|automatic|on its own|completes the work|operates within/i, `${level}: "${text}"`);
  }
  for (const level of ["ai_led", "review_only"] as const) assert.match(AI_AUTHORITY_LEVEL_LIVE_DESCRIPTIONS[level], /still comes to you for approval/);
});

console.log("\n9. Chapter order sanity\n");

check("live chapters keep the canonical order", () => {
  const live = liveCalibrationChapters(FULL);
  const order = live.map((c) => CHAPTER_ORDER.indexOf(c));
  assert.deepEqual(order, [...order].sort((x, y) => x - y));
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
