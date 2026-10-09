import { useTranslation } from "react-i18next";
import { HeartHandshake, Sprout, type LucideIcon } from "lucide-react";
import { SHOP_CURRENCY, type CrossDatum } from "../../../data/adminAnalytics";
import { formatPercent } from "../../../lib/adminAnalytics";
import { useFormat } from "../../../lib/format";

/**
 * What customers buy together. Today `analytics_snapshot()` measures one such
 * figure (jewellery orders that also carry aftercare); a figure that comes with
 * a store-wide benchmark is shown against it, because "47 %" means nothing until
 * you know the house average.
 */

const ICONS: Record<string, LucideIcon> = {
  aftercareAttach: HeartHandshake,
};

export function EcosystemGrid({ rows }: { rows: CrossDatum[] }) {
  const { formatMoney } = useFormat();
  const { t } = useTranslation();
  const show = (value: number, format: CrossDatum["format"]) =>
    format === "currency" ? formatMoney(value, SHOP_CURRENCY) : formatPercent(value);

  return (
    <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 xl:grid-cols-4">
      {rows.map((row) => {
        const Icon = ICONS[row.id] ?? Sprout;
        return (
          <li key={row.id} className="grid content-start gap-2 rounded-[var(--admin-radius-sm)] border border-[var(--border-subtle)] p-4">
            <span
              aria-hidden="true"
              className="grid h-8 w-8 place-items-center rounded-[var(--admin-radius-sm)] bg-[var(--gt-fuchsia-50)] text-[var(--accent-highlight-ink)]"
            >
              <Icon size={15} strokeWidth={1.9} />
            </span>
            <strong className="text-[length:var(--text-h3)] leading-none text-[var(--text-primary)]">
              {show(row.value, row.format)}
            </strong>
            <span className="text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">
              {t(`admin.stats.cross.${row.id}.label`)}
            </span>
            <span className="text-[length:var(--text-caption)] leading-[var(--leading-normal)] text-[var(--text-muted)]">
              {row.benchmark === undefined
                ? t(`admin.stats.cross.${row.id}.hint`)
                : t("admin.stats.cross.benchmark", { value: show(row.benchmark, row.format) })}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
