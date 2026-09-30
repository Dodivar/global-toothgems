import clsx from "clsx";
import { ArrowDownUp, Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CREATION_FILTERS, CREATION_SORTS, type CreationFilter, type CreationSort } from "../../../lib/studioWorkspace/library";
import { chipClass, focusRing } from "./workspaceStyles";

/**
 * Lightweight library tools: one search field, a row of filter chips and a
 * sort. A creative library, not an admin table — no columns, no pagination.
 * Filters and sort are optional so the Gem Groups page reuses the search alone.
 */
export function SearchAndFilters({
  query,
  onQuery,
  placeholder,
  filter,
  onFilter,
  sort,
  onSort,
  counts,
}: {
  query: string;
  onQuery: (q: string) => void;
  placeholder: string;
  filter?: CreationFilter;
  onFilter?: (f: CreationFilter) => void;
  sort?: CreationSort;
  onSort?: (s: CreationSort) => void;
  /** How many items each filter would show, next to its label. */
  counts?: Partial<Record<CreationFilter, number>>;
}) {
  const { t } = useTranslation();

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <label
          className={clsx(
            "flex h-10 min-w-0 flex-1 basis-[240px] items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3.5 text-[var(--text-subtle)] transition-colors",
            "focus-within:border-[var(--focus-ring)] focus-within:shadow-[var(--shadow-focus)]",
          )}
        >
          <Search size={15} aria-hidden="true" />
          <span className="sr-only">{placeholder}</span>
          <input
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder={placeholder}
            className="w-full min-w-0 bg-transparent text-[length:var(--text-body-sm)] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-subtle)] [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              onClick={() => onQuery("")}
              aria-label={t("studio.workspace.library.clearSearch")}
              className={clsx("grid h-6 w-6 flex-none place-items-center rounded-full hover:bg-[var(--gt-ink-100)]", focusRing)}
            >
              <X size={13} aria-hidden="true" />
            </button>
          )}
        </label>
        {sort && onSort && (
          <label className="relative flex h-10 flex-none items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--border-subtle)] bg-[var(--surface-card)] pl-3.5 pr-2 text-[12.5px] font-semibold text-[var(--text-primary)] focus-within:border-[var(--focus-ring)] focus-within:shadow-[var(--shadow-focus)]">
            <ArrowDownUp size={14} aria-hidden="true" className="text-[var(--text-subtle)]" />
            <span className="sr-only">{t("studio.workspace.library.sortLabel")}</span>
            <select
              value={sort}
              onChange={(e) => onSort(e.target.value as CreationSort)}
              className="cursor-pointer appearance-none bg-transparent pr-1 outline-none"
            >
              {CREATION_SORTS.map((s) => (
                <option key={s} value={s}>
                  {t(`studio.workspace.library.sorts.${s}`)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {filter && onFilter && (
        <div role="group" aria-label={t("studio.workspace.library.filterLabel")} className="gt-editor-scroll-x -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {CREATION_FILTERS.map((f) => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => onFilter(f)} className={chipClass(filter === f)}>
              {t(`studio.workspace.library.filters.${f}`)}
              {counts?.[f] !== undefined && (
                <span className={clsx("tabular-nums", filter === f ? "text-white/70" : "text-[var(--text-subtle)]")}>{counts[f]}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
