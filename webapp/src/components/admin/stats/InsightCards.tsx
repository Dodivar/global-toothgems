import { useTranslation } from "react-i18next";
import { Lightbulb, Sparkles, TrendingDown, type LucideIcon } from "lucide-react";
import clsx from "clsx";
import type { InsightDatum } from "../../../data/adminAnalytics";
import { ADMIN_PRODUCTS } from "../../../data/adminCatalog";
import { formatPercent } from "../../../lib/adminAnalytics";
import { formatPrice } from "../../../lib/format";
import { useLocalized } from "../../../lib/localized";

/**
 * What the numbers above add up to, in sentences.
 *
 * Every card is generated from the snapshot the rest of the page is drawn from,
 * so an insight cannot contradict the chart beside it — and it disappears
 * rather than lies when a filter removes what it was about.
 *
 * The tone is informative, never alarmist: a slowing product is stated with the
 * figure and left there. An administrator decides what is a problem.
 */

const TONE: Record<InsightDatum["tone"], { icon: LucideIcon; chip: string }> = {
  positive: { icon: Sparkles, chip: "bg-[var(--status-success-bg)] text-[var(--status-success-fg)]" },
  neutral: { icon: Lightbulb, chip: "bg-[var(--gt-blue-100)] text-[var(--gt-blue-700)]" },
  attention: { icon: TrendingDown, chip: "bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]" },
};

export function InsightCards({ insights }: { insights: InsightDatum[] }) {
  const { t } = useTranslation();
  const L = useLocalized();

  /** Product ids and raw figures become words here, not in the fixture. */
  const values = (insight: InsightDatum): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(insight.values)) {
      if (key === "name") {
        const product = ADMIN_PRODUCTS.find((p) => p.id === value);
        out[key] = product ? L(product.name) : String(value);
      } else if (key === "revenue") {
        out[key] = formatPrice(Number(value));
      } else {
        out[key] = formatPercent(Number(value));
      }
    }
    return out;
  };

  return (
    <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 xl:grid-cols-3">
      {insights.map((insight) => {
        const tone = TONE[insight.tone];
        return (
          <li
            key={insight.id}
            className="flex items-start gap-3 rounded-[var(--admin-radius-sm)] border border-[var(--border-subtle)] bg-[var(--admin-panel-sunken)] p-3.5"
          >
            <span aria-hidden="true" className={clsx("grid h-8 w-8 flex-none place-items-center rounded-[var(--admin-radius-sm)]", tone.chip)}>
              <tone.icon size={15} strokeWidth={2} />
            </span>
            <p className="m-0 text-[length:var(--text-body-sm)] leading-[var(--leading-normal)] text-[var(--text-body)]">
              {t(`admin.stats.insights.${insight.id}`, values(insight))}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
