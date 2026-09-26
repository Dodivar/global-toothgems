import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowUp, CircleCheck, CircleSlash, Clock3, TrendingDown, TrendingUp, TriangleAlert } from "lucide-react";
import clsx from "clsx";
import type { LucideIcon } from "lucide-react";
import type { StockState } from "../../../data/adminCatalog";
import type { ProductDatum } from "../../../data/adminAnalytics";
import { formatChange, formatPercent, sortProducts, type ProductSortKey } from "../../../lib/adminAnalytics";
import { formatCount, formatPrice } from "../../../lib/format";
import { useLocalized } from "../../../lib/localized";
import { AdminSelect } from "../AdminSelect";

/**
 * The period's best sellers.
 *
 * A table on a laptop and cards on a phone — the same eight rows either way.
 * Squeezing seven numeric columns into 360px produces something technically
 * responsive and practically unreadable, and this list is one an administrator
 * actually reads on the way to the studio.
 *
 * Rank is a number in a quiet column rather than a medal: this is a product
 * report, and a podium would invite the wrong kind of attention to positions
 * that swap on a single order.
 */

const STOCK_META: Record<StockState, { icon: LucideIcon; className: string }> = {
  in_stock: { icon: CircleCheck, className: "border-[var(--gt-emerald-300)] bg-[var(--status-success-bg)] text-[var(--status-success-fg)]" },
  low_stock: { icon: TriangleAlert, className: "border-[var(--gt-amber-400)] bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]" },
  out_of_stock: { icon: CircleSlash, className: "border-[var(--gt-red-400)] bg-[var(--status-error-bg)] text-[var(--status-error-fg)]" },
  preorder: { icon: Clock3, className: "border-[var(--gt-blue-200)] bg-[var(--gt-blue-50)] text-[var(--gt-blue-700)]" },
};

function StockPill({ state }: { state: StockState }) {
  const { t } = useTranslation();
  const meta = STOCK_META[state];
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-[var(--radius-pill)] border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[var(--tracking-wide)]",
        meta.className,
      )}
    >
      <meta.icon size={11} strokeWidth={2.2} aria-hidden="true" />
      {t(`admin.stock.${state}`)}
    </span>
  );
}

function ChangeChip({ value }: { value: number }) {
  const Icon = value >= 0 ? TrendingUp : TrendingDown;
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 whitespace-nowrap text-[length:var(--text-caption)] font-semibold tabular-nums",
        value >= 0 ? "text-[var(--status-success-fg)]" : "text-[var(--status-error-fg)]",
      )}
    >
      <Icon size={12} strokeWidth={2.4} aria-hidden="true" />
      {formatChange(value)}
    </span>
  );
}

const COLUMNS: { key: ProductSortKey; labelKey: string }[] = [
  { key: "units", labelKey: "admin.stats.products.units" },
  { key: "revenue", labelKey: "admin.stats.products.revenue" },
  { key: "orders", labelKey: "admin.stats.products.orders" },
  { key: "conversion", labelKey: "admin.stats.products.conversion" },
];

