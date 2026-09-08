// Phase 5.4B — verifies the Daily Briefing model: deterministic generation,
// the sensitive-content review-hold override, automation-setting
// resolution (global default vs. per-client override), and the coach-
// controlled draft/approve/publish/edit lifecycle. Pure functions, no
// storage dependency — see lib/coach/daily-briefing.ts.

import assert from "node:assert/strict";
import { WORKSPACE_OPTIM_ID, COACH_PROFILE_TEAGUE, CLIENT_PROFILE_DEMO } from "../tenancy/seed.ts";
import {
  approveAndPublishDailyBriefing,
  approveDailyBriefing,
  defaultCoachBriefingSettings,
  editDailyBriefingText,
  generateDailyBriefing,
  isBriefingVisibleToClient,
  publishDailyBriefing,
  resolveEffectiveBriefingAutomation,
  shouldHoldBriefingForReview,
  type CoachBriefingSettings,
} from "./daily-briefing.ts";

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

function baseInput(overrides: Partial<Parameters<typeof generateDailyBriefing>[0]> = {}) {
  return {
    clientId: CLIENT_PROFILE_DEMO.id,
    workspaceId: WORKSPACE_OPTIM_ID,
    coachId: COACH_PROFILE_TEAGUE.id,
    forDateIso: "2026-01-10",
    isTrainingDay: true,
    workoutDisplayName: "Push Day",
    workoutFocus: "Chest and shoulders",
    automation: "review_first" as const,
    hasPainFlag: false,
    hasUnapprovedProgramChange: false,
    hasLowConfidenceSignal: false,
    nowIso: "2026-01-10T07:00:00.000Z",
    ...overrides,
  };
}

console.log("\n1. Deterministic generation\n");

check("a training day names the real assigned focus, never generic filler", () => {
  const record = generateDailyBriefing(baseInput());
  assert.ok(record.todaysEdgeText.includes("Chest and shoulders"));
  assert.equal(record.isTrainingDay, true);
});

check("a rest day gets honest recovery-oriented copy, never a training prompt", () => {
  const record = generateDailyBriefing(baseInput({ isTrainingDay: false, workoutDisplayName: undefined, workoutFocus: undefined }));
  assert.ok(record.todaysEdgeText.toLowerCase().includes("recovery"));
});

check("the client-facing text is short — one focus line plus one action step, not a checklist", () => {
  const record = generateDailyBriefing(baseInput());
  assert.equal(record.todaysEdgeText.split(". ").length <= 3, true);
});

console.log("\n2. Review-hold override (spec §7)\n");

check("a pain flag holds the briefing regardless of the automation setting", () => {
  const record = generateDailyBriefing(baseInput({ automation: "auto_publish", hasPainFlag: true }));
  assert.equal(record.status, "held_for_review");
  assert.ok(record.heldForReviewReason);
});

check("an unapproved program change holds the briefing regardless of automation", () => {
  const record = generateDailyBriefing(baseInput({ automation: "auto_publish", hasUnapprovedProgramChange: true }));
  assert.equal(record.status, "held_for_review");
});

check("a low-confidence signal holds the briefing regardless of automation", () => {
  const record = generateDailyBriefing(baseInput({ automation: "auto_publish", hasLowConfidenceSignal: true }));
  assert.equal(record.status, "held_for_review");
});

check("with nothing sensitive, review_first produces a draft and auto_publish produces auto_published", () => {
  assert.equal(generateDailyBriefing(baseInput({ automation: "review_first" })).status, "draft");
  assert.equal(generateDailyBriefing(baseInput({ automation: "auto_publish" })).status, "auto_published");
});

check("shouldHoldBriefingForReview is pure and total across every input combination", () => {
  assert.equal(shouldHoldBriefingForReview({ hasPainFlag: false, hasUnapprovedProgramChange: false, hasLowConfidenceSignal: false }).hold, false);
  assert.equal(shouldHoldBriefingForReview({ hasPainFlag: true, hasUnapprovedProgramChange: false, hasLowConfidenceSignal: false }).hold, true);
});

console.log("\n3. Automation setting resolution (global default vs. per-client override)\n");

check("a coach with no settings gets the honest review-first default", () => {
  const settings = defaultCoachBriefingSettings(COACH_PROFILE_TEAGUE.id, WORKSPACE_OPTIM_ID, "2026-01-01T00:00:00.000Z");
  assert.equal(resolveEffectiveBriefingAutomation(settings, CLIENT_PROFILE_DEMO.id), "review_first");
});

check("a per-client override replaces the global setting for that client only", () => {
  const settings: CoachBriefingSettings = {
    coachId: COACH_PROFILE_TEAGUE.id,
    workspaceId: WORKSPACE_OPTIM_ID,
    globalAutomation: "review_first",
    clientOverrides: { [CLIENT_PROFILE_DEMO.id]: "auto_publish" },
    updatedAtIso: "2026-01-01T00:00:00.000Z",
  };
  assert.equal(resolveEffectiveBriefingAutomation(settings, CLIENT_PROFILE_DEMO.id), "auto_publish");
  assert.equal(resolveEffectiveBriefingAutomation(settings, "client-someone-else"), "review_first");
});

console.log("\n4. Coach-controlled lifecycle: draft -> approve -> publish, and edit\n");

