import { useId, useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { FilterX, X } from "lucide-react";
import clsx from "clsx";
import { AdminButton } from "./AdminButton";
import { AdminSelect, type AdminOption } from "./AdminSelect";
import { ColorMedia, ShapeMedia, useGemTraits } from "./GemTraits";
import { SearchInput } from "./SearchInput";
import { useLocalized } from "../../lib/localized";
import { useAdminCatalog } from "../../lib/adminCatalog";
import { sortByShapeLabel } from "../../data/products";
import { type AdminProduct, type CategoryId, type ProductStatus, type StockState } from "../../data/adminCatalog";
import {
  DEFAULT_FILTERS,
  SORT_KEYS,
  gemFacets,
  isFiltered,
  type FacetCount,
  type FilterKey,
  type ProductFilterState,
  type SortKey,
} from "../../lib/productFilters";

/**
 * The toolbar above the product list.
 *
 * Every control changes the list on the spot — there is no Apply button,
 * because filtering a catalogue should cost one interaction, not two.
 *
 * Shape and colour get rows of drawn chips rather than selects: a gem is
 * recognised by its silhouette and shade faster than by its name, and a native
 * `<select>` can show neither. Each chip carries the count its click would
 * give, so a dead end is visible before it is taken.
 *
 * Whatever narrows the list is repeated as a removable pill next to the count:
 * a shape picked, then a category that has no such shape, would otherwise
 * leave an empty table with nothing on screen saying why.
 */
export function ProductFilters({
  filters,
  onChange,
  products,
  resultCount,
  totalCount,
}: {
  filters: ProductFilterState;
  onChange: (next: ProductFilterState) => void;
  /** The whole catalogue, unfiltered: the chip counts are computed from it. */
  products: AdminProduct[];
  resultCount: number;
  totalCount: number;
}) {
  const { t, i18n } = useTranslation();
  const L = useLocalized();
  const { categories, categoryById } = useAdminCatalog();
  const { shapeLabel, colorLabel, colorDef, colorOrder } = useGemTraits();

  const set = <K extends keyof ProductFilterState>(key: K, value: ProductFilterState[K]) =>
    onChange({ ...filters, [key]: value });

  const facets = useMemo(() => gemFacets(products, filters, colorOrder), [products, filters, colorOrder]);
  // Alphabetical in the reading language, like the storefront and the form's picker.
  const shapeFacets = useMemo(
    () => sortByShapeLabel(facets.shapes, (facet) => facet.value, shapeLabel, i18n.language),
    [facets.shapes, shapeLabel, i18n.language],
  );

  const categoryOptions: AdminOption[] = [
    { value: "all", label: t("admin.filters.allCategories") },
    ...categories.map((c) => ({ value: c.id, label: L(c.name) })),
  ];

  const statusOptions: AdminOption[] = [
    { value: "all", label: t("admin.filters.allStatuses") },
    ...(["active", "draft", "archived"] as ProductStatus[]).map((s) => ({
      value: s,
      label: t(`admin.state.${s}`),
    })),
  ];

  const availabilityOptions: AdminOption[] = [
    { value: "all", label: t("admin.filters.allAvailability") },
    ...(["in_stock", "low_stock", "out_of_stock", "preorder"] as StockState[]).map((s) => ({
      value: s,
      label: t(`admin.stock.${s}`),
    })),
  ];

  const sortOptions: AdminOption[] = SORT_KEYS.map((key) => ({
    value: key,
    label: t(`admin.sort.${key}`),
  }));

  const filtered = isFiltered(filters);

  /** One removable pill per active filter, in toolbar order. */
  const pills: { key: FilterKey; name: string; value: string }[] = [];
  if (filters.search.trim()) pills.push({ key: "search", name: t("admin.filters.search"), value: t("admin.filters.searchValue", { query: filters.search.trim() }) });
  if (filters.category !== "all")
    pills.push({ key: "category", name: t("admin.filters.category"), value: L(categoryById(filters.category).name) });
  if (filters.status !== "all")
    pills.push({ key: "status", name: t("admin.filters.status"), value: t(`admin.state.${filters.status}`) });
  if (filters.availability !== "all")
    pills.push({ key: "availability", name: t("admin.filters.availability"), value: t(`admin.stock.${filters.availability}`) });
  if (filters.shape !== "all") pills.push({ key: "shape", name: t("admin.filters.shape"), value: shapeLabel(filters.shape) });
  if (filters.color !== "all") pills.push({ key: "color", name: t("admin.filters.color"), value: colorLabel(filters.color) });

  return (
    <section aria-label={t("admin.filters.label")} className="gt-admin-panel grid gap-4 p-4">
      {/* Sized from each control's longest option rather than evenly: a filter
          whose current value is cut off has stopped saying what it is doing. */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-[minmax(190px,1.3fr)_minmax(170px,1.1fr)_minmax(140px,1fr)_minmax(175px,1.1fr)_minmax(215px,1.3fr)]">
        <SearchInput
          value={filters.search}
          onChange={(value) => set("search", value)}
          label={t("admin.filters.searchLabel")}
          placeholder={t("admin.filters.searchPlaceholder")}
          clearLabel={t("admin.filters.clearSearch")}
        />

        <AdminSelect
          aria-label={t("admin.filters.category")}
          options={categoryOptions}
          value={filters.category}
          data-active={filters.category !== "all"}
          onChange={(e) => set("category", e.target.value as CategoryId | "all")}
        />

        <AdminSelect
          aria-label={t("admin.filters.status")}
          options={statusOptions}
          value={filters.status}
          data-active={filters.status !== "all"}
          onChange={(e) => set("status", e.target.value as ProductStatus | "all")}
        />

        <AdminSelect
          aria-label={t("admin.filters.availability")}
          options={availabilityOptions}
          value={filters.availability}
          data-active={filters.availability !== "all"}
          onChange={(e) => set("availability", e.target.value as StockState | "all")}
        />

        <label className="flex items-center gap-2">
          <span className="flex-none text-[length:var(--text-caption)] font-semibold text-[var(--text-muted)]">
            {t("admin.filters.sort")}
          </span>
          <AdminSelect
            aria-label={t("admin.filters.sort")}
            options={sortOptions}
            value={filters.sort}
            onChange={(e) => set("sort", e.target.value as SortKey)}
          />
        </label>
      </div>

      <ChipRow
        label={t("admin.filters.shape")}
        facets={shapeFacets}
        selected={filters.shape}
        allLabel={t("admin.filters.allShapes")}
        onSelect={(value) => set("shape", value)}
        render={(shape) => ({ label: shapeLabel(shape), media: <ShapeMedia shape={shape} /> })}
      />

      <ChipRow
        label={t("admin.filters.color")}
        facets={facets.colors}
        selected={filters.color}
        allLabel={t("admin.filters.allColors")}
        onSelect={(value) => set("color", value)}
        render={(slug) => ({ label: colorLabel(slug), media: <ColorMedia color={colorDef(slug)} /> })}
      />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-[var(--border-subtle)] pt-3">
        {/* Polite, not assertive: the count updates on every keystroke, and an
            assertive region would interrupt the typing that caused it. */}
        <p
          role="status"
          aria-live="polite"
          className="m-0 text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]"
        >
          {filtered
            ? t("admin.filters.resultCountFiltered", { count: resultCount, total: totalCount })
            : t("admin.filters.resultCount", { count: resultCount })}
        </p>

        {pills.length > 0 && (
          <ul aria-label={t("admin.filters.active")} className="m-0 flex list-none flex-wrap items-center gap-1.5 p-0">
            {pills.map((pill) => {
              const text = t("admin.filters.pill", { name: pill.name, value: pill.value });
              return (
                <li key={pill.key}>
                  <button
                    type="button"
                    onClick={() => set(pill.key, DEFAULT_FILTERS[pill.key])}
                    aria-label={t("admin.filters.removeFilter", { filter: text })}
                    className="inline-flex max-w-[280px] items-center gap-1.5 rounded-[var(--radius-pill)] border border-[var(--gt-ink-900)] bg-[var(--gt-blue-50)] py-0.5 pl-2.5 pr-1.5 text-[length:var(--text-caption)] text-[var(--text-primary)] transition-colors hover:bg-[var(--gt-ink-100)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                  >
                    <span className="truncate">
                      <span className="text-[var(--text-muted)]">{pill.name}</span>{" "}
                      <span className="font-semibold">{pill.value}</span>
                    </span>
                    <X size={13} strokeWidth={2.2} aria-hidden="true" className="flex-none" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {filtered && (
          <AdminButton
            size="sm"
            variant="ghost"
            iconLeft={FilterX}
            className="ml-auto"
            onClick={() => onChange({ ...DEFAULT_FILTERS, sort: filters.sort })}
          >
            {t("admin.filters.clear")}
          </AdminButton>
        )}
      </div>
    </section>
  );
}

/**
 * One labelled row of toggle chips: "all" first, then each value with its
 * count. The row disappears when no value has a product under the current
 * filters and none is picked — under "Outils", a row of shapes at 0 is only
 * noise — but a picked value always stays, so it can be unpicked in place.
 */
function ChipRow<T extends string>({
  label,
  facets,
  selected,
  allLabel,
  onSelect,
  render,
}: {
  label: string;
  facets: FacetCount<T>[];
  selected: T | "all";
  allLabel: string;
  onSelect: (value: T | "all") => void;
  render: (value: T) => { label: string; media: ReactNode };
}) {
  const { t } = useTranslation();
  const labelId = useId();
  if (facets.length === 0) return null;
  if (selected === "all" && facets.every((facet) => facet.count === 0)) return null;

  return (
    <div className="grid gap-1.5 md:grid-cols-[88px_1fr] md:items-start md:gap-3">
      <span id={labelId} className="pt-1.5 text-[length:var(--text-caption)] font-semibold text-[var(--text-muted)]">
        {label}
      </span>
      {/* Wraps on a wide screen, where every value should be in sight; scrolls
          sideways on a phone, where wrapping would push the table off-screen. */}
      <div role="group" aria-labelledby={labelId} className="gt-scroller flex gap-1.5 pb-0.5 md:flex-wrap md:overflow-visible">
        <Chip active={selected === "all"} onClick={() => onSelect("all")} label={allLabel} />
        {facets.map((facet) => {
          const { label: chipLabel, media } = render(facet.value);
          const active = selected === facet.value;
          return (
            <Chip
              key={facet.value}
              active={active}
              // Clicking the picked value again unpicks it: the chip is a toggle.
              onClick={() => onSelect(active ? "all" : facet.value)}
              label={chipLabel}
              media={media}
              count={facet.count}
              countLabel={t("admin.filters.chipCount", { count: facet.count })}
            />
          );
        })}
      </div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  label,
  media,
  count,
  countLabel,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  media?: ReactNode;
  count?: number;
  countLabel?: string;
}) {
  const empty = count === 0 && !active;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        "inline-flex h-8 flex-none snap-start items-center gap-1.5 rounded-[var(--radius-pill)] border text-[length:var(--text-caption)] transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
        media ? "pl-1.5 pr-2.5" : "px-3",
        active
          ? "border-[var(--gt-ink-900)] bg-[var(--gt-ink-900)] font-semibold text-[var(--text-inverse)]"
          : "border-[var(--border-subtle)] bg-[var(--admin-panel)] text-[var(--text-primary)] hover:border-[var(--gt-ink-900)]",
        empty && "opacity-55",
      )}
    >
      {media && <span className="grid h-5 w-5 flex-none place-items-center rounded-full bg-[var(--admin-panel)]">{media}</span>}
      <span className="whitespace-nowrap">{label}</span>
      {count !== undefined && (
        <>
          <span
            aria-hidden="true"
            className={clsx(
              "tabular-nums",
              active ? "text-[color-mix(in_srgb,var(--text-inverse)_75%,transparent)]" : "text-[var(--text-muted)]",
            )}
          >
            {count}
          </span>
          <span className="sr-only">{countLabel}</span>
        </>
      )}
    </button>
  );
}
