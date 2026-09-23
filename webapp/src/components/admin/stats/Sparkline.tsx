import { createPlot, linePath, areaPath } from "./chart";

/**
 * Twelve points of context inside a KPI card.
 *
 * Purely supporting: it has no axis and no tooltip, and the card states the
 * value and the change in words above it. So it is hidden from assistive
 * technology rather than given a label that would repeat the card.
 */
export function Sparkline({
  values,
  tone = "neutral",
  width = 96,
  height = 30,
}: {
  values: number[];
  tone?: "neutral" | "positive" | "negative";
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return null;

  const max = Math.max(...values) || 1;
  const plot = createPlot(width, height, values.length, max * 1.12, { top: 3, right: 1, bottom: 3, left: 1 });
  const color = {
    neutral: "var(--gt-blue-600)",
    positive: "var(--gt-emerald-600)",
    negative: "var(--gt-red-500)",
  }[tone];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      focusable="false"
      className="overflow-visible"
    >
      <path d={areaPath(values, plot)} fill={color} fillOpacity={0.1} />
      <path d={linePath(values, plot)} fill="none" stroke={color} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
      <circle
        cx={plot.x(values.length - 1)}
        cy={plot.y(values[values.length - 1])}
        r={2.75}
        fill={color}
        stroke="var(--admin-panel)"
        strokeWidth={1.75}
      />
    </svg>
  );
}
