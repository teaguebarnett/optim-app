"use client";

import { Moon, Sun } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useTheme } from "@/components/app-shell/theme-provider";
import { cn } from "@/lib/cn";

/**
 * The one place appearance is changed AFTER first-run (see theme-
 * provider.tsx's RequireThemeChoice for the one-time initial choice) —
 * used in both the coach's Playbook and the client's Settings sheet, so
 * "how do I change this later" is answered identically for both roles.
 * Changing it here never affects any other account's own preference.
 */
export function AppearanceSettingsCard() {
  const { mode, setMode } = useTheme();

  return (
    <Card>
      <p className="text-subheading text-off-white">Appearance</p>
      <p className="mt-1 text-meta text-neutral">Only changes how OPTIM looks for you.</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setMode("light")}
          aria-pressed={mode === "light"}
          className={cn(
            "flex flex-col items-center gap-1.5 rounded-[var(--radius-md)] border-2 px-3 py-3 transition-colors",
            mode === "light" ? "border-accent bg-selected-bg text-accent-fg" : "border-border-strong bg-surface-input text-off-white hover:border-accent/40"
          )}
          style={{ transitionDuration: "var(--motion-fast)" }}
        >
          <Sun size={18} aria-hidden="true" />
          <span className="text-sm font-medium">Light</span>
          <span className="text-meta text-neutral">Pearl Ivory</span>
        </button>
        <button
          type="button"
          onClick={() => setMode("dark")}
          aria-pressed={mode === "dark"}
          className={cn(
            "flex flex-col items-center gap-1.5 rounded-[var(--radius-md)] border-2 px-3 py-3 transition-colors",
            mode === "dark" ? "border-accent bg-selected-bg text-accent-fg" : "border-border-strong bg-surface-input text-off-white hover:border-accent/40"
          )}
          style={{ transitionDuration: "var(--motion-fast)" }}
        >
          <Moon size={18} aria-hidden="true" />
          <span className="text-sm font-medium">Dark</span>
          <span className="text-meta text-neutral">Midnight Navy</span>
        </button>
      </div>
    </Card>
  );
}
