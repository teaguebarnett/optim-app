// OPTIM Phase 5.0A — Connected Platform Foundation verification.
//
// Exercises the platform-store reducer/migration, the coach/client
// repository joins, activation readiness, the attention queue, and the
// pure role-routing decision logic directly against the real
// implementations — no UI rendering involved, matching every sibling
// verify:*.mts. Run with: npm run verify:coach

import assert from "node:assert/strict";

import {
  createInitialPlatformState,
  generateInvitationToken,
  migratePlatformState,
  platformReducer,
  type PlatformState,
} from "./platform-store.ts";
import {
  getAllClientProfiles,
  getClientLifecycle,
  getClientProfileForCoach,
  getClientsForCoach,
  getIntendedProgram,
  getInvitationByToken,
  getInvitationForClient,
  getOnboardingProgress,
  resolveProgramAssignmentRef,
} from "./repository.ts";
import { checkActivationReadiness } from "./activation.ts";
import { createEmptyClientProgram, createEmptyExercise, createEmptyWorkout } from "./training.ts";
import { buildAttentionQueue } from "./attention-queue.ts";
import { classifyPathname, isGenuinelyNewCoach, isRouteAllowed, resolveHomeRoute } from "./routing.ts";
import { resolveNextCoachAction } from "./next-action.ts";
import { DEV_ENTRY_ACTIONS, DEV_PENDING_LIFECYCLE_STATUS, DEV_TARGET_CLIENT_ID, DEV_TARGET_WORKSPACE_ID } from "./dev-actions.ts";
import { createInitialState } from "../state.ts";
import {
  CLIENT_PROFILE_DEMO,
  CLIENT_PROFILE_JORDAN,
  COACH_PROFILE_ALEX,
  COACH_PROFILE_PRIYA,
  COACH_PROFILE_TEAGUE,
  WORKSPACE_ATLAS_ID,
  WORKSPACE_OPTIM_ID,
  resolveAssignedCoachId,
} from "../tenancy/seed.ts";
import type { ClientProfile } from "../tenancy/types";
import type { ClientAssignedProgram, ReviewRequest } from "../types";

function makeValidAssignedProgram(clientId: string, coachId: string): ClientAssignedProgram {
  const program = createEmptyClientProgram({ workspaceId: WORKSPACE_OPTIM_ID, clientId, coachId, name: "Test Program", durationWeeks: 12, nowIso: "2026-01-01T00:00:00.000Z" });
  const workout = createEmptyWorkout(WORKSPACE_OPTIM_ID, "Monday");
  workout.exercises = [{ ...createEmptyExercise(1), name: "Squat" }];
  return {
    ...program,
    status: "assigned",
    weeks: [{ weekNumber: 1, days: program.weeks[0].days.map((d) => (d.dayOfWeek === "Monday" ? { ...d, type: "training", workout } : d)) }],
  };
}

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

