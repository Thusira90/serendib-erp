type Datum = { label: string; value: number; secondary?: number };

/**
 * Vertical bar chart with an optional secondary line (revenue + collected).
 */
export function ColumnChart({
  data, height = 220,
  accent = "sgs-teal",
  formatValue = (v: number) => v.toLocaleString(),
  secondaryLabel,
}: {
  data: Datum[];
  height?: number;
  accent?: "sgs-teal" | "sgs-purple";
  formatValue?: (v: number) => string;
  secondaryLabel?: string;
}) {
  const colX = 260;
  const chartWidth = Math.max(360, data.length * 60);
  const chartHeight = height;
  const padTop = 20, padBottom = 32;
  const innerH = chartHeight - padTop - padBottom;
  const allVals = data.flatMap((d) => [d.value, d.secondary ?? 0]);
  const max = Math.max(1, ...allVals);
  const barW = Math.max(14, Math.floor(chartWidth / data.length) - 12);
  const color = accent === "sgs-teal" ? "#2C5F6C" : "#501464";
  const line = accent === "sgs-teal" ? "#501464" : "#2C5F6C";

  const points = data.map((d, i) => {
    const x = 40 + i * (chartWidth / data.length) + (chartWidth / data.length) / 2;
    const y = padTop + innerH - ((d.secondary ?? 0) / max) * innerH;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg viewBox={`0 0 ${chartWidth + 40} ${chartHeight}`} className="w-full h-auto" role="img">
      {/* baseline */}
      <line x1={40} x2={chartWidth + 40} y1={padTop + innerH} y2={padTop + innerH} stroke="#E5E4E0" strokeWidth={1} />
      {data.map((d, i) => {
        const bw = barW;
        const x = 40 + i * (chartWidth / data.length) + ((chartWidth / data.length) - bw) / 2;
        const barH = (d.value / max) * innerH;
        const y = padTop + innerH - barH;
        return (
          <g key={`${d.label}-${i}`}>
            <rect x={x} y={y} width={bw} height={barH} rx={3} style={{ fill: color }} />
            <text x={x + bw / 2} y={padTop + innerH + 14} textAnchor="middle" className="text-[10px]" style={{ fill: "#64707A" }}>
              {d.label}
            </text>
            <text x={x + bw / 2} y={y - 4} textAnchor="middle" className="text-[10px]" style={{ fill: "#0F1414" }}>
              {formatValue(d.value)}
            </text>
          </g>
        );
      })}
      {data.some((d) => d.secondary != null) && (
        <>
          <polyline fill="none" stroke={line} strokeWidth={1.5} points={points} />
          {data.map((d, i) => {
            const x = 40 + i * (chartWidth / data.length) + (chartWidth / data.length) / 2;
            const y = padTop + innerH - ((d.secondary ?? 0) / max) * innerH;
            return <circle key={`sec-${i}`} cx={x} cy={y} r={3} style={{ fill: line }} />;
          })}
        </>
      )}
      {secondaryLabel && (
        <text x={chartWidth + 20} y={12} textAnchor="end" className="text-[10px]" style={{ fill: line }}>
          {secondaryLabel}
        </text>
      )}
    </svg>
  );
}
