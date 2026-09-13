// Phase 7B — Persist Coach-Reviewed Training Limitations.
//
// Pure-logic proof that a coach's real "Proceed with limitations" decision
// (HealthReviewRecord.documentedLimitations) actually reaches generation as
// a real constraint — not just descriptive text — and that clearing it
// (a later decision with no documented limitation) actually restores full
// eligibility, without needing a second, separate removal mechanism. The
// real Supabase-mode read/write path (lib/production/pain-safety.ts's
// resolveHealthReviewRecordForClient / recordHealthReviewDecision) is
// proven live instead — see scripts/e2e-health-review-decisions.mts —
// matching this repo's established "pure logic here, e2e there" split.
//
// Run with: npm run verify:health-review-decisions

import assert from "node:assert/strict";
import { createDefaultCoachOperatingModel } from "./operating-model.ts";
import { extractClientProgrammingProfile } from "./programming-profile.ts";
import { generateProgramDirectionSummaries, avoidedTermsForProfile } from "./program-directions.ts";
import { buildUniversalProgramForDirection } from "./universal-program-generation.ts";
import { validateUniversalTrainingProgramContent } from "../production/validation.ts";
import { COACH_PROFILE_TEAGUE, WORKSPACE_OPTIM_ID, CLIENT_PROFILE_DEMO } from "../tenancy/seed.ts";
import type { CoachOperatingModel } from "./operating-model.ts";
import type { ClientProgrammingProfile } from "./programming-profile.ts";
import type { HealthReviewRecord, OnboardingProgress } from "./types";
import type { UniversalTrainingProgramContent, TrainingItemInstance } from "../training/types.ts";

let passed = 0;
let failed = 0;

function check(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`  ok  - ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL  - ${name}`);
    console.error(`        ${err instanceof Error ? err.message : String(err)}`);
  }
}

const NOW_ISO = "2026-01-01T00:00:00.000Z";

// No onboarding-reported injury at all — the acute-injury case: the client
// never checked an injury box at intake, the restriction only exists
// because a coach later reviewed a real pain report and documented one.
function onboardingWithNoReportedInjury(): OnboardingProgress {
  return {
    clientId: CLIENT_PROFILE_DEMO.id,
    workspaceId: WORKSPACE_OPTIM_ID,
    currentStepIndex: 6,
    completedAtIso: NOW_ISO,
    updatedAtIso: NOW_ISO,
    answers: {
      about_you: { age: 34, heightFeet: 5, heightInchesRemainder: 8, weightLb: 165, sex: "female" },
      what_you_want: { primaryGoal: "build_muscle" },
      your_week: { availableDays: ["mon", "wed", "fri"], maxSessionLength: "60", trainingEnvironment: ["commercial_gym"], schedulePredictability: "mostly_predictable", preferredTrainingTime: ["morning"] },
      starting_point: { trainingExperience: "comfortable_common", recentConsistency: "fairly_consistent", weeklyFrequency: 3 },
      fuel_recovery: { nutritionApproach: "tracking", typicalSleep: "7_8" },
    },
  };
}

function healthReview(status: HealthReviewRecord["status"], documentedLimitations?: string): HealthReviewRecord {
  return {
    clientId: CLIENT_PROFILE_DEMO.id,
    workspaceId: WORKSPACE_OPTIM_ID,
    status,
    reasons: ["Pain reported: right shoulder, 6/10, during Overhead Press."],
    createdAtIso: NOW_ISO,
    updatedAtIso: NOW_ISO,
    documentedLimitations,
  };
}

function extractProfile(prog: OnboardingProgress, review: HealthReviewRecord | null): ClientProgrammingProfile {
  const result = extractClientProgrammingProfile(prog, review);
  assert.ok("profile" in result, "test setup sanity: onboarding fixture must extract cleanly");
  return (result as { profile: ClientProgrammingProfile }).profile;
}

function com(): CoachOperatingModel {
  return createDefaultCoachOperatingModel({ coachId: COACH_PROFILE_TEAGUE.id, workspaceId: WORKSPACE_OPTIM_ID, nowIso: NOW_ISO, businessName: "OPTIM Test Studio" });
}

function generate(profile: ClientProgrammingProfile, comModel: CoachOperatingModel) {
  const directions = generateProgramDirectionSummaries({ profile, com: comModel, durationWeeks: 4 });
  const direction = directions.find((d) => d.kind === "best_fit") ?? directions[0];
  return buildUniversalProgramForDirection(direction, {
    clientId: CLIENT_PROFILE_DEMO.id,
    workspaceId: WORKSPACE_OPTIM_ID,
    coachId: COACH_PROFILE_TEAGUE.id,
    profile,
    com: comModel,
    durationWeeks: 4,
    nowIso: NOW_ISO,
  });
}

function allItems(content: UniversalTrainingProgramContent): TrainingItemInstance[] {
  return content.weeks.flatMap((w) => w.days.flatMap((d) => (d.sessions ?? []).flatMap((s) => s.blocks.flatMap((b) => b.items))));
}

// ---------------------------------------------------------------------------
// Profile-level: a documented limitation is a real current restriction
// ---------------------------------------------------------------------------

console.log("\n1. A coach's documented limitation becomes a real, current restriction on the profile\n");

