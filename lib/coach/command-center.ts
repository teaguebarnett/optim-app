// Phase 5.3B — pure view-model helpers for the /coach Command Center.
//
// The decision queue itself (priority order, deduplication) already exists
// and is already tested — see lib/coach/attention-queue.ts's
// buildAttentionQueue, reused here unchanged. This file adds the two other
// pieces of real, derivable state the command center's contextual rail
// needs: a roster-pulse breakdown and a truthful "upcoming work" list —
// never a fabricated calendar, wellness score, or automation count.

import type { ClientProfileId } from "../tenancy/types";
import type { ClientLifecycleStatus } from "./types";
import type { ProgramPhase } from "../scheduling/types";

export interface RosterPulseCounts {
  onTrack: number;
  watch: number;
  needsCoach: number;
  /** Phase 5.6A.4 — an "active" lifecycle client whose approved program
   * hasn't reached its own real start date yet (see
   * lib/scheduling/program-timing.ts). Deliberately excluded from onTrack:
   * a client can't be "on track" against program performance that hasn't
   * started. Excluded from the roster-pulse total the same way paused/
   * completed clients already are — see categorizeRosterStatus's own doc. */
  scheduled: number;
}

/** Lifecycle stages that represent real, in-progress coach work — not yet
 * day-to-day active, but not a decision either. "completed" and "paused"
 * are deliberately excluded from all three buckets: neither is "on track"
 * (misleading) nor "needs you right now" (it doesn't), and including them
 * would inflate the roster pulse with clients who aren't part of today's
 * real picture. */
const WATCH_STATUSES: ReadonlySet<ClientLifecycleStatus> = new Set(["invited", "onboarding", "coach_setup", "ready_to_activate"]);

/**
 * Every client lands in exactly one bucket: already in the decision queue
 * ("needs coach") takes priority over lifecycle status entirely — a client
 * mid-pipeline who ALSO has a flagged pain report is a decision, not a
 * routine pipeline fact. Never invents a category or count beyond what's
 * directly derivable from real lifecycle + queue membership.
 */
export function buildRosterPulse(
  clientIds: readonly ClientProfileId[],
  lifecycleByClientId: ReadonlyMap<ClientProfileId, ClientLifecycleStatus>,
  needsCoachClientIds: ReadonlySet<ClientProfileId>,
  /** Phase 5.6A.4 — optional so every pre-existing caller/test keeps
   * working unchanged; omitted (or a missing entry) means "no known
   * program timing," which categorizeRosterStatus treats exactly like an
   * already-started program — never a new false "scheduled" bucket for
   * data nobody actually supplied. */
  programPhaseByClientId?: ReadonlyMap<ClientProfileId, ProgramPhase | null>
): RosterPulseCounts {
  let onTrack = 0;
  let watch = 0;
  let needsCoach = 0;
  let scheduled = 0;

  for (const clientId of clientIds) {
    const status = lifecycleByClientId.get(clientId) ?? "active";
    const phase = programPhaseByClientId?.get(clientId) ?? null;
    const category = categorizeRosterStatus(needsCoachClientIds.has(clientId), status, phase);
    if (category === "needs_coach") needsCoach += 1;
    else if (category === "on_track") onTrack += 1;
    else if (category === "watch") watch += 1;
    else if (category === "scheduled") scheduled += 1;
    // "paused"/"completed" clients categorize as "other" — real, but
    // neither on-track nor a pipeline "watch" item — deliberately excluded
    // from this pulse rather than forced into a bucket that would
    // misrepresent them.
  }

  return { onTrack, watch, needsCoach, scheduled };
}

export type RosterCategory = "needs_coach" | "watch" | "on_track" | "scheduled" | "other";

/** The single-client version of buildRosterPulse's own categorization
 * logic, exposed separately so the Clients list filter (see
 * app/coach/clients/page.tsx) and the Roster Pulse bar always agree on
 * what "on track"/"watch"/"needs you"/"scheduled" mean for one specific
 * client.
 *
 * Phase 5.6A.4 — `programPhase` is the one addition: an "active" lifecycle
 * client whose approved program is still "pre_program" (hasn't reached its
 * real start date — see lib/scheduling/program-timing.ts) categorizes as
 * "scheduled", never "on_track". An open decision still outranks
 * everything else, exactly as before — a genuine coach decision is real
 * regardless of whether the client's own program has started yet. */
