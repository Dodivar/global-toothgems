import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDownUp, Check, ChevronDown, Clock3, Search, ShieldCheck, ToggleRight, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import clsx from "clsx";
import { Menu } from "../ui/Menu";
import { ROLE_META, STATUS_META } from "./userMeta";
import {
  DEFAULT_USER_SORT,
  USER_ACTIVITY_PRESETS,
  USER_SORT_KEYS,
  type UserFilters,
} from "../../lib/adminUserFilters";
import { USER_ROLES, USER_STATUSES } from "../../data/adminUsers";

/**
 * Search, filters and sorting for the user list.
 *
 * Everything writes to the URL; the only local state is the search box's
 * draft, debounced so a history entry is not pushed per keystroke — the same
 * rule as the customers toolbar.
 *
 * There are few enough dimensions here that all of them stay visible on one
 * row: search, role, status, last activity and sort. No "more filters" panel —
 * with four filters, folding one away would cost more than it saves. The
 * active filters are repeated as removable chips underneath, with the result
 * count, so a narrowed list always says why it is narrow.
 */

const SEARCH_DEBOUNCE = 220;

const controlClass =
  "inline-flex h-10 items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--border-default)] bg-[var(--surface-card)] px-3.5 text-[length:var(--text-body-sm)] text-[var(--text-body)] transition-colors hover:border-[var(--gt-ink-400)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]";

const controlActiveClass = "border-[var(--gt-ink-900)] bg-[var(--gt-ink-100)] font-semibold text-[var(--text-primary)]";

interface Option {
  value: string;
  label: string;
  icon?: LucideIcon;
}

/**
 * One filter as a dropdown. The current choice carries a tick in the list and
 * is named on the trigger — and in the trigger's accessible name — so the state
 * is visible without opening it and is never conveyed by the tint alone.
 */
function FilterMenu({
  label,
  icon: Icon,
  value,
  defaultValue = "all",
  options,
  onChange,
  triggerText,
  align = "start",
}: {
  align?: "start" | "end";
  label: string;
  icon: LucideIcon;
  value: string;
  defaultValue?: string;
  options: Option[];
  onChange: (value: string) => void;
  triggerText: string;
}) {
  const active = value !== defaultValue;
  return (
    <Menu
      label={`${label}: ${triggerText}`}
      width={240}
      align={align}
      items={options.map((option) => ({
        id: option.value,
        label: option.label,
        icon: option.value === value ? Check : option.icon,
        onSelect: () => onChange(option.value),
      }))}
      trigger={(props) => (
        <button type="button" {...props} className={clsx(controlClass, "w-full sm:w-auto", active && controlActiveClass)}>
          <Icon size={15} aria-hidden="true" className="flex-none" />
          <span className="min-w-0 flex-1 truncate text-left sm:max-w-[160px]">{triggerText}</span>
          <ChevronDown size={14} aria-hidden="true" className="flex-none text-[var(--text-muted)]" />
        </button>
      )}
    />
  );
}

