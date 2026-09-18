"use client";

import { User, Users, ArrowUpRight, RotateCw } from "lucide-react";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { usePlatformState } from "@/hooks/use-platform-state";
import { getClientLifecycle } from "@/lib/coach/repository";
import { CLIENT_PROFILE_DEMO, WORKSPACE_OPTIM_ID } from "@/lib/tenancy/seed";
import { cn } from "@/lib/cn";

/**
 * Phase 5.0A — the one restrained, development-only way to switch between
 * the two seeded perspectives (see lib/tenancy/session.ts's module doc for
 * why it's exactly these two, never an arbitrary account switcher).
 * Rendered inside components/app-shell/settings-sheet.tsx, matching that
 * sheet's existing "prototype controls" visual language exactly.
 */
export function DevPerspectiveSwitcher() {
  const { perspective, activeClientId, setPerspective, setActiveClientId } = usePrototypeState();
  const { platform, dispatch } = usePlatformState();
  const lifecycle = getClientLifecycle(platform, CLIENT_PROFILE_DEMO.id);
  const isClientDemoActive = perspective === "client" && activeClientId === CLIENT_PROFILE_DEMO.id;

  function setDemoLifecycle(status: "active" | "ready_to_activate") {
    dispatch({
      type: "SET_CLIENT_LIFECYCLE",
      clientId: CLIENT_PROFILE_DEMO.id,
      workspaceId: WORKSPACE_OPTIM_ID,
      status,
      nowIso: new Date().toISOString(),
    });
  }

  return (
    <div className="space-y-2">
      <p className="px-1 text-xs font-medium uppercase tracking-wide text-neutral">Dev: perspective</p>
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setActiveClientId(CLIENT_PROFILE_DEMO.id)}
          className={cn(
            "flex items-center justify-center gap-2 rounded-[var(--radius-md)] border px-4 py-3 text-sm font-medium",
            isClientDemoActive ? "border-accent bg-accent-soft text-accent-fg" : "border-border-strong text-off-white"
          )}
        >
          <User size={16} /> Client view
        </button>
        <button
          onClick={() => setPerspective("coach")}
          className={cn(
            "flex items-center justify-center gap-2 rounded-[var(--radius-md)] border px-4 py-3 text-sm font-medium",
            perspective === "coach" ? "border-accent bg-accent-soft text-accent-fg" : "border-border-strong text-off-white"
          )}
        >
          <Users size={16} /> Coach view
        </button>
      </div>

      <div className="rounded-[var(--radius-md)] border border-border-strong px-4 py-3">
        <p className="text-xs text-neutral">
          Demo client lifecycle: <span className="font-medium text-off-white">{lifecycle}</span>
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            onClick={() => setDemoLifecycle("ready_to_activate")}
            disabled={lifecycle === "ready_to_activate"}
            className="flex items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border border-border-strong px-3 py-2 text-xs font-medium text-off-white disabled:opacity-40"
          >
            <ArrowUpRight size={14} /> Simulate: pending
          </button>
          <button
            onClick={() => setDemoLifecycle("active")}
            disabled={lifecycle === "active"}
            className="flex items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border border-border-strong px-3 py-2 text-xs font-medium text-off-white disabled:opacity-40"
          >
            <RotateCw size={14} /> Reset to active
          </button>
        </div>
        <p className="mt-2 text-[11px] text-neutral">
          Sets the seeded demo client to &quot;ready to activate&quot; so you can demonstrate the coach workspace&apos;s
          Activate action and the setup-status screen — never affects a real client.
        </p>
      </div>
    </div>
  );
}
