import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Archive,
  ArchiveRestore,
  Copy,
  ImageOff,
  Pencil,
  Send,
  Undo2,
  X,
} from "lucide-react";
import clsx from "clsx";
import { AdminButton } from "./AdminButton";
import { AdminIconButton } from "./AdminIconButton";
import { CategoryBadge } from "./CategoryBadge";
import { ProductStatusBadge } from "./ProductStatusBadge";
import { StockIndicator } from "./StockIndicator";
import { useFocusTrap } from "../../lib/useFocusTrap";
import { useLocalized } from "../../lib/localized";
import { useAdminCatalog } from "../../lib/adminCatalog";
import { formatDate, formatPrice } from "../../lib/format";
import {
  displayState,
  effectivePrice,
  type AdminProduct,
} from "../../data/adminCatalog";
import type { ProductRowActions } from "./ProductRow";

/**
 * Side drawer opened by clicking a product in the list.
 *
 * A drawer rather than a detail page, deliberately: triaging a catalogue means
 * checking one product after another, and a drawer keeps the filtered list —
 * and the administrator's place in it — on screen. Anything that changes the
 * product still opens the full edit page, so there is exactly one place where
 * products are edited.
 */
export function ProductPreview({
  product,
  onClose,
  actions,
}: {
  product: AdminProduct | null;
  onClose: () => void;
  actions: ProductRowActions;
}) {
  const { t } = useTranslation();
  const L = useLocalized();
  const { categoryById } = useAdminCatalog();
  const ref = useFocusTrap<HTMLDivElement>(product !== null, onClose);
  const [activeImage, setActiveImage] = useState(0);

  if (!product) return null;

  const cover = product.media[Math.min(activeImage, product.media.length - 1)];
  const archived = product.status === "archived";
  const discounted = product.promoPrice != null && product.promoPrice < product.price;

  const facts: { label: string; value: React.ReactNode }[] = [
    { label: t("admin.table.sku"), value: <span className="font-[family-name:var(--gt-font-mono)]">{product.sku}</span> },
    { label: t("admin.table.category"), value: L(categoryById(product.categoryId).name) },
    { label: t("admin.form.type"), value: t(`admin.type.${product.type}`) },
    { label: t("admin.preview.material"), value: L(product.material) || "—" },
    { label: t("admin.table.stock"), value: <StockIndicator product={product} compact /> },
    { label: t("admin.preview.threshold"), value: product.trackInventory ? String(product.lowStockThreshold) : "—" },
    { label: t("admin.preview.created"), value: formatDate(product.createdAt) },
    { label: t("admin.preview.updated"), value: formatDate(product.updatedAt) },
  ];

  return (
    <div className="fixed inset-0 z-[300]">
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={onClose}
        className="gt-admin-scrim absolute inset-0 cursor-default bg-[rgba(17,17,17,.36)]"
      />

      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="gt-preview-title"
        tabIndex={-1}
        className="gt-admin-drawer absolute right-0 top-0 flex h-full w-full max-w-[520px] flex-col border-l border-[var(--border-subtle)] bg-[var(--admin-panel)] shadow-[var(--shadow-lg)]"
      >
        <div className="flex flex-none items-start justify-between gap-4 border-b border-[var(--border-subtle)] px-6 py-4">
          <div className="grid gap-1.5">
            <span className="gt-eyebrow">{t("admin.preview.eyebrow")}</span>
            <h2 id="gt-preview-title" className="text-[length:var(--text-h3)] leading-[var(--leading-snug)]">
              {L(product.name)}
            </h2>
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              <ProductStatusBadge state={displayState(product)} size="sm" />
              <CategoryBadge id={product.categoryId} />
            </div>
          </div>
          <AdminIconButton icon={X} label={t("common.close")} onClick={onClose} />
        </div>

        <div className="gt-admin-scroll flex-1 overflow-y-auto px-6 py-5">
          {/* Media */}
          {cover ? (
            <figure className="m-0 grid gap-2">
              <img
                src={cover.src}
                alt={L(cover.alt)}
                className={clsx(
                  "aspect-[4/3] w-full rounded-[var(--admin-radius)] border border-[var(--border-subtle)] object-cover",
                  archived && "opacity-70 grayscale",
                )}
              />
              {product.media.length > 1 && (
                <div className="flex flex-wrap gap-2">
                  {product.media.map((image, index) => (
                    <button
                      key={image.id}
                      type="button"
                      onClick={() => setActiveImage(index)}
                      aria-label={t("admin.preview.showImage", { index: index + 1 })}
                      aria-current={index === activeImage}
                      className={clsx(
                        "h-14 w-14 overflow-hidden rounded-[var(--admin-radius-sm)] border-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
                        index === activeImage ? "border-[var(--gt-ink-900)]" : "border-[var(--border-subtle)] hover:border-[var(--gt-ink-400)]",
                      )}
                    >
                      <img src={image.src} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </figure>
          ) : (
            <div className="grid aspect-[4/3] w-full place-items-center gap-2 rounded-[var(--admin-radius)] border border-dashed border-[var(--border-default)] bg-[var(--surface-sunken)] text-[var(--text-subtle)]">
              <ImageOff size={22} strokeWidth={1.6} aria-hidden="true" />
              <span className="text-[length:var(--text-caption)]">{t("admin.table.noImage")}</span>
            </div>
          )}

          {/* Price */}
          <div className="mt-5 flex items-end gap-3">
            <span className="text-[length:var(--text-h2)] font-bold tabular-nums text-[var(--text-primary)]">
              {formatPrice(effectivePrice(product))}
            </span>
            {discounted && (
              <span className="pb-1.5 text-[length:var(--text-body-sm)] text-[var(--text-muted)] line-through tabular-nums">
                {formatPrice(product.price)}
              </span>
            )}
            {product.compareAtPrice != null && !discounted && (
              <span className="pb-1.5 text-[length:var(--text-caption)] text-[var(--text-muted)]">
                {t("admin.preview.compareAt", { price: formatPrice(product.compareAtPrice) })}
              </span>
            )}
          </div>

          <p className="m-0 mt-3 text-[length:var(--text-body-sm)] leading-[var(--leading-normal)] text-[var(--text-body)]">
            {L(product.description)}
          </p>

          {/* Facts */}
          <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-[var(--border-subtle)] pt-5">
            {facts.map((fact) => (
              <div key={fact.label} className="grid gap-1">
                <dt className="text-[10px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-muted)]">
                  {fact.label}
                </dt>
                <dd className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-primary)]">{fact.value}</dd>
              </div>
            ))}
          </dl>

          {product.tags.length > 0 && (
            <div className="mt-6 border-t border-[var(--border-subtle)] pt-5">
              <p className="gt-eyebrow m-0 mb-2">{t("admin.form.tags")}</p>
              <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
                {product.tags.map((tag) => (
                  <li
                    key={tag}
                    className="rounded-[var(--radius-pill)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-2.5 py-1 text-[length:var(--text-caption)] text-[var(--text-body)]"
                  >
                    {tag}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Actions. Editing is the primary one; the rest stay secondary so the
            drawer never becomes a second, competing edit surface. */}
        <div className="flex flex-none flex-wrap items-center gap-2 border-t border-[var(--border-subtle)] bg-[var(--admin-panel-sunken)] px-6 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <AdminButton variant="primary" iconLeft={Pencil} onClick={() => actions.onEdit(product)}>
              {t("admin.actions.edit")}
            </AdminButton>
            <AdminButton variant="outline" iconLeft={Copy} onClick={() => actions.onDuplicate(product)}>
              {t("admin.actions.duplicate")}
            </AdminButton>
            {product.status === "active" ? (
              <AdminButton variant="ghost" iconLeft={Undo2} onClick={() => actions.onUnpublish(product)}>
                {t("admin.actions.unpublish")}
              </AdminButton>
            ) : (
              <AdminButton variant="ghost" iconLeft={Send} onClick={() => actions.onPublish(product)}>
                {t("admin.actions.publish")}
              </AdminButton>
            )}
          </div>
          {/* `ml-auto` rather than a spacer: when the bar wraps, archiving stays
              on the far side instead of landing under the primary action. */}
          <div className="ml-auto">
            {archived ? (
              <AdminButton variant="ghost" iconLeft={ArchiveRestore} onClick={() => actions.onRestore(product)}>
                {t("admin.actions.restore")}
              </AdminButton>
            ) : (
              <AdminButton variant="ghost" iconLeft={Archive} onClick={() => actions.onArchive(product)}>
                {t("admin.actions.archive")}
              </AdminButton>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
