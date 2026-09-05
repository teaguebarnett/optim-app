"use client";

/**
 * A minimal SVG sparkline for a short real time series — no chart
 * dependency. Honestly refuses to draw a "trend" from fewer than two real
 * points (see MIN_POINTS): a single measurement is a fact, not a trend,
 * and this renders `insufficientDataLabel` instead of fabricating a flat
 * line. Every point is real stored data passed in by the caller; this
 * component never invents or interpolates missing days.
 */
const MIN_POINTS = 2;

export function MiniTrend({
  points,
  width = 120,
  height = 36,
  colorClassName = "text-accent",
  label,
  insufficientDataLabel = "Not enough data yet",
}: {
  points: number[];
  width?: number;
  height?: number;
  colorClassName?: string;
  label: string;
  insufficientDataLabel?: string;
}) {
  if (points.length < MIN_POINTS) {
    return (
      <div className="flex items-center text-meta text-neutral" style={{ height }} role="img" aria-label={`${label}: ${insufficientDataLabel}`}>
        {insufficientDataLabel}
      </div>
    );
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const stepX = width / (points.length - 1);
  const coords = points.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const path = `M${coords.join(" L")}`;
  const lastPoint = coords[coords.length - 1].split(",");

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label}: ${points[0]} to ${points[points.length - 1]}`}>
      <path d={path} fill="none" className={colorClassName} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastPoint[0]} cy={lastPoint[1]} r={2.5} className={colorClassName} fill="currentColor" />
    </svg>
  );
}
