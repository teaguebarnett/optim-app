interface LineChartPoint {
  label: string;
  value: number;
}

interface LineChartProps {
  points: LineChartPoint[];
  color?: string;
  height?: number;
  valueSuffix?: string;
}

export function LineChart({ points, color = "var(--pc-accent)", height = 140, valueSuffix = "" }: LineChartProps) {
  const width = 320;
  const paddingX = 24;
  const paddingY = 20;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const coords = points.map((p, i) => {
    const x = paddingX + (i / (points.length - 1)) * (width - paddingX * 2);
    const y = paddingY + (1 - (p.value - min) / range) * (height - paddingY * 2);
    return { x, y, ...p };
  });

  const path = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x} ${c.y}`).join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Trend line chart">
      <path d={path} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      {coords.map((c) => (
        <g key={c.label}>
          <circle cx={c.x} cy={c.y} r={4} fill="var(--pc-near-black)" stroke={color} strokeWidth={2.5} />
          <text x={c.x} y={height - 2} textAnchor="middle" fontSize={10} fill="var(--pc-neutral)">
            {c.label}
          </text>
        </g>
      ))}
      <text x={coords[coords.length - 1].x} y={coords[coords.length - 1].y - 12} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--pc-off-white)">
        {points[points.length - 1].value}
        {valueSuffix}
      </text>
    </svg>
  );
}
