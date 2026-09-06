// Phase 5.4B completion pass — the active-client header's compact status
// (spec §5.1): On Track / Monitoring / Needs Attention. Pure and derived
// entirely from this client's own real, already-computed attention-queue
// items — never a second scoring system.

import type { AttentionQueueItem } from "./types";
import type { ClientProfileId } from "../tenancy/types";

export type ClientStatusLabel = "on_track" | "monitoring" | "needs_attention";

export const CLIENT_STATUS_LABELS: Record<ClientStatusLabel, string> = {
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
 */
export function resolveClientStatusLabel(clientId: ClientProfileId, attentionQueue: AttentionQueueItem[]): ClientStatusLabel {
  const relevant = attentionQueue.filter((i) => i.clientId === clientId && i.kind !== "milestone" && i.status !== "resolved");
  if (relevant.some((i) => i.status === "needs_review" || i.status === "in_progress")) return "needs_attention";
  if (relevant.some((i) => i.status === "waiting")) return "monitoring";
  return "on_track";
}
