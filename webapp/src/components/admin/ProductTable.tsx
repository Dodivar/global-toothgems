import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PackageSearch } from "lucide-react";
import { EmptyState } from "./EmptyState";
import { TableLoadingState } from "./LoadingState";
import { ProductRow, type ProductRowActions } from "./ProductRow";
import { variantAlerts, type AdminProduct } from "../../data/adminCatalog";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { columnSortDirection, nextColumnSort, type ProductFilterState, type SortColumn } from "../../lib/productFilters";

/**
 * The catalogue, as a real table.
 *
 * `<table>` rather than a grid of divs: the columns carry meaning, and the
 * semantics are what let a screen reader say "Price, 89 €" instead of reading a
 * bare number. The head is sticky so those column names survive scrolling, and
 * the horizontal scroll only engages below the desktop widths this workspace is
 * designed for.
 */
export function ProductTable({
  products,
  actions,
  loading,
  selectedId,
  emptyAction,
  filtered,
  filters,
  expandAlerts = false,
  onSort,
}: {
  products: AdminProduct[];
  actions: ProductRowActions;
  loading: boolean;
  selectedId?: string | null;
  /** Offered in the empty state — create a product, or clear the filters. */
  emptyAction?: ReactNode;
  filtered: boolean;
  /** The list's filters, which the rows' category, shape and colour toggles reflect. */
  filters: ProductFilterState;
  /**
   * Unfold, from the start, the options of every product that has one
   * needing restocking: set while the list is filtered on low or out of stock.
   */
  expandAlerts?: boolean;
  /** A click on a sortable column header; receives the new sort key. */
  onSort: (sort: ProductFilterState["sort"]) => void;
}) {
  const { t } = useTranslation();

  const sortableHead = (column: SortColumn, label: string, className: string) => {
    const direction = columnSortDirection(column, filters.sort);
    const Icon = direction === "ascending" ? ArrowUp : direction === "descending" ? ArrowDown : ChevronsUpDown;
    return (
      <th scope="col" aria-sort={direction ?? "none"} className={`${className} font-semibold`}>
        <button
          type="button"
          onClick={() => onSort(nextColumnSort(column, filters.sort))}
          className="inline-flex cursor-pointer items-center gap-1 rounded-sm border-0 bg-transparent p-0 font-[inherit] text-[length:inherit] font-semibold uppercase tracking-[inherit] text-inherit hover:text-[var(--text-strong,inherit)]"
        >
          {label}
          <Icon size={12} aria-hidden="true" className={direction ? "" : "opacity-40"} />
        </button>
      </th>
    );
  };

  if (loading) {
    return (
      <div className="gt-admin-panel overflow-hidden">
        <TableLoadingState label={t("admin.table.loading")} />
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="gt-admin-panel">
        <EmptyState
          icon={PackageSearch}
          title={filtered ? t("admin.table.emptyFilteredTitle") : t("admin.table.emptyTitle")}
          body={filtered ? t("admin.table.emptyFilteredBody") : t("admin.table.emptyBody")}
          action={emptyAction}
        />
      </div>
    );
  }

  return (
    <div className="gt-admin-panel overflow-hidden">
      <div className="gt-admin-scroll max-h-[calc(100vh-320px)] overflow-auto">
        {/* `table-fixed`, not auto: with automatic layout the browser is free to
            squeeze the thumbnail column, and Tailwind's `img { max-width: 100% }`
            then shrinks the 44px thumbnails into slivers. Fixed layout makes the
            colgroup below binding and leaves the remainder to the name column. */}
        <table className="w-full min-w-[1080px] table-fixed border-collapse text-left">
          <caption className="sr-only">{t("admin.table.caption")}</caption>
          <colgroup>
            {/* Options toggle + thumbnail. */}
            <col style={{ width: 100 }} />
            {/* The product name takes whatever the other eight leave. */}
            <col />
            <col style={{ width: 120 }} />
            <col style={{ width: 140 }} />
            <col style={{ width: 96 }} />
            <col style={{ width: 150 }} />
            <col style={{ width: 132 }} />
            <col style={{ width: 104 }} />
            <col style={{ width: 120 }} />
          </colgroup>
          <thead className="gt-admin-thead">
            <tr className="text-[length:var(--text-caption)] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]">
              <th scope="col" className="py-3 pl-2 pr-2 font-semibold">
                <span className="sr-only">{t("admin.table.image")}</span>
              </th>
              {sortableHead("name", t("admin.table.product"), "py-3 pr-4")}
              {sortableHead("sku", t("admin.table.sku"), "py-3 pr-4")}
              {sortableHead("category", t("admin.table.category"), "py-3 pr-4")}
              {sortableHead("price", t("admin.table.price"), "py-3 pr-4")}
              {sortableHead("stock", t("admin.table.stock"), "py-3 pr-4")}
              {sortableHead("status", t("admin.table.status"), "py-3 pr-4")}
              {sortableHead("updated", t("admin.table.updated"), "py-3 pr-4")}
              <th scope="col" className="py-3 pr-4 text-right font-semibold">
                <span className="sr-only">{t("admin.table.actions")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <ProductRow
                // Re-keyed when `expandAlerts` flips, so switching the filter
                // re-applies the default instead of keeping stale toggles.
                key={`${product.id}:${expandAlerts}`}
                product={product}
                actions={actions}
                selected={selectedId === product.id}
                filters={filters}
                defaultExpanded={expandAlerts && variantAlerts(product).length > 0}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
