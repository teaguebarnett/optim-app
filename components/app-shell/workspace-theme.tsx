"use client";

import { useEffect } from "react";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { hexToRgba } from "@/lib/color";

/**
 * Bridges Phase 2's centralized workspace branding into the Phase 3 design
 * tokens at runtime. This is the ONLY place a workspace's configured
 * primaryColor/accentColor touches CSS — every component keeps using the
 * same --pc-accent / --pc-accent-strong / --pc-accent-soft tokens (via the
 * bg-accent / text-accent-strong / bg-accent-soft Tailwind utilities)
 * regardless of which workspace is active.
 *
 * The OPTIM demo workspace's configured colors already match the
 * stylesheet's defaults (see app/globals.css), so this is a no-op for the
 * current demo — but a differently-branded workspace's primaryColor would
 * repaint every accent-colored control app-wide without touching a single
 * component.
 */
export function WorkspaceTheme() {
  const { activeContext } = usePrototypeState();
  const { primaryColor, accentColor } = activeContext.branding;

  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty("--pc-accent", primaryColor);
    root.setProperty("--pc-accent-strong", accentColor);
    root.setProperty("--pc-accent-soft", hexToRgba(primaryColor, 0.09));
  }, [primaryColor, accentColor]);

  return null;
}
