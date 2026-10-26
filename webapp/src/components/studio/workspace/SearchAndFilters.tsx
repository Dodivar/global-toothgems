import clsx from "clsx";
import { ArrowDownUp, ListFilter, Search, X, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CREATION_FILTERS, CREATION_SORTS, type CreationFilter, type CreationSort } from "../../../lib/studioWorkspace/library";
import { focusRing } from "./workspaceStyles";

/**
 * Lightweight library tools on one row: a search field, then the filter and
 * the sort as two compact selects. A creative library, not an admin table —
 * no columns, no pagination. Filters and sort are optional so the Gem Groups
 * page reuses the search alone.
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
    <div className="flex flex-wrap items-center gap-2.5">
      <label
        className={clsx(
          "flex h-10 min-w-0 flex-1 basis-full items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3.5 text-[var(--text-subtle)] transition-colors sm:basis-[240px]",
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
      {filter && onFilter && (
        <PillSelect
          icon={ListFilter}
          label={t("studio.workspace.library.filterLabel")}
          value={filter}
          onChange={(v) => onFilter(v as CreationFilter)}
          active={filter !== "all"}
        >
          {CREATION_FILTERS.map((f) => (
            <option key={f} value={f}>
              {t(`studio.workspace.library.filters.${f}`)}
              {counts?.[f] !== undefined ? ` (${counts[f]})` : ""}
            </option>
          ))}
        </PillSelect>
      )}
      {sort && onSort && (
        <PillSelect icon={ArrowDownUp} label={t("studio.workspace.library.sortLabel")} value={sort} onChange={(v) => onSort(v as CreationSort)}>
          {CREATION_SORTS.map((s) => (
            <option key={s} value={s}>
              {t(`studio.workspace.library.sorts.${s}`)}
            </option>
          ))}
        </PillSelect>
      )}
    </div>
  );
}

/** A native select dressed as a pill; `active` marks a filter that narrows the list. */
function PillSelect({
  icon: Icon,
  label,
  value,
  onChange,
  active = false,
  children,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  onChange: (value: string) => void;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <label
      className={clsx(
        "relative flex h-10 min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-pill)] border pl-3.5 pr-2 text-[12.5px] font-semibold focus-within:border-[var(--focus-ring)] focus-within:shadow-[var(--shadow-focus)] sm:flex-none",
        active
          ? "border-[var(--gt-ink-900)] bg-[var(--gt-ink-900)] text-white"
          : "border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-primary)]",
      )}
    >
      <Icon size={14} aria-hidden="true" className={active ? "text-white/70" : "text-[var(--text-subtle)]"} />
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full min-w-0 cursor-pointer appearance-none bg-transparent pr-1 outline-none [&>option]:text-[var(--text-primary)]"
      >
        {children}
      </select>
    </label>
  );
}
