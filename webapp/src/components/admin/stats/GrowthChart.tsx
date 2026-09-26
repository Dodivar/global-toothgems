import { useTranslation } from "react-i18next";
import type { BucketStep } from "../../../data/adminAnalytics";
import { useBucketLabel } from "../../../lib/adminAnalytics";
import { formatCount } from "../../../lib/format";
import { areaPath, createPlot, linePath, useMeasure } from "./chart";

/**
 * How the customer base grew across the window.
 *
 * One series and a single question — is the line still climbing — so it gets no
 * axis furniture, no legend and no tooltip: the endpoints are labelled directly
 * and the exact figures are in the list beside it. A second chart with a full
 * grid here would compete with the revenue chart above for no added answer.
 */
export function GrowthChart({
  points,
  step,
}: {
  points: { key: string; total: number }[];
  step: BucketStep;
}) {
  const { t } = useTranslation();
  const labelOf = useBucketLabel(step);
  const { ref, width } = useMeasure<HTMLDivElement>();

  if (points.length < 2) return null;

  const height = 132;
  const values = points.map((point) => point.total);
  const min = Math.min(...values);
  const max = Math.max(...values);
  // Zoomed to the window rather than anchored at zero: this is a cumulative
  // count in the thousands, where a zero baseline would flatten the growth into
  // a straight line. The axis caption says so, and no fill area is drawn below
  // a false baseline — the wash stops at the window minimum.
  const floor = min - (max - min) * 0.25;
  const plot = createPlot(width || 520, height, values.length, Math.max(1, max - floor), {
    top: 10, right: 12, bottom: 18, left: 12,
  });
  const scaled = values.map((value) => value - floor);
  const last = values[values.length - 1];

  return (
    <figure className="m-0 grid gap-1">
      <div ref={ref}>
        <svg
          width={width || 520}
          height={height}
          viewBox={`0 0 ${width || 520} ${height}`}
          role="img"
          aria-label={t("admin.stats.customers.growthSummary", {
            from: formatCount(values[0]),
            to: formatCount(last),
          })}
          className="block"
        >
          <path d={areaPath(scaled, plot)} fill="var(--gt-blue-600)" fillOpacity={0.1} />
          <path
            d={linePath(scaled, plot)}
            fill="none"
            stroke="var(--gt-blue-600)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <circle
            cx={plot.x(scaled.length - 1)}
            cy={plot.y(scaled[scaled.length - 1])}
            r={4}
            fill="var(--gt-blue-600)"
            stroke="var(--admin-panel)"
            strokeWidth={2}
          />
        </svg>
      </div>
      <figcaption className="flex items-baseline justify-between gap-3 text-[length:var(--text-caption)] text-[var(--text-muted)]">
        <span>{labelOf(points[0].key, true)}</span>
        <span className="font-semibold tabular-nums text-[var(--text-primary)]">{formatCount(last)}</span>
      </figcaption>
    </figure>
  );
}
