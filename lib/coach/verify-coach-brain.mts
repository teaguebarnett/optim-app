// Gate 3 — Coach Brain pure rules (lib/coach/coach-brain.ts). The answer
// fixtures are generated from the real question bank (every required,
// visible question explicitly answered), so these checks track the survey's
// actual content rather than a hand-copied list.

import assert from "node:assert/strict";
import {
  LIVE_UNSUPPORTED_CHAPTERS,
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
import { COACH_ONBOARDING_QUESTIONS, ALL_CHAPTER_IDS_IN_ORDER, visibleQuestionsForChapter, type CoachOnboardingAnswers } from "./coach-onboarding-questions.ts";
import { applicableChapters } from "./coach-onboarding-engine.ts";
import { createDefaultCoachOperatingModel, isCoachOperatingModelConfirmed } from "./operating-model.ts";
import { confirmMethodology, getMethodologyConfirmation, GENERATION_METHOD_QUESTION_IDS, parseMethodAnswers } from "./methodology.ts";
import { DEFAULT_AI_AUTHORITY_LEVEL, AI_AUTHORITY_LEVELS, AI_AUTHORITY_LEVEL_LIVE_DESCRIPTIONS } from "./ai-authority.ts";
import { buildSystemPrompt, UNCONFIRMED_METHOD_POLICY, type AssistantContextSnapshot } from "../ai/context.ts";

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

/** Answers every currently-visible question in every chapter with a real
 * option value, repeating until conditional questions stop appearing. */
function answerEverything(seed: CoachOnboardingAnswers = {}): CoachOnboardingAnswers {
  const answers: CoachOnboardingAnswers = { nutrition_offered: true, ...seed };
  for (let pass = 0; pass < 6; pass++) {
    let added = 0;
    for (const chapter of applicableChapters(answers)) {
      for (const q of visibleQuestionsForChapter(chapter, answers)) {
        if (answers[q.id] !== undefined) continue;
        const first = q.options?.[0]?.value;
        let value: CoachOnboardingAnswers[string];
        if (q.type === "multi_select" || q.type === "scenario") value = first ? [first] : ["x"];
        else if (q.type === "boolean") value = true;
        else if (q.type === "slider" || q.type === "number") value = q.min ?? 1;
        else if (q.type === "text") value = "Explicit coach answer";
        else value = first ?? "x";
        answers[q.id] = value;
        added++;
      }
    }
    if (added === 0) break;
  }
  return answers;
}

function build(answers: CoachOnboardingAnswers, opts: { coachUserId?: string; authorityConfirmed?: boolean } = {}) {
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

const FULL = answerEverything();

console.log("\n1. What counts as calibrated\n");

check("an empty calibration is not ready and lists every required question", () => {
  const r = calibrationReadiness({ answers: {}, aiAuthorityConfirmed: false });
  assert.equal(r.ready, false);
  assert.ok(r.unansweredQuestionIds.length > 40, `only ${r.unansweredQuestionIds.length} required`);
  assert.equal(r.authorityUnconfirmed, true);
});

check("every required question answered + authority explicitly confirmed → ready", () => {
  const r = calibrationReadiness({ answers: FULL, aiAuthorityConfirmed: true });
  assert.deepEqual(r.unansweredQuestionIds, []);
  assert.equal(r.ready, true);
});

check("all questions answered but authority never confirmed → NOT ready (no silent authority)", () => {
  const r = calibrationReadiness({ answers: FULL, aiAuthorityConfirmed: false });
  assert.equal(r.ready, false);
  assert.equal(r.authorityUnconfirmed, true);
});

check("a single missing required answer blocks confirmation", () => {
  const id = requiredCalibrationQuestionIds(FULL)[5];
  const partial = { ...FULL };
  delete partial[id];
  const r = calibrationReadiness({ answers: partial, aiAuthorityConfirmed: true });
  assert.deepEqual(r.unansweredQuestionIds, [id]);
  assert.throws(() => build(partial), CalibrationIncompleteError);
});

check("whitespace-only text or an empty list is not an answer", () => {
  const textQ = requiredCalibrationQuestionIds(FULL).map((id) => COACH_ONBOARDING_QUESTIONS.find((q) => q.id === id)!).find((q) => q.type === "multi_select" || q.type === "scenario")!;
  const r = calibrationReadiness({ answers: { ...FULL, [textQ.id]: [] }, aiAuthorityConfirmed: true });
  assert.ok(r.unansweredQuestionIds.includes(textQ.id));
});

console.log("\n2. Live-unsupported survey content\n");

check("'existing work' (demo templates/meals) is hidden in live calibration", () => {
  assert.deepEqual([...LIVE_UNSUPPORTED_CHAPTERS], ["existing_work"]);
  assert.ok(!liveCalibrationChapters(FULL).includes("existing_work"));
  assert.ok(liveCalibrationChapters(FULL).includes("ai_authority") && liveCalibrationChapters(FULL).includes("review"));
});

check("hidden unsupported chapters contribute no required questions (never block completion)", () => {
  const required = new Set(requiredCalibrationQuestionIds(FULL));
  const fromHidden = COACH_ONBOARDING_QUESTIONS.filter((q) => LIVE_UNSUPPORTED_CHAPTERS.includes(q.chapter) && required.has(q.id));
  assert.equal(fromHidden.length, 0);
});

console.log("\n3. Mapping explicit answers → confirmed method, with provenance\n");

check("confirmed method: active, versioned, owned by the confirming coach", () => {
  const { operatingModel, aiAuthority } = build(FULL);
  assert.equal(operatingModel.status, "active");
  assert.equal(operatingModel.activatedAtIso, NOW);
  assert.equal(operatingModel.version, 1);
  assert.equal(operatingModel.coachId, COACH_A);
  assert.equal(aiAuthority.coachId, COACH_A);
});

check("every required answer carries coach provenance (calibration_answer)", () => {
  const { operatingModel } = build(FULL);
  const required = requiredCalibrationQuestionIds(FULL);
  assert.ok(isCoachOperatingModelConfirmed(operatingModel, required));
  for (const id of required) assert.equal(knowledgeSourceOf(operatingModel.provenance[id]?.source), "calibration_answer", id);
});

check("a value the coach never answered stays a system default — never coach truth", () => {
  const { operatingModel } = build(FULL);
  const unanswered = Object.entries(operatingModel.provenance).filter(([id]) => FULL[id] === undefined);
  for (const [, p] of unanswered) assert.ok(!isCoachAuthoredSource(knowledgeSourceOf(p.source)));
});

check("the calibration-confirmed method also satisfies program generation's method gate", () => {
  const { operatingModel } = build(FULL);
  assert.equal(getMethodologyConfirmation(operatingModel).confirmed, true);
});

console.log("\n4. Defaults and legacy configuration never count\n");

check("OPTIM's default model is not confirmed and its provenance is system_default", () => {
  const model = createDefaultCoachOperatingModel({ coachId: COACH_A, workspaceId: WS, nowIso: NOW, businessName: "OPTIM" });
  assert.equal(getMethodologyConfirmation(model).confirmed, false);
  assert.equal(isCoachOperatingModelConfirmed(model, requiredCalibrationQuestionIds(FULL)), false);
  for (const p of Object.values(model.provenance)) assert.equal(knowledgeSourceOf(p.source), "system_default");
});

check("legacy 12-field confirmation is NOT calibration: its answers leave most required questions unanswered", () => {
  // What the legacy Settings form submits: the 12 generation fields only.
  const legacyAnswers = Object.fromEntries(GENERATION_METHOD_QUESTION_IDS.map((id) => [id, FULL[id] ?? ""]));
  const parsed = parseMethodAnswers(legacyAnswers);
  assert.ok(parsed.ok, parsed.ok ? "" : parsed.message);
  const base = createDefaultCoachOperatingModel({ coachId: COACH_A, workspaceId: WS, nowIso: NOW, businessName: "OPTIM" });
  const legacy = confirmMethodology(base, (parsed as { ok: true; answers: Parameters<typeof confirmMethodology>[1] }).answers, NOW);
  // The legacy form looked "confirmed" to generation…
  assert.equal(getMethodologyConfirmation(legacy).confirmed, true);
  // …but as calibration it is nowhere near complete, so it can't seed a Brain.
  const r = calibrationReadiness({ answers: legacyAnswers, aiAuthorityConfirmed: false });
  assert.equal(r.ready, false);
  assert.ok(r.unansweredQuestionIds.length > 30, `${r.unansweredQuestionIds.length}`);
  assert.throws(() => build(legacyAnswers), CalibrationIncompleteError);
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
  const bAnswers = answerEverything({ program_splits: ["upper_lower"] });
  const b = build(bAnswers, { coachUserId: COACH_B });
  assert.equal(a.operatingModel.coachId, COACH_A);
  assert.equal(b.operatingModel.coachId, COACH_B);
  assert.notEqual(a.operatingModel, b.operatingModel);
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
  const order = live.map((c) => ALL_CHAPTER_IDS_IN_ORDER.indexOf(c));
  assert.deepEqual(order, [...order].sort((x, y) => x - y));
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
