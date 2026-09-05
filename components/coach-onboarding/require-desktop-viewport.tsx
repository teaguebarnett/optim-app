"use client";

import { useEffect, useState } from "react";
import { MonitorSmartphone } from "lucide-react";

const MIN_SUPPORTED_WIDTH = 1280;

/**
 * Phase 5.4A — coach onboarding is deliberately computer-only this phase
 * (see the brief §III.1): rather than squeezing a desktop-canvas survey
 * into a phone layout, a narrower viewport gets an honest, deliberate
 * message instead of the wizard. Mirrors the app's other hydration-gate
 * components (RequireThemeChoice) — renders nothing until mounted, so
 * there's no SSR/first-paint flash of the wrong branch.
 */
export function RequireDesktopViewport({ children }: { children: React.ReactNode }) {
  const [width, setWidth] = useState<number | null>(null);

  useEffect(() => {
    function measure() {
      setWidth(window.innerWidth);
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  if (width === null) return null;

  if (width < MIN_SUPPORTED_WIDTH) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas px-6">
        <div className="max-w-sm rounded-[var(--radius-lg)] border border-border-strong bg-charcoal p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent-strong">
            <MonitorSmartphone size={22} aria-hidden="true" />
          </div>
          <h1 className="text-heading text-off-white">Open OPTIM Coach on a computer</h1>
          <p className="mt-2 text-body text-neutral">
            Calibrating how OPTIM coaches for you takes real screen space — this setup is built for a laptop or desktop, not a phone.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
