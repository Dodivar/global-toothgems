import { useState } from "react";
import { useTranslation } from "react-i18next";
import { RotateCcw, SlidersHorizontal } from "lucide-react";
import clsx from "clsx";
import { AdminButton } from "../admin/AdminButton";
import { AdminSelect } from "../admin/AdminSelect";
import { SearchInput } from "../admin/SearchInput";
import { useAdminCatalog } from "../../lib/adminCatalog";
import { useLocalized } from "../../lib/localized";
import {
  PROMOTION_SORTS,
  activePromotionFilterCount,
  type PromotionFilters,
} from "../../lib/promotionRules";
import { PROMOTION_STATUSES, PROMOTION_TYPES, type Campaign, type PromotionStatus } from "../../data/adminPromotions";
import { promotionStatusIcon } from "./PromoBadges";
import { BottomSheet } from "./PromoUi";

/**
 * Search, filters and sort for the promotion list.
 *
 * On a laptop everything is on screen at once — five filters is few enough
 * that a "More filters" drawer would only add a click. On a phone the search
 * and the sort stay visible and the rest moves into a bottom sheet, with the
 * active-filter count on its button so nothing is filtered invisibly.
 */
export function PromotionsToolbar({
  filters,
  campaigns,
  showStatus,
  resultCount,
  onChange,
  onReset,
}: {
  filters: PromotionFilters;
  campaigns: Campaign[];
  /** Status chips only make sense on the "All" tab; the other tabs are a status. */
  showStatus: boolean;
  resultCount: number;
  onChange: (patch: Partial<PromotionFilters>) => void;
  onReset: () => void;
}) {
  const { t } = useTranslation();
  const [sheet, setSheet] = useState(false);
  const active = activePromotionFilterCount(filters);

  const sortSelect = (id: string) => (
    <label className="grid gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]">{t("promo.filters.sort")}</span>
      <AdminSelect
        id={id}
        value={filters.sort}
        onChange={(e) => onChange({ sort: e.target.value as PromotionFilters["sort"] })}
        options={PROMOTION_SORTS.map((s) => ({ value: s, label: t(`promo.sort.${s}`) }))}
      />
    </label>
  );

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[200px] flex-1">
          <SearchInput
            id="promo-search"
            value={filters.query}
            onChange={(query) => onChange({ query })}
            label={t("promo.filters.searchLabel")}
            placeholder={t("promo.filters.searchPlaceholder")}
            clearLabel={t("promo.filters.clearSearch")}
          />
        </div>
        <div className="hidden w-[210px] md:block">{sortSelect("promo-sort")}</div>
        <AdminButton
          variant="outline"
          iconLeft={SlidersHorizontal}
          className="md:hidden"
          onClick={() => setSheet(true)}
          aria-label={t("promo.filters.openSheet", { count: active })}
        >
          {t("promo.filters.filters")}
          {active > 0 && (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[var(--gt-ink-900)] px-1 text-[10px] text-[var(--gt-white)]">{active}</span>
          )}
        </AdminButton>
      </div>

      <div className="hidden md:block">
        <FilterFields filters={filters} campaigns={campaigns} showStatus={showStatus} onChange={onChange} layout="inline" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[length:var(--text-caption)] text-[var(--text-muted)]">
        <p className="m-0" aria-live="polite">
          {t("promo.filters.results", { count: resultCount })}
        </p>
        {active > 0 && (
          <AdminButton size="sm" variant="ghost" iconLeft={RotateCcw} onClick={onReset}>
            {t("promo.filters.reset", { count: active })}
          </AdminButton>
        )}
      </div>

      <BottomSheet
        open={sheet}
        title={t("promo.filters.filters")}
        onClose={() => setSheet(false)}
        closeLabel={t("promo.common.close")}
        footer={
          <>
            <AdminButton variant="outline" onClick={onReset} disabled={active === 0} className="flex-1">
              {t("promo.filters.resetShort")}
            </AdminButton>
            <AdminButton variant="dark" onClick={() => setSheet(false)} className="flex-1">
              {t("promo.filters.show", { count: resultCount })}
            </AdminButton>
          </>
        }
      >
        <div className="grid gap-4">
          {sortSelect("promo-sort-mobile")}
          <FilterFields filters={filters} campaigns={campaigns} showStatus={showStatus} onChange={onChange} layout="stack" />
        </div>
      </BottomSheet>
    </div>
  );
}

