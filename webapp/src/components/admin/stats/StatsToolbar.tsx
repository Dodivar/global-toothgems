import { useId } from "react";
import { useTranslation } from "react-i18next";
import { CalendarRange, FilterX, History } from "lucide-react";
import clsx from "clsx";
import { AdminButton } from "../AdminButton";
import { AdminSelect, type AdminOption } from "../AdminSelect";
import { useLocalized } from "../../../lib/localized";
import {
  COUNTRY_IDS,
  ORDER_STATUS_IDS,
  RANGE_IDS,
  REVENUE_CATEGORIES,
  analyticsCourseOptions,
  analyticsProductOptions,
  type AnalyticsFilters,
} from "../../../data/adminAnalytics";

/**
 * The controls the whole report hangs off.
 *
 * Two rows, in the order the questions are asked: *when* first — the window and
 * whether it is measured against the one before it — then *what*, the six
 * narrowing filters. Everything applies on the spot; there is no Apply button,
 * because reading a report is a conversation and a two-step control turns every
 * question into two.
 *
 * "Reset filters" only exists once something is filtered, so the resting
 * toolbar stays quiet, and the window is never reset with it: an administrator
 * clearing filters wants the same period, unfiltered.
 */
export function StatsToolbar({
  filters,
  compare,
  activeFilters,
  updatedMinutesAgo,
  onChange,
  onCompare,
  onReset,
}: {
  filters: AnalyticsFilters;
  compare: boolean;
  activeFilters: number;
  updatedMinutesAgo: number;
  onChange: (patch: Partial<AnalyticsFilters>) => void;
  onCompare: (value: boolean) => void;
  onReset: () => void;
}) {
  const { t } = useTranslation();
  const L = useLocalized();
  const groupId = useId();
  const compareId = useId();

  const option = (value: string, label: string): AdminOption => ({ value, label });

  const categoryOptions = [
    option("all", t("admin.stats.filters.allCategories")),
    ...REVENUE_CATEGORIES.map((id) => option(id, t(`admin.stats.category.${id}`))),
  ];
  const productOptions = [
    option("all", t("admin.stats.filters.allProducts")),
    ...analyticsProductOptions().map((p) => option(p.id, L(p.name))),
  ];
  const courseOptions = [
    option("all", t("admin.stats.filters.allCourses")),
    ...analyticsCourseOptions().map((c) => option(c.id, L(c.title))),
  ];
  const customerOptions = [
    option("all", t("admin.stats.filters.allCustomers")),
    option("new", t("admin.stats.customers.new")),
    option("returning", t("admin.stats.customers.returning")),
  ];
  const countryOptions = [
    option("all", t("admin.stats.filters.allCountries")),
    ...COUNTRY_IDS.map((id) => option(id, t(`admin.stats.country.${id}`))),
  ];
  const statusOptions = [
    option("all", t("admin.stats.filters.allStatuses")),
    ...ORDER_STATUS_IDS.map((id) => option(id, t(`admin.stats.orderStatus.${id}`))),
  ];

  return (
    <section aria-label={t("admin.stats.filters.label")} className="gt-admin-panel grid gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        {/* Native radios rather than painted buttons: the platform gives the
            group semantics and arrow-key movement, which a row of <button>s
            would have to re-implement to be equivalent. */}
        <fieldset className="m-0 min-w-0 border-0 p-0">
          <legend className="sr-only">{t("admin.stats.range.label")}</legend>
          <div className="gt-admin-scroll -mx-1 flex gap-1.5 overflow-x-auto px-1 py-0.5">
            {RANGE_IDS.map((id) => {
              const selected = filters.range === id;
              return (
                <label
                  key={id}
                  className={clsx(
                    "relative flex-none cursor-pointer rounded-[var(--radius-pill)] border px-3 py-1.5 text-[length:var(--text-caption)] font-semibold transition-colors",
                    "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus-ring)]",
                    selected
                      ? "border-[var(--gt-ink-900)] bg-[var(--gt-ink-900)] text-[var(--text-inverse)]"
                      : "border-[var(--border-default)] bg-[var(--admin-panel)] text-[var(--text-body)] hover:bg-[var(--gt-ink-100)]",
                  )}
                >
                  <input
                    type="radio"
                    name={groupId}
                    value={id}
                    checked={selected}
                    onChange={() => onChange({ range: id })}
                    className="sr-only"
                  />
                  {t(`admin.stats.range.${id}`)}
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          {/* Compact switch. Same mechanism as `ToggleSwitch` — a real checkbox
              under a painted track — but laid out inline for a toolbar, and with
              the whole thing inside the label so the track is a hit target too:
              the switch is what the eye aims at. */}
          <label htmlFor={compareId} className="flex cursor-pointer items-center gap-2.5">
            <span className="text-[length:var(--text-caption)] font-semibold text-[var(--text-body)]">
              {t("admin.stats.compare")}
            </span>
            <span className="relative inline-flex flex-none items-center">
              <input
                id={compareId}
                type="checkbox"
                role="switch"
                checked={compare}
                onChange={(event) => onCompare(event.target.checked)}
                className="peer sr-only"
              />
              <span
                aria-hidden="true"
                className="block h-5 w-9 rounded-[var(--radius-pill)] bg-[var(--gt-ink-300)] transition-colors duration-[var(--duration-fast)] peer-checked:bg-[var(--gt-emerald-500)] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--focus-ring)]"
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-[var(--gt-white)] shadow-[var(--shadow-xs)] transition-transform duration-[var(--duration-fast)] peer-checked:translate-x-4"
              />
            </span>
          </label>

          <span className="inline-flex items-center gap-1.5 text-[length:var(--text-caption)] text-[var(--text-muted)]">
            <History size={13} strokeWidth={1.9} aria-hidden="true" />
            {updatedMinutesAgo === 0
              ? t("admin.stats.updatedNow")
              : t("admin.stats.updatedAgo", { count: updatedMinutesAgo })}
          </span>
        </div>
      </div>

      {filters.range === "custom" && (
        <div className="flex flex-wrap items-end gap-3 rounded-[var(--admin-radius-sm)] bg-[var(--admin-panel-sunken)] p-3">
          <span className="inline-flex items-center gap-1.5 text-[length:var(--text-caption)] font-semibold text-[var(--text-body)]">
            <CalendarRange size={14} strokeWidth={1.9} aria-hidden="true" />
            {t("admin.stats.range.custom")}
          </span>
          <label className="grid gap-1">
            <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("admin.stats.range.from")}</span>
            <input
              type="date"
              value={filters.customFrom}
              max={filters.customTo}
              onChange={(event) => onChange({ customFrom: event.target.value || filters.customFrom })}
              className="gt-admin-field w-auto"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("admin.stats.range.to")}</span>
            <input
              type="date"
              value={filters.customTo}
              min={filters.customFrom}
              onChange={(event) => onChange({ customTo: event.target.value || filters.customTo })}
              className="gt-admin-field w-auto"
            />
          </label>
        </div>
      )}

      <div className="grid gap-3 border-t border-[var(--border-subtle)] pt-4 md:grid-cols-2 xl:grid-cols-3">
        <AdminSelect
          aria-label={t("admin.stats.filters.category")}
          options={categoryOptions}
          value={filters.category}
          onChange={(event) => onChange({ category: event.target.value as AnalyticsFilters["category"] })}
        />
        <AdminSelect
          aria-label={t("admin.stats.filters.product")}
          options={productOptions}
          value={filters.product}
          onChange={(event) => onChange({ product: event.target.value })}
        />
        <AdminSelect
          aria-label={t("admin.stats.filters.course")}
          options={courseOptions}
          value={filters.course}
          onChange={(event) => onChange({ course: event.target.value })}
        />
        <AdminSelect
          aria-label={t("admin.stats.filters.customerType")}
          options={customerOptions}
          value={filters.customerType}
          onChange={(event) => onChange({ customerType: event.target.value as AnalyticsFilters["customerType"] })}
        />
        <AdminSelect
          aria-label={t("admin.stats.filters.country")}
          options={countryOptions}
          value={filters.country}
          onChange={(event) => onChange({ country: event.target.value as AnalyticsFilters["country"] })}
        />
        <AdminSelect
          aria-label={t("admin.stats.filters.orderStatus")}
          options={statusOptions}
          value={filters.orderStatus}
          onChange={(event) => onChange({ orderStatus: event.target.value as AnalyticsFilters["orderStatus"] })}
        />
      </div>

      {activeFilters > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p role="status" aria-live="polite" className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">
            {t("admin.stats.filters.active", { count: activeFilters })}
          </p>
          <AdminButton size="sm" variant="ghost" iconLeft={FilterX} onClick={onReset}>
            {t("admin.stats.filters.reset")}
          </AdminButton>
        </div>
      )}
    </section>
  );
}