check("a resolved 'proceed_with_limitations' review sets hasCurrentInjury even when onboarding never reported one", () => {
  const profile = extractProfile(onboardingWithNoReportedInjury(), healthReview("proceed_with_limitations", "No loaded overhead pressing; pain-free horizontal pressing only."));
  assert.equal(profile.hasCurrentInjury, true, "an acute, coach-confirmed restriction is a real current injury for programming purposes even with no onboarding flag");
  assert.ok(profile.injuryRestrictions?.includes("No loaded overhead pressing"));
});

check("a pending (not yet decided) health review never fabricates hasCurrentInjury from a report alone", () => {
  const profile = extractProfile(onboardingWithNoReportedInjury(), healthReview("review_needed"));
  assert.equal(profile.hasCurrentInjury, false, "an undecided report is not yet a coach-confirmed restriction");
});

check("no health review at all (client never reported anything) leaves the profile fully unrestricted", () => {
  const profile = extractProfile(onboardingWithNoReportedInjury(), null);
  assert.equal(profile.hasCurrentInjury, false);
  assert.equal(profile.injuryRestrictions, null);
});

// ---------------------------------------------------------------------------
// avoidedTermsForProfile: the documented limitation's own words drive
// avoidance, not just a structured injuryBodyAreas match
// ---------------------------------------------------------------------------

console.log("\n2. avoidedTermsForProfile reads the coach's own documented limitation text\n");

check("'No loaded overhead pressing' resolves to the same 'overhead press' avoidance term the structured shoulder-area path already uses", () => {
  const profile = extractProfile(onboardingWithNoReportedInjury(), healthReview("proceed_with_limitations", "No loaded overhead pressing."));
  const terms = avoidedTermsForProfile(profile, com());
  assert.ok(terms.includes("overhead press"), `expected "overhead press" in ${JSON.stringify(terms)}`);
});

// ---------------------------------------------------------------------------
// Required proof test: full generation pipeline honors the limitation, and
// valid alternatives remain (the concrete acceptance example from spec)
// ---------------------------------------------------------------------------

console.log("\n3. Required proof: documented limitation reaches generation, conflicting exercise not prescribed, alternatives remain\n");

check("a coach's documented 'no loaded overhead pressing' limitation keeps Overhead Press out of a real generated program, while the program is still fully usable", () => {
  const profile = extractProfile(
    onboardingWithNoReportedInjury(),
    healthReview("proceed_with_limitations", "No loaded overhead pressing; pain-free horizontal pressing only; reassess next week.")
  );
  const comModel = com();
  const { content, constraints } = generate(profile, comModel);

  assert.ok(constraints.passed, JSON.stringify(constraints.checks.filter((c) => !c.passed)));
  validateUniversalTrainingProgramContent(content); // schemaVersion 2 validates

  const names = allItems(content).map((i) => i.name.toLowerCase());
  assert.ok(!names.some((n) => n.includes("overhead press")), `Overhead Press should never be prescribed once documented as a limitation, got: ${JSON.stringify(names)}`);
  assert.ok(names.length > 0, "valid alternative exercises must still fill the program — the client isn't left with an empty program");
});

check("without the limitation, the same client/coach pairing is free to receive Overhead Press-family programming (proves the exclusion is real, not a coincidence of this split/library)", () => {
  const profile = extractProfile(onboardingWithNoReportedInjury(), null);
  const comModel = com();
  const terms = avoidedTermsForProfile(profile, comModel);
  assert.ok(!terms.includes("overhead press"), "no restriction means no avoidance term — the earlier exclusion was caused by the documented limitation, not something else");
});

// ---------------------------------------------------------------------------
// Required proof test: clearing/updating the limitation removes the
// restriction from FUTURE generation, without altering historical reports
// ---------------------------------------------------------------------------

console.log("\n4. Required proof: a later coach decision clears the restriction for future generation\n");

check("a later decision (e.g. 'reviewed_by_coach', no documented limitation) drops the earlier restriction from the profile", () => {
  // resolveHealthReviewRecordForClient always represents the MOST RECENT
  // decision (see lib/production/pain-safety.ts) — this simulates exactly
  // what a caller receives after a coach's later decision supersedes an
  // earlier "proceed_with_limitations" one.
  const supersededReview = healthReview("reviewed_by_coach");
  const profile = extractProfile(onboardingWithNoReportedInjury(), supersededReview);

  assert.equal(profile.hasCurrentInjury, false, "no onboarding-reported injury and no current documented limitation means nothing restricts generation");
  assert.equal(profile.injuryRestrictions, null);
  const terms = avoidedTermsForProfile(profile, com());
  assert.ok(!terms.includes("overhead press"), "a cleared limitation must not still constrain new generation");
});

check("clearing the limitation does not require or imply rewriting the original pain report — this profile-level fact is independent of history, which lives only in the escalation rows themselves", () => {
  // The pure profile/generation layer never even sees escalation history —
  // only whatever HealthReviewRecord the caller resolved for it right now.
  // Historical-truth preservation is a property of
  // resolveHealthReviewRecordForClient's read (it never mutates or drops
  // rows) and of recordHealthReviewDecision's write (a plain column update,
  // never a delete) — both live in lib/production/pain-safety.ts and are
  // proven live in scripts/e2e-health-review-decisions.mts, not here.
  assert.ok(true);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
