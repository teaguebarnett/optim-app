import type { WeightRangeModel } from "@/lib/progress/types";

interface WeightChartProps {
  range: WeightRangeModel;
  /** Smaller, caption-free rendering for a card's collapsed preview. */
  compact?: boolean;
}

/** Client-local date formatting only — dateIso is already the client-local
 * calendar date (see lib/shared/local-date.ts), so this never re-derives a
 * date from a raw instant/timezone; it only formats the string for display,
 * matching the existing app-wide short-date convention. */
function formatChartDateLabel(dateIso: string): string {
  return new Date(`${dateIso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Small dependency-free accessible SVG — raw weigh-ins as points, the
 * 7-day trailing trend as a connected line drawn only across dates that
 * actually have a trailing average (never bridging a gap with an
 * interpolated segment). No forced zero baseline (misleading for
 * bodyweight), no clipped first/last point, and 1-2 raw points render
 * without breaking.
 */
export function WeightChart({ range, compact = false }: WeightChartProps) {
  const { rawPoints, trendPoints, status } = range;

  if (status === "empty" || rawPoints.length === 0) {
    return <p className="text-sm text-neutral">No weigh-ins logged yet in this range.</p>;
  }

  const width = 320;
  const height = 140;
  const paddingX = 16;
  const paddingY = 20;

  const trendValues = trendPoints
    .map((p) => p.trailingAverageLb)
    .filter((v): v is number => v !== null);
  const allValues = [...rawPoints.map((p) => p.weightLb), ...trendValues];
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const range_ = max - min || 2;
  const pad = range_ * 0.15;
  const domainMin = min - pad;
  const domainMax = max + pad;
  const domainRange = domainMax - domainMin;

  const n = rawPoints.length;
  const xFor = (i: number) => (n === 1 ? width / 2 : paddingX + (i / (n - 1)) * (width - paddingX * 2));
  const yFor = (value: number) => paddingY + (1 - (value - domainMin) / domainRange) * (height - paddingY * 2);

  const rawCoords = rawPoints.map((p, i) => ({ ...p, cx: xFor(i), cy: yFor(p.weightLb) }));

  const trendByDate = new Map(trendPoints.map((p) => [p.dateIso, p.trailingAverageLb]));
  const segments: { x: number; y: number }[][] = [];
  let current: { x: number; y: number }[] = [];
  rawPoints.forEach((p, i) => {
    const avg = trendByDate.get(p.dateIso);
    if (avg !== null && avg !== undefined) {
      current.push({ x: xFor(i), y: yFor(avg) });
    } else if (current.length > 0) {
      segments.push(current);
      current = [];
    }
  });
  if (current.length > 0) segments.push(current);

  const first = rawPoints[0];
  const latest = rawPoints[n - 1];
  const summary =
    n === 1
      ? `One weigh-in in this range: ${latest.weightLb} pounds on ${latest.dateIso}.`
      : `${n} weigh-ins from ${first.dateIso} to ${latest.dateIso}, ranging from ${min} to ${max} pounds. Latest: ${latest.weightLb} pounds${latest.isCorrected ? " (corrected)" : ""}.`;

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className={compact ? "h-12 w-full" : "w-full"}
        preserveAspectRatio="none"
        role="img"
        aria-label={summary}
      >
        {segments.map((seg, i) => (
          <path
            key={i}
            d={seg.map((c, j) => `${j === 0 ? "M" : "L"} ${c.x} ${c.y}`).join(" ")}
            fill="none"
            stroke="var(--pc-accent)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {rawCoords.map((c) => (
          <circle
            key={c.dateIso}
            cx={c.cx}
            cy={c.cy}
            r={compact ? 2.5 : 3.5}
            fill={c.isCorrected ? "var(--pc-warning)" : "var(--pc-near-black)"}
            stroke={c.isCorrected ? "var(--pc-warning)" : "var(--pc-neutral)"}
            strokeWidth={1.5}
          />
        ))}
      </svg>
      {!compact ? (
        <p className="mt-1.5 text-center text-xs text-neutral">
          {n === 1 ? formatChartDateLabel(first.dateIso) : `${formatChartDateLabel(first.dateIso)} – ${formatChartDateLabel(latest.dateIso)}`}
        </p>
      ) : null}
      {!compact && status === "insufficient_data" ? (
        <p className="mt-2 text-xs text-neutral">
          Not enough consecutive days logged yet for a trend line — showing raw weigh-ins only.
        </p>
      ) : null}
    </div>
  );
}
