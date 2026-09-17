import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PackageSearch } from "lucide-react";
import { EmptyState } from "./EmptyState";
import { TableLoadingState } from "./LoadingState";
import { ProductRow, type ProductRowActions } from "./ProductRow";
import type { AdminProduct } from "../../data/adminCatalog";

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
}: {
  products: AdminProduct[];
  actions: ProductRowActions;
  loading: boolean;
  selectedId?: string | null;
  /** Offered in the empty state — create a product, or clear the filters. */
  emptyAction?: ReactNode;
  filtered: boolean;
}) {
  const { t } = useTranslation();

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
        <table className="w-full min-w-[980px] table-fixed border-collapse text-left">
          <caption className="sr-only">{t("admin.table.caption")}</caption>
          <colgroup>
            <col style={{ width: 76 }} />
            {/* The product name takes whatever the other eight leave. */}
            <col />
            <col style={{ width: 120 }} />
            <col style={{ width: 140 }} />
            <col style={{ width: 96 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 132 }} />
            <col style={{ width: 104 }} />
            <col style={{ width: 84 }} />
          </colgroup>
          <thead className="gt-admin-thead">
            <tr className="text-[length:var(--text-caption)] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]">
              <th scope="col" className="py-3 pl-5 pr-2 font-semibold">
                <span className="sr-only">{t("admin.table.image")}</span>
              </th>
              <th scope="col" className="py-3 pr-4 font-semibold">{t("admin.table.product")}</th>
              <th scope="col" className="py-3 pr-4 font-semibold">{t("admin.table.sku")}</th>
              <th scope="col" className="py-3 pr-4 font-semibold">{t("admin.table.category")}</th>
              <th scope="col" className="py-3 pr-4 font-semibold">{t("admin.table.price")}</th>
              <th scope="col" className="py-3 pr-4 font-semibold">{t("admin.table.stock")}</th>
              <th scope="col" className="py-3 pr-4 font-semibold">{t("admin.table.status")}</th>
              <th scope="col" className="py-3 pr-4 font-semibold">{t("admin.table.updated")}</th>
              <th scope="col" className="py-3 pr-4 text-right font-semibold">
                <span className="sr-only">{t("admin.table.actions")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <ProductRow
                key={product.id}
                product={product}
                actions={actions}
                selected={selectedId === product.id}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
