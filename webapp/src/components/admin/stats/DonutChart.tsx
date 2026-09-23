import { useState } from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import { CATEGORY_COLOR, type CategoryDatum } from "../../../data/adminAnalytics";
import { formatPercent } from "../../../lib/adminAnalytics";
import { formatPrice } from "../../../lib/format";

/**
 * Where the period's revenue came from.
 *
 * The ring answers "is one category carrying the store"; the list beside it
 * answers "by how much", and it is a real table rather than a legend — the
 * segments are small on a phone and colour alone is never the way to a figure
 * here. Hovering or focusing either side lifts the other, so the two read as one
 * object.
 *
 * Categories keep their colour whatever their rank, and they are drawn in
 * catalogue order rather than by size: re-ordering by value would repaint the
 * chart every time a filter changed, and the order the segments touch in is
 * what the palette was checked against for colour-blind separation.
 */
export function DonutChart({ data, total }: { data: CategoryDatum[]; total: number }) {
  const { t } = useTranslation();
  const [active, setActive] = useState<string | null>(null);

  const size = 208;
  const stroke = 26;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  /** Surface-coloured gap, so neighbouring segments never merge into one arc. */
  const gap = data.length > 1 ? 3 : 0;

  let offset = 0;
  const arcs = data.map((slice) => {
    const length = total > 0 ? (slice.revenue / total) * circumference : 0;
    const arc = { id: slice.id, dash: Math.max(0, length - gap), offset };
    offset += length;
    return arc;
  });

  const leader = [...data].sort((a, b) => b.revenue - a.revenue)[0];

  return (
    <div className="grid items-center gap-6 sm:grid-cols-[auto_minmax(0,1fr)]">
      <div className="relative mx-auto" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="presentation" focusable="false">
          <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="var(--surface-sunken)"
              strokeWidth={stroke}
            />
            {arcs.map((arc) => (
              <circle
                key={arc.id}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={CATEGORY_COLOR[arc.id]}
                strokeWidth={active === arc.id ? stroke + 6 : stroke}
                strokeDasharray={`${arc.dash} ${circumference - arc.dash}`}
                strokeDashoffset={-arc.offset}
                className="transition-[stroke-width] duration-[var(--duration-fast)]"
                opacity={active && active !== arc.id ? 0.45 : 1}
              />
            ))}
          </g>
        </svg>
        {/* The hole is not decoration: it carries the total the shares are of. */}
        <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
          <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
            {t("admin.stats.breakdown.total")}
          </span>
          <strong className="text-[length:var(--text-h3)] leading-tight text-[var(--text-primary)]">
            {formatPrice(total)}
          </strong>
        </div>
      </div>

      <table className="w-full border-collapse text-[length:var(--text-body-sm)]">
        <caption className="sr-only">{t("admin.stats.breakdown.caption")}</caption>
        <thead className="sr-only">
          <tr>
            <th scope="col">{t("admin.stats.breakdown.category")}</th>
            <th scope="col">{t("admin.stats.metric.revenue")}</th>
            <th scope="col">{t("admin.stats.breakdown.share")}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((slice) => (
            <tr
              key={slice.id}
              onMouseEnter={() => setActive(slice.id)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(slice.id)}
              onBlur={() => setActive(null)}
              tabIndex={0}
              className={clsx(
                "border-b border-[var(--border-subtle)] last:border-b-0 transition-colors",
                "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
                active === slice.id && "bg-[var(--gt-blue-50)]",
              )}
            >
              <th scope="row" className="py-2 pr-3 text-left font-medium">
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 flex-none rounded-[3px]"
                    style={{ background: CATEGORY_COLOR[slice.id] }}
                  />
                  <span className="text-[var(--text-primary)]">{t(`admin.stats.category.${slice.id}`)}</span>
                  {leader?.id === slice.id && data.length > 1 && (
                    <span className="rounded-[var(--radius-pill)] border border-[var(--gt-blue-200)] bg-[var(--gt-blue-50)] px-1.5 py-px text-[10px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--gt-blue-700)]">
                      {t("admin.stats.breakdown.leader")}
                    </span>
                  )}
                </span>
              </th>
              <td className="whitespace-nowrap py-2 text-right font-semibold tabular-nums text-[var(--text-primary)]">
                {formatPrice(slice.revenue)}
              </td>
              <td className="whitespace-nowrap py-2 pl-3 text-right tabular-nums text-[var(--text-muted)]">
                {formatPercent(slice.share)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
