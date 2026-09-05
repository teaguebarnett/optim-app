// Phase 5.0B — the /dev route's action definitions.
//
// app/dev/page.tsx is a thin renderer over this module: every effect
// described here dispatches into the exact same primitives every other
// screen already uses — usePrototypeState's perspective (see
// lib/tenancy/session.ts) and the platform store's SET_CLIENT_LIFECYCLE
// action (see lib/coach/platform-store.ts, and
// components/app-shell/dev-perspective-switcher.tsx for the sibling
// mechanism this reuses rather than duplicates). Kept as data/pure
// functions, not inline JSX handlers, so each action's resulting
// perspective/lifecycle/route is independently testable without rendering
// React — see lib/coach/verify-coach.mts.

import { ALEX_USER, CLIENT_PROFILE_DEMO, TEAGUE_USER, WORKSPACE_OPTIM_ID } from "../tenancy/seed.ts";
import { resolveHomeRoute } from "./routing.ts";
import type { DevPerspective } from "../tenancy/session.ts";
import type { ClientLifecycleStatus } from "./types";

/** The one seeded client every /dev entry action acts on — the same
 * client-demo the existing dev-perspective-switcher's "Simulate: pending"/
 * "Reset to active" controls already target. /dev never creates or
 * touches any other client. */
export const DEV_TARGET_CLIENT_ID = CLIENT_PROFILE_DEMO.id;
export const DEV_TARGET_WORKSPACE_ID = WORKSPACE_OPTIM_ID;

/** The lifecycle status "Enter as Pending Client" forces client-demo into —
 * deliberately the exact same status dev-perspective-switcher's "Simulate:
 * pending" button already uses, not a new one, so there's only ever one
 * definition of what "pending" means in this dev tooling. */
export const DEV_PENDING_LIFECYCLE_STATUS: ClientLifecycleStatus = "ready_to_activate";

/** The second seeded coach — same workspace as Teague, used only for
 * Phase 5.2's multi-coach identity QA entry below. See lib/tenancy/
 * seed.ts's COACH_PROFILE_ALEX doc. */
export const DEV_SECOND_COACH_USER_ID = ALEX_USER.id;
export const DEV_DEFAULT_COACH_USER_ID = TEAGUE_USER.id;

export interface DevEntryAction {
  id: "enter-coach" | "enter-active-client" | "enter-pending-client" | "enter-second-coach";
  label: string;
  description: string;
  perspective: DevPerspective;
  /** Lifecycle to force client-demo into — null when the action never
   * touches lifecycle at all (entering as coach doesn't need to). */
  lifecycleStatus: ClientLifecycleStatus | null;
  /** Where to navigate immediately after applying perspective/lifecycle.
   * Computed via lib/coach/routing.ts's own resolveHomeRoute rather than a
   * hardcoded string, so this can never drift from what the role/lifecycle
   * boundary itself would independently decide. */
  route: string;
  /** Present only for a "coach" action that should act as a SPECIFIC coach
   * other than Teague (see lib/tenancy/session.ts's activeCoachUserId) —
   * absent means "whichever coach this browser was already acting as,"
   * preserving every existing action's exact prior behavior. */
  coachUserId?: string;
}

export const DEV_ENTRY_ACTIONS: DevEntryAction[] = [
  {
    id: "enter-coach",
    label: "Enter as Coach",
    description: "Acts as Teague, the seeded workspace owner/coach.",
    perspective: "coach",
    lifecycleStatus: null,
    route: resolveHomeRoute("workspace_owner", null, null),
    coachUserId: DEV_DEFAULT_COACH_USER_ID,
  },
  {
    id: "enter-active-client",
    label: "Enter as Active Client",
    description: "Acts as client-demo with an active program.",
    perspective: "client",
    lifecycleStatus: "active",
    route: resolveHomeRoute("client", "active", DEV_TARGET_CLIENT_ID),
  },
  {
    id: "enter-pending-client",
    label: "Enter as Pending Client",
    description: "Acts as client-demo awaiting coach setup/activation.",
    perspective: "client",
    lifecycleStatus: DEV_PENDING_LIFECYCLE_STATUS,
    route: resolveHomeRoute("client", DEV_PENDING_LIFECYCLE_STATUS, DEV_TARGET_CLIENT_ID),
  },
  {
    id: "enter-second-coach",
    label: "Enter as Alex (second coach)",
    description: "Multi-coach identity QA — a second real coach in the same workspace, with their own clients, reviews, programs, and meals.",
    perspective: "coach",
    lifecycleStatus: null,
    route: resolveHomeRoute("coach", null, null),
    coachUserId: DEV_SECOND_COACH_USER_ID,
  },
];