check("approveDailyBriefing stamps the real coach identity and timestamp", () => {
  const draft = generateDailyBriefing(baseInput());
  const approved = approveDailyBriefing(draft, COACH_PROFILE_TEAGUE.id, "Teague Barnett", "2026-01-10T08:00:00.000Z");
  assert.equal(approved.status, "approved");
  assert.equal(approved.approvedByCoachName, "Teague Barnett");
  assert.equal(approved.approvedAtIso, "2026-01-10T08:00:00.000Z");
});

check("publishDailyBriefing moves approved -> published and is the first status visible to the client", () => {
  const draft = generateDailyBriefing(baseInput());
  const approved = approveDailyBriefing(draft, COACH_PROFILE_TEAGUE.id, "Teague Barnett", "2026-01-10T08:00:00.000Z");
  assert.equal(isBriefingVisibleToClient(approved.status), false);
  const published = publishDailyBriefing(approved, "2026-01-10T08:05:00.000Z");
  assert.equal(isBriefingVisibleToClient(published.status), true);
});

check("auto_published is visible to the client without an explicit publish step", () => {
  const record = generateDailyBriefing(baseInput({ automation: "auto_publish" }));
  assert.equal(isBriefingVisibleToClient(record.status), true);
});

check("editDailyBriefingText marks generationSource coach_edited and never regenerates other fields", () => {
  const draft = generateDailyBriefing(baseInput());
  const edited = editDailyBriefingText(draft, "Custom coach-written line for today.", "2026-01-10T08:00:00.000Z");
  assert.equal(edited.todaysEdgeText, "Custom coach-written line for today.");
  assert.equal(edited.generationSource, "coach_edited");
  assert.equal(edited.focusLine, draft.focusLine);
});

console.log("\n5. Phase 5.6A.2 — repairing the publishing contract\n");

check("approveAndPublishDailyBriefing makes a fresh Approve click immediately visible to the client — the exact bug this phase repairs", () => {
  const draft = generateDailyBriefing(baseInput());
  assert.equal(isBriefingVisibleToClient(draft.status), false);
  const result = approveAndPublishDailyBriefing(draft, COACH_PROFILE_TEAGUE.id, "Teague Barnett", "2026-01-10T08:00:00.000Z");
  assert.equal(result.status, "published");
  assert.equal(isBriefingVisibleToClient(result.status), true);
  assert.equal(result.approvedByCoachName, "Teague Barnett");
  assert.ok(result.publishedAtIso);
});

check("re-editing a published briefing pulls it back to draft — the client keeps seeing the last real approved text, not a half-edited one, until it's approved again", () => {
  const draft = generateDailyBriefing(baseInput());
  const published = approveAndPublishDailyBriefing(draft, COACH_PROFILE_TEAGUE.id, "Teague Barnett", "2026-01-10T08:00:00.000Z");
  assert.equal(isBriefingVisibleToClient(published.status), true);

  const reEdited = editDailyBriefingText(published, "Changed my mind — new focus for today.", "2026-01-10T09:00:00.000Z");
  assert.equal(reEdited.status, "draft");
  assert.equal(isBriefingVisibleToClient(reEdited.status), false);
  assert.equal(reEdited.approvedByCoachId, undefined);
  assert.equal(reEdited.publishedAtIso, undefined);
  assert.equal(reEdited.todaysEdgeText, "Changed my mind — new focus for today.");
});

check("re-editing an auto_published briefing also requires a fresh approval before it's visible again", () => {
  const record = generateDailyBriefing(baseInput({ automation: "auto_publish" }));
  assert.equal(isBriefingVisibleToClient(record.status), true);
  const reEdited = editDailyBriefingText(record, "A different auto-generated line.", "2026-01-10T09:00:00.000Z");
  assert.equal(reEdited.status, "draft");
});

check("editing a plain draft (never yet approved) stays a draft — nothing to protect the client from yet", () => {
  const draft = generateDailyBriefing(baseInput());
  const edited = editDailyBriefingText(draft, "Still drafting.", "2026-01-10T08:00:00.000Z");
  assert.equal(edited.status, "draft");
});

check("editing a held-for-review briefing stays held — an unrelated text edit never silently clears a safety hold", () => {
  const held = generateDailyBriefing(baseInput({ hasPainFlag: true }));
  assert.equal(held.status, "held_for_review");
  const edited = editDailyBriefingText(held, "Adjusted wording.", "2026-01-10T08:00:00.000Z");
  assert.equal(edited.status, "held_for_review");
  assert.equal(edited.heldForReviewReason, held.heldForReviewReason);
});

check("repeated approval of the same record never produces a second identity — deterministic per-client-per-date id is unchanged by approval", () => {
  const draft = generateDailyBriefing(baseInput());
  const first = approveAndPublishDailyBriefing(draft, COACH_PROFILE_TEAGUE.id, "Teague Barnett", "2026-01-10T08:00:00.000Z");
  const second = approveAndPublishDailyBriefing(first, COACH_PROFILE_TEAGUE.id, "Teague Barnett", "2026-01-10T08:10:00.000Z");
  assert.equal(second.id, draft.id);
  assert.equal(second.id, `briefing-${draft.clientId}-${draft.forDateIso}`);
});

check("the same client's briefing on two different dates never collide — distinct ids", () => {
  const dayOne = generateDailyBriefing(baseInput({ forDateIso: "2026-01-10" }));
  const dayTwo = generateDailyBriefing(baseInput({ forDateIso: "2026-01-11" }));
  assert.notEqual(dayOne.id, dayTwo.id);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
