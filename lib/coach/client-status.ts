// Phase 5.4B completion pass — the active-client header's compact status
// (spec §5.1): On Track / Monitoring / Needs Attention. Pure and derived
// entirely from this client's own real, already-computed attention-queue
// items — never a second scoring system.

import type { AttentionQueueItem } from "./types";
import type { ClientProfileId } from "../tenancy/types";

export type ClientStatusLabel = "scheduled" | "on_track" | "monitoring" | "needs_attention";

export const CLIENT_STATUS_LABELS: Record<ClientStatusLabel, string> = {
  scheduled: "Scheduled",
  on_track: "On Track",
  monitoring: "Monitoring",
  needs_attention: "Needs Attention",
};

/**
 * needs_attention: at least one real, non-milestone item actually needs a
 * decision right now (needs_review/in_progress). monitoring: nothing needs
 * a decision, but something is genuinely being watched (a "waiting" item —
 * the coach already acted and is watching for a resurface). on_track:
 * neither — the honest default, never assumed positive by omission alone
 * (it's only reached after checking the other two).
 *
 * Phase 5.6A.4 — `isPreProgramStart` (see lib/scheduling/program-timing.ts's
 * ProgramTiming) overrides that "on_track" default to "scheduled": a client
 * whose approved program hasn't reached its own start date yet has no real
 * program performance to be "on track" with. Never overrides
 * needs_attention/monitoring — a genuine open decision or a waiting item
 * still outranks "scheduled" exactly the same way it outranks "on_track".
 */
export function resolveClientStatusLabel(clientId: ClientProfileId, attentionQueue: AttentionQueueItem[], isPreProgramStart: boolean = false): ClientStatusLabel {
  const relevant = attentionQueue.filter((i) => i.clientId === clientId && i.kind !== "milestone" && i.status !== "resolved");
  if (relevant.some((i) => i.status === "needs_review" || i.status === "in_progress")) return "needs_attention";
  if (relevant.some((i) => i.status === "waiting")) return "monitoring";
  return isPreProgramStart ? "scheduled" : "on_track";
}