function FilterFields({
  filters,
  campaigns,
  showStatus,
  onChange,
  layout,
}: {
  filters: PromotionFilters;
  campaigns: Campaign[];
  showStatus: boolean;
  onChange: (patch: Partial<PromotionFilters>) => void;
  layout: "inline" | "stack";
}) {
  const { t } = useTranslation();
  const l = useLocalized();
  const { products } = useAdminCatalog();
  const pre = layout === "inline" ? "d" : "m";

  const toggleStatus = (s: PromotionStatus) =>
    onChange({ statuses: filters.statuses.includes(s) ? filters.statuses.filter((x) => x !== s) : [...filters.statuses, s] });

  const label = (text: string, htmlFor: string) => (
    <label htmlFor={htmlFor} className="text-[11px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]">
      {text}
    </label>
  );

  return (
    <div className="grid gap-3">
      {showStatus && (
        <fieldset className="m-0 border-0 p-0">
          <legend className="mb-1.5 p-0 text-[11px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]">
            {t("promo.filters.status")}
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {PROMOTION_STATUSES.map((s) => {
              const on = filters.statuses.includes(s);
              const Icon = promotionStatusIcon(s);
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleStatus(s)}
                  className={clsx(
                    "inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-pill)] border px-3 text-[length:var(--text-caption)] font-semibold transition-colors",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
                    on
                      ? "border-[var(--gt-ink-900)] bg-[var(--gt-ink-900)] text-[var(--gt-white)]"
                      : "border-[var(--border-default)] bg-[var(--admin-panel)] text-[var(--text-body)] hover:border-[var(--gt-ink-400)]",
                  )}
                >
                  <Icon size={13} aria-hidden="true" />
                  {t(`promo.status.${s}`)}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}
      <div className={clsx("grid gap-3", layout === "inline" && "md:grid-cols-2 xl:grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.3fr)]")}>
        <div className="grid gap-1">
          {label(t("promo.filters.type"), `${pre}-type`)}
          <AdminSelect
            id={`${pre}-type`}
            value={filters.type}
            onChange={(e) => onChange({ type: e.target.value as PromotionFilters["type"] })}
            options={[{ value: "all", label: t("promo.filters.allTypes") }, ...PROMOTION_TYPES.map((x) => ({ value: x, label: t(`promo.type.${x}`) }))]}
          />
        </div>
        <div className="grid gap-1">
          {label(t("promo.filters.campaign"), `${pre}-campaign`)}
          <AdminSelect
            id={`${pre}-campaign`}
            value={filters.campaign}
            onChange={(e) => onChange({ campaign: e.target.value })}
            options={[
              { value: "all", label: t("promo.filters.allCampaigns") },
              { value: "none", label: t("promo.filters.noCampaign") },
              ...campaigns.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
        </div>
        <div className="grid gap-1">
          {label(t("promo.filters.product"), `${pre}-product`)}
          <AdminSelect
            id={`${pre}-product`}
            value={filters.product}
            onChange={(e) => onChange({ product: e.target.value })}
            options={[{ value: "all", label: t("promo.filters.allProducts") }, ...products.map((p) => ({ value: p.id, label: l(p.name) }))]}
          />
        </div>
        <fieldset className="m-0 grid gap-1 border-0 p-0">
          <legend className="mb-1 p-0 text-[11px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]">
            {t("promo.filters.dates")}
          </legend>
          <div className="grid grid-cols-2 gap-2">
            <label className="grid">
              <span className="sr-only">{t("promo.filters.from")}</span>
              <input
                type="date"
                value={filters.from}
                max={filters.to || undefined}
                onChange={(e) => onChange({ from: e.target.value })}
                className="gt-admin-field"
              />
            </label>
            <label className="grid">
              <span className="sr-only">{t("promo.filters.to")}</span>
              <input
                type="date"
                value={filters.to}
                min={filters.from || undefined}
                onChange={(e) => onChange({ to: e.target.value })}
                className="gt-admin-field"
              />
            </label>
          </div>
        </fieldset>
      </div>
    </div>
  );
}