export function UsersToolbar({
  filters,
  resultCount,
  activeCount,
  onSearch,
  onSet,
  onReset,
}: {
  filters: UserFilters;
  resultCount: number;
  activeCount: number;
  onSearch: (value: string) => void;
  onSet: (key: "role" | "status" | "activity" | "sort", value: string) => void;
  onReset: () => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(filters.search);

  // The URL is the source of truth: a reset from a chip, a KPI tile or the
  // empty state has to clear the box too.
  useEffect(() => setDraft(filters.search), [filters.search]);

  useEffect(() => {
    if (draft === filters.search) return;
    const id = setTimeout(() => onSearch(draft), SEARCH_DEBOUNCE);
    return () => clearTimeout(id);
  }, [draft, filters.search, onSearch]);

  const roleOptions: Option[] = [
    { value: "all", label: t("admin.users.filterAllRoles") },
    ...USER_ROLES.map((role) => ({ value: role, label: t(`admin.users.role.${role}`), icon: ROLE_META[role].icon })),
  ];
  const statusOptions: Option[] = [
    { value: "all", label: t("admin.users.filterAllStatuses") },
    ...USER_STATUSES.map((s) => ({ value: s, label: t(`admin.users.status.${s}`), icon: STATUS_META[s].icon })),
  ];
  const activityOptions: Option[] = USER_ACTIVITY_PRESETS.map((preset) => ({
    value: preset,
    label: t(`admin.users.activityPreset.${preset}`),
  }));
  const sortOptions: Option[] = USER_SORT_KEYS.map((key) => ({ value: key, label: t(`admin.users.sort.${key}`) }));

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 basis-[260px]">
          <Search
            size={16}
            aria-hidden="true"
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
          />
          <input
            type="search"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-label={t("admin.users.searchLabel")}
            placeholder={t("admin.users.searchPlaceholder")}
            className="h-10 w-full rounded-[var(--radius-pill)] border border-[var(--border-default)] bg-[var(--surface-card)] pl-11 pr-10 text-[length:var(--text-body-sm)] text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] hover:border-[var(--gt-ink-400)] focus:border-[var(--focus-ring)] focus:shadow-[var(--shadow-focus)] [&::-webkit-search-cancel-button]:hidden"
          />
          {draft && (
            <button
              type="button"
              onClick={() => {
                setDraft("");
                onSearch("");
              }}
              aria-label={t("admin.users.clearSearch")}
              title={t("admin.users.clearSearch")}
              className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--gt-ink-100)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
            >
              <X size={14} aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Two columns on a phone, one row above: the left column's menus open
            rightwards and the right column's leftwards, so no panel can run
            off the edge of a 375px screen. */}
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
          <FilterMenu
            label={t("admin.users.filterRole")}
            icon={ShieldCheck}
            value={filters.role}
            options={roleOptions}
            onChange={(v) => onSet("role", v)}
            triggerText={filters.role === "all" ? t("admin.users.filterRole") : t(`admin.users.role.${filters.role}`)}
          />
          <FilterMenu
            label={t("admin.users.filterStatus")}
            icon={ToggleRight}
            align="end"
            value={filters.status}
            options={statusOptions}
            onChange={(v) => onSet("status", v)}
            triggerText={filters.status === "all" ? t("admin.users.filterStatus") : t(`admin.users.status.${filters.status}`)}
          />
          <FilterMenu
            label={t("admin.users.filterActivity")}
            icon={Clock3}
            value={filters.activity}
            options={activityOptions}
            onChange={(v) => onSet("activity", v)}
            triggerText={
              filters.activity === "all" ? t("admin.users.filterActivity") : t(`admin.users.activityPreset.${filters.activity}`)
            }
          />
          <span aria-hidden="true" className="mx-0.5 hidden h-6 w-px bg-[var(--border-subtle)] sm:block" />
          <FilterMenu
            label={t("admin.users.sortLabel")}
            icon={ArrowDownUp}
            value={filters.sort}
            defaultValue={DEFAULT_USER_SORT}
            align="end"
            options={sortOptions}
            onChange={(v) => onSet("sort", v)}
            triggerText={t(`admin.users.sort.${filters.sort}`)}
          />
        </div>
      </div>

      {activeCount > 0 && <ActiveChips filters={filters} resultCount={resultCount} onSearch={onSearch} onSet={onSet} onReset={onReset} />}
    </div>
  );
}

function ActiveChips({
  filters,
  resultCount,
  onSearch,
  onSet,
  onReset,
}: {
  filters: UserFilters;
  resultCount: number;
  onSearch: (value: string) => void;
  onSet: (key: "role" | "status" | "activity", value: string) => void;
  onReset: () => void;
}) {
  const { t } = useTranslation();
  const chips: { id: string; label: string; onRemove: () => void }[] = [];

  if (filters.search.trim()) {
    chips.push({ id: "search", label: t("admin.users.chipSearch", { term: filters.search.trim() }), onRemove: () => onSearch("") });
  }
  if (filters.role !== "all") {
    chips.push({
      id: "role",
      label: `${t("admin.users.filterRole")}: ${t(`admin.users.role.${filters.role}`)}`,
      onRemove: () => onSet("role", "all"),
    });
  }
  if (filters.status !== "all") {
    chips.push({
      id: "status",
      label: `${t("admin.users.filterStatus")}: ${t(`admin.users.status.${filters.status}`)}`,
      onRemove: () => onSet("status", "all"),
    });
  }
  if (filters.activity !== "all") {
    chips.push({
      id: "activity",
      label: `${t("admin.users.filterActivity")}: ${t(`admin.users.activityPreset.${filters.activity}`)}`,
      onRemove: () => onSet("activity", "all"),
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border-subtle)] pt-3">
      <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]" aria-live="polite">
        {t("admin.users.resultCount", { count: resultCount })}
      </span>
      <ul className="m-0 flex list-none flex-wrap items-center gap-1.5 p-0">
        {chips.map((chip) => (
          <li key={chip.id} className="motion-safe:animate-[gt-menu-in_var(--duration-fast)_var(--ease-out-soft)_both]">
            <button
              type="button"
              onClick={chip.onRemove}
              className="inline-flex max-w-[280px] items-center gap-1.5 rounded-[var(--radius-pill)] border border-[var(--gt-blue-200)] bg-[var(--surface-brand-wash)] py-1 pl-3 pr-2 text-[length:var(--text-caption)] text-[var(--gt-blue-700)] transition-colors hover:border-[var(--gt-blue-400)] hover:bg-[var(--gt-blue-100)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
            >
              <span className="truncate">{chip.label}</span>
              <X size={13} aria-hidden="true" className="flex-none" />
              <span className="sr-only">{t("admin.users.chipRemove")}</span>
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onReset}
        className="ml-auto inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] px-3 py-1 text-[length:var(--text-caption)] font-semibold text-[var(--text-muted)] underline decoration-1 underline-offset-4 transition-colors hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
      >
        {t("admin.users.clearFilters")}
      </button>
    </div>
  );
}
