interface ProgressRingProps {
  percent: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  sublabel?: string;
  color?: string;
  /** Screen-reader label — defaults to a sensible "{label} {sublabel}: N%"
   * composition when omitted, so a caller that already passes label/
   * sublabel doesn't have to repeat itself. */
  ariaLabel?: string;
}

/** A real interpolating progress ring (SVG, no chart dependency) — the
 * fill animates via `stroke-dashoffset` (layout/shape movement, not
 * opacity) whenever `percent` changes. Exposes `role="img"` +
 * `aria-label` so the value reaches screen readers even though the visual
 * itself is color/shape-based. */
export function ProgressRing({ percent, size = 148, strokeWidth = 12, label, sublabel, color = "var(--pc-accent)", ariaLabel }: ProgressRingProps) {
  const clamped = Math.max(0, Math.min(100, percent));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);
  const computedAriaLabel = ariaLabel ?? [label, sublabel].filter(Boolean).join(" ") + ` — ${Math.round(clamped)}%`;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }} role="img" aria-label={computedAriaLabel}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--pc-track-empty)" strokeWidth={strokeWidth} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset var(--motion-slower) var(--motion-ease)" }}
        />
      </svg>
      {label || sublabel ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center" aria-hidden="true">
          {label ? <span className="text-2xl font-semibold text-off-white">{label}</span> : null}
          {sublabel ? <span className="mt-0.5 text-xs text-neutral">{sublabel}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
