import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Archive,
  ArchiveRestore,
  ChevronRight,
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
import { ColorMedia, ShapeMedia, useGemTraits } from "./GemTraits";
import { OverflowMenu, type MenuAction } from "./OverflowMenu";
import { ProductStatusBadge } from "./ProductStatusBadge";
import { StockIndicator, VariantStockIndicator } from "./StockIndicator";
import { useAdminCatalog } from "../../lib/adminCatalog";
import { useLocalized } from "../../lib/localized";
import { useFormat } from "../../lib/format";
import {
  displayState,
  effectivePrice,
  inventoryState,
  stockState,
  type AdminProduct,
  type VariantStock,
} from "../../data/adminCatalog";
import type { ProductFilterState } from "../../lib/productFilters";

/** The values a row can filter the list on, straight from the table. */
export type RowFilterKey = "category" | "shape";

/** Everything a row can ask the page to do. The page owns the consequences. */
export interface ProductRowActions {
  onOpen: (product: AdminProduct) => void;
  onEdit: (product: AdminProduct) => void;
  /** Edit screen opened on one option (the plain edit screen for a variant the form does not edit). */
  onEditOption: (product: AdminProduct, variant: VariantStock) => void;
  onDuplicate: (product: AdminProduct) => void;
  onPublish: (product: AdminProduct) => void;
  onUnpublish: (product: AdminProduct) => void;
  onMarkOutOfStock: (product: AdminProduct) => void;
  onRestock: (product: AdminProduct) => void;
  onArchive: (product: AdminProduct) => void;
  onRestore: (product: AdminProduct) => void;
  onDelete: (product: AdminProduct) => void;
  /** Filter the list on one of the row's values; `"all"` lifts that filter. */
  onFilter: <K extends RowFilterKey>(key: K, value: ProductFilterState[K]) => void;
}

/**
 * One product in the table.
 *
 * The whole row responds to a click, but the accessible target is the product
 * name button: a clickable `<tr>` is invisible to the keyboard, and the name is
 * what an administrator aims at anyway. The actions cell stops propagation so
 * using the menu never also opens the preview.
 *
 * A product with variants stays one row (it is one product to publish,
 * archive or delete) with a toggle that unfolds one row per option under it,
 * the options that need restocking first. Each option row opens the edit
 * screen on that option.
 */
export function ProductRow({
  product,
  actions,
  selected,
  filters,
  defaultExpanded = false,
}: {
  product: AdminProduct;
  actions: ProductRowActions;
  /** The list's current filters, so a value already filtered on reads as such. */
  filters: ProductFilterState;
  /** The row currently open in the preview drawer. */
  selected: boolean;
  /** Start with the option rows unfolded. */
  defaultExpanded?: boolean;
}) {
  const { formatDateShort, formatPrice } = useFormat();
  const { t } = useTranslation();
  const L = useLocalized();
  const { categoryById } = useAdminCatalog();
  const { shapeLabel, colorLabel, colorDef } = useGemTraits();
  const variants = product.variantStock ?? [];
  const [expanded, setExpanded] = useState(defaultExpanded && variants.length > 0);
  const optionRowId = (index: number) => `product-${product.id}-option-${index}`;
  const toggleLabel = t(expanded ? "admin.table.hideOptions" : "admin.table.showOptions", { name: L(product.name) });

  const state = displayState(product);
  const stock = stockState(product);
  const archived = product.status === "archived";
  const cover = product.media[0];
  const price = effectivePrice(product);
  const discounted = product.promoPrice != null && product.promoPrice < product.price;

  const { shape, color } = product;

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
    <>
    <tr
      onClick={() => actions.onOpen(product)}
      className={clsx(
        "gt-admin-row cursor-pointer border-b border-[var(--border-subtle)] last:border-b-0",
        selected && "bg-[var(--gt-blue-50)]",
      )}
    >
      <td className="py-3 pl-2 pr-2 align-middle">
        <span className="flex items-center gap-1">
        {variants.length > 0 ? (
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={expanded ? variants.map((_, index) => optionRowId(index)).join(" ") : undefined}
            aria-label={toggleLabel}
            title={toggleLabel}
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((open) => !open);
            }}
            className="grid h-8 w-8 flex-none place-items-center rounded-[var(--admin-radius-sm)] text-[var(--text-muted)] hover:bg-[var(--gt-ink-100)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
          >
            <ChevronRight
              size={16}
              aria-hidden="true"
              className={clsx("transition-transform duration-[var(--duration-fast)] motion-reduce:transition-none", expanded && "rotate-90")}
            />
          </button>
        ) : (
          <span aria-hidden="true" className="h-8 w-8 flex-none" />
        )}
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
        </span>
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
          {/* On a gem, the traits line below takes the description's place:
              in a list of look-alike names, cut and colour are what tell the
              rows apart. */}
          {!shape && !color && (
            <span className="block truncate text-[length:var(--text-caption)] text-[var(--text-muted)]">
              {L(product.shortDescription)}
            </span>
          )}
        </button>
        {(shape || color) && (
          <span className="mt-1 flex flex-wrap items-center gap-1" onClick={(e) => e.stopPropagation()}>
            {shape && (
              <FilterTag
                active={filters.shape === shape}
                label={shapeLabel(shape)}
                media={<ShapeMedia shape={shape} size={16} />}
                onToggle={(on) => actions.onFilter("shape", on ? shape : "all")}
              />
            )}
            {color && (
              // Informative only: the colour is not a filter of this list.
              <TagBody active={false} label={colorLabel(color)} media={<ColorMedia color={colorDef(color)} size={12} />} />
            )}
          </span>
        )}
      </td>

      <td className="py-3 pr-4 align-middle">
        <span className="block truncate font-[family-name:var(--gt-font-mono)] text-[length:var(--text-caption)] text-[var(--text-muted)]">
          {product.sku}
        </span>
      </td>

      <td className="py-3 pr-4 align-middle" onClick={(e) => e.stopPropagation()}>
        <FilterToggle
          active={filters.category === product.categoryId}
          label={L(categoryById(product.categoryId).name)}
          onToggle={(on) => actions.onFilter("category", on ? product.categoryId : "all")}
        >
          <CategoryBadge id={product.categoryId} active={filters.category === product.categoryId} />
        </FilterToggle>
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
    {expanded &&
      alertsFirst(variants).map((variant, index) => (
        <OptionRow
          key={variant.key}
          id={optionRowId(index)}
          product={product}
          variant={variant}
          onEdit={() => actions.onEditOption(product, variant)}
        />
      ))}
    </>
  );
}

