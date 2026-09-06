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

export interface RosterPulseCounts {
  onTrack: number;
  watch: number;
  needsCoach: number;
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
  needsCoachClientIds: ReadonlySet<ClientProfileId>
): RosterPulseCounts {
  let onTrack = 0;
  let watch = 0;
  let needsCoach = 0;

  for (const clientId of clientIds) {
    const status = lifecycleByClientId.get(clientId) ?? "active";
    const category = categorizeRosterStatus(needsCoachClientIds.has(clientId), status);
    if (category === "needs_coach") needsCoach += 1;
    else if (category === "on_track") onTrack += 1;
    else if (category === "watch") watch += 1;
    // "paused"/"completed" clients categorize as "other" — real, but
    // neither on-track nor a pipeline "watch" item — deliberately excluded
    // from this pulse rather than forced into a bucket that would
    // misrepresent them.
  }

  return { onTrack, watch, needsCoach };
}

export type RosterCategory = "needs_coach" | "watch" | "on_track" | "other";

/** The single-client version of buildRosterPulse's own categorization
 * logic, exposed separately so the Clients list filter (see
 * app/coach/clients/page.tsx) and the Roster Pulse bar always agree on
 * what "on track"/"watch"/"needs you" mean for one specific client. */
export function categorizeRosterStatus(hasOpenDecision: boolean, lifecycle: ClientLifecycleStatus): RosterCategory {
  if (hasOpenDecision) return "needs_coach";
  if (lifecycle === "active") return "on_track";
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
}

/**
 * Real upcoming coach work — every client still short of "active," ready-
 * to-activate first, then the rest of the pipeline in the order given
 * (matching the existing pipeline ordering everywhere else in the coach
 * workspace). Never a fabricated calendar entry: this app has no concept of
 * a scheduled coach appointment, so "upcoming" here means "the next real
 * thing you'll need to do," not a time-boxed event.
 */
export function buildUpcomingWork(clients: { id: ClientProfileId; name: string }[], lifecycleByClientId: ReadonlyMap<ClientProfileId, ClientLifecycleStatus>): UpcomingWorkItem[] {
  const items = clients
    .map((client) => ({ client, lifecycle: lifecycleByClientId.get(client.id) ?? "active" }))
    .filter(({ lifecycle }) => lifecycle !== "active" && lifecycle !== "paused" && lifecycle !== "completed")
    .map(({ client, lifecycle }) => ({
      clientId: client.id,
      clientName: client.name,
      lifecycle,
      readyToActivate: lifecycle === "ready_to_activate",
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
