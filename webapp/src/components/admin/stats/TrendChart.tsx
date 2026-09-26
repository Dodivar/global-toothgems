import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import type { BucketStep, TimePoint } from "../../../data/adminAnalytics";
import {
  formatCompact,
  formatCompactMoney,
  useBucketLabel,
  type ChartMetric,
} from "../../../lib/adminAnalytics";
import { formatCount, formatPrice } from "../../../lib/format";
import { areaPath, axisScale, createPlot, labelIndices, linePath, useMeasure } from "./chart";

/**
 * Revenue and orders over the selected window.
 *
 * Revenue and orders are never drawn against two y-axes on one grid. A second
 * scale makes the crossing point of the two lines look like a finding when it is
 * an artefact of where the axes were pinned, and it is the mistake that makes a
 * dashboard's numbers arguable. "Revenue + orders" therefore stacks two plots
 * that share one x-axis and one crosshair: the comparison is still immediate,
 * and every value is read against a single honest scale.
 *
 * The hover layer is not the only way to the numbers — the table under the chart
 * carries every point, which is what keeps the chart usable by keyboard, by
 * screen reader, and by anyone who wants to check a figure rather than hover it.
 */

interface SeriesSpec {
  id: "revenue" | "orders";
  color: string;
  compareColor: string;
  value: (point: TimePoint) => number;
  previous: (point: TimePoint) => number;
  tick: (value: number) => string;
  full: (value: number) => string;
}

const SERIES: Record<"revenue" | "orders", SeriesSpec> = {
  // Money is the blue the brand leads with; counts are ink. Neither borrows a
  // category colour from the breakdown below, so a hue means one thing per page.
  revenue: {
    id: "revenue",
    color: "var(--gt-blue-700)",
    compareColor: "var(--gt-blue-400)",
    value: (p) => p.revenue,
    previous: (p) => p.previousRevenue,
    tick: formatCompactMoney,
    full: (v) => formatPrice(v),
  },
  orders: {
    id: "orders",
    color: "var(--gt-ink-700)",
    compareColor: "var(--gt-ink-300)",
    value: (p) => p.orders,
    previous: (p) => p.previousOrders,
    tick: formatCompact,
    full: (v) => formatCount(v),
  },
};

const PADDING = { top: 14, right: 16, bottom: 26, left: 56 };

