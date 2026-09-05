"use client";

import { Moon, Sun } from "lucide-react";
import { PhoneCanvas } from "@/components/app-shell/phone-canvas";
import type { ThemeMode } from "@/lib/shared/theme-preference";

/** A miniature, static preview of each theme's own real surfaces — never a
 * screenshot, just the same tokens rendered at a tiny scale so the choice
 * is visual, not descriptive text. */
function ThemePreview({ mode }: { mode: ThemeMode }) {
  const isDark = mode === "dark";
  return (
    <div
      className="flex h-32 w-full overflow-hidden rounded-[var(--radius-md)] border"
      style={{
        borderColor: isDark ? "#263546" : "#dfdfd9",
        background: isDark ? "#0b1119" : "#f6f5ef",
      }}
    >
      <div className="flex w-9 flex-col gap-1.5 border-r p-2" style={{ borderColor: isDark ? "#263546" : "#dfdfd9", background: isDark ? "#131d28" : "#fffefa" }}>
        <span className="h-1.5 w-4 rounded-full" style={{ background: "#3157f6" }} />
        <span className="h-1.5 w-4 rounded-full" style={{ background: isDark ? "#33465c" : "#dfdfd9" }} />
        <span className="h-1.5 w-4 rounded-full" style={{ background: isDark ? "#33465c" : "#dfdfd9" }} />
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <span className="h-2 w-14 rounded-full" style={{ background: isDark ? "#f5f8fb" : "#0a1b31" }} />
        <span className="h-1.5 w-20 rounded-full" style={{ background: isDark ? "#aab6c6" : "#647080" }} />
        <div className="mt-1 flex-1 rounded-[var(--radius-sm)]" style={{ background: "#071a34" }} />
        <span className="h-1.5 w-10 rounded-full" style={{ background: isDark ? "#1a2735" : "#ecebe1" }} />
      </div>
    </div>
  );
}

/**
 * The one required, explicit appearance choice every account makes before
 * seeing any real screen for the first time (see theme-provider.tsx's
 * RequireThemeChoice) — two large, self-previewing options, never a form
 * with a submit step. Choosing immediately commits; there's nothing else
 * to fill in.
 *
 * Phase 5.4A corrective pass: this is the very first screen in the client
 * lifecycle, and manual review found it rendering as a wide desktop page
 * for a client opening their invite on a computer. `phoneOnly` (set by
 * RequireThemeChoice for accountKind="client", never for a coach account)
 * wraps this same component in the shared PhoneCanvas — one implementation,
 * not a forked client-only copy.
 */
export function AppearanceSelector({ onChoose, phoneOnly }: { onChoose: (mode: ThemeMode) => void; phoneOnly?: boolean }) {
  const content = (
    <div className={phoneOnly ? "flex min-h-screen flex-1 items-center justify-center px-6 py-10" : "flex min-h-screen items-center justify-center bg-near-black px-6 py-12"}>
      <div className="w-full max-w-lg text-center">
        <p className="text-label text-accent-strong">OPTIM</p>
        <h1 className="mt-2 text-display text-off-white">Choose your appearance</h1>
        <p className="mt-2 text-body text-neutral">Pick the look you want to work in. You can change this anytime in Settings.</p>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => onChoose("light")}
            className="group rounded-[var(--radius-lg)] border-2 border-border-strong bg-charcoal p-4 text-left transition-all hover:border-accent/50 active:scale-[0.98]"
            style={{ transitionDuration: "var(--motion-fast)" }}
          >
            <ThemePreview mode="light" />
            <div className="mt-3 flex items-center gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-strong">
                <Sun size={16} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-subheading text-off-white">Light</p>
                <p className="text-meta text-neutral">Pearl Ivory</p>
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onChoose("dark")}
            className="group rounded-[var(--radius-lg)] border-2 border-border-strong bg-charcoal p-4 text-left transition-all hover:border-accent/50 active:scale-[0.98]"
            style={{ transitionDuration: "var(--motion-fast)" }}
          >
            <ThemePreview mode="dark" />
            <div className="mt-3 flex items-center gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-strong">
                <Moon size={16} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-subheading text-off-white">Dark</p>
                <p className="text-meta text-neutral">Midnight Navy</p>
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );

  return phoneOnly ? <PhoneCanvas>{content}</PhoneCanvas> : content;
}