/**
 * A value of the row that doubles as a filter. A real toggle button — pressed
 * while the list is filtered on it — so the keyboard reaches it and a screen
 * reader says what a click does. The name is spelled out ("Filtrer sur
 * Étoile") because the visible text alone reads as plain information.
 */
function FilterToggle({
  active,
  label,
  onToggle,
  children,
}: {
  active: boolean;
  label: string;
  onToggle: (on: boolean) => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const name = t(active ? "admin.filters.unfilterOn" : "admin.filters.filterOn", { value: label });
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={name}
      title={name}
      onClick={() => onToggle(!active)}
      className="inline-flex max-w-full rounded-[var(--radius-pill)] [&:hover>span]:border-[var(--gt-ink-900)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
    >
      {children}
    </button>
  );
}

/** Cut of a gem, under its name: its drawing and name, as a filter toggle. */
function FilterTag({
  active,
  label,
  media,
  onToggle,
}: {
  active: boolean;
  label: string;
  media: ReactNode;
  onToggle: (on: boolean) => void;
}) {
  return (
    <FilterToggle active={active} label={label} onToggle={onToggle}>
      <TagBody active={active} label={label} media={media} />
    </FilterToggle>
  );
}

/** The drawing and name of a gem trait, with no behaviour of its own. */
function TagBody({ active, label, media }: { active: boolean; label: string; media: ReactNode }) {
  return (
    <span
      className={clsx(
        "inline-flex max-w-full items-center gap-1 rounded-[var(--radius-pill)] border py-px pl-1 pr-2 text-[length:var(--text-caption)] leading-5 transition-colors",
        active
          ? "border-[var(--gt-ink-900)] bg-[var(--gt-blue-50)] font-semibold text-[var(--text-primary)]"
          : "border-[var(--border-subtle)] bg-[var(--admin-panel)] text-[var(--text-body)]",
      )}
    >
      <span className="grid h-4 w-4 flex-none place-items-center">{media}</span>
      <span className="truncate">{label}</span>
    </span>
  );
}

const OPTION_RANK = { out_of_stock: 0, low_stock: 1, in_stock: 2, preorder: 2 } as const;

/** Sold out first, then low, then the rest; each group keeps the product's option order. */
function alertsFirst(variants: VariantStock[]): VariantStock[] {
  return [...variants].sort((a, b) => OPTION_RANK[inventoryState(a)] - OPTION_RANK[inventoryState(b)]);
}

/**
 * One option under its product: its name, SKU, price and stock, and the way
 * into the edit form on that option. Same columns as the product row, so the
 * stock figures line up under the product's total.
 */
function OptionRow({
  id,
  product,
  variant,
  onEdit,
}: {
  id: string;
  product: AdminProduct;
  variant: VariantStock;
  onEdit: () => void;
}) {
  const { formatPrice } = useFormat();
  const { t } = useTranslation();
  const L = useLocalized();
  const state = inventoryState(variant);
  const label = t("admin.table.editOption", { option: L(variant.name), name: L(product.name) });

  return (
    <tr
      id={id}
      onClick={onEdit}
      className="gt-admin-row cursor-pointer border-b border-[var(--border-subtle)] bg-[var(--admin-panel-sunken)]"
    >
      <td className="py-2 pl-2 pr-2 align-middle">
        {/* A short rule in place of the thumbnail ties the option to the product above. */}
        <span aria-hidden="true" className="ml-4 block h-px w-10 bg-[var(--border-default)]" />
      </td>
      <td className="py-2 pr-4 align-middle">
        <button
          type="button"
          aria-label={label}
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className="block max-w-full rounded-[2px] text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        >
          <span className="block truncate text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">
            {L(variant.name)}
          </span>
        </button>
      </td>
      <td className="py-2 pr-4 align-middle">
        <span className="block truncate font-[family-name:var(--gt-font-mono)] text-[length:var(--text-caption)] text-[var(--text-muted)]">
          {variant.sku ?? ""}
        </span>
      </td>
      <td className="py-2 pr-4 align-middle" />
      <td className="py-2 pr-4 align-middle">
        <span className="text-[length:var(--text-body-sm)] tabular-nums text-[var(--text-body)]">
          {formatPrice(variant.price ?? product.price)}
        </span>
      </td>
      <td className="py-2 pr-4 align-middle">
        <VariantStockIndicator variant={variant} />
      </td>
      <td className="py-2 pr-4 align-middle">
        {(state === "out_of_stock" || state === "low_stock") && <ProductStatusBadge state={state} size="sm" />}
      </td>
      <td className="py-2 pr-4 align-middle" />
      <td className="py-2 pr-4 align-middle" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-end">
          <AdminIconButton size="sm" icon={Pencil} label={label} onClick={onEdit} />
        </div>
      </td>
    </tr>
  );
}
