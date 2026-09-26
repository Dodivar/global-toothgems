import { useTranslation } from "react-i18next";
import clsx from "clsx";
import {
  inventoryState,
  stockState,
  variantAlerts,
  type AdminProduct,
  type StockState,
  type VariantStock,
} from "../../data/adminCatalog";

const TONE: Record<StockState, string> = {
  in_stock: "text-[var(--text-body)]",
  low_stock: "text-[var(--status-warning-fg)]",
  out_of_stock: "text-[var(--status-error-fg)]",
  preorder: "text-[var(--gt-blue-700)]",
};

/**
 * Inventory of one product, as a count plus the word for what that count means.
 *
 * The number alone is not an answer — 9 units is comfortable for a curing lamp
 * and critical for a consumable — so the threshold is applied here and the
 * result is spelled out next to it.
 *
 * A product with variants shows its total, but the words under it count the
 * options that need restocking: a total of 400 says nothing about the one
 * option at 0.
 */
export function StockIndicator({ product, compact = false }: { product: AdminProduct; compact?: boolean }) {
  const { t } = useTranslation();
  const state = stockState(product);
  const variants = product.variantStock ?? [];

  if (variants.length > 0) {
    const alerts = variantAlerts(product);
    const out = alerts.filter((a) => a.state === "out_of_stock").length;
    const low = alerts.length - out;
    return (
      <span className={clsx("grid gap-0.5", compact && "inline-grid")}>
        <span className={clsx("text-[length:var(--text-body-sm)] font-semibold tabular-nums", TONE[state])}>
          {t("admin.stock.units", { count: product.stock })}
        </span>
        {alerts.length === 0 ? (
          <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
            {t(`admin.stock.${state}`)} · {t("admin.stock.options", { count: variants.length })}
          </span>
        ) : (
          <span className="grid text-[length:var(--text-caption)] font-semibold">
            {out > 0 && <span className={TONE.out_of_stock}>{t("admin.stock.optionsOut", { count: out })}</span>}
            {low > 0 && <span className={TONE.low_stock}>{t("admin.stock.optionsLow", { count: low })}</span>}
          </span>
        )}
      </span>
    );
  }

  return (
    <span className={clsx("grid gap-0.5", compact && "inline-grid")}>
      <span className={clsx("text-[length:var(--text-body-sm)] font-semibold tabular-nums", TONE[state])}>
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

/** Same reading for one variant, in the product list's option rows. */
export function VariantStockIndicator({ variant }: { variant: VariantStock }) {
  const { t } = useTranslation();
  const state = inventoryState(variant);
  const reserved = variant.reserved ?? 0;

  return (
    <span className="grid gap-0.5">
      <span className={clsx("text-[length:var(--text-body-sm)] font-semibold tabular-nums", TONE[state])}>
        {variant.trackInventory ? t("admin.stock.units", { count: variant.stock }) : t(`admin.stock.${state}`)}
      </span>
      <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
        {variant.trackInventory ? t(`admin.stock.${state}`) : t("admin.stock.untracked")}
        {variant.trackInventory && reserved > 0 && ` · ${t("admin.stock.reserved", { count: reserved })}`}
      </span>
    </span>
  );
}
