import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Search, SlidersHorizontal, X } from "lucide-react";
import clsx from "clsx";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import {
  activeFilterCount,
  CATALOG_SORTS,
  DEFAULT_CATALOG_FILTERS,
  type CatalogFilters,
  type CatalogSort,
} from "../../lib/academy/catalog";
import type { CourseCategory, CourseLevel } from "../../lib/academy/publicCourse";

interface Facets {
  categories: CourseCategory[];
  levels: CourseLevel[];
}

/**
 * The catalogue's lightweight controls: theme chips, level, sort and — once
 * the catalogue is long enough to need it — a search field. Only the
 * dimensions on which the published courses actually differ are offered.
 * On a wide screen they sit in one quiet row; on a phone they move into a
 * bottom sheet (the shared `Dialog`: focus kept inside, Escape closes, focus
 * returned) applied with one button that says how many courses it will show.
 */
export function CatalogControls({
  filters,
  onChange,
  facets,
  showSearch,
  countFor,
  resultCount,
}: {
  filters: CatalogFilters;
  onChange: (filters: CatalogFilters) => void;
  facets: Facets;
  showSearch: boolean;
  /** How many courses a set of filters keeps (the sheet's apply button). */
  countFor: (filters: CatalogFilters) => number;
  resultCount: number;
}) {
  const { t } = useTranslation();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState(filters);
  const active = activeFilterCount(filters);

  const openSheet = () => {
    setDraft(filters);
    setSheetOpen(true);
  };
  const applySheet = () => {
    onChange(draft);
    setSheetOpen(false);
  };

  return (
    <div className="grid gap-4">
      {/* Wide screens: one row. */}
      <div className="hidden flex-wrap items-end gap-x-6 gap-y-4 md:flex">
        <FilterFields filters={filters} onChange={onChange} facets={facets} showSearch={showSearch} layout="row" />
        <div className="ml-auto flex items-center gap-4">
          <ResultCount count={resultCount} />
          {active > 0 && <ClearButton onClick={() => onChange({ ...DEFAULT_CATALOG_FILTERS, sort: filters.sort })} />}
        </div>
      </div>

      {/* Phones: a compact bar opening the sheet. */}
      <div className="flex items-center justify-between gap-3 md:hidden">
        <button
          type="button"
          onClick={openSheet}
          aria-haspopup="dialog"
          className="inline-flex h-11 items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--border-strong)] bg-[var(--surface-card)] px-4 text-[13px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        >
          <SlidersHorizontal size={16} aria-hidden="true" />
          {t("academyPage.filters.open")}
          {active > 0 && (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[var(--accent-cta)] px-1.5 text-[11px] font-bold leading-none text-[var(--text-on-accent)]">
              <span className="sr-only">(</span>
              {active}
              <span className="sr-only">)</span>
            </span>
          )}
        </button>
        <ResultCount count={resultCount} />
      </div>

      <Dialog
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={t("academyPage.filters.dialogTitle")}
        closeLabel={t("academyPage.filters.close")}
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <ClearButton onClick={() => setDraft({ ...DEFAULT_CATALOG_FILTERS, sort: draft.sort })} disabled={activeFilterCount(draft) === 0} />
            <Button variant="primary" onClick={applySheet}>
              {t("academyPage.filters.apply", { count: countFor(draft) })}
            </Button>
          </div>
        }
      >
        <div className="grid gap-5">
          <FilterFields filters={draft} onChange={setDraft} facets={facets} showSearch={showSearch} layout="stack" />
        </div>
      </Dialog>
    </div>
  );
}

function ResultCount({ count }: { count: number }) {
  const { t } = useTranslation();
  return (
    <p role="status" className="m-0 whitespace-nowrap text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
      {t("academyPage.filters.results", { count })}
    </p>
  );
}

function ClearButton({ onClick, disabled = false }: { onClick: () => void; disabled?: boolean }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)] underline decoration-1 underline-offset-4 disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
    >
      <X size={14} aria-hidden="true" />
      {t("academyPage.filters.clear")}
    </button>
  );
}

function FilterFields({
  filters,
  onChange,
  facets,
  showSearch,
  layout,
}: {
  filters: CatalogFilters;
  onChange: (filters: CatalogFilters) => void;
  facets: Facets;
  showSearch: boolean;
  layout: "row" | "stack";
}) {
  const { t } = useTranslation();
  const searchId = useId();
  const set = (patch: Partial<CatalogFilters>) => onChange({ ...filters, ...patch });

  return (
    <>
      {showSearch && (
        <label htmlFor={searchId} className={clsx("grid gap-1.5", layout === "row" && "w-[240px]")}>
          <FieldLabel>{t("academyPage.filters.search")}</FieldLabel>
          <span className="relative">
            <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              id={searchId}
              type="search"
              value={filters.search}
              onChange={(event) => set({ search: event.target.value })}
              placeholder={t("academyPage.filters.searchPlaceholder")}
              className="h-11 w-full rounded-[var(--radius-pill)] border border-[var(--border-default)] bg-[var(--surface-card)] pl-10 pr-4 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-subtle)] focus:border-[var(--focus-ring)]"
            />
          </span>
        </label>
      )}

      {facets.categories.length > 1 && (
        <fieldset className="m-0 grid min-w-0 gap-1.5 border-0 p-0">
          <legend className="mb-1.5 p-0">
            <FieldLabel>{t("academyPage.filters.category")}</FieldLabel>
          </legend>
          <div className="flex flex-wrap gap-2">
            {(["any", ...facets.categories] as const).map((category) => {
              const selected = filters.category === category;
              return (
                <button
                  key={category}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => set({ category })}
                  className={clsx(
                    "gt-academy-chip inline-flex h-11 items-center gap-1.5 rounded-[var(--radius-pill)] border px-4 text-[13px] font-semibold",
                    selected
                      ? "border-[var(--surface-inverse)] bg-[var(--surface-inverse)] text-[var(--text-inverse)]"
                      : "border-[var(--border-default)] bg-[var(--surface-card)] text-[var(--text-primary)] hover:border-[var(--border-strong)]",
                  )}
                >
                  {category === "any" ? t("academyPage.filters.anyCategory") : t(`academy.categories.${category}`)}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      {facets.levels.length > 1 && (
        <NativeSelect
          label={t("academyPage.filters.level")}
          value={filters.level}
          onChange={(level) => set({ level: level as CourseLevel | "any" })}
          options={[
            { value: "any", label: t("academyPage.filters.anyLevel") },
            ...facets.levels.map((level) => ({ value: level, label: t(`academy.levels.${level}`) })),
          ]}
        />
      )}

      <NativeSelect
        label={t("academyPage.filters.sort")}
        value={filters.sort}
        onChange={(sort) => set({ sort: sort as CatalogSort })}
        options={CATALOG_SORTS.map((sort) => ({ value: sort, label: t(`academyPage.filters.sorts.${sort}`) }))}
      />
    </>
  );
}

function FieldLabel({ children }: { children: string }) {
  return <span className="text-[11px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-muted)]">{children}</span>;
}

/** A labelled native select: the platform's own picker on a phone, with one id per instance. */
function NativeSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  const id = useId();
  return (
    <label htmlFor={id} className="grid gap-1.5">
      <FieldLabel>{label}</FieldLabel>
      <span className="relative">
        <select
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-11 w-full min-w-[190px] appearance-none rounded-[var(--radius-pill)] border border-[var(--border-default)] bg-[var(--surface-card)] pl-4 pr-10 text-sm font-medium text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--focus-ring)]"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown size={16} aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
      </span>
    </label>
  );
}