export function TrendChart({
  points,
  metric,
  compare,
  step,
}: {
  points: TimePoint[];
  metric: ChartMetric;
  compare: boolean;
  step: BucketStep;
}) {
  const { t } = useTranslation();
  const labelOf = useBucketLabel(step);
  const { ref, width } = useMeasure<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const hintId = useId();

  const panels: SeriesSpec[] = metric === "both" ? [SERIES.revenue, SERIES.orders] : [SERIES[metric]];
  const height = metric === "both" ? 156 : 252;
  const count = points.length;
  const kept = labelIndices(count, Math.max(width - PADDING.left - PADDING.right, 1));

  const move = (delta: number) => {
    setActive((current) => {
      const next = current === null ? count - 1 : current + delta;
      return Math.min(count - 1, Math.max(0, next));
    });
  };

  const activePoint = active === null ? null : points[active];

  /** What a screen reader hears when the chart takes focus. */
  const summary = panels
    .map((series) => {
      const values = points.map(series.value);
      const total = values.reduce((a, b) => a + b, 0);
      return t(`admin.stats.chart.summary.${series.id}`, {
        total: series.full(total),
        first: series.full(values[0] ?? 0),
        last: series.full(values[values.length - 1] ?? 0),
      });
    })
    .join(" ");

  return (
    <div className="grid gap-3">
      <div
        ref={ref}
        tabIndex={0}
        role="img"
        aria-label={`${summary} ${t("admin.stats.chart.range", {
          from: labelOf(points[0]?.key ?? "", true),
          to: labelOf(points[count - 1]?.key ?? "", true),
        })}`}
        aria-describedby={hintId}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") { move(1); event.preventDefault(); }
          else if (event.key === "ArrowLeft") { move(-1); event.preventDefault(); }
          else if (event.key === "Home") { setActive(0); event.preventDefault(); }
          else if (event.key === "End") { setActive(count - 1); event.preventDefault(); }
          else if (event.key === "Escape") setActive(null);
        }}
        onBlur={() => setActive(null)}
        className="relative grid gap-1 rounded-[var(--admin-radius-sm)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--focus-ring)]"
      >
        {panels.map((series, panelIndex) => {
          // In a stack the x-axis is drawn once, under the bottom plot: the two
          // panels share it, and repeating it would read as two charts that
          // happen to sit together.
          const showAxis = panelIndex === panels.length - 1;
          const values = points.map(series.value);
          const previous = points.map(series.previous);
          // Three gridlines on the stacked pair, four on the tall single plot:
          // the same density at half the height would read as a net.
          const { max, ticks } = axisScale(
            Math.max(1, ...values, ...(compare ? previous : [])),
            metric === "both" ? 2 : 4,
          );
          const plot = createPlot(width || 640, height, count, max, PADDING);

          return (
            <figure key={series.id} className="m-0 grid gap-1">
              {metric === "both" && (
                <figcaption className="flex items-center gap-2 pl-[56px] text-[length:var(--text-caption)] font-semibold text-[var(--text-muted)]">
                  <span aria-hidden="true" className="h-[2px] w-4 rounded-full" style={{ background: series.color }} />
                  {t(`admin.stats.metric.${series.id}`)}
                </figcaption>
              )}
              <svg
                width={width || 640}
                height={height}
                viewBox={`0 0 ${width || 640} ${height}`}
                role="presentation"
                focusable="false"
                className="block touch-pan-y select-none"
                onPointerMove={(event) => {
                  const box = event.currentTarget.getBoundingClientRect();
                  const inner = box.width - PADDING.left - PADDING.right;
                  const ratio = (event.clientX - box.left - PADDING.left) / Math.max(1, inner);
                  setActive(Math.min(count - 1, Math.max(0, Math.round(ratio * (count - 1)))));
                }}
                onPointerLeave={() => setActive(null)}
              >
                {/* Grid. Hairline, solid, one step off the surface: it is there to
                    be read past, not looked at. */}
                {ticks.map((tick) => (
                  <g key={tick}>
                    <line
                      x1={PADDING.left}
                      x2={plot.width - PADDING.right}
                      y1={plot.y(tick)}
                      y2={plot.y(tick)}
                      stroke="var(--border-subtle)"
                      strokeWidth={1}
                    />
                    <text
                      x={PADDING.left - 10}
                      y={plot.y(tick) + 4}
                      textAnchor="end"
                      className="fill-[var(--text-subtle)] text-[10px] tabular-nums"
                    >
                      {series.tick(tick)}
                    </text>
                  </g>
                ))}

                {compare && (
                  <path
                    d={linePath(previous, plot)}
                    fill="none"
                    stroke={series.compareColor}
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    strokeDasharray="5 5"
                  />
                )}

                <path d={areaPath(values, plot)} fill={series.color} fillOpacity={0.1} />
                <path
                  d={linePath(values, plot)}
                  fill="none"
                  stroke={series.color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />

                {/* x labels */}
                {showAxis && kept.map((index) => (
                  <text
                    key={index}
                    x={plot.x(index)}
                    y={plot.height - 8}
                    textAnchor={index === 0 ? "start" : index === count - 1 ? "end" : "middle"}
                    className="fill-[var(--text-subtle)] text-[10px]"
                  >
                    {labelOf(points[index].key)}
                  </text>
                ))}

                {active !== null && (
                  <g pointerEvents="none">
                    <line
                      x1={plot.x(active)}
                      x2={plot.x(active)}
                      y1={PADDING.top}
                      y2={plot.zeroY}
                      stroke="var(--gt-ink-400)"
                      strokeWidth={1}
                    />
                    {compare && (
                      <circle
                        cx={plot.x(active)}
                        cy={plot.y(previous[active])}
                        r={4}
                        fill={series.compareColor}
                        stroke="var(--admin-panel)"
                        strokeWidth={2}
                      />
                    )}
                    <circle
                      cx={plot.x(active)}
                      cy={plot.y(values[active])}
                      r={4.5}
                      fill={series.color}
                      stroke="var(--admin-panel)"
                      strokeWidth={2}
                    />
                  </g>
                )}
              </svg>
            </figure>
          );
        })}

        {/* Tooltip. Positioned along the x of the active bucket and clamped so it
            never leaves the panel on the first or last point. */}
        {activePoint && width > 0 && (
          <div
            role="presentation"
            className="pointer-events-none absolute top-0 z-10 w-max min-w-[168px] -translate-x-1/2 rounded-[var(--admin-radius-sm)] border border-[var(--border-subtle)] bg-[var(--admin-panel)] px-3 py-2 shadow-[var(--shadow-md)]"
            style={{
              left: Math.min(
                Math.max(
                  PADDING.left +
                    ((active ?? 0) / Math.max(1, count - 1)) * (width - PADDING.left - PADDING.right),
                  96,
                ),
                Math.max(96, width - 96),
              ),
            }}
          >
            <p className="m-0 text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">
              {labelOf(activePoint.key, true)}
            </p>
            <dl className="m-0 mt-1 grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-0.5">
              <dt className="text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("admin.stats.metric.revenue")}</dt>
              <dd className="m-0 justify-self-end text-[length:var(--text-caption)] font-semibold tabular-nums text-[var(--text-primary)]">
                {formatPrice(activePoint.revenue)}
              </dd>
              <dt className="text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("admin.stats.metric.orders")}</dt>
              <dd className="m-0 justify-self-end text-[length:var(--text-caption)] font-semibold tabular-nums text-[var(--text-primary)]">
                {formatCount(activePoint.orders)}
              </dd>
              {compare && (
                <>
                  <dt className="text-[length:var(--text-caption)] text-[var(--text-subtle)]">{t("admin.stats.chart.previous")}</dt>
                  <dd className="m-0 justify-self-end text-[length:var(--text-caption)] tabular-nums text-[var(--text-muted)]">
                    {formatPrice(activePoint.previousRevenue)} · {formatCount(activePoint.previousOrders)}
                  </dd>
                </>
              )}
            </dl>
          </div>
        )}
      </div>

      <p id={hintId} className="m-0 text-[length:var(--text-caption)] text-[var(--text-subtle)]">
        {t("admin.stats.chart.hint")}
      </p>

      {/* Announced as the selection moves, so keyboard users hear the value the
          tooltip is showing. */}
      <p role="status" aria-live="polite" className="sr-only">
        {activePoint
          ? t("admin.stats.chart.point", {
              date: labelOf(activePoint.key, true),
              revenue: formatPrice(activePoint.revenue),
              orders: formatCount(activePoint.orders),
            })
          : ""}
      </p>

      {compare && (
        <ul className="m-0 flex list-none flex-wrap gap-x-5 gap-y-1 p-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">
          <li className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="h-[2px] w-5 rounded-full"
              style={{ background: panels[0].color }}
            />
            {t("admin.stats.chart.current")}
          </li>
          <li className="flex items-center gap-2">
            {/* Dashed, not merely paler: the comparison has to survive a
                greyscale print and a colour-blind reader. */}
            <span
              aria-hidden="true"
              className="h-0 w-5 border-t-2 border-dashed"
              style={{ borderColor: panels[0].compareColor }}
            />
            {t("admin.stats.chart.previous")}
          </li>
        </ul>
      )}

      <details className="group">
        <summary
          className={clsx(
            "inline-flex cursor-pointer list-none items-center gap-1.5 rounded-[var(--admin-radius-sm)] text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]",
            "underline decoration-[var(--border-default)] underline-offset-4 hover:decoration-[var(--text-primary)]",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
          )}
        >
          {t("admin.stats.chart.tableToggle")}
        </summary>
        <div className="gt-admin-scroll mt-3 max-h-[280px] overflow-auto rounded-[var(--admin-radius-sm)] border border-[var(--border-subtle)]">
          <table className="w-full border-collapse text-[length:var(--text-caption)]">
            <caption className="sr-only">{t("admin.stats.chart.tableCaption")}</caption>
            <thead className="gt-admin-thead">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-semibold text-[var(--text-muted)]">{t("admin.stats.chart.date")}</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold text-[var(--text-muted)]">{t("admin.stats.metric.revenue")}</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold text-[var(--text-muted)]">{t("admin.stats.metric.orders")}</th>
                {compare && (
                  <th scope="col" className="px-3 py-2 text-right font-semibold text-[var(--text-muted)]">{t("admin.stats.chart.previous")}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.key} className="border-t border-[var(--border-subtle)]">
                  <th scope="row" className="px-3 py-1.5 text-left font-medium text-[var(--text-body)]">
                    {labelOf(point.key, true)}
                  </th>
                  <td className="px-3 py-1.5 text-right tabular-nums text-[var(--text-body)]">{formatPrice(point.revenue)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-[var(--text-body)]">{formatCount(point.orders)}</td>
                  {compare && (
                    <td className="px-3 py-1.5 text-right tabular-nums text-[var(--text-muted)]">
                      {formatPrice(point.previousRevenue)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