export function categorizeRosterStatus(hasOpenDecision: boolean, lifecycle: ClientLifecycleStatus, programPhase?: ProgramPhase | null): RosterCategory {
  if (hasOpenDecision) return "needs_coach";
  if (lifecycle === "active") return programPhase === "pre_program" ? "scheduled" : "on_track";
  if (WATCH_STATUSES.has(lifecycle)) return "watch";
  return "other";
}

export interface UpcomingWorkItem {
  clientId: ClientProfileId;
  clientName: string;
  lifecycle: ClientLifecycleStatus;
  /** True for a client who's fully set up and just waiting on the
   * activation click — surfaced first, since it's the shortest real path
   * to a client actually starting. */
  readyToActivate: boolean;
  /** Phase 5.6A.4 — set only for an "active" lifecycle client whose
   * approved program hasn't reached its real start date yet, e.g.
   * "Monday, September 14" (see lib/scheduling/program-timing.ts /
   * lib/shared/local-date.ts's formatLongDateLabel). Lets "Next up" name a
   * genuine imminent launch instead of ever claiming the pipeline is clear
   * while a scheduled start is still coming. */
  startsLabel?: string;
}

/**
 * Real upcoming coach work — every client still short of "active" (ready-
 * to-activate first, then the rest of the pipeline in the order given),
 * PLUS every "active" client whose own approved program hasn't started yet
 * (see `scheduledStartLabelByClientId`). Never a fabricated calendar entry:
 * this app has no concept of a scheduled coach appointment, so "upcoming"
 * here means "the next real thing you'll need to know about," not a
 * time-boxed event.
 */
export function buildUpcomingWork(
  clients: { id: ClientProfileId; name: string }[],
  lifecycleByClientId: ReadonlyMap<ClientProfileId, ClientLifecycleStatus>,
  /** Phase 5.6A.4 — optional so every pre-existing caller/test keeps
   * working unchanged; a missing/absent entry for an "active" client means
   * their program has already started (or there's no known timing at
   * all), so they're correctly excluded exactly as before. */
  scheduledStartLabelByClientId?: ReadonlyMap<ClientProfileId, string>
): UpcomingWorkItem[] {
  const items = clients
    .map((client) => ({ client, lifecycle: lifecycleByClientId.get(client.id) ?? "active" }))
    .filter(({ client, lifecycle }) => {
      if (lifecycle === "active") return scheduledStartLabelByClientId?.has(client.id) ?? false;
      return lifecycle !== "paused" && lifecycle !== "completed";
    })
    .map(({ client, lifecycle }) => ({
      clientId: client.id,
      clientName: client.name,
      lifecycle,
      readyToActivate: lifecycle === "ready_to_activate",
      startsLabel: lifecycle === "active" ? scheduledStartLabelByClientId?.get(client.id) : undefined,
    }));

  return items.sort((a, b) => Number(b.readyToActivate) - Number(a.readyToActivate));
}

// ---------------------------------------------------------------------------
// Phase 5.4B — time-of-day adaptivity for the Command Center's secondary
// sections (spec §2: "morning emphasizes prepared briefings; active
// training windows emphasize live flags/activity; later in day emphasizes
// unresolved work"). "Needs Your Attention" (see app/coach/page.tsx) always
// dominates ahead of all of this when it's non-empty — this only ever
// reorders the sections that come after it.
// ---------------------------------------------------------------------------

export type TimeOfDay = "morning" | "midday" | "evening";

export function timeOfDayForHour(hour: number): TimeOfDay {
  if (hour < 11) return "morning";
  if (hour < 17) return "midday";
  return "evening";
}

export type SecondarySectionId = "briefings" | "personal_touch" | "waiting";

export const SECONDARY_SECTION_ORDER: Record<TimeOfDay, SecondarySectionId[]> = {
  morning: ["briefings", "personal_touch", "waiting"],
  midday: ["personal_touch", "briefings", "waiting"],
  evening: ["waiting", "briefings", "personal_touch"],
};
