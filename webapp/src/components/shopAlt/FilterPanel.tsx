import { useId, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import { ShapeGlyph } from "../ui/ShapeGlyph";
import { ColorSwatch } from "../ui/ColorSwatch";
import { GEM_SHAPES, SHOP_CATEGORIES, colorsInCatalog, type Product } from "../../data/products";
import { useCatalog } from "../../lib/catalog/CatalogProvider";
import { useShapesInCatalog } from "../../lib/catalog/useShapesInCatalog";
import {
  FILTER_PARAMS,
  PRICE_BANDS,
  SORT_KEYS,
  STOCK_BANDS,
  facetCount,
  gemFiltersApply,
  materialsInCatalog,
  type FilterKey,
  type StorefrontFilters,
  type StorefrontSort,
} from "../../lib/storefrontFilters";
import { useFilterLabels } from "./useFilterLabels";

/** A group of the panel: one of the filters, or the sort order (drawer only). */
export type GroupKey = FilterKey | "sort";

interface FilterPanelProps {
  filters: StorefrontFilters;
  onChange: (key: FilterKey, value: string) => void;
  /** The whole catalogue: options come from what it carries, counts from the filters applied to it. */
  products: Product[];
  /** Groups expanded on first render; a group with an active value always starts open. */
  defaultOpen: GroupKey[];
  /** The drawer offers the sort order too, since the toolbar has scrolled away by then. */
  sort?: { value: StorefrontSort; onChange: (value: StorefrontSort) => void };
}

/**
 * The filter groups, shared by the desktop sidebar and the mobile drawer.
 *
 * Every group is a set of radio buttons — one choice per filter, as in the URL
 * — so a whole group is one tab stop and arrow keys move within it. Each
 * option shows how many products choosing it would leave, the other filters
 * unchanged; an option that would empty the grid is dimmed but not disabled,
 * so it can still be reached and read.
 */
export function FilterPanel({ filters, onChange, products, defaultOpen, sort }: FilterPanelProps) {
  const { t, i18n } = useTranslation();
  const labelOf = useFilterLabels();
  const uid = useId();
  const { colors: colorList } = useCatalog();
  const shapes = useShapesInCatalog(products);
  const colors = colorsInCatalog(products, colorList);
  const materials = useMemo(() => materialsInCatalog(products, i18n.language), [products, i18n.language]);
  const categories = SHOP_CATEGORIES.filter((c) => products.some((p) => p.cat === c));

  // Shape and colour only describe gems (see `gemFiltersApply`).
  const showGemFilters = gemFiltersApply(filters.category);
  const count = (key: FilterKey, value: string) => facetCount(products, filters, key, value);
  const name = (key: GroupKey) => `${uid}-${key}`;
  const summary = (key: FilterKey) =>
    filters[key] !== FILTER_PARAMS[key].fallback ? labelOf(key, filters[key]) : undefined;
  const isOpen = (key: GroupKey) => defaultOpen.includes(key) || (key !== "sort" && summary(key) !== undefined);

  const rows = (key: FilterKey, label: string, values: string[], media?: (value: string) => ReactNode) => (
    <div role="radiogroup" aria-label={label} className="grid gap-0.5">
      {[FILTER_PARAMS[key].fallback, ...values].map((value) => (
        <OptionRow
          key={value}
          name={name(key)}
          checked={filters[key] === value}
          onSelect={() => onChange(key, value)}
          label={labelOf(key, value)}
          count={count(key, value)}
          media={value === FILTER_PARAMS[key].fallback ? undefined : media?.(value)}
        />
      ))}
    </div>
  );

  return (
    <div className="grid">
      {sort && (
        <FilterGroup title={t("shopAlt.sortLabel")} summary={t(`shopAlt.sorts.${sort.value}`)} defaultOpen={isOpen("sort")}>
          <div role="radiogroup" aria-label={t("shopAlt.sortLabel")} className="grid gap-0.5">
            {SORT_KEYS.map((value) => (
              <OptionRow
                key={value}
                name={name("sort")}
                checked={sort.value === value}
                onSelect={() => sort.onChange(value)}
                label={t(`shopAlt.sorts.${value}`)}
              />
            ))}
          </div>
        </FilterGroup>
      )}

      {categories.length > 0 && (
        <FilterGroup title={t("shopAlt.categoryLabel")} summary={summary("category")} defaultOpen={isOpen("category")}>
          {rows("category", t("shopAlt.categoryLabel"), categories)}
        </FilterGroup>
      )}

      {showGemFilters && shapes.length > 0 && (
        <FilterGroup title={t("shop.shapeLabel")} summary={summary("shape")} defaultOpen={isOpen("shape")}>
          <div role="radiogroup" aria-label={t("shop.shapeLabel")} className="grid grid-cols-3 gap-1.5">
            {["all", ...shapes.map((s) => s.shape)].map((value) => (
              <TileOption
                key={value}
                name={name("shape")}
                checked={filters.shape === value}
                onSelect={() => onChange("shape", value)}
                label={labelOf("shape", value)}
                count={count("shape", value)}
                media={
                  value === "all" ? (
                    <span aria-hidden="true" className="grid h-[26px] w-[26px] grid-cols-2 place-items-center gap-0.5 p-1">
                      {[0, 1, 2, 3].map((i) => (
                        <span key={i} className="h-2 w-2 rounded-[2px] bg-[var(--gt-blue-400)]" />
                      ))}
                    </span>
                  ) : (
                    <ShapeGlyph shape={value as (typeof GEM_SHAPES)[number]} size={26} className="text-[var(--gt-blue-700)]" />
                  )
                }
              />
            ))}
          </div>
        </FilterGroup>
      )}

      {showGemFilters && colors.length > 0 && (
        <FilterGroup title={t("shop.colorLabel")} summary={summary("color")} defaultOpen={isOpen("color")}>
          {rows(
            "color",
            t("shop.colorLabel"),
            colors.map((c) => c.color.slug),
            (slug) => {
              const def = colors.find((c) => c.color.slug === slug)?.color;
              return def ? <ColorSwatch color={def} size={18} /> : null;
            },
          )}
        </FilterGroup>
      )}

      {materials.length > 0 && (
        <FilterGroup title={t("shop.materialLabel")} summary={summary("material")} defaultOpen={isOpen("material")}>
          {rows("material", t("shop.materialLabel"), materials)}
        </FilterGroup>
      )}

      <FilterGroup title={t("shop.priceLabel")} summary={summary("price")} defaultOpen={isOpen("price")}>
        <div role="radiogroup" aria-label={t("shop.priceLabel")} className="flex flex-wrap gap-1.5">
          {["all", ...PRICE_BANDS].map((value) => (
            <PillOption
              key={value}
              name={name("price")}
              checked={filters.price === value}
              onSelect={() => onChange("price", value)}
              label={labelOf("price", value)}
              count={count("price", value)}
            />
          ))}
        </div>
      </FilterGroup>

      <FilterGroup title={t("shop.stockLabel")} summary={summary("stock")} defaultOpen={isOpen("stock")}>
        {rows("stock", t("shop.stockLabel"), [...STOCK_BANDS])}
      </FilterGroup>
    </div>
  );
}

/**
 * One collapsible group: a heading holding a disclosure button, as in the
 * accordion pattern. Collapsed, it still shows the value picked in it.
 */
function FilterGroup({
  title,
  summary,
  defaultOpen,
  children,
}: {
  title: string;
  summary?: string;
  defaultOpen: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <section className="border-b border-[var(--border-subtle)] last:border-b-0">
      <h3 className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((v) => !v)}
          className="gt-shopb-group-toggle flex w-full items-center gap-2 py-3.5 text-left"
        >
          <span className="text-[12px] font-bold uppercase tracking-[var(--tracking-wide)] text-[var(--text-primary)]">{title}</span>
          {summary && !open && (
            <span className="min-w-0 flex-1 truncate text-right text-[12px] font-medium text-[var(--gt-blue-700)]">{summary}</span>
          )}
          <ChevronDown
            size={16}
            aria-hidden="true"
            className={`ml-auto flex-none text-[var(--text-muted)] transition-transform duration-[var(--duration-fast)] ${open ? "rotate-180" : ""}`}
          />
        </button>
      </h3>
      <div id={id} hidden={!open} className="pb-4">
        {children}
      </div>
    </section>
  );
}

