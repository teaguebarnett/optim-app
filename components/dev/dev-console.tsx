"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Users, User, Clock3, CheckCircle2, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { usePlatformState } from "@/hooks/use-platform-state";
import { getClientLifecycle } from "@/lib/coach/repository";
import { LIFECYCLE_LABELS } from "@/lib/coach/labels";
import { createInitialPlatformState } from "@/lib/coach/platform-store";
import {
  DEV_DEFAULT_COACH_USER_ID,
  DEV_ENTRY_ACTIONS,
  DEV_TARGET_CLIENT_ID,
  DEV_TARGET_WORKSPACE_ID,
  type DevEntryAction,
} from "@/lib/coach/dev-actions";

const ACTION_ICONS: Record<DevEntryAction["id"], typeof Users> = {
  "enter-coach": Users,
  "enter-active-client": User,
  "enter-pending-client": Clock3,
  "enter-second-coach": UserCog,
};

/**
 * The one always-reachable escape hatch from a stuck demo perspective/
 * lifecycle combination (e.g. a seeded client left in "coach_setup," which
 * has no controls of its own on the polished setup-status screen by
 * design — see app/setup-status/[clientId]/page.tsx). Every action here
 * dispatches into the exact same primitives the rest of the app already
 * uses (usePrototypeState's perspective, the platform store's
 * SET_CLIENT_LIFECYCLE/HYDRATE) — see lib/coach/dev-actions.ts for the
 * pure action definitions this just renders and applies. Never rendered in
 * a production build — see app/dev/page.tsx's server-side gate.
 */
export function DevConsole() {
  const router = useRouter();
  const { perspective, activeContext, setActiveClientId, setActiveCoachUserId, resetToday } = usePrototypeState();
  const { platform, dispatch: dispatchPlatform } = usePlatformState();
  const [confirmReset, setConfirmReset] = useState(false);

  const demoLifecycle = getClientLifecycle(platform, DEV_TARGET_CLIENT_ID);

  function applyEntryAction(action: DevEntryAction) {
    // Every /dev entry action targets client-demo specifically — using
    // setActiveClientId (not just setPerspective) here re-selects
    // client-demo even if this browser was last acting as some other
    // (e.g. newly activated) client, so "Enter as Active Client" always
    // means client-demo, never whichever client happened to be active.
    if (action.perspective === "coach") {
      setActiveCoachUserId(action.coachUserId ?? DEV_DEFAULT_COACH_USER_ID);
    } else {
      setActiveClientId(DEV_TARGET_CLIENT_ID);
    }
    if (action.lifecycleStatus) {
      dispatchPlatform({
        type: "SET_CLIENT_LIFECYCLE",
        clientId: DEV_TARGET_CLIENT_ID,
        workspaceId: DEV_TARGET_WORKSPACE_ID,
        status: action.lifecycleStatus,
        nowIso: new Date().toISOString(),
      });
    }
    router.push(action.route);
  }

  function handleReset() {
    // Explicitly re-selects client-demo first so this always resets THAT
    // client regardless of which client this browser was last acting as.
    setActiveClientId(DEV_TARGET_CLIENT_ID);
    resetToday(); // dispatches RESET_TODAY, i.e. createInitialState() — see lib/state.ts
    dispatchPlatform({ type: "HYDRATE", payload: createInitialPlatformState() });
    setConfirmReset(false);
  }

  return (
    <div className="mx-auto min-h-screen max-w-lg bg-near-black px-5 py-10">
      <p className="text-label text-neutral">Development only</p>
      <h1 className="mt-1 text-heading text-off-white">Dev console</h1>
      <p className="mt-2 text-sm text-neutral">
        Jump straight into a seeded perspective — reachable no matter what demo state the browser is currently
        stuck in. Never available in a production build.
      </p>

      <Card className="mt-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral">Current state</p>
        <div className="mt-2 space-y-1 text-sm text-off-white">
          <p>
            Perspective:{" "}
            <span className="font-medium">
              {perspective === "coach" ? `Coach (${activeContext.coachProfile?.displayName ?? "unknown"})` : "Client"}
            </span>
          </p>
          <p>
            client-demo lifecycle: <span className="font-medium">{LIFECYCLE_LABELS[demoLifecycle]}</span>
          </p>
        </div>
      </Card>

      <div className="mt-4 space-y-2">
        {DEV_ENTRY_ACTIONS.map((action) => {
          const Icon = ACTION_ICONS[action.id];
          return (
            <button
              key={action.id}
              onClick={() => applyEntryAction(action)}
              className="flex w-full items-center gap-3 rounded-[var(--radius-md)] border border-border-strong px-4 py-3.5 text-left hover:border-accent/40"
            >
              <Icon size={18} className="shrink-0 text-neutral" />
              <span>
                <span className="block text-sm font-medium text-off-white">{action.label}</span>
                <span className="block text-xs text-neutral">{action.description}</span>
              </span>
            </button>
          );
        })}
      </div>

      <Card className="mt-4">
        <p className="text-sm font-medium text-off-white">Reset demo state</p>
        <p className="mt-1 text-xs text-neutral">
          Restores client-demo&apos;s day and the coach platform store to their canonical seed values. Does not
          change which perspective you&apos;re currently viewing as.
        </p>
        {confirmReset ? (
          <div className="mt-3 flex gap-2">
            <Button variant="danger" size="sm" className="flex-1" onClick={handleReset}>
              <CheckCircle2 size={14} /> Confirm reset
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" className="mt-3" onClick={() => setConfirmReset(true)}>
            <RotateCcw size={14} /> Reset demo state
          </Button>
        )}
      </Card>
    </div>
  );
}
