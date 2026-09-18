"use client";

import { useEffect } from "react";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { hexToRgba } from "@/lib/color";

/**
 * Bridges Phase 2's centralized workspace branding into the Phase 3 design
 * tokens at runtime. This is the ONLY place a workspace's configured
 * primaryColor/accentColor touches CSS — every component keeps using the
 * same --pc-accent / --pc-accent-strong / --pc-accent-soft tokens (via the
 * bg-accent / hover:bg-accent-strong / bg-accent-soft Tailwind utilities)
 * regardless of which workspace is active. --pc-accent-fg (the small
 * text/icon/badge-label foreground role — see app/globals.css's own doc)
 * is deliberately NOT bridged here: it's a pure light/dark theme token,
 * independent of workspace branding, because a fill color's dark-surface
 * legibility problem as small text is a theme-contrast issue, not a brand
 * one — see this phase's visual-QA correction.
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
    root.setProperty("--pc-selected-bg", hexToRgba(primaryColor, 0.12));
  }, [primaryColor, accentColor]);

  return null;
}