interface OptionProps {
  name: string;
  checked: boolean;
  onSelect: () => void;
  label: string;
  count?: number;
  media?: ReactNode;
}

function CountText({ count }: { count: number }) {
  const { t } = useTranslation();
  return (
    <>
      <span aria-hidden="true" className="text-[11px] tabular-nums text-[var(--text-subtle)]">{count}</span>
      <span className="sr-only">, {t("shopAlt.optionCount", { count })}</span>
    </>
  );
}

function OptionRow({ name, checked, onSelect, label, count, media }: OptionProps) {
  return (
    <label
      className="gt-shopb-option flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-2 py-1.5 text-[13.5px]"
      data-empty={count === 0 && !checked}
    >
      <input type="radio" name={name} checked={checked} onChange={onSelect} className="gt-shopb-radio" />
      {media}
      <span className={`min-w-0 flex-1 truncate ${checked ? "font-semibold text-[var(--text-primary)]" : "text-[var(--text-body)]"}`}>{label}</span>
      {count !== undefined && <CountText count={count} />}
    </label>
  );
}

function TileOption({ name, checked, onSelect, label, count, media }: OptionProps) {
  return (
    <label className="gt-shopb-tile relative cursor-pointer" data-empty={count === 0 && !checked}>
      <input type="radio" name={name} checked={checked} onChange={onSelect} className="peer sr-only" />
      <span className="gt-shopb-tile-face flex h-full flex-col items-center gap-1 rounded-[var(--radius-md)] border px-1 pb-1.5 pt-2 text-center">
        {media}
        <span className="text-[11px] font-medium leading-tight text-[var(--text-primary)]">{label}</span>
        {count !== undefined && <CountText count={count} />}
      </span>
    </label>
  );
}

function PillOption({ name, checked, onSelect, label, count }: OptionProps) {
  return (
    <label className="gt-shopb-pill cursor-pointer" data-empty={count === 0 && !checked}>
      <input type="radio" name={name} checked={checked} onChange={onSelect} className="peer sr-only" />
      <span className="gt-shopb-pill-face inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] border px-3 py-1.5 text-[12.5px]">
        {label}
        {count !== undefined && <CountText count={count} />}
      </span>
    </label>
  );
}
