"use client";

import { useEffect, useState } from "react";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { usePlatformState } from "@/hooks/use-platform-state";
import {
  getAllClientProfiles,
  getBriefingSettings,
  getBriefingsForCoach,
  getClientLifecycle,
  getClientProfileForCoach,
  getClientsForCoach,
  getDailyBriefing,
  getHealthReview,
  getIntendedProgram,
  getInvitationForClient,
  getOnboardingProgress,
  resolveProgramAssignmentRef,
} from "@/lib/coach/repository";
import { resolveEffectiveBriefingAutomation } from "@/lib/coach/daily-briefing";
import { loadClientAppState, subscribeToClientAppStateChanges } from "@/lib/tenancy/client-state-store";
import { buildAttentionQueue, buildReviewQueueItems } from "@/lib/coach/attention-queue";
import { checkActivationReadiness } from "@/lib/coach/activation";
import { RESOLVED_HEALTH_REVIEW_STATUSES } from "@/lib/coach/types";
import type { AppState } from "@/lib/state";
import type { ClientProfileId } from "@/lib/tenancy/types";

/**
 * Every coach screen's one data source — joins the platform store's
 * roster/lifecycle/onboarding/invitations (see lib/coach/repository.ts)
 * with every one of THOSE clients' own real, independently-persisted
 * AppState (see lib/tenancy/client-state-store.ts) — never just "whichever
 * client this browser currently acts as." Reading every client's state
 * directly by id (rather than through usePrototypeState()'s own live
 * reducer, which now follows whatever client perspective is currently
 * switched to — see hooks/use-prototype-state.tsx) is what lets the coach
 * workspace show correct data for every client at once, including one the
 * coach has never "opened as" in this browser. Scoped to the ACTING
 * coach's own workspace and assignment: a coach never sees another
 * workspace's clients or review requests, and never another coach's — see
 * buildAttentionQueue/getClientsForCoach's own docs for the isolation rule
 * this applies.
 */
export function useCoachWorkspace() {
  const { activeContext } = usePrototypeState();
  const { platform, dispatch: dispatchPlatform, isPlatformHydrated } = usePlatformState();

  // Any client's AppState can be written directly from outside this hook's
  // own reactive state (a coach resolving a review, or completing setup —
  // see lib/tenancy/client-state-store.ts's module doc) — re-render on that
  // signal so every client's data below is re-read fresh instead of
  // silently going stale until something unrelated happens to re-render.
  const [, setAppStateChangeTick] = useState(0);
  useEffect(() => subscribeToClientAppStateChanges(() => setAppStateChangeTick((n) => n + 1)), []);

  const workspaceId = activeContext.workspace.id;
  const coachId = activeContext.coachProfile?.id ?? null;

  const allClients = getAllClientProfiles(platform);
  const clients = coachId ? getClientsForCoach(platform, workspaceId, coachId) : [];

  // Every client's own persisted daily state, read directly and
  // independently of whichever client this browser currently acts as —
  // the one place every coach screen that needs "does client X have real
  // data yet" builds this map, so it's never computed two different ways
  // in two different screens (see lib/coach/roster.ts, this file's
  // useCoachClientView below, and the messages/reviews pages).
  const clientAppStates = new Map<ClientProfileId, AppState | null>();
  for (const client of allClients) {
    clientAppStates.set(client.id, loadClientAppState(client.id));
  }

  const allReviewRequests = allClients.flatMap((c) => clientAppStates.get(c.id)?.reviewRequests ?? []);
  // Only ever an unresolved health review is a "needs you" item — a
  // resolved one (professional guidance confirmed / reviewed by coach)
  // never resurfaces here, matching every other attention-queue item's
  // "unresolved only" rule. Scoped to THIS coach's own clients before it
  // ever reaches buildAttentionQueue, the same isolation discipline every
  // other input to it already follows — a HealthReviewRecord has no
  // assignedCoachId of its own to filter on the way a ReviewRequest does.
  const thisCoachsClientIds = new Set(clients.map((c) => c.id));
  const unresolvedHealthReviews = platform.healthReviews.filter(
    (r) => !RESOLVED_HEALTH_REVIEW_STATUSES.has(r.status) && r.workspaceId === workspaceId && thisCoachsClientIds.has(r.clientId)
  );
  // Phase 5.4B completion pass — the one piece of live context
  // resolveNotificationTier needs: which clients have a workout actually
  // in progress RIGHT NOW, so a pain report only ever classifies as
  // "immediate" while it's a genuinely live situation (spec §7).
  const workoutInProgressClientIds = new Set(
    allClients.filter((c) => clientAppStates.get(c.id)?.workoutSession.status === "in-progress").map((c) => c.id)
  );
  const attentionQueue = coachId
    ? buildAttentionQueue({ workspaceId, coachId, reviewRequests: allReviewRequests, clients: allClients, healthReviews: unresolvedHealthReviews, workoutInProgressClientIds })
    : [];
  // Every status, not just unresolved — the Reviews page's Needs review /
  // In progress / Resolved tabs (see app/coach/reviews/page.tsx) need the
  // full history, while every other screen keeps using attentionQueue
  // above (unresolved-only, unchanged badge/dashboard behavior).
  const reviewQueueItems = coachId
    ? buildReviewQueueItems({ workspaceId, coachId, reviewRequests: allReviewRequests, clients: allClients, healthReviews: unresolvedHealthReviews, workoutInProgressClientIds })
    : [];

  // Phase 5.4B — every briefing this coach owns, across every client, for
  // the Command Center's Daily Briefings section (spec §2).
  const briefingSettings = coachId ? getBriefingSettings(platform, coachId, workspaceId) : null;
  const briefings = coachId ? getBriefingsForCoach(platform, coachId) : [];

  return {
    activeContext,
    platform,
    dispatchPlatform,
    isPlatformHydrated,
    workspaceId,
    coachId,
    allClients,
    clients,
    clientAppStates,
    attentionQueue,
    reviewQueueItems,
    briefingSettings,
    briefings,
  };
}

