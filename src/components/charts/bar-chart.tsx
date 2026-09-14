import { formatCurrency } from "@/lib/utils";

type Datum = { label: string; value: number };

/**
 * Compact horizontal bar chart, rendered as pure SVG so it works both server
 * and client side and prints cleanly.
 */
export function HBarChart({
  data, height = 260, valueFormat = (v: number) => v.toLocaleString(),
  accent = "sgs-teal", showValue = true,
}: {
  data: Datum[];
  height?: number;
  valueFormat?: (v: number) => string;
  accent?: "sgs-teal" | "sgs-purple";
  showValue?: boolean;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const rowHeight = Math.max(18, Math.floor(height / Math.max(1, data.length)));
  const labelWidth = 120;
  const valueWidth = 96;
  const barMax = 320;
  const width = labelWidth + barMax + valueWidth + 16;

  const color = accent === "sgs-teal" ? "#2C5F6C" : "#501464";

  return (
    <svg viewBox={`0 0 ${width} ${data.length * rowHeight + 4}`} className="w-full h-auto" role="img">
      {data.map((d, i) => {
        const y = i * rowHeight + rowHeight / 2;
        const w = (d.value / max) * barMax;
        return (
          <g key={`${d.label}-${i}`}>
            <text x={labelWidth - 8} y={y} dy="0.35em" textAnchor="end" className="fill-current text-[11px]" style={{ fill: "#0F1414" }}>
              {d.label}
            </text>
            <rect x={labelWidth} y={y - rowHeight / 2 + 4} width={barMax} height={rowHeight - 8} rx={3} className="fill-current" style={{ fill: "#E5E4E0" }} />
            <rect x={labelWidth} y={y - rowHeight / 2 + 4} width={Math.max(2, w)} height={rowHeight - 8} rx={3} style={{ fill: color }} />
            {showValue && (
              <text x={labelWidth + barMax + 6} y={y} dy="0.35em" className="text-[11px]" style={{ fill: "#0F1414" }}>
                {valueFormat(d.value)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export const currencyFormat = (currency = "USD") => (v: number) => formatCurrency(v, currency);
export const compactCurrency = (currency = "USD") => (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(v);