function makeClient(overrides: Partial<ClientProfile> = {}): ClientProfile {
  return {
    id: "client-new-1",
    workspaceId: WORKSPACE_OPTIM_ID,
    name: "Jordan Rivera",
    email: "jordan.rivera@example.com",
    goal: "",
    programWeek: 0,
    programTotalWeeks: 12,
    avatarInitials: "JR",
    previousWeightLb: 0,
    primaryCoachId: COACH_PROFILE_TEAGUE.id,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------

console.log("\n1. Role-routing matrix\n");

check("classifyPathname sorts coach/client-app/public routes correctly", () => {
  assert.equal(classifyPathname("/coach"), "coach");
  assert.equal(classifyPathname("/coach/clients/abc"), "coach");
  assert.equal(classifyPathname("/today"), "client-app");
  assert.equal(classifyPathname("/training/workout"), "client-app");
  assert.equal(classifyPathname("/onboarding/client-1"), "public");
  assert.equal(classifyPathname("/invite/tok123"), "public");
  assert.equal(classifyPathname("/setup-status/client-1"), "public");
});

check("Phase 5.4A: /coach-onboarding classifies as coach area despite sitting outside /coach/*", () => {
  assert.equal(classifyPathname("/coach-onboarding"), "coach");
  assert.equal(isRouteAllowed("/coach-onboarding", "coach", null), true);
  assert.equal(isRouteAllowed("/coach-onboarding", "client", "active"), false);
});

check("A coach-capable role may stay on /coach, never on the client app", () => {
  assert.equal(isRouteAllowed("/coach", "workspace_owner", null), true);
  assert.equal(isRouteAllowed("/coach/clients", "coach", null), true);
  assert.equal(isRouteAllowed("/today", "workspace_owner", null), false);
});

check("A client may only stay on the client app while genuinely active", () => {
  assert.equal(isRouteAllowed("/today", "client", "active"), true);
  assert.equal(isRouteAllowed("/today", "client", "onboarding"), false);
  assert.equal(isRouteAllowed("/today", "client", "paused"), false);
  assert.equal(isRouteAllowed("/coach", "client", "active"), false);
});

check("resolveHomeRoute sends every coach-capable role to /coach", () => {
  assert.equal(resolveHomeRoute("coach", null, "client-1"), "/coach");
  assert.equal(resolveHomeRoute("workspace_owner", null, null), "/coach");
  assert.equal(resolveHomeRoute("platform_admin", "active", "client-1"), "/coach");
});

check("resolveHomeRoute routes a client by lifecycle: active -> /today, pre-active -> onboarding/setup-status", () => {
  assert.equal(resolveHomeRoute("client", "active", "client-1"), "/today");
  assert.equal(resolveHomeRoute("client", "invited", "client-1"), "/onboarding/client-1");
  assert.equal(resolveHomeRoute("client", "onboarding", "client-1"), "/onboarding/client-1");
  assert.equal(resolveHomeRoute("client", "coach_setup", "client-1"), "/setup-status/client-1");
  assert.equal(resolveHomeRoute("client", "ready_to_activate", "client-1"), "/setup-status/client-1");
  assert.equal(resolveHomeRoute("client", "paused", "client-1"), "/setup-status/client-1");
  assert.equal(resolveHomeRoute("client", "completed", "client-1"), "/setup-status/client-1");
});

console.log("\n2. Client lifecycle transitions\n");

check("CREATE_CLIENT starts a new client at 'invited' with a real invitation", () => {
  const client = makeClient();
  const nowIso = "2026-01-01T00:00:00.000Z";
  const state = platformReducer(createInitialPlatformState(), {
    type: "CREATE_CLIENT",
    workspaceId: WORKSPACE_OPTIM_ID,
    client,
    intendedStartDateIso: "2026-01-15",
    intendedDurationWeeks: 12,
    intendedWeeklyCheckIn: true,
    nowIso,
  });
  assert.equal(getClientLifecycle(state, client.id), "invited");
  const invitation = getInvitationForClient(state, client.id);
  assert.ok(invitation);
  assert.equal(invitation!.delivery, "local_link_only");
  assert.equal(invitation!.acceptedAtIso, undefined);
  assert.equal(getIntendedProgram(state, client.id)?.intendedWeeklyCheckIn, true);
});

check("ACCEPT_INVITATION moves an invited client to 'onboarding' and marks the invitation opened", () => {
  const client = makeClient();
  let state = platformReducer(createInitialPlatformState(), {
    type: "CREATE_CLIENT",
    workspaceId: WORKSPACE_OPTIM_ID,
    client,
    intendedStartDateIso: "2026-01-15",
    intendedDurationWeeks: 12,
    intendedWeeklyCheckIn: false,
    nowIso: "2026-01-01T00:00:00.000Z",
  });
  const token = getInvitationForClient(state, client.id)!.token;
  state = platformReducer(state, { type: "ACCEPT_INVITATION", token, nowIso: "2026-01-02T00:00:00.000Z" });
  assert.equal(getClientLifecycle(state, client.id), "onboarding");
  assert.equal(getInvitationForClient(state, client.id)?.acceptedAtIso, "2026-01-02T00:00:00.000Z");
});

check("SAVE_ONBOARDING_STEP never regresses a client the coach already moved past onboarding", () => {
  const client = makeClient();
  let state = platformReducer(createInitialPlatformState(), {
    type: "CREATE_CLIENT",
    workspaceId: WORKSPACE_OPTIM_ID,
    client,
    intendedStartDateIso: "2026-01-15",
    intendedDurationWeeks: 12,
    intendedWeeklyCheckIn: false,
    nowIso: "2026-01-01T00:00:00.000Z",
  });
  state = platformReducer(state, {
    type: "SET_CLIENT_LIFECYCLE",
    clientId: client.id,
    workspaceId: WORKSPACE_OPTIM_ID,
    status: "paused",
    nowIso: "2026-01-03T00:00:00.000Z",
  });
  state = platformReducer(state, {
    type: "SAVE_ONBOARDING_STEP",
    clientId: client.id,
    workspaceId: WORKSPACE_OPTIM_ID,
    stepId: "basics",
    answers: { fullName: "Jordan" },
    nextStepIndex: 1,
    nowIso: "2026-01-04T00:00:00.000Z",
  });
  assert.equal(getClientLifecycle(state, client.id), "paused", "a routine step-save must never un-pause a client");
});

check("COMPLETE_ONBOARDING moves the client to 'coach_setup' and stamps completedAtIso", () => {
  const client = makeClient();
  let state = platformReducer(createInitialPlatformState(), {
    type: "CREATE_CLIENT",
    workspaceId: WORKSPACE_OPTIM_ID,
    client,
    intendedStartDateIso: "2026-01-15",
    intendedDurationWeeks: 12,
    intendedWeeklyCheckIn: false,
    nowIso: "2026-01-01T00:00:00.000Z",
  });
  state = platformReducer(state, {
    type: "SAVE_ONBOARDING_STEP",
    clientId: client.id,
    workspaceId: WORKSPACE_OPTIM_ID,
    stepId: "basics",
    answers: { fullName: "Jordan" },
    nextStepIndex: 1,
    nowIso: "2026-01-02T00:00:00.000Z",
  });
  state = platformReducer(state, { type: "COMPLETE_ONBOARDING", clientId: client.id, workspaceId: WORKSPACE_OPTIM_ID, nowIso: "2026-01-05T00:00:00.000Z" });
  assert.equal(getClientLifecycle(state, client.id), "coach_setup");
  assert.equal(getOnboardingProgress(state, client.id)?.completedAtIso, "2026-01-05T00:00:00.000Z");
});

console.log("\n3. Invitation creation and persistence\n");

check("Invitation tokens are unique per created client", () => {
  const a = generateInvitationToken();
  const b = generateInvitationToken();
  assert.notEqual(a, b);
});

check("A created invitation is resolvable by token and survives a migratePlatformState round-trip", () => {
  const client = makeClient();
  const state = platformReducer(createInitialPlatformState(), {
    type: "CREATE_CLIENT",
    workspaceId: WORKSPACE_OPTIM_ID,
    client,
    intendedStartDateIso: "2026-01-15",
    intendedDurationWeeks: 12,
    intendedWeeklyCheckIn: false,
    nowIso: "2026-01-01T00:00:00.000Z",
  });
  const token = getInvitationForClient(state, client.id)!.token;

  const roundTripped = migratePlatformState(JSON.parse(JSON.stringify(state)));
  assert.ok(roundTripped);
  assert.equal(getInvitationByToken(roundTripped!, token)?.clientId, client.id);
});

console.log("\n4. Onboarding save/resume/completion\n");

check("Onboarding progress accumulates answers across steps without discarding earlier ones", () => {
  const client = makeClient();
  let state = platformReducer(createInitialPlatformState(), {
    type: "CREATE_CLIENT",
    workspaceId: WORKSPACE_OPTIM_ID,
    client,
    intendedStartDateIso: "2026-01-15",
    intendedDurationWeeks: 12,
    intendedWeeklyCheckIn: false,
    nowIso: "2026-01-01T00:00:00.000Z",
  });
  state = platformReducer(state, {
    type: "SAVE_ONBOARDING_STEP",
    clientId: client.id,
    workspaceId: WORKSPACE_OPTIM_ID,
    stepId: "basics",
    answers: { fullName: "Jordan", age: 29 },
    nextStepIndex: 1,
    nowIso: "2026-01-02T00:00:00.000Z",
  });
  state = platformReducer(state, {
    type: "SAVE_ONBOARDING_STEP",
    clientId: client.id,
    workspaceId: WORKSPACE_OPTIM_ID,
    stepId: "goals",
    answers: { primaryGoal: "build_muscle" },
    nextStepIndex: 2,
    nowIso: "2026-01-02T00:05:00.000Z",
  });
  const progress = getOnboardingProgress(state, client.id);
  assert.equal(progress?.currentStepIndex, 2);
  assert.equal(progress?.answers.basics?.fullName, "Jordan");
  assert.equal(progress?.answers.goals?.primaryGoal, "build_muscle");
});

check("A resumed session reads back the exact persisted step index and answers", () => {
  const client = makeClient();
  let state = platformReducer(createInitialPlatformState(), {
    type: "CREATE_CLIENT",
    workspaceId: WORKSPACE_OPTIM_ID,
    client,
    intendedStartDateIso: "2026-01-15",
    intendedDurationWeeks: 12,
    intendedWeeklyCheckIn: false,
    nowIso: "2026-01-01T00:00:00.000Z",
  });
  state = platformReducer(state, {
    type: "SAVE_ONBOARDING_STEP",
    clientId: client.id,
    workspaceId: WORKSPACE_OPTIM_ID,
    stepId: "training_background",
    answers: { experienceLevel: "some", daysPerWeek: 4 },
    nextStepIndex: 3,
    nowIso: "2026-01-02T00:00:00.000Z",
  });
  // Simulate a reload: serialize, migrate, and read back exactly what a
  // freshly-mounted OnboardingWizard would resume from.
  const reloaded = migratePlatformState(JSON.parse(JSON.stringify(state)));
  const progress = getOnboardingProgress(reloaded!, client.id);
  assert.equal(progress?.currentStepIndex, 3);
  assert.equal(progress?.answers.training_background?.daysPerWeek, 4);
});

console.log("\n5. Workspace isolation and assigned-coach resolution\n");

check("getClientsForCoach never returns a client assigned to a different coach", () => {
  const state = createInitialPlatformState();
  const alexClients = getClientsForCoach(state, WORKSPACE_OPTIM_ID, COACH_PROFILE_ALEX.id);
  assert.ok(alexClients.every((c) => resolveAssignedCoachId(c.id) === COACH_PROFILE_ALEX.id));
  assert.ok(!alexClients.some((c) => c.id === CLIENT_PROFILE_DEMO.id), "Teague's client must never appear in Alex's roster");
});

check("getClientsForCoach never returns a client from a different workspace", () => {
  const state = createInitialPlatformState();
  const priyaClients = getClientsForCoach(state, WORKSPACE_ATLAS_ID, COACH_PROFILE_PRIYA.id);
  assert.ok(priyaClients.every((c) => c.workspaceId === WORKSPACE_ATLAS_ID));
  assert.equal(priyaClients.some((c) => c.id === CLIENT_PROFILE_JORDAN.id), true);
});

check("A newly coach-created client resolves through the same real assignedCoachId join, not a hardcoded id", () => {
  const client = makeClient({ primaryCoachId: COACH_PROFILE_ALEX.id });
  const state = platformReducer(createInitialPlatformState(), {
    type: "CREATE_CLIENT",
    workspaceId: WORKSPACE_OPTIM_ID,
    client,
    intendedStartDateIso: "2026-01-15",
    intendedDurationWeeks: 12,
    intendedWeeklyCheckIn: false,
    nowIso: "2026-01-01T00:00:00.000Z",
  });
  const alexRoster = getClientsForCoach(state, WORKSPACE_OPTIM_ID, COACH_PROFILE_ALEX.id);
  assert.ok(alexRoster.some((c) => c.id === client.id));
  const teagueRoster = getClientsForCoach(state, WORKSPACE_OPTIM_ID, COACH_PROFILE_TEAGUE.id);
  assert.ok(!teagueRoster.some((c) => c.id === client.id));
});

check("getAllClientProfiles includes both the seed roster and coach-created clients", () => {
  const client = makeClient();
  const state = platformReducer(createInitialPlatformState(), {
    type: "CREATE_CLIENT",
    workspaceId: WORKSPACE_OPTIM_ID,
    client,
    intendedStartDateIso: "2026-01-15",
    intendedDurationWeeks: 12,
    intendedWeeklyCheckIn: false,
    nowIso: "2026-01-01T00:00:00.000Z",
  });
  const all = getAllClientProfiles(state);
  assert.ok(all.some((c) => c.id === CLIENT_PROFILE_DEMO.id));
  assert.ok(all.some((c) => c.id === client.id));
});

console.log("\n6. Activation readiness and blocking\n");

check("A live, already-real client (the seeded demo client) passes every activation requirement", () => {
  const liveAppState = createInitialState();
  const programAssignment = resolveProgramAssignmentRef(CLIENT_PROFILE_DEMO.id, liveAppState);
  const readiness = checkActivationReadiness({
    clientId: CLIENT_PROFILE_DEMO.id,
    onboarding: {
      clientId: CLIENT_PROFILE_DEMO.id,
      workspaceId: WORKSPACE_OPTIM_ID,
      currentStepIndex: 0,
      answers: {},
      completedAtIso: liveAppState.programEnrollment.createdAtIso,
      updatedAtIso: liveAppState.programEnrollment.createdAtIso,
    },
    programAssignment,
    intendedProgram: null,
    assignedCoachId: resolveAssignedCoachId(CLIENT_PROFILE_DEMO.id),
    nutritionConfigured: true,
    assignedProgram: makeValidAssignedProgram(CLIENT_PROFILE_DEMO.id, resolveAssignedCoachId(CLIENT_PROFILE_DEMO.id)),
    healthReview: null,
  });
  assert.equal(readiness.ready, true);
  assert.ok(readiness.requirements.every((r) => r.met));
});

check("A newly created client without a program assignment is blocked with the exact, named reason", () => {
  const client = makeClient();
  const readiness = checkActivationReadiness({
    clientId: client.id,
    onboarding: {
      clientId: client.id,
      workspaceId: WORKSPACE_OPTIM_ID,
      currentStepIndex: 6,
      answers: {},
      completedAtIso: "2026-01-05T00:00:00.000Z",
      updatedAtIso: "2026-01-05T00:00:00.000Z",
    },
    programAssignment: null,
    intendedProgram: { clientId: client.id, workspaceId: WORKSPACE_OPTIM_ID, intendedStartDateIso: "2026-01-15", intendedDurationWeeks: 12, intendedWeeklyCheckIn: true },
    assignedCoachId: COACH_PROFILE_TEAGUE.id,
    nutritionConfigured: false,
    assignedProgram: null,
    healthReview: null,
  });
  assert.equal(readiness.ready, false);
  const programReq = readiness.requirements.find((r) => r.id === "week1_program_assigned");
  assert.equal(programReq?.met, false);
  assert.ok(programReq?.reason && programReq.reason.length > 0);
  // Onboarding and start date are independently satisfied even though
  // program assignment is the one real gap — never a blanket "not ready."
  assert.equal(readiness.requirements.find((r) => r.id === "onboarding_complete")?.met, true);
  assert.equal(readiness.requirements.find((r) => r.id === "start_date_exists")?.met, true);
});

check("A client with no onboarding at all is blocked on that requirement specifically", () => {
  const readiness = checkActivationReadiness({
    clientId: "client-x",
    onboarding: null,
    programAssignment: null,
    intendedProgram: null,
    assignedCoachId: null,
    nutritionConfigured: false,
    assignedProgram: null,
    healthReview: null,
  });
  assert.equal(readiness.ready, false);
  assert.equal(readiness.requirements.find((r) => r.id === "onboarding_complete")?.met, false);
  assert.equal(readiness.requirements.find((r) => r.id === "assigned_coach_exists")?.met, false);
});

function readinessInputWith(assignedProgram: ClientAssignedProgram | null) {
  return {
    clientId: "client-week1-test",
    onboarding: {
      clientId: "client-week1-test",
      workspaceId: WORKSPACE_OPTIM_ID,
      currentStepIndex: 6,
      answers: {},
      completedAtIso: "2026-01-05T00:00:00.000Z",
      updatedAtIso: "2026-01-05T00:00:00.000Z",
    },
    programAssignment: null,
    intendedProgram: { clientId: "client-week1-test", workspaceId: WORKSPACE_OPTIM_ID, intendedStartDateIso: "2026-01-15", intendedDurationWeeks: 12, intendedWeeklyCheckIn: true },
    assignedCoachId: COACH_PROFILE_TEAGUE.id,
    nutritionConfigured: true,
    assignedProgram,
    healthReview: null,
  };
}

check("week1_program_assigned is unmet when no program has been assigned at all", () => {
  const readiness = checkActivationReadiness(readinessInputWith(null));
  assert.equal(readiness.requirements.find((r) => r.id === "week1_program_assigned")?.met, false);
});

check("week1_program_assigned is unmet for a draft program, even with a fully valid Week 1", () => {
  const draft = { ...makeValidAssignedProgram("client-week1-test", COACH_PROFILE_TEAGUE.id), status: "draft" as const };
  const readiness = checkActivationReadiness(readinessInputWith(draft));
  assert.equal(readiness.requirements.find((r) => r.id === "week1_program_assigned")?.met, false);
});

check("week1_program_assigned is unmet when a training day has no workout authored yet", () => {
  const program = makeValidAssignedProgram("client-week1-test", COACH_PROFILE_TEAGUE.id);
  const incomplete = { ...program, weeks: [{ weekNumber: 1, days: program.weeks[0].days.map((d) => (d.dayOfWeek === "Tuesday" ? { ...d, type: "training" as const } : d)) }] };
  const readiness = checkActivationReadiness(readinessInputWith(incomplete));
  assert.equal(readiness.requirements.find((r) => r.id === "week1_program_assigned")?.met, false);
});

check("week1_program_assigned is met for an assigned program with a genuinely usable Week 1", () => {
  const readiness = checkActivationReadiness(readinessInputWith(makeValidAssignedProgram("client-week1-test", COACH_PROFILE_TEAGUE.id)));
  assert.equal(readiness.requirements.find((r) => r.id === "week1_program_assigned")?.met, true);
  assert.equal(readiness.ready, true);
});

console.log("\n7. Coach attention queue — correct routing and safety-first priority\n");

function reviewRequest(overrides: Partial<ReviewRequest>): ReviewRequest {
  return {
    id: "review-1",
    workspaceId: WORKSPACE_OPTIM_ID,
    clientId: CLIENT_PROFILE_DEMO.id,
    assignedCoachId: COACH_PROFILE_TEAGUE.id,
    kind: "pain-report",
    severity: "high",
    createdAtIso: "2026-01-01T00:00:00.000Z",
    updatedAtIso: "2026-01-01T00:00:00.000Z",
    summary: "Pain reported via chat",
    status: "needs_review",
    resolved: false,
    ...overrides,
  };
}

check("A pain report created for the demo client appears in Teague's attention queue (Teague is the assigned coach)", () => {
  const queue = buildAttentionQueue({
    workspaceId: WORKSPACE_OPTIM_ID,
    coachId: COACH_PROFILE_TEAGUE.id,
    reviewRequests: [reviewRequest({})],
    clients: [CLIENT_PROFILE_DEMO],
  });
  assert.equal(queue.length, 1);
  assert.equal(queue[0].clientId, CLIENT_PROFILE_DEMO.id);
  assert.equal(queue[0].kind, "pain-report");
});

check("The same pain report never appears in a different coach's queue", () => {
  const queue = buildAttentionQueue({
    workspaceId: WORKSPACE_OPTIM_ID,
    coachId: COACH_PROFILE_ALEX.id,
    reviewRequests: [reviewRequest({})],
    clients: [CLIENT_PROFILE_DEMO],
  });
  assert.equal(queue.length, 0);
});

check("A resolved review request never appears in the queue", () => {
  const queue = buildAttentionQueue({
    workspaceId: WORKSPACE_OPTIM_ID,
    coachId: COACH_PROFILE_TEAGUE.id,
    reviewRequests: [reviewRequest({ status: "resolved", resolved: true })],
    clients: [CLIENT_PROFILE_DEMO],
  });
  assert.equal(queue.length, 0);
});

check("A review request from a different workspace never leaks into this workspace's queue", () => {
  const queue = buildAttentionQueue({
    workspaceId: WORKSPACE_OPTIM_ID,
    coachId: COACH_PROFILE_TEAGUE.id,
    reviewRequests: [reviewRequest({ workspaceId: WORKSPACE_ATLAS_ID })],
    clients: [CLIENT_PROFILE_DEMO],
  });
  assert.equal(queue.length, 0);
});

check("Pain/injury always sorts before a program-change request, regardless of recency", () => {
  const queue = buildAttentionQueue({
    workspaceId: WORKSPACE_OPTIM_ID,
    coachId: COACH_PROFILE_TEAGUE.id,
    reviewRequests: [
      reviewRequest({ id: "r-program", kind: "program-change-request", createdAtIso: "2026-01-05T00:00:00.000Z" }),
      reviewRequest({ id: "r-pain", kind: "pain-report", createdAtIso: "2026-01-01T00:00:00.000Z" }),
    ],
    clients: [CLIENT_PROFILE_DEMO],
  });
  assert.equal(queue[0].kind, "pain-report", "pain must sort first even though it's the older item");
});

console.log("\n8. Next-coach-action derivation\n");

check("An unresolved attention item always outranks lifecycle-driven guidance", () => {
  assert.equal(resolveNextCoachAction("active", true, true), "Review flagged item");
});

check("A ready-to-activate client with nothing flagged prompts activation", () => {
  assert.equal(resolveNextCoachAction("ready_to_activate", false, true), "Activate client");
});

console.log("\n9. Active-client routing to /today\n");

check("An active client landing on any non-client-app route is sent to /today, and may freely stay on one", () => {
  assert.equal(resolveHomeRoute("client", "active", CLIENT_PROFILE_DEMO.id), "/today");
  assert.equal(isRouteAllowed("/chat", "client", "active"), true);
  assert.equal(isRouteAllowed("/nutrition", "client", "active"), true);
});

console.log("\n10. Platform-state persistence and migration\n");

check("A freshly created platform state migrates through unchanged (nothing to upgrade yet)", () => {
  const fresh = createInitialPlatformState();
  const migrated = migratePlatformState(JSON.parse(JSON.stringify(fresh)));
  assert.ok(migrated);
  assert.equal(migrated!.version, 7);
  assert.deepEqual(migrated, fresh);
});

check("An unrecognized/corrupt stored shape migrates to null rather than crashing", () => {
  assert.equal(migratePlatformState(null), null);
  assert.equal(migratePlatformState("garbage"), null);
  assert.equal(migratePlatformState({ version: 3, clients: [] }), null);
});

check("Phase 5.1 — a pre-existing v1 stored shape (no healthReviews array yet) migrates all the way to the current version, preserving every other field untouched", () => {
  const v1Stored = {
    version: 1,
    clients: [makeClient({ id: "client-legacy-v1" })],
    lifecycles: [{ clientId: "client-legacy-v1", workspaceId: WORKSPACE_OPTIM_ID, status: "active", updatedAtIso: "2026-01-01T00:00:00.000Z" }],
    invitations: [],
    onboarding: [
      {
        clientId: "client-legacy-v1",
        workspaceId: WORKSPACE_OPTIM_ID,
        currentStepIndex: 6,
        answers: { basics: { fullName: "Legacy Client", heightInches: 70 }, health_readiness: { hasInjuryHistory: false } },
        completedAtIso: "2026-01-01T00:00:00.000Z",
        updatedAtIso: "2026-01-01T00:00:00.000Z",
      },
    ],
    intendedPrograms: [],
  };
  const migrated = migratePlatformState(JSON.parse(JSON.stringify(v1Stored)));
  assert.ok(migrated);
  assert.equal(migrated!.version, 7);
  assert.deepEqual(migrated!.healthReviews, []);
  assert.deepEqual(migrated!.programTemplates, []);
  assert.deepEqual(migrated!.mealRecommendations, []);
  assert.deepEqual(migrated!.aiAuthoritySettings, []);
  // Phase 5.4A — added at the v5->v6 step (see platform-store.ts's
  // migratePlatformState): a pre-existing coach's PlatformState migrates
  // with these all honestly empty, never backfilled/inferred.
  assert.deepEqual(migrated!.coachOperatingModels, []);
  assert.deepEqual(migrated!.coachOnboardingProgress, []);
  assert.deepEqual(migrated!.activationGenerations, []);
  assert.deepEqual(migrated!.communicationPolicies, []);
  // Phase 5.4B — added at the v6->v7 step.
  assert.deepEqual(migrated!.dailyBriefings, []);
  assert.deepEqual(migrated!.briefingSettings, []);
  assert.equal(migrated!.clients.length, 1);
  assert.equal(migrated!.onboarding[0]!.answers.basics!.fullName, "Legacy Client");
  assert.equal(migrated!.onboarding[0]!.answers.health_readiness!.hasInjuryHistory, false);
});

console.log("\n11. /dev console actions and route destinations\n");

check("/dev exposes exactly four seeded-perspective entry actions (three client-demo actions plus the Phase 5.2 second-coach QA entry), targeting client-demo in the OPTIM workspace", () => {
  assert.equal(DEV_ENTRY_ACTIONS.length, 4);
  assert.equal(DEV_TARGET_CLIENT_ID, CLIENT_PROFILE_DEMO.id);
  assert.equal(DEV_TARGET_WORKSPACE_ID, WORKSPACE_OPTIM_ID);
});

check("Enter as Alex (second coach) targets a real, different coach profile in the same workspace, never Teague", () => {
  const action = DEV_ENTRY_ACTIONS.find((a) => a.id === "enter-second-coach")!;
  assert.equal(action.perspective, "coach");
  assert.ok(action.coachUserId);
  assert.notEqual(action.coachUserId, "user-teague");
});

check("Enter as Coach sets the coach perspective and touches no lifecycle, routing to /coach", () => {
  const action = DEV_ENTRY_ACTIONS.find((a) => a.id === "enter-coach")!;
  assert.equal(action.perspective, "coach");
  assert.equal(action.lifecycleStatus, null);
  assert.equal(action.route, "/coach");
});

check("Enter as Active Client sets the client perspective and an active lifecycle, routing to /today", () => {
  const action = DEV_ENTRY_ACTIONS.find((a) => a.id === "enter-active-client")!;
  assert.equal(action.perspective, "client");
  assert.equal(action.lifecycleStatus, "active");
  assert.equal(action.route, "/today");
});

check("Enter as Pending Client sets the client perspective and the same pending status the existing dev switcher uses, routing to setup-status", () => {
  const action = DEV_ENTRY_ACTIONS.find((a) => a.id === "enter-pending-client")!;
  assert.equal(action.perspective, "client");
  assert.equal(action.lifecycleStatus, DEV_PENDING_LIFECYCLE_STATUS);
  assert.equal(action.lifecycleStatus, "ready_to_activate");
  assert.equal(action.route, `/setup-status/${DEV_TARGET_CLIENT_ID}`);
});

check("Every /dev entry action's route agrees with what resolveHomeRoute would independently decide for its own perspective/lifecycle", () => {
  for (const action of DEV_ENTRY_ACTIONS) {
    const role = action.perspective === "coach" ? "workspace_owner" : "client";
    const clientId = action.perspective === "coach" ? null : DEV_TARGET_CLIENT_ID;
    assert.equal(resolveHomeRoute(role, action.lifecycleStatus, clientId), action.route);
  }
});

check("Applying the Enter as Pending Client action's lifecycle status through the real reducer actually lands the client on setup-status, not /today", () => {
  let state = createInitialPlatformState();
  const action = DEV_ENTRY_ACTIONS.find((a) => a.id === "enter-pending-client")!;
  state = platformReducer(state, {
    type: "SET_CLIENT_LIFECYCLE",
    clientId: DEV_TARGET_CLIENT_ID,
    workspaceId: DEV_TARGET_WORKSPACE_ID,
    status: action.lifecycleStatus!,
    nowIso: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(getClientLifecycle(state, DEV_TARGET_CLIENT_ID), "ready_to_activate");
  assert.equal(isRouteAllowed(action.route, "client", getClientLifecycle(state, DEV_TARGET_CLIENT_ID)), true);
  assert.equal(isRouteAllowed("/today", "client", getClientLifecycle(state, DEV_TARGET_CLIENT_ID)), false);
});

check("/dev itself is never gated by role or lifecycle — it classifies as public like /invite, /onboarding, and /setup-status", () => {
  assert.equal(classifyPathname("/dev"), "public");
  assert.equal(isRouteAllowed("/dev", "client", "coach_setup"), true);
  assert.equal(isRouteAllowed("/dev", "client", null), true);
  assert.equal(isRouteAllowed("/dev", "workspace_owner", null), true);
});

check("Reset Demo State's canonical targets are the same fresh AppState/PlatformState every other hydration path already uses", () => {
  const freshApp = createInitialState();
  assert.equal(freshApp.chatMessages.length, 0);
  assert.equal(freshApp.reviewRequests.length, 0);
  assert.equal(freshApp.clientId, DEV_TARGET_CLIENT_ID);

  const freshPlatform = createInitialPlatformState();
  assert.deepEqual(freshPlatform, {
    version: 7,
    clients: [],
    lifecycles: [],
    invitations: [],
    onboarding: [],
    intendedPrograms: [],
    healthReviews: [],
    programTemplates: [],
    mealRecommendations: [],
    aiAuthoritySettings: [],
    coachOperatingModels: [],
    coachOnboardingProgress: [],
    activationGenerations: [],
    communicationPolicies: [],
    dailyBriefings: [],
    briefingSettings: [],
  });
});

check("A full create -> accept -> onboard -> complete -> activate lifecycle survives a full JSON round-trip at every step", () => {
  const client = makeClient({ id: "client-full-loop" });
  let state: PlatformState = createInitialPlatformState();
  state = platformReducer(state, {
    type: "CREATE_CLIENT",
    workspaceId: WORKSPACE_OPTIM_ID,
    client,
    intendedStartDateIso: "2026-01-15",
    intendedDurationWeeks: 12,
    intendedWeeklyCheckIn: true,
    nowIso: "2026-01-01T00:00:00.000Z",
  });
  state = migratePlatformState(JSON.parse(JSON.stringify(state)))!;

  const token = getInvitationForClient(state, client.id)!.token;
  state = platformReducer(state, { type: "ACCEPT_INVITATION", token, nowIso: "2026-01-02T00:00:00.000Z" });
  state = migratePlatformState(JSON.parse(JSON.stringify(state)))!;
  assert.equal(getClientLifecycle(state, client.id), "onboarding");

  state = platformReducer(state, {
    type: "SAVE_ONBOARDING_STEP",
    clientId: client.id,
    workspaceId: WORKSPACE_OPTIM_ID,
    stepId: "basics",
    answers: { fullName: "Jordan" },
    nextStepIndex: 1,
    nowIso: "2026-01-02T00:01:00.000Z",
  });
  state = platformReducer(state, { type: "COMPLETE_ONBOARDING", clientId: client.id, workspaceId: WORKSPACE_OPTIM_ID, nowIso: "2026-01-03T00:00:00.000Z" });
  state = migratePlatformState(JSON.parse(JSON.stringify(state)))!;
  assert.equal(getClientLifecycle(state, client.id), "coach_setup");

  state = platformReducer(state, { type: "SET_CLIENT_LIFECYCLE", clientId: client.id, workspaceId: WORKSPACE_OPTIM_ID, status: "active", nowIso: "2026-01-10T00:00:00.000Z" });
  state = migratePlatformState(JSON.parse(JSON.stringify(state)))!;
  assert.equal(getClientLifecycle(state, client.id), "active");
  assert.equal(resolveHomeRoute("client", getClientLifecycle(state, client.id), client.id), "/today");
});

// ---------------------------------------------------------------------------

console.log("\n12. Phase 5.4A — cross-coach client isolation (getClientProfileForCoach)\n");

check("A coach can resolve their own real client", () => {
  const state = createInitialPlatformState();
  assert.equal(getClientProfileForCoach(state, CLIENT_PROFILE_DEMO.id, COACH_PROFILE_TEAGUE.id)?.id, CLIENT_PROFILE_DEMO.id);
});

check("A coach can never resolve another coach's client by guessing/knowing its id — treated identically to 'no client found'", () => {
  const state = createInitialPlatformState();
  // CLIENT_PROFILE_DEMO's primaryCoachId is Teague — Alex must get null, not
  // Teague's real client data, even though the id is perfectly valid.
  assert.equal(getClientProfileForCoach(state, CLIENT_PROFILE_DEMO.id, COACH_PROFILE_ALEX.id), null);
});

check("The same isolation holds for a coach-created (non-seed) client, not just the seed roster", () => {
  let state = createInitialPlatformState();
  const client: ClientProfile = {
    id: "client-isolation-test",
    workspaceId: WORKSPACE_OPTIM_ID,
    name: "Isolation Test Client",
    goal: "build_muscle",
    programWeek: 1,
    programTotalWeeks: 12,
    avatarInitials: "IT",
    previousWeightLb: 150,
    primaryCoachId: COACH_PROFILE_TEAGUE.id,
  };
  state = { ...state, clients: [...state.clients, client] };
  assert.equal(getClientProfileForCoach(state, client.id, COACH_PROFILE_TEAGUE.id)?.id, client.id);
  assert.equal(getClientProfileForCoach(state, client.id, COACH_PROFILE_ALEX.id), null);
});

check("A nonexistent client id resolves to null for every coach, exactly like a real-but-foreign client id", () => {
  const state = createInitialPlatformState();
  assert.equal(getClientProfileForCoach(state, "client-does-not-exist", COACH_PROFILE_TEAGUE.id), null);
});

console.log("\n13. Phase 5.4A corrective pass — new-coach first-run gate (isGenuinelyNewCoach)\n");

check("A coach with zero clients and not_started calibration is genuinely new", () => {
  assert.equal(isGenuinelyNewCoach({ calibrationStatus: "not_started", clientCount: 0 }), true);
});

check("A coach with any real client is never treated as genuinely new, regardless of calibration status", () => {
  assert.equal(isGenuinelyNewCoach({ calibrationStatus: "not_started", clientCount: 1 }), false);
  assert.equal(isGenuinelyNewCoach({ calibrationStatus: "in_progress", clientCount: 3 }), false);
});

check("A coach with zero clients but who has already started/confirmed calibration is not re-gated", () => {
  assert.equal(isGenuinelyNewCoach({ calibrationStatus: "in_progress", clientCount: 0 }), false);
  assert.equal(isGenuinelyNewCoach({ calibrationStatus: "calibrated", clientCount: 0 }), false);
  assert.equal(isGenuinelyNewCoach({ calibrationStatus: "inferred_unconfirmed", clientCount: 0 }), false);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
