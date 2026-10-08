import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { splinePath, type SalesSeries } from "../../lib/adminDashboard";
import { formatCount, formatMoney, useFormat } from "../../lib/format";
import { axisScale, labelIndices, useMeasure } from "./stats/chart";

/**
 * Sales of the last days, as two plots on one shared x-axis and one crosshair.
 *
 * Top: revenue and average basket as smooth lines (both money, one scale).
 * Bottom: products and courses bought as grouped bars (both counts, one
 * scale). Money and counts are never drawn against two y-axes on one grid —
 * the rule `stats/TrendChart.tsx` states — so the request for "lines and bars
 * in one chart" is answered by stacking them. A day without an order leaves a
 * gap in the basket line rather than a zero. The table under the chart is the
 * accessible twin of the drawing, and the way to read exact figures.
 */

const REVENUE = "var(--gt-blue-700)";
const BASKET = "var(--gt-ink-700)";
const PRODUCTS = "var(--gt-blue-400)";
const COURSES = "var(--gt-emerald-500)";

const PAD = { top: 10, right: 12, bottom: 4, left: 52 };
const MONEY_H = 170;
const COUNT_H = 100;
const AXIS_H = 24;
const GAP = 14;

export function SalesChart({ series }: { series: SalesSeries }) {
  const { t } = useTranslation();
  const { locale } = useFormat();
  const { ref, width } = useMeasure<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const titleId = useId();

  const { days, currency } = series;
  const count = days.length;
  const innerW = Math.max(1, width - PAD.left - PAD.right);
  const band = innerW / count;
  const cx = (i: number) => PAD.left + (i + 0.5) * band;

  const moneyScale = axisScale(
    Math.max(...days.map((d) => Math.max(d.revenue, d.averageBasket ?? 0)), 0) / 100,
    4,
  );
  const countScale = axisScale(Math.max(...days.map((d) => Math.max(d.products, d.courses)), 0), 2);

  const moneyTop = PAD.top;
  const moneyBottom = moneyTop + MONEY_H;
  const countTop = moneyBottom + GAP;
  const countBottom = countTop + COUNT_H;
  const totalH = countBottom + PAD.bottom + AXIS_H;

  const yMoney = (minor: number) => moneyBottom - (Math.max(0, minor / 100) / moneyScale.max) * MONEY_H;
  const yCount = (n: number) => countBottom - (Math.max(0, n) / countScale.max) * COUNT_H;

  const dayLabel = (iso: string, long = false) =>
    new Intl.DateTimeFormat(locale, long ? { weekday: "long", day: "numeric", month: "long" } : { day: "numeric", month: "short" }).format(
      new Date(`${iso}T12:00:00`),
    );
  const compact = (major: number) =>
    new Intl.NumberFormat(locale, { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(major);

  const revenuePath = splinePath(days.map((d, i) => ({ x: cx(i), y: yMoney(d.revenue) })));
  const basketPath = splinePath(days.map((d, i) => (d.averageBasket === null ? null : { x: cx(i), y: yMoney(d.averageBasket) })));
  const barW = Math.min(18, Math.max(3, (band - 4) / 2.4));
  const labels = new Set(labelIndices(count, width));

  const indexAt = (clientX: number, rect: DOMRect) => {
    const i = Math.floor(((clientX - rect.left - PAD.left) / innerW) * count);
    return Math.min(count - 1, Math.max(0, i));
  };
  const active = hover === null ? null : days[hover];

  return (
    <div className="grid gap-3">
      <ul className="m-0 flex list-none flex-wrap gap-x-5 gap-y-1.5 p-0 text-[length:var(--text-caption)] text-[var(--text-body)]">
        <Key label={t("admin.dashboard.sales.revenue")}>
          <svg width="22" height="10" aria-hidden="true"><path d="M1 5h20" stroke={REVENUE} strokeWidth="2.5" strokeLinecap="round" /></svg>
        </Key>
        <Key label={t("admin.dashboard.sales.basket")}>
          <svg width="22" height="10" aria-hidden="true"><path d="M1 5h20" stroke={BASKET} strokeWidth="2" strokeDasharray="4 3" strokeLinecap="round" /></svg>
        </Key>
        <Key label={t("admin.dashboard.sales.products")}>
          <svg width="10" height="10" aria-hidden="true"><rect width="10" height="10" rx="2" fill={PRODUCTS} /></svg>
        </Key>
        <Key label={t("admin.dashboard.sales.courses")}>
          <svg width="10" height="10" aria-hidden="true"><rect width="10" height="10" rx="2" fill={COURSES} /></svg>
        </Key>
      </ul>

      <div ref={ref} className="relative">
        {width > 0 && (
          <svg
            width={width}
            height={totalH}
            role="img"
            aria-labelledby={titleId}
            className="block touch-pan-y select-none"
            onPointerMove={(e) => setHover(indexAt(e.clientX, e.currentTarget.getBoundingClientRect()))}
            onPointerLeave={() => setHover(null)}
          >
            <title id={titleId}>{t("admin.dashboard.sales.chartLabel")}</title>

            {moneyScale.ticks.map((tick) => (
              <g key={`m${tick}`}>
                <line x1={PAD.left} x2={width - PAD.right} y1={yMoney(tick * 100)} y2={yMoney(tick * 100)} stroke="var(--border-subtle)" />
                <text x={PAD.left - 8} y={yMoney(tick * 100)} dy="0.32em" textAnchor="end" fontSize="11" fill="var(--text-muted)">
                  {compact(tick)}
                </text>
              </g>
            ))}
            {countScale.ticks.map((tick) => (
              <g key={`c${tick}`}>
                <line x1={PAD.left} x2={width - PAD.right} y1={yCount(tick)} y2={yCount(tick)} stroke="var(--border-subtle)" />
                <text x={PAD.left - 8} y={yCount(tick)} dy="0.32em" textAnchor="end" fontSize="11" fill="var(--text-muted)">
                  {formatCount(tick, locale)}
                </text>
              </g>
            ))}

            {hover !== null && (
              <line x1={cx(hover)} x2={cx(hover)} y1={moneyTop} y2={countBottom} stroke="var(--gt-ink-300)" strokeDasharray="3 3" />
            )}

            <path d={revenuePath} fill="none" stroke={REVENUE} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d={basketPath} fill="none" stroke={BASKET} strokeWidth="2" strokeDasharray="5 4" strokeLinecap="round" strokeLinejoin="round" />
            {days.map((d, i) =>
              d.averageBasket !== null && (i === 0 || days[i - 1].averageBasket === null) && (i === count - 1 || days[i + 1].averageBasket === null) ? (
                <circle key={d.day} cx={cx(i)} cy={yMoney(d.averageBasket)} r="3" fill={BASKET} />
              ) : null,
            )}
            {hover !== null && (
              <>
                <circle cx={cx(hover)} cy={yMoney(days[hover].revenue)} r="4" fill={REVENUE} stroke="var(--surface-raised, #fff)" strokeWidth="2" />
                {days[hover].averageBasket !== null && (
                  <circle cx={cx(hover)} cy={yMoney(days[hover].averageBasket!)} r="4" fill={BASKET} stroke="var(--surface-raised, #fff)" strokeWidth="2" />
                )}
              </>
            )}

            {days.map((d, i) => (
              <g key={`b${d.day}`}>
                <rect x={cx(i) - barW - 1} y={yCount(d.products)} width={barW} height={countBottom - yCount(d.products)} rx="2" fill={PRODUCTS} />
                <rect x={cx(i) + 1} y={yCount(d.courses)} width={barW} height={countBottom - yCount(d.courses)} rx="2" fill={COURSES} />
              </g>
            ))}

            {days.map((d, i) =>
              labels.has(i) ? (
                <text key={`x${d.day}`} x={cx(i)} y={countBottom + PAD.bottom + 16} textAnchor="middle" fontSize="11" fill="var(--text-muted)">
                  {dayLabel(d.day)}
                </text>
              ) : null,
            )}
          </svg>
        )}

        {active && hover !== null && width > 0 && (
          <div
            role="presentation"
            className="pointer-events-none absolute top-2 z-10 grid min-w-[170px] gap-1 rounded-[var(--admin-radius-sm)] border border-[var(--border-default)] bg-[var(--surface-raised,#fff)] px-3 py-2 text-[length:var(--text-caption)] shadow-[var(--shadow-sm)]"
            style={{ left: Math.min(Math.max(cx(hover) + 12, 0), Math.max(0, width - 190)) }}
          >
            <strong className="text-[var(--text-primary)]">{dayLabel(active.day, true)}</strong>
            <Row color={REVENUE} label={t("admin.dashboard.sales.revenue")} value={formatMoney(active.revenue, currency, locale)} />
            <Row
              color={BASKET}
              label={t("admin.dashboard.sales.basket")}
              value={active.averageBasket === null ? "–" : formatMoney(active.averageBasket, currency, locale)}
            />
            <Row color={PRODUCTS} label={t("admin.dashboard.sales.products")} value={formatCount(active.products, locale)} />
            <Row color={COURSES} label={t("admin.dashboard.sales.courses")} value={formatCount(active.courses, locale)} />
          </div>
        )}
      </div>

      <table className="sr-only">
        <caption>{t("admin.dashboard.sales.chartLabel")}</caption>
        <thead>
          <tr>
            <th scope="col">{t("admin.dashboard.sales.day")}</th>
            <th scope="col">{t("admin.dashboard.sales.revenue")}</th>
            <th scope="col">{t("admin.dashboard.sales.basket")}</th>
            <th scope="col">{t("admin.dashboard.sales.products")}</th>
            <th scope="col">{t("admin.dashboard.sales.courses")}</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.day}>
              <th scope="row">{dayLabel(d.day, true)}</th>
              <td>{formatMoney(d.revenue, currency, locale)}</td>
              <td>{d.averageBasket === null ? "–" : formatMoney(d.averageBasket, currency, locale)}</td>
              <td>{d.products}</td>
              <td>{d.courses}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Key({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <li className="inline-flex items-center gap-2">
      {children}
      {label}
    </li>
  );
}

function Row({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <span className="flex items-center justify-between gap-3">
      <span className="inline-flex items-center gap-1.5 text-[var(--text-muted)]">
        <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: color }} />
        {label}
      </span>
      <span className="font-semibold tabular-nums text-[var(--text-primary)]">{value}</span>
    </span>
  );
}
