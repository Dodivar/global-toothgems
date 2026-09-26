import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Menu as MenuIcon, X } from "lucide-react";
import { Button } from "../ui/Button";
import { Select, type SelectOption } from "../ui/Select";
import { ShapeGlyph } from "../ui/ShapeGlyph";
import { ColorSwatch } from "../ui/ColorSwatch";
import { SHOP_CATEGORIES, colorsInCatalog, shapesInCatalog } from "../../data/products";
import { useCatalog } from "../../lib/catalog/CatalogProvider";

const CATEGORIES = ["Tout", ...SHOP_CATEGORIES] as const;

interface ShopFilterBarProps {
  category: string;
  shape: string;
  color: string;
  material: string;
  priceBand: string;
  stockBand: string;
  sort: string;
  materialOptions: SelectOption[];
  priceOptions: SelectOption[];
  stockOptions: SelectOption[];
  sortOptions: SelectOption[];
  activeCount: number;
  setParam: (key: string, value: string, fallback: string) => void;
  onReset: () => void;
  open: boolean;
  onToggleOpen: () => void;
}

/** Shared shell for one selectable chip in the shape and colour rows. */
function Chip({
  active,
  onClick,
  label,
  media,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  media?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="flex shrink-0 snap-start items-center gap-2 rounded-[var(--radius-pill)] border px-3 py-2 text-[length:var(--text-body-sm)] transition-[background-color,border-color,color] duration-[var(--duration-fast)]"
      style={{
        borderColor: active ? "var(--border-brand)" : "var(--border-subtle)",
        background: active ? "var(--surface-brand-wash-strong)" : "var(--surface-card)",
        color: active ? "var(--text-primary)" : "var(--text-body)",
        fontWeight: active ? 700 : 400,
      }}
    >
      {media}
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}

/**
 * The collection's filters, laid out across the top of the page.
 *
 * Shape and colour are the two attributes people shop by, so they get their own
 * rows of visual chips rather than a `<select>` each — and because the URL is
 * the single source of truth, a shape arriving from the header carousel or from
 * /formes renders here already selected with no extra wiring.
 *
 * The rows stay visible at every width; only the secondary controls collapse on
 * mobile, where they would otherwise push the grid off the first screen.
 */
export function ShopFilterBar(props: ShopFilterBarProps) {
  const { t } = useTranslation();
  const { category, shape, color, material, priceBand, stockBand, sort, setParam } = props;

  const { products } = useCatalog();
  const shapes = shapesInCatalog(products);
  const colors = colorsInCatalog(products);

  return (
    <div className="grid gap-5 border-b border-[var(--border-subtle)] pb-6">
      <div className="grid gap-2">
        <div className="flex items-baseline justify-between gap-4">
          <span className="gt-eyebrow">{t("shop.shapeLabel")}</span>
          <Link to="/formes" className="text-xs text-[var(--text-muted)] underline decoration-1 underline-offset-4 hover:text-[var(--text-primary)]">
            {t("nav.viewAllShapes")}
          </Link>
        </div>
        <div className="gt-scroller flex gap-2 pb-1">
          <Chip active={shape === "all"} onClick={() => setParam("forme", "all", "all")} label={t("shop.shapes.all")} />
          {shapes.map((group) => (
            <Chip
              key={group.shape}
              active={shape === group.shape}
              onClick={() => setParam("forme", group.shape, "all")}
              label={t(`shop.shapes.${group.shape}`)}
              media={<ShapeGlyph shape={group.shape} size={22} className="text-[var(--gt-blue-700)]" />}
            />
          ))}
        </div>
      </div>

      <div className="grid gap-2">
        <div className="flex items-baseline justify-between gap-4">
          <span className="gt-eyebrow">{t("shop.colorLabel")}</span>
          <Link to="/couleurs" className="text-xs text-[var(--text-muted)] underline decoration-1 underline-offset-4 hover:text-[var(--text-primary)]">
            {t("nav.viewAllColors")}
          </Link>
        </div>
        <div className="gt-scroller flex gap-2 pb-1">
          <Chip active={color === "all"} onClick={() => setParam("couleur", "all", "all")} label={t("shop.colors.all")} />
          {colors.map((group) => (
            <Chip
              key={group.color}
              active={color === group.color}
              onClick={() => setParam("couleur", group.color, "all")}
              label={t(`shop.colors.${group.color}`)}
              media={<ColorSwatch color={group.color} size={20} />}
            />
          ))}
        </div>
      </div>

      <div className="lg:hidden">
        <Button
          variant="outline"
          iconLeft={MenuIcon}
          fullWidth
          aria-expanded={props.open}
          aria-controls="gt-shop-filters"
          onClick={props.onToggleOpen}
        >
          {(props.open ? t("shop.filterToggleHide") : t("shop.filterToggleShow")) +
            (props.activeCount ? ` · ${props.activeCount}` : "")}
        </Button>
      </div>

      {/* Category and the remaining selects sit on two rows of their own: the
          pills need the full width to stay on one line, and four equal select
          columns read as a toolbar rather than as a leftover sidebar. */}
      <div id="gt-shop-filters" className={`${props.open ? "grid" : "hidden"} gap-4 lg:grid`}>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t("shop.categoryLabel")}>
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setParam("categorie", c, "Tout")}
              aria-pressed={category === c}
              className="rounded-[var(--radius-pill)] border px-3.5 py-2 text-[length:var(--text-body-sm)] transition-colors"
              style={{
                fontWeight: category === c ? 700 : 400,
                color: category === c ? "var(--text-inverse)" : "var(--text-body)",
                background: category === c ? "var(--gt-ink-900)" : "var(--surface-card)",
                borderColor: category === c ? "var(--gt-ink-900)" : "var(--border-subtle)",
              }}
            >
              {c === "Tout" ? t("shop.categories.all") : t(`shop.categories.${c}`)}
            </button>
          ))}
          {props.activeCount > 0 && (
            <Button variant="ghost" size="sm" iconLeft={X} className="ml-auto" onClick={props.onReset}>
              {t("shop.reset")}
            </Button>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Select label={t("shop.materialLabel")} options={props.materialOptions} value={material} onChange={(v) => setParam("matiere", v, "all")} />
          <Select label={t("shop.priceLabel")} options={props.priceOptions} value={priceBand} onChange={(v) => setParam("prix", v, "all")} />
          <Select label={t("shop.stockLabel")} options={props.stockOptions} value={stockBand} onChange={(v) => setParam("stock", v, "all")} />
          <Select label={t("shop.sortLabel")} options={props.sortOptions} value={sort} onChange={(v) => setParam("tri", v, "new")} />
        </div>
      </div>
    </div>
  );
}
