interface BarChartPoint {
  label: string;
  value: number;
}

interface BarChartProps {
  points: BarChartPoint[];
  color?: string;
  height?: number;
  maxValue?: number;
}

export function BarChart({ points, color = "var(--pc-accent)", height = 120, maxValue = 100 }: BarChartProps) {
  const width = 320;
  const paddingX = 20;
  const paddingBottom = 20;
  const barGap = 14;
  const barWidth = (width - paddingX * 2 - barGap * (points.length - 1)) / points.length;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Bar chart">
      {points.map((p, i) => {
        const x = paddingX + i * (barWidth + barGap);
        const barHeight = Math.max(2, (Math.min(p.value, maxValue) / maxValue) * (height - paddingBottom - 16));
        const y = height - paddingBottom - barHeight;
        const isEmpty = p.value === 0;
        return (
          <g key={p.label}>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={barHeight}
              rx={4}
              fill={isEmpty ? "rgba(255,255,255,0.08)" : color}
            />
            {!isEmpty && (
              <text x={x + barWidth / 2} y={y - 6} textAnchor="middle" fontSize={10} fontWeight={600} fill="var(--pc-off-white)">
                {p.value}%
              </text>
            )}
            <text x={x + barWidth / 2} y={height - 4} textAnchor="middle" fontSize={10} fill="var(--pc-neutral)">
              {p.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
