import { useTranslation } from "react-i18next";
import { FilterX } from "lucide-react";
import { AdminButton } from "./AdminButton";
import { AdminSelect, type AdminOption } from "./AdminSelect";
import { SearchInput } from "./SearchInput";
import { useLocalized } from "../../lib/localized";
import { useAdminCatalog } from "../../lib/adminCatalog";
import { type CategoryId, type ProductStatus, type StockState } from "../../data/adminCatalog";
import { DEFAULT_FILTERS, SORT_KEYS, isFiltered, type ProductFilterState, type SortKey } from "../../lib/productFilters";

/**
 * The toolbar above the product list.
 *
 * Every control changes the list on the spot — there is no Apply button,
 * because filtering a sixteen-product catalogue should cost one interaction,
 * not two. `Clear` appears only once something is actually filtered, so the
 * toolbar stays quiet in its resting state.
 */
export function ProductFilters({
  filters,
  onChange,
  resultCount,
  totalCount,
}: {
  filters: ProductFilterState;
  onChange: (next: ProductFilterState) => void;
  resultCount: number;
  totalCount: number;
}) {
  const { t } = useTranslation();
  const L = useLocalized();
  const { categories } = useAdminCatalog();

  const set = <K extends keyof ProductFilterState>(key: K, value: ProductFilterState[K]) =>
    onChange({ ...filters, [key]: value });

  const categoryOptions: AdminOption[] = [
    { value: "all", label: t("admin.filters.allCategories") },
    ...categories.map((c) => ({ value: c.id, label: L(c.name) })),
  ];

  const statusOptions: AdminOption[] = [
    { value: "all", label: t("admin.filters.allStatuses") },
    ...(["active", "draft", "archived"] as ProductStatus[]).map((s) => ({
      value: s,
      label: t(`admin.state.${s}`),
    })),
  ];

  const availabilityOptions: AdminOption[] = [
    { value: "all", label: t("admin.filters.allAvailability") },
    ...(["in_stock", "low_stock", "out_of_stock", "preorder"] as StockState[]).map((s) => ({
      value: s,
      label: t(`admin.stock.${s}`),
    })),
  ];

  const sortOptions: AdminOption[] = SORT_KEYS.map((key) => ({
    value: key,
    label: t(`admin.sort.${key}`),
  }));

  const filtered = isFiltered(filters);

  return (
    <section aria-label={t("admin.filters.label")} className="gt-admin-panel grid gap-3 p-4">
      {/* Sized from each control's longest option rather than evenly: a filter
          whose current value is cut off has stopped saying what it is doing. */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-[minmax(190px,1.3fr)_minmax(170px,1.1fr)_minmax(140px,1fr)_minmax(175px,1.1fr)_minmax(215px,1.3fr)]">
        <SearchInput
          value={filters.search}
          onChange={(value) => set("search", value)}
          label={t("admin.filters.searchLabel")}
          placeholder={t("admin.filters.searchPlaceholder")}
          clearLabel={t("admin.filters.clearSearch")}
        />

        <label className="grid gap-1">
          <span className="sr-only">{t("admin.filters.category")}</span>
          <AdminSelect
            aria-label={t("admin.filters.category")}
            options={categoryOptions}
            value={filters.category}
            onChange={(e) => set("category", e.target.value as CategoryId | "all")}
          />
        </label>

        <label className="grid gap-1">
          <span className="sr-only">{t("admin.filters.status")}</span>
          <AdminSelect
            aria-label={t("admin.filters.status")}
            options={statusOptions}
            value={filters.status}
            onChange={(e) => set("status", e.target.value as ProductStatus | "all")}
          />
        </label>

        <label className="grid gap-1">
          <span className="sr-only">{t("admin.filters.availability")}</span>
          <AdminSelect
            aria-label={t("admin.filters.availability")}
            options={availabilityOptions}
            value={filters.availability}
            onChange={(e) => set("availability", e.target.value as StockState | "all")}
          />
        </label>

        <label className="flex items-center gap-2">
          <span className="flex-none text-[length:var(--text-caption)] font-semibold text-[var(--text-muted)]">
            {t("admin.filters.sort")}
          </span>
          <AdminSelect
            aria-label={t("admin.filters.sort")}
            options={sortOptions}
            value={filters.sort}
            onChange={(e) => set("sort", e.target.value as SortKey)}
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Polite, not assertive: the count updates on every keystroke, and an
            assertive region would interrupt the typing that caused it. */}
        <p role="status" aria-live="polite" className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">
          {filtered
            ? t("admin.filters.resultCountFiltered", { count: resultCount, total: totalCount })
            : t("admin.filters.resultCount", { count: resultCount })}
        </p>

        {filtered && (
          <AdminButton size="sm" variant="ghost" iconLeft={FilterX} onClick={() => onChange({ ...DEFAULT_FILTERS, sort: filters.sort })}>
            {t("admin.filters.clear")}
          </AdminButton>
        )}
      </div>
    </section>
  );
}
