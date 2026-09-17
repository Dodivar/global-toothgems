import { useTranslation } from "react-i18next";
import clsx from "clsx";
import { stockState, type AdminProduct } from "../../data/adminCatalog";

/**
 * Inventory of one product, as a count plus the word for what that count means.
 *
 * The number alone is not an answer — 9 units is comfortable for a curing lamp
 * and critical for a consumable — so the threshold is applied here and the
 * result is spelled out next to it.
 */
export function StockIndicator({ product, compact = false }: { product: AdminProduct; compact?: boolean }) {
  const { t } = useTranslation();
  const state = stockState(product);

  const toneClass = {
    in_stock: "text-[var(--text-body)]",
    low_stock: "text-[var(--status-warning-fg)]",
    out_of_stock: "text-[var(--status-error-fg)]",
    preorder: "text-[var(--gt-blue-700)]",
  }[state];

  return (
    <span className={clsx("grid gap-0.5", compact && "inline-grid")}>
      <span className={clsx("text-[length:var(--text-body-sm)] font-semibold tabular-nums", toneClass)}>
        {product.trackInventory
          ? t("admin.stock.units", { count: product.stock })
          : t(`admin.stock.${state}`)}
      </span>
      <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
        {product.trackInventory
          ? t(`admin.stock.${state}`)
          : t("admin.stock.untracked")}
      </span>
    </span>
  );
}
