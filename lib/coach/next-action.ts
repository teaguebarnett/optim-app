// Pure "what does the coach need to do next for this client" derivation —
// shared by the roster table and the client workspace so the two can never
// disagree about what a client's row/header claims is pending.

import type { ClientLifecycleStatus } from "./types";

export function resolveNextCoachAction(
  lifecycle: ClientLifecycleStatus,
  hasUnresolvedAttention: boolean,
  readinessReady: boolean
): string {
  if (hasUnresolvedAttention) return "Review flagged item";
  switch (lifecycle) {
    case "invited":
      return "Waiting on client to accept invitation";
    case "onboarding":
      return "Waiting on client to finish onboarding";
    case "coach_setup":
      return readinessReady ? "Ready to activate" : "Finish client setup";
    case "ready_to_activate":
      return "Activate client";
    case "active":
      return "No action needed";
    case "paused":
      return "Resume when ready";
    case "completed":
      return "None — program completed";
    default:
      return "Review client";
  }
}