/** One client's full coach-facing view model — everything
 * app/coach/clients/[clientId]/page.tsx needs, joined once here so the page
 * component itself stays presentational. */
export function useCoachClientView(clientId: ClientProfileId) {
  const workspace = useCoachWorkspace();
  // Cross-coach isolation (Phase 5.4A) — see
  // lib/coach/repository.ts's getClientProfileForCoach. A client that
  // exists but belongs to a DIFFERENT coach resolves identically to "no
  // client found," which every caller already branches on (see
  // app/coach/clients/[clientId]/page.tsx and .../activate/page.tsx).
  const client = workspace.coachId ? getClientProfileForCoach(workspace.platform, clientId, workspace.coachId) : null;

  const lifecycle = getClientLifecycle(workspace.platform, clientId);
  const clientAppState = client ? (workspace.clientAppStates.get(clientId) ?? null) : null;
  const hasClientAppState = clientAppState !== null;
  const onboarding = client ? getOnboardingProgress(workspace.platform, clientId) : null;
  const intendedProgram = client ? getIntendedProgram(workspace.platform, clientId) : null;
  const invitation = client ? getInvitationForClient(workspace.platform, clientId) : null;
  const programAssignment = client ? resolveProgramAssignmentRef(clientId, clientAppState) : null;
  const assignedCoachId = client?.primaryCoachId ?? null;
  const healthReview = client ? getHealthReview(workspace.platform, clientId) : null;

  // A client with a real, already-live AppState predates this onboarding
  // system entirely (see lib/state.ts's "one client this prototype has ever
  // run as" convention) — they were never going to have a platform-store
  // OnboardingProgress record, and that must never block their (already
  // real) activation. This synthetic stand-in is used ONLY for the
  // readiness check below, never shown as if it were a real onboarding
  // summary — see components/coach/onboarding-summary-card.tsx, which
  // still reads the real (possibly null) `onboarding` value returned here.
  const onboardingForReadiness =
    onboarding ??
    (hasClientAppState && clientAppState
      ? {
          clientId,
          workspaceId: workspace.workspaceId,
          currentStepIndex: 0,
          answers: {},
          completedAtIso: clientAppState.programEnrollment.createdAtIso,
          updatedAtIso: clientAppState.programEnrollment.createdAtIso,
        }
      : null);

  const readiness = checkActivationReadiness({
    clientId,
    onboarding: onboardingForReadiness,
    programAssignment,
    intendedProgram,
    assignedCoachId,
    // Nutrition configuration and program assignment are both written by
    // the same coach setup save (see lib/coach/setup.ts) — a client either
    // has their own real AppState (both real) or doesn't (neither yet).
    // Kept as its own independent input rather than folded into
    // programAssignment's boolean, since it's now backed by its own real
    // field (AppState.nutritionTargets) — see lib/coach/activation.ts.
    nutritionConfigured: hasClientAppState,
    assignedProgram: clientAppState?.assignedProgram ?? null,
    healthReview,
  });
  const clientReviewRequests = clientAppState ? clientAppState.reviewRequests.filter((r) => !r.resolved) : [];
  const chatMessages = clientAppState?.chatMessages ?? [];

  // Phase 5.4B — this client's Daily Briefing for their own current local
  // date (never "today" in the coach's timezone — see AppState.dateIso's
  // doc), and the automation setting that actually governs them (per-client
  // override if one exists, else the coach's global default).
  const briefingSettings = workspace.coachId ? getBriefingSettings(workspace.platform, workspace.coachId, workspace.workspaceId) : null;
  const dailyBriefing = clientAppState ? getDailyBriefing(workspace.platform, clientId, clientAppState.dateIso) : null;
  const effectiveBriefingAutomation = briefingSettings ? resolveEffectiveBriefingAutomation(briefingSettings, clientId) : "review_first";

  return {
    ...workspace,
    client,
    lifecycle,
    clientAppState,
    hasClientAppState,
    onboarding,
    intendedProgram,
    invitation,
    programAssignment,
    readiness,
    healthReview,
    clientReviewRequests,
    chatMessages,
    briefingSettings,
    dailyBriefing,
    effectiveBriefingAutomation,
  };
}
