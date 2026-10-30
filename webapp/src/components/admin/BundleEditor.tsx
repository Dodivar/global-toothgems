import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Info, Trash2 } from "lucide-react";
import clsx from "clsx";
import { AdminIconButton } from "./AdminIconButton";
import { AdminSelect } from "./AdminSelect";
import { NumberInput } from "./AdminNumberInputs";
import { ToggleSwitch } from "./ToggleSwitch";
import { ProductPicker } from "../promotions/ProductPicker";
import { useAdminCatalog } from "../../lib/adminCatalog";
import { useLocalized } from "../../lib/localized";
import { bundleCapacity, componentKey, isBundle } from "../../lib/productBundles";
import type { AdminProduct, BundleComponent } from "../../data/adminCatalog";

/**
 * "Kit contents" of the product form (decision 117).
 *
 * Switched on, the product becomes a kit: the team lists what one kit holds
 * (a product, or one option of it, and how many) and the database derives the
 * kit's stock from those products' stock — selling a kit takes its components,
 * selling a component alone takes kits away. The figure shown here is the same
 * computation on the stock the back office last read, with the components that
 * hold it down, so the team sees at once what to restock.
 */
export function BundleEditor({
  product,
  initial,
  error,
  onChange,
}: {
  product: AdminProduct;
  /** The product as saved: whether it already was a kit. */
  initial: AdminProduct;
  error?: string;
  onChange: (bundle: BundleComponent[] | undefined) => void;
}) {
  const { t } = useTranslation();
  const l = useLocalized();
  const { products } = useAdminCatalog();
  const components = useMemo(() => product.bundle ?? [], [product.bundle]);
  const on = product.bundle !== undefined;
  const hasVariants = (product.variantCount ?? 0) > 0 || (product.customVariants?.length ?? 0) > 0 || Boolean(product.gemOptions?.enabled);

  // A kit never holds itself nor another kit (the database refuses both).
  const excludeIds = useMemo(
    () => products.filter((p) => p.id === product.id || isBundle(p)).map((p) => p.id),
    [products, product.id],
  );
  const capacity = useMemo(() => bundleCapacity(components, products), [components, products]);
  const selected = [...new Set(components.map((item) => item.productId))];
  const ownStock = !isBundle(initial) && initial.trackInventory && initial.stock > 0 ? initial.stock : 0;

  const pick = (ids: string[]) => {
    const kept = components.filter((item) => ids.includes(item.productId));
    const added = ids
      .filter((id) => !components.some((item) => item.productId === id))
      .map((id): BundleComponent => {
        const variant = products.find((p) => p.id === id)?.variantStock?.[0];
        return { productId: id, ...(variant?.variantId ? { variantId: variant.variantId } : {}), quantity: 1 };
      });
    onChange([...kept, ...added]);
  };
  const update = (index: number, patch: Partial<BundleComponent>) =>
    onChange(components.map((item, i) => (i === index ? { ...item, ...patch } : item)));

  return (
    <div className="grid gap-4">
      <div className="rounded-[var(--admin-radius-sm)] border border-[var(--border-subtle)] bg-[var(--admin-panel-sunken)] p-4">
        <ToggleSwitch
          label={t("admin.bundle.toggle")}
          description={t(hasVariants && !on ? "admin.bundle.toggleVariants" : "admin.bundle.toggleHint")}
          checked={on}
          disabled={hasVariants && !on}
          onChange={(checked) => onChange(checked ? (initial.bundle ?? []) : undefined)}
        />
      </div>

      {on && (
        <>
          {ownStock > 0 && (
            <p className="m-0 flex items-start gap-2 rounded-[var(--admin-radius-sm)] bg-[var(--status-warning-bg)] p-3 text-[length:var(--text-body-sm)] text-[var(--status-warning-fg)]">
              <Info size={14} aria-hidden="true" className="mt-0.5 flex-none" />
              {t("admin.bundle.ownStockWarning", { count: ownStock })}
            </p>
          )}
          {isBundle(initial) && (
            <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("admin.bundle.snapshotHint")}</p>
          )}

          <ProductPicker
            label={t("admin.bundle.pickLabel")}
            hint={t("admin.bundle.pickHint")}
            selected={selected}
            onChange={pick}
            excludeIds={excludeIds}
            error={error}
          />

          {components.length > 0 && (
            <ul className="m-0 grid list-none gap-2 p-0" aria-label={t("admin.bundle.listLabel")}>
              {components.map((item, index) => {
                const row = capacity.components[index];
                const component = row?.product;
                const name = component ? l(component.name) : t("admin.bundle.unknownProduct");
                const options = component?.variantStock ?? [];
                const limiting = capacity.limiting.includes(row);
                return (
                  <li
                    key={componentKey(item)}
                    className={clsx(
                      "grid items-center gap-3 rounded-[var(--admin-radius-sm)] border p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]",
                      limiting ? "border-[var(--status-warning-fg)]" : "border-[var(--border-subtle)]",
                    )}
                  >
                    <div className="grid min-w-0 gap-1">
                      <span className="truncate text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">{name}</span>
                      {options.length > 0 && (
                        <AdminSelect
                          aria-label={t("admin.bundle.optionLabel", { name })}
                          options={options.map((option) => ({ value: option.variantId ?? option.key, label: l(option.name) }))}
                          value={item.variantId ?? ""}
                          onChange={(e) => update(index, { variantId: e.target.value })}
                        />
                      )}
                      <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
                        {row?.makes === undefined
                          ? t("admin.bundle.untracked")
                          : row.available === undefined
                            ? t("admin.bundle.unavailable")
                            : t("admin.bundle.componentStock", { count: row.available, kits: row.makes })}
                        {limiting && <strong className="font-semibold text-[var(--status-warning-fg)]"> · {t("admin.bundle.limiting")}</strong>}
                      </span>
                    </div>
                    <label className="flex items-center gap-2 text-[length:var(--text-caption)] text-[var(--text-muted)]">
                      {t("admin.bundle.quantity")}
                      <span className="w-20">
                        <NumberInput
                          aria-label={t("admin.bundle.quantityLabel", { name })}
                          value={item.quantity}
                          min={1}
                          onValueChange={(value) => update(index, { quantity: value ?? 0 })}
                        />
                      </span>
                    </label>
                    <AdminIconButton
                      size="sm"
                      icon={Trash2}
                      tone="danger"
                      label={t("admin.bundle.remove", { name })}
                      onClick={() => onChange(components.filter((_, i) => i !== index))}
                    />
                  </li>
                );
              })}
            </ul>
          )}

          {components.length > 0 && (
            <p
              className="m-0 flex items-start gap-2 rounded-[var(--admin-radius-sm)] bg-[var(--status-info-bg)] p-3 text-[length:var(--text-body-sm)] text-[var(--gt-blue-700)]"
              aria-live="polite"
            >
              <Info size={14} aria-hidden="true" className="mt-0.5 flex-none" />
              {capacity.buildable === undefined
                ? t("admin.bundle.capacityUntracked")
                : t("admin.bundle.capacity", {
                    count: capacity.buildable,
                    names: capacity.limiting.map((row) => (row.product ? l(row.product.name) : "?")).join(", "),
                  })}
            </p>
          )}
        </>
      )}
    </div>
  );
}
