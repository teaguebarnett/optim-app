// Pure roster-row assembly — the one place that turns raw client/platform/
// live-state data into what components/coach/client-roster-table.tsx (and
// the Overview command center's own condensed list) actually render. Kept
// separate from those components so the exact same row shape is
// independently testable without rendering anything.

import { resolveProgramTiming, describeProgramTimingForCoach } from "../scheduling/program-timing.ts";
import { checkActivationReadiness } from "./activation.ts";
import { getClientLifecycle, getHealthReview, getIntendedProgram, getOnboardingProgress, resolveProgramAssignmentRef } from "./repository.ts";
import { resolveNextCoachAction } from "./next-action.ts";
import type { AppState } from "../state";
import type { ProgramPhase } from "../scheduling/types";
import type { ClientProfile, ClientProfileId } from "../tenancy/types";
import type { PlatformState } from "./platform-store";
import type { AttentionQueueItem, ClientLifecycleStatus } from "./types";

export interface RosterRow {
  clientId: ClientProfileId;
  name: string;
  lifecycle: ClientLifecycleStatus;
  coachName: string;
  programWeekLabel: string | null;
  /** null when there's no real program yet at all; otherwise whether this
   * client's assigned program hasn't started, is underway, or has ended —
   * "active" lifecycle + "pre_program" phase is the future-start case that
   * must never render as a bare "Week — of N" (see
   * lib/scheduling/program-timing.ts). */
  programPhase: ProgramPhase | null;
  attentionCount: number;
  lastActivityLabel: string;
  nextAction: string;
}

export interface BuildRosterRowsInput {
  clients: ClientProfile[];
  platform: PlatformState;
  /** Every listed client's own AppState, keyed by clientId — see
   * lib/tenancy/client-state-store.ts. A missing/null entry means that
   * client has no real daily state yet (never coach-setup-completed). */
  clientAppStates: Map<ClientProfileId, AppState | null>;
  attentionQueue: AttentionQueueItem[];
  coachName: string;
}

export function buildRosterRows(input: BuildRosterRowsInput): RosterRow[] {
  const attentionCountByClient = new Map<string, number>();
  for (const item of input.attentionQueue) {
    attentionCountByClient.set(item.clientId, (attentionCountByClient.get(item.clientId) ?? 0) + 1);
  }

  return input.clients.map((client) => {
    const lifecycle = getClientLifecycle(input.platform, client.id);
    const clientAppState = input.clientAppStates.get(client.id) ?? null;

    const timing = clientAppState ? resolveProgramTiming(clientAppState.programEnrollment, clientAppState.dateIso) : null;
    const programWeekLabel =
      clientAppState && timing
        ? describeProgramTimingForCoach(
            timing,
            clientAppState.programEnrollment.durationWeeks,
            new Date(`${clientAppState.programEnrollment.startDateIso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })
          )
        : null;

    const onboarding = getOnboardingProgress(input.platform, client.id);
    const lastActivityIso = clientAppState ? clientAppState.dateIso : (onboarding?.updatedAtIso ?? null);
    const lastActivityLabel = lastActivityIso
      ? new Date(lastActivityIso).toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : "No activity yet";

    const intendedProgram = getIntendedProgram(input.platform, client.id);
    const programAssignment = resolveProgramAssignmentRef(client.id, clientAppState);
    const readiness = checkActivationReadiness({
      clientId: client.id,
      onboarding,
      programAssignment,
      intendedProgram,
      assignedCoachId: client.primaryCoachId,
      nutritionConfigured: !!clientAppState,
      assignedProgram: clientAppState?.assignedProgram ?? null,
      healthReview: getHealthReview(input.platform, client.id),
    });

    const attentionCount = attentionCountByClient.get(client.id) ?? 0;
    const nextAction = resolveNextCoachAction(lifecycle, attentionCount > 0, readiness.ready);

    return {
      clientId: client.id,
      name: client.name,
      lifecycle,
      coachName: input.coachName,
      programWeekLabel,
      programPhase: timing?.phase ?? null,
      attentionCount,
      lastActivityLabel,
      nextAction,
    };
  });
}
