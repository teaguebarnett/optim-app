"use client";

import { useState } from "react";
import { Settings, Bell } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { SettingsSheet } from "@/components/app-shell/settings-sheet";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { CLIENT } from "@/lib/mock-data";

export function Header() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { state } = usePrototypeState();
  const hasUnresolvedReview = state.reviewRequests.some((r) => !r.resolved);

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-near-black/90 pc-safe-top backdrop-blur-md">
      <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-3">
        <span className="text-[15px] font-semibold tracking-tight text-off-white">
          <span className="text-accent">OPTIM</span>
        </span>

        <div className="flex items-center gap-2">
          <button
            aria-label={hasUnresolvedReview ? "Notifications: updates available" : "Notifications"}
            className="relative flex h-10 w-10 items-center justify-center rounded-full text-neutral hover:bg-white/5 hover:text-off-white"
          >
            <Bell size={19} />
            {hasUnresolvedReview ? (
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-accent" aria-hidden="true" />
            ) : null}
          </button>
          <button
            aria-label="Prototype settings"
            onClick={() => setSettingsOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-full text-neutral hover:bg-white/5 hover:text-off-white"
          >
            <Settings size={19} />
          </button>
          <Avatar initials={CLIENT.avatarInitials} size="sm" />
        </div>
      </div>
      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </header>
  );
}
