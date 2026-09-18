"use client";

import { useState } from "react";
import { Settings, Bell } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { SettingsSheet } from "@/components/app-shell/settings-sheet";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { OptimWordmark } from "@/components/brand/optim-wordmark";

// Phase 13B (Gate 2A human QA) — the client shell's one brand mark, shared
// by Today, Plan, Progress, and Coach (all rendered through this same
// Header inside AppShell — see components/app-shell/shell.tsx). Mirrors
// coach-shell.tsx's isCanonicalOptimBrand rule exactly: a workspace
// genuinely branded as OPTIM gets the real canonical wordmark; a
// custom-branded demo workspace keeps its existing plain-text treatment
// unchanged — this never touches white-label capability.
export function Header() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { state, activeContext } = usePrototypeState();
  const hasUnresolvedReview = state.reviewRequests.some((r) => !r.resolved);
  const businessName = activeContext.branding.businessName;
  const isCanonicalOptimBrand = businessName === "OPTIM";

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-near-black/90 pc-safe-top backdrop-blur-md">
      <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-3">
        {isCanonicalOptimBrand ? (
          <OptimWordmark size={18} className="text-off-white" />
        ) : (
          <span className="text-[15px] font-semibold tracking-tight text-off-white">
            <span className="text-accent">{businessName}</span>
          </span>
        )}

        <div className="flex items-center gap-2">
          <button
            aria-label={hasUnresolvedReview ? "Notifications: updates available" : "Notifications"}
            className="relative flex h-10 w-10 items-center justify-center rounded-full text-neutral hover:bg-off-white/5 hover:text-off-white"
          >
            <Bell size={19} />
            {hasUnresolvedReview ? (
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-accent" aria-hidden="true" />
            ) : null}
          </button>
          <button
            aria-label="Prototype settings"
            onClick={() => setSettingsOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-full text-neutral hover:bg-off-white/5 hover:text-off-white"
          >
            <Settings size={19} />
          </button>
          <Avatar initials={activeContext.clientProfile?.avatarInitials ?? "?"} size="sm" />
        </div>
      </div>
      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </header>
  );
}