export function TopProducts({
  products,
  sort,
  ascending,
  onSort,
}: {
  products: ProductDatum[];
  sort: ProductSortKey;
  ascending: boolean;
  onSort: (key: ProductSortKey, ascending: boolean) => void;
}) {
  const { t } = useTranslation();
  const L = useLocalized();
  const rows = sortProducts(products, sort, ascending);

  const cell = (product: ProductDatum, key: ProductSortKey) =>
    key === "revenue"
      ? formatPrice(product.revenue)
      : key === "conversion"
        ? formatPercent(product.conversion)
        : formatCount(product[key]);

  return (
    <>
      {/* Below the table breakpoint the sort lives in a select, since there are
          no column headers to press. */}
      <div className="mb-3 flex items-center gap-2 lg:hidden">
        <span className="flex-none text-[length:var(--text-caption)] font-semibold text-[var(--text-muted)]">
          {t("admin.stats.products.sortBy")}
        </span>
        <AdminSelect
          aria-label={t("admin.stats.products.sortBy")}
          options={COLUMNS.map((column) => ({ value: column.key, label: t(column.labelKey) }))}
          value={sort}
          onChange={(event) => onSort(event.target.value as ProductSortKey, false)}
        />
      </div>

      <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2 lg:hidden">
        {rows.map((product, index) => (
          <li key={product.id} className="grid gap-2 rounded-[var(--admin-radius-sm)] border border-[var(--border-subtle)] p-3">
            <div className="flex items-start gap-3">
              <span aria-hidden="true" className="w-4 flex-none pt-1 text-[length:var(--text-caption)] tabular-nums text-[var(--text-subtle)]">
                {index + 1}
              </span>
              {product.thumbnail && (
                <img
                  src={product.thumbnail}
                  alt=""
                  loading="lazy"
                  className="h-11 w-11 flex-none rounded-[var(--admin-radius-sm)] border border-[var(--border-subtle)] object-cover"
                />
              )}
              <span className="grid min-w-0 flex-1 gap-1">
                <span className="truncate text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">
                  {L(product.name)}
                </span>
                <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
                  {t(`admin.stats.category.${product.bucket}`)}
                </span>
              </span>
              <StockPill state={product.stock} />
            </div>
            <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-[var(--border-subtle)] pt-2">
              {COLUMNS.map((column) => (
                <div key={column.key} className="flex items-baseline justify-between gap-2">
                  <dt className="text-[length:var(--text-caption)] text-[var(--text-muted)]">{t(column.labelKey)}</dt>
                  <dd className="m-0 text-[length:var(--text-body-sm)] font-semibold tabular-nums text-[var(--text-primary)]">
                    {cell(product, column.key)}
                  </dd>
                </div>
              ))}
              <div className="col-span-2 flex items-baseline justify-between gap-2">
                <dt className="text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("admin.stats.products.change")}</dt>
                <dd className="m-0"><ChangeChip value={product.change} /></dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>

      <div className="gt-admin-scroll hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[860px] border-collapse text-[length:var(--text-body-sm)]">
          <caption className="sr-only">{t("admin.stats.products.caption")}</caption>
          <thead className="gt-admin-thead">
            <tr>
              <th scope="col" className="w-10 py-2.5 pl-3 text-left text-[length:var(--text-caption)] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]">
                <span className="sr-only">{t("admin.stats.products.rank")}</span>
                <span aria-hidden="true">#</span>
              </th>
              <th scope="col" className="py-2.5 pr-3 text-left text-[length:var(--text-caption)] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]">
                {t("admin.stats.products.product")}
              </th>
              {COLUMNS.map((column) => {
                const current = sort === column.key;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={current ? (ascending ? "ascending" : "descending") : "none"}
                    className="py-2.5 pl-3 text-right text-[length:var(--text-caption)] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]"
                  >
                    <button
                      type="button"
                      onClick={() => onSort(column.key, current ? !ascending : false)}
                      className={clsx(
                        "inline-flex items-center gap-1 rounded-[2px] uppercase tracking-[var(--tracking-wide)] transition-colors hover:text-[var(--text-primary)]",
                        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
                        current && "text-[var(--text-primary)]",
                      )}
                    >
                      {t(column.labelKey)}
                      {current ? (
                        ascending ? (
                          <ArrowUp size={12} strokeWidth={2.4} aria-hidden="true" />
                        ) : (
                          <ArrowDown size={12} strokeWidth={2.4} aria-hidden="true" />
                        )
                      ) : (
                        <ArrowDown size={12} strokeWidth={2.4} aria-hidden="true" className="opacity-0 transition-opacity group-hover:opacity-40" />
                      )}
                    </button>
                  </th>
                );
              })}
              <th scope="col" className="py-2.5 pl-3 text-right text-[length:var(--text-caption)] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]">
                {t("admin.stats.products.change")}
              </th>
              <th scope="col" className="py-2.5 pl-3 pr-3 text-right text-[length:var(--text-caption)] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]">
                {t("admin.stats.products.stock")}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((product, index) => (
              <tr key={product.id} className="gt-admin-row border-b border-[var(--border-subtle)] last:border-b-0">
                <td className="py-3 pl-3 text-left tabular-nums text-[var(--text-subtle)]">{index + 1}</td>
                <th scope="row" className="py-3 pr-3 text-left font-medium">
                  <span className="flex items-center gap-3">
                    {product.thumbnail && (
                      <img
                        src={product.thumbnail}
                        alt=""
                        loading="lazy"
                        className="h-10 w-10 flex-none rounded-[var(--admin-radius-sm)] border border-[var(--border-subtle)] object-cover"
                      />
                    )}
                    <span className="grid min-w-0 gap-0.5">
                      <span className="truncate text-[var(--text-primary)]">{L(product.name)}</span>
                      <span className="truncate text-[length:var(--text-caption)] font-normal text-[var(--text-muted)]">
                        {t(`admin.stats.category.${product.bucket}`)}
                      </span>
                    </span>
                  </span>
                </th>
                {COLUMNS.map((column) => (
                  <td
                    key={column.key}
                    className={clsx(
                      "py-3 pl-3 text-right tabular-nums",
                      sort === column.key ? "font-semibold text-[var(--text-primary)]" : "text-[var(--text-body)]",
                    )}
                  >
                    {cell(product, column.key)}
                  </td>
                ))}
                <td className="py-3 pl-3 text-right"><ChangeChip value={product.change} /></td>
                <td className="py-3 pl-3 pr-3 text-right"><StockPill state={product.stock} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
