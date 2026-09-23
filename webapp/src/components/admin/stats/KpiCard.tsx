import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Info, Minus, TrendingDown, TrendingUp } from "lucide-react";
import clsx from "clsx";
import type { KpiDatum } from "../../../data/adminAnalytics";
import { formatChange, formatPercent } from "../../../lib/adminAnalytics";
import { formatCount, formatPrice } from "../../../lib/format";
import { Sparkline } from "./Sparkline";

/**
 * One headline figure.
 *
 * Three things and no more: the number, what it is, and which way it moved.
 * The definition sits behind a button rather than in the card, because a
 * sentence of explanation on eight cards is eight sentences an administrator
 * reads past every morning — and behind a *button* rather than a hover tooltip,
 * so it is reachable on a touch screen and by keyboard.
 *
 * Direction is never colour alone: the chip carries an arrow, a signed number
 * and, for a screen reader, the period it is measured against.
 */
export function KpiCard({ kpi, compare }: { kpi: KpiDatum; compare: boolean }) {
  const { t } = useTranslation();
  const [explained, setExplained] = useState(false);

  const value =
    kpi.format === "currency"
      ? formatPrice(kpi.value)
      : kpi.format === "percent"
        ? formatPercent(kpi.value)
        : formatCount(kpi.value);

  const previous =
    kpi.format === "currency"
      ? formatPrice(kpi.previous)
      : kpi.format === "percent"
        ? formatPercent(kpi.previous)
        : formatCount(kpi.previous);

  const TrendIcon = kpi.trend === "up" ? TrendingUp : kpi.trend === "down" ? TrendingDown : Minus;
  const chip = {
    up: "border-[var(--gt-emerald-300)] bg-[var(--status-success-bg)] text-[var(--status-success-fg)]",
    down: "border-[var(--gt-red-400)] bg-[var(--status-error-bg)] text-[var(--status-error-fg)]",
    flat: "border-[var(--border-subtle)] bg-[var(--surface-sunken)] text-[var(--text-muted)]",
  }[kpi.trend];

  return (
    <li
      // The two figures the business is run on get their own row above the
      // others and a bigger number. A dashboard where every card shouts says
      // nothing at all.
      className="gt-admin-panel grid content-start gap-2 p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-[length:var(--text-caption)] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]">
          {t(`admin.stats.kpi.${kpi.id}.label`)}
        </h3>
        <button
          type="button"
          aria-expanded={explained}
          aria-label={t("admin.stats.kpi.explain", { name: t(`admin.stats.kpi.${kpi.id}.label`) })}
          onClick={() => setExplained((open) => !open)}
          className={clsx(
            "-m-1 grid h-7 w-7 flex-none place-items-center rounded-[var(--admin-radius-sm)] transition-colors",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
            explained ? "bg-[var(--gt-ink-100)] text-[var(--text-primary)]" : "text-[var(--text-subtle)] hover:bg-[var(--gt-ink-100)] hover:text-[var(--text-primary)]",
          )}
        >
          <Info size={14} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
        <strong
          className={clsx(
            "leading-none text-[var(--text-primary)]",
            kpi.lead ? "text-[length:var(--text-h2)]" : "text-[length:var(--text-h3)]",
          )}
        >
          {value}
        </strong>
        <Sparkline
          values={kpi.spark}
          tone={kpi.trend === "up" ? "positive" : kpi.trend === "down" ? "negative" : "neutral"}
          width={kpi.lead ? 108 : 76}
          height={kpi.lead ? 34 : 28}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span
          className={clsx(
            "inline-flex items-center gap-1 rounded-[var(--radius-pill)] border px-2 py-0.5 text-[length:var(--text-caption)] font-semibold tabular-nums",
            chip,
          )}
        >
          <TrendIcon size={12} strokeWidth={2.4} aria-hidden="true" />
          {formatChange(kpi.change, kpi.changeUnit)}
        </span>
        <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
          {compare ? t("admin.stats.kpi.versusValue", { value: previous }) : t("admin.stats.kpi.versus")}
        </span>
      </div>

      {explained && (
        <p className="m-0 border-t border-[var(--border-subtle)] pt-2 text-[length:var(--text-caption)] leading-[var(--leading-normal)] text-[var(--text-muted)]">
          {t(`admin.stats.kpi.${kpi.id}.hint`)}
        </p>
      )}
    </li>
  );
}
