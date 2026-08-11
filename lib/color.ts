// Tiny hex-color helper for turning a workspace's configured brand color
// into a translucent "soft" tint at runtime — see
// components/app-shell/workspace-theme.tsx. No dependency pulled in for
// this; the app only ever needs one conversion.

export function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "");
  const full =
    normalized.length === 3
      ? normalized
          .split("")
          .map((c) => c + c)
          .join("")
      : normalized;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return `rgba(22, 41, 74, ${alpha})`;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
