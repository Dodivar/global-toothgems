import { useTranslation } from "react-i18next";
import {
  Archive,
  ArchiveRestore,
  Copy,
  Eye,
  ImageOff,
  PackageCheck,
  PackageX,
  Pencil,
  Send,
  Trash2,
  Undo2,
} from "lucide-react";
import clsx from "clsx";
import { AdminIconButton } from "./AdminIconButton";
import { CategoryBadge } from "./CategoryBadge";
import { OverflowMenu, type MenuAction } from "./OverflowMenu";
import { ProductStatusBadge } from "./ProductStatusBadge";
import { StockIndicator } from "./StockIndicator";
import { useLocalized } from "../../lib/localized";
import { formatDateShort, formatPrice } from "../../lib/format";
import { displayState, effectivePrice, stockState, type AdminProduct } from "../../data/adminCatalog";

/** Everything a row can ask the page to do. The page owns the consequences. */
export interface ProductRowActions {
  onOpen: (product: AdminProduct) => void;
  onEdit: (product: AdminProduct) => void;
  onDuplicate: (product: AdminProduct) => void;
  onPublish: (product: AdminProduct) => void;
  onUnpublish: (product: AdminProduct) => void;
  onMarkOutOfStock: (product: AdminProduct) => void;
  onRestock: (product: AdminProduct) => void;
  onArchive: (product: AdminProduct) => void;
  onRestore: (product: AdminProduct) => void;
  onDelete: (product: AdminProduct) => void;
}

/**
 * One product in the table.
 *
 * The whole row responds to a click, but the accessible target is the product
 * name button: a clickable `<tr>` is invisible to the keyboard, and the name is
 * what an administrator aims at anyway. The actions cell stops propagation so
 * using the menu never also opens the preview.
 */
export function ProductRow({
  product,
  actions,
  selected,
}: {
  product: AdminProduct;
  actions: ProductRowActions;
  /** The row currently open in the preview drawer. */
  selected: boolean;
}) {
  const { t } = useTranslation();
  const L = useLocalized();

  const state = displayState(product);
  const stock = stockState(product);
  const archived = product.status === "archived";
  const cover = product.media[0];
  const price = effectivePrice(product);
  const discounted = product.promoPrice != null && product.promoPrice < product.price;

  const menu: MenuAction[] = [
    { id: "open", label: t("admin.actions.preview"), icon: Eye, onSelect: () => actions.onOpen(product) },
    { id: "edit", label: t("admin.actions.edit"), icon: Pencil, onSelect: () => actions.onEdit(product) },
    { id: "duplicate", label: t("admin.actions.duplicate"), icon: Copy, onSelect: () => actions.onDuplicate(product) },
    product.status === "active"
      ? {
          id: "unpublish",
          label: t("admin.actions.unpublish"),
          icon: Undo2,
          onSelect: () => actions.onUnpublish(product),
          separated: true,
        }
      : {
          id: "publish",
          label: t("admin.actions.publish"),
          icon: Send,
          onSelect: () => actions.onPublish(product),
          separated: true,
        },
    stock === "out_of_stock"
      ? { id: "restock", label: t("admin.actions.restock"), icon: PackageCheck, onSelect: () => actions.onRestock(product) }
      : {
          id: "out-of-stock",
          label: t("admin.actions.markOutOfStock"),
          icon: PackageX,
          onSelect: () => actions.onMarkOutOfStock(product),
        },
    archived
      ? {
          id: "restore",
          label: t("admin.actions.restore"),
          icon: ArchiveRestore,
          onSelect: () => actions.onRestore(product),
          separated: true,
        }
      : {
          id: "archive",
          label: t("admin.actions.archive"),
          icon: Archive,
          onSelect: () => actions.onArchive(product),
          separated: true,
        },
    { id: "delete", label: t("admin.actions.delete"), icon: Trash2, tone: "danger", onSelect: () => actions.onDelete(product) },
  ];

  return (
    <tr
      onClick={() => actions.onOpen(product)}
      className={clsx(
        "gt-admin-row cursor-pointer border-b border-[var(--border-subtle)] last:border-b-0",
        selected && "bg-[var(--gt-blue-50)]",
      )}
    >
      <td className="py-3 pl-5 pr-2 align-middle">
        {cover ? (
          <img
            src={cover.src}
            alt=""
            loading="lazy"
            className={clsx(
              "h-11 w-11 flex-none rounded-[var(--admin-radius-sm)] border border-[var(--border-subtle)] object-cover",
              archived && "opacity-55 grayscale",
            )}
          />
        ) : (
          <span
            aria-label={t("admin.table.noImage")}
            title={t("admin.table.noImage")}
            className="grid h-11 w-11 flex-none place-items-center rounded-[var(--admin-radius-sm)] border border-dashed border-[var(--border-default)] bg-[var(--surface-sunken)] text-[var(--text-subtle)]"
          >
            <ImageOff size={15} strokeWidth={1.8} aria-hidden="true" />
          </span>
        )}
      </td>

      <td className="py-3 pr-4 align-middle">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            actions.onOpen(product);
          }}
          className="block max-w-full rounded-[2px] text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        >
          <span
            className={clsx(
              "block truncate text-[length:var(--text-body-sm)] font-semibold",
              archived ? "text-[var(--text-muted)]" : "text-[var(--text-primary)]",
            )}
          >
            {L(product.name)}
          </span>
          <span className="block truncate text-[length:var(--text-caption)] text-[var(--text-muted)]">
            {L(product.shortDescription)}
          </span>
        </button>
      </td>

      <td className="py-3 pr-4 align-middle">
        <span className="block truncate font-[family-name:var(--gt-font-mono)] text-[length:var(--text-caption)] text-[var(--text-muted)]">
          {product.sku}
        </span>
      </td>

      <td className="py-3 pr-4 align-middle">
        <CategoryBadge id={product.categoryId} />
      </td>

      <td className="py-3 pr-4 align-middle">
        <span className="grid gap-0.5">
          <span className="text-[length:var(--text-body-sm)] font-semibold tabular-nums text-[var(--text-primary)]">
            {formatPrice(price)}
          </span>
          {discounted && (
            <span className="text-[length:var(--text-caption)] text-[var(--text-muted)] line-through tabular-nums">
              {formatPrice(product.price)}
            </span>
          )}
        </span>
      </td>

      <td className="py-3 pr-4 align-middle">
        <StockIndicator product={product} />
      </td>

      <td className="py-3 pr-4 align-middle">
        <ProductStatusBadge state={state} />
      </td>

      <td className="py-3 pr-4 align-middle">
        <span className="whitespace-nowrap text-[length:var(--text-caption)] text-[var(--text-muted)]">
          {formatDateShort(product.updatedAt)}
        </span>
      </td>

      <td className="py-3 pr-4 align-middle" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-0.5">
          <AdminIconButton
            size="sm"
            icon={Pencil}
            label={t("admin.actions.editNamed", { name: L(product.name) })}
            onClick={() => actions.onEdit(product)}
          />
          <OverflowMenu label={t("admin.actions.moreNamed", { name: L(product.name) })} actions={menu} />
        </div>
      </td>
    </tr>
  );
}
