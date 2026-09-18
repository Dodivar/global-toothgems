import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarRange, ChevronDown, Filter, Search, SlidersHorizontal, X } from "lucide-react";
import clsx from "clsx";
import { Button } from "../ui/Button";
import { Menu } from "../ui/Menu";
import { TAG_ICON } from "./CustomerBadges";
import {
  CUSTOMER_DATE_PRESETS,
  ORDER_ACTIVITIES,
  SPEND_BANDS,
  TRAINING_FILTERS,
  type CustomerDatePreset,
  type CustomerFilters,
} from "../../lib/adminCustomerFilters";
import { CUSTOMER_SEGMENTS, CUSTOMER_STATUSES, CUSTOMER_TAGS } from "../../data/adminCustomers";

/**
 * Search and filtering for the customer base.
 *
 * Everything writes to the URL, so the toolbar holds no state of its own except
 * the search box's draft — that one is local and debounced, because pushing a
 * history entry per keystroke would make the back button useless.
 *
 * The layout follows the orders toolbar's finding: seven filters laid out as
 * seven open selects is taller than the first rows of the table it filters. So
 * what stays permanently visible is search, registration date and status — the
 * three an operator reaches for constantly — and the rest folds behind "More
 * filters". The chips underneath are what keep that honest: a filter hidden
 * inside a collapsed panel is invisible, and an operator who cannot see why the
 * table has four rows will conclude the data is missing.
 *
 * The search field states what it searches. "Search customers…" leaves an
 * operator guessing whether a phone number will work; naming the four fields
 * costs one line of placeholder and answers it.
 */

const SEARCH_DEBOUNCE = 220;

interface ToolbarProps {
  filters: CustomerFilters;
  /** Result count under the current filters, shown beside the reset action. */
  resultCount: number;
  activeCount: number;
  /** Tags actually present in the base, so the filter never offers an empty one. */
  availableTags: string[];
  onSearch: (value: string) => void;
  onToggleStatus: (status: string) => void;
  onSet: (key: keyof CustomerFilters, value: string) => void;
  onDatePreset: (preset: CustomerDatePreset, from?: string, to?: string) => void;
  onReset: () => void;
}

function FieldLabel({ children }: { children: string }) {
  return (
    <span className="text-[11px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-muted)]">
      {children}
    </span>
  );
}

/** Shared look for the toolbar's popover triggers and inline controls. */
const controlClass =
  "inline-flex h-10 items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--border-default)] bg-[var(--surface-card)] px-3.5 text-[length:var(--text-body-sm)] text-[var(--text-body)] transition-colors hover:border-[var(--gt-ink-400)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]";

const controlActiveClass = "border-[var(--gt-ink-900)] bg-[var(--gt-ink-100)] font-semibold text-[var(--text-primary)]";

function PopoverSelect({
  label,
  value,
  options,
  onChange,
  allLabel,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  allLabel: string;
}) {
  const active = value !== "all";
  const current = options.find((o) => o.value === value);
  return (
    <Menu
      label={label}
      width={248}
      items={[
        { id: "all", label: allLabel, onSelect: () => onChange("all") },
        ...options.map((o) => ({ id: o.value, label: o.label, onSelect: () => onChange(o.value) })),
      ]}
      trigger={(props) => (
        <button type="button" {...props} className={clsx(controlClass, active && controlActiveClass)}>
          <span className="max-w-[170px] truncate">{active && current ? current.label : label}</span>
          <ChevronDown size={14} aria-hidden="true" className="flex-none text-[var(--text-muted)]" />
        </button>
      )}
    />
  );
}

export function CustomersToolbar({
  filters,
  resultCount,
  activeCount,
  availableTags,
  onSearch,
  onToggleStatus,
  onSet,
  onDatePreset,
  onReset,
}: ToolbarProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(filters.search);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(filters.from);
  const [customTo, setCustomTo] = useState(filters.to);

  // The URL is the source of truth, so a reset elsewhere — the chips, the empty
  // state, a KPI tile, a pasted link — has to clear the box too.
  useEffect(() => setDraft(filters.search), [filters.search]);

  useEffect(() => {
    if (draft === filters.search) return;
    const id = setTimeout(() => onSearch(draft), SEARCH_DEBOUNCE);
    return () => clearTimeout(id);
  }, [draft, filters.search, onSearch]);

  // A filter set from a KPI tile or a pasted link lives in the advanced panel.
  // Opening the panel when one of its filters is on is what stops the operator
  // from having to hunt for the control that is narrowing their table.
  const advancedActive =
    filters.segment !== "all" ||
    filters.activity !== "all" ||
    filters.training !== "all" ||
    filters.spend !== "all" ||
    filters.tag !== "all";

  useEffect(() => {
    if (advancedActive) setAdvancedOpen(true);
  }, [advancedActive]);

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* Search. Wide, first, and the only control that grows: "where is
            Clara Vidal" has to be answerable without reading the toolbar. */}
        <div className="relative min-w-[240px] flex-1">
          <Search
            size={16}
            aria-hidden="true"
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
          />
          <input
            type="search"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-label={t("admin.customers.searchLabel")}
            aria-describedby="gt-customer-search-hint"
            placeholder={t("admin.customers.searchPlaceholder")}
            className="h-10 w-full rounded-[var(--radius-pill)] border border-[var(--border-default)] bg-[var(--surface-card)] pl-11 pr-4 text-[length:var(--text-body-sm)] text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-subtle)] focus:border-[var(--focus-ring)] focus:shadow-[var(--shadow-focus)]"
          />
          <span id="gt-customer-search-hint" className="sr-only">
            {t("admin.customers.searchHint")}
          </span>
        </div>

        {/* Registration date. Presets first, because "last 30 days" is what an
            operator actually wants; the custom range is at the bottom of the
            same panel. */}
        <Menu
          label={t("admin.customers.dateLabel")}
          width={268}
          trigger={(props) => (
            <button
              type="button"
              {...props}
              className={clsx(controlClass, filters.datePreset !== "all" && controlActiveClass)}
            >
              <CalendarRange size={15} aria-hidden="true" className="flex-none" />
              <span className="truncate">
                {filters.datePreset === "all"
                  ? t("admin.customers.dateLabel")
                  : t(`admin.customers.datePreset.${filters.datePreset}`)}
              </span>
              <ChevronDown size={14} aria-hidden="true" className="flex-none text-[var(--text-muted)]" />
            </button>
          )}
        >
          <div className="grid gap-1">
            {CUSTOMER_DATE_PRESETS.filter((p) => p !== "custom").map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => onDatePreset(preset)}
                aria-pressed={filters.datePreset === preset}
                className={clsx(
                  "rounded-[var(--radius-sm)] px-2.5 py-2 text-left text-[length:var(--text-body-sm)] transition-colors hover:bg-[var(--gt-ink-100)]",
                  filters.datePreset === preset
                    ? "bg-[var(--gt-ink-100)] font-semibold text-[var(--text-primary)]"
                    : "text-[var(--text-body)]",
                )}
              >
                {t(`admin.customers.datePreset.${preset}`)}
              </button>
            ))}
          </div>
          <div className="grid gap-2 border-t border-[var(--border-subtle)] pt-3">
            <FieldLabel>{t("admin.customers.datePreset.custom")}</FieldLabel>
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1">
                <span className="text-[10px] uppercase tracking-[var(--tracking-wide)] text-[var(--text-subtle)]">
                  {t("admin.customers.dateFrom")}
                </span>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="h-9 rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--surface-card)] px-2 text-[length:var(--text-caption)] text-[var(--text-primary)] outline-none focus:border-[var(--focus-ring)]"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-[10px] uppercase tracking-[var(--tracking-wide)] text-[var(--text-subtle)]">
                  {t("admin.customers.dateTo")}
                </span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="h-9 rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--surface-card)] px-2 text-[length:var(--text-caption)] text-[var(--text-primary)] outline-none focus:border-[var(--focus-ring)]"
                />
              </label>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={!customFrom && !customTo}
              onClick={() => onDatePreset("custom", customFrom, customTo)}
            >
              {t("admin.customers.dateApply")}
            </Button>
          </div>
        </Menu>

        {/* Status. Multi-select, because "inactive or suspended" is one
            question — "which accounts cannot currently buy". */}
        <Menu
          label={t("admin.customers.statusFilterLabel")}
          width={236}
          trigger={(props) => (
            <button
              type="button"
              {...props}
              className={clsx(controlClass, filters.statuses.length > 0 && controlActiveClass)}
            >
              <Filter size={15} aria-hidden="true" className="flex-none" />
              <span className="truncate">
                {filters.statuses.length === 0
                  ? t("admin.customers.statusFilterLabel")
                  : t("admin.customers.statusFilterCount", { count: filters.statuses.length })}
              </span>
              <ChevronDown size={14} aria-hidden="true" className="flex-none text-[var(--text-muted)]" />
            </button>
          )}
        >
          <div className="grid gap-0.5">
            {CUSTOMER_STATUSES.map((status) => (
              <label
                key={status}
                className="flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-2 py-1.5 text-[length:var(--text-body-sm)] text-[var(--text-body)] transition-colors hover:bg-[var(--gt-ink-100)]"
              >
                <input
                  type="checkbox"
                  checked={filters.statuses.includes(status)}
                  onChange={() => onToggleStatus(status)}
                  className="h-4 w-4 flex-none accent-[var(--gt-ink-900)]"
                />
                {t(`admin.customers.status.${status}`)}
              </label>
            ))}
          </div>
        </Menu>

        <button
          type="button"
          onClick={() => setAdvancedOpen((v) => !v)}
          aria-expanded={advancedOpen}
          aria-controls="gt-customer-advanced-filters"
          className={clsx(controlClass, advancedOpen && controlActiveClass)}
        >
          <SlidersHorizontal size={15} aria-hidden="true" className="flex-none" />
          <span className="hidden sm:inline">{t("admin.customers.moreFilters")}</span>
        </button>
      </div>

      <div
        id="gt-customer-advanced-filters"
        className={clsx("flex-wrap items-center gap-2", advancedOpen ? "flex" : "hidden")}
      >
        <PopoverSelect
          label={t("admin.customers.segmentFilterLabel")}
          value={filters.segment}
          allLabel={t("admin.customers.filterAllSegments")}
          options={CUSTOMER_SEGMENTS.map((s) => ({ value: s, label: t(`admin.customers.segment.${s}`) }))}
          onChange={(v) => onSet("segment", v)}
        />
        <PopoverSelect
          label={t("admin.customers.activityFilterLabel")}
          value={filters.activity}
          allLabel={t("admin.customers.filterAllActivity")}
          options={ORDER_ACTIVITIES.filter((a) => a !== "all").map((a) => ({
            value: a,
            label: t(`admin.customers.activity.${a}`),
          }))}
          onChange={(v) => onSet("activity", v)}
        />
        <PopoverSelect
          label={t("admin.customers.trainingFilterLabel")}
          value={filters.training}
          allLabel={t("admin.customers.filterAllTraining")}
          options={TRAINING_FILTERS.filter((f) => f !== "all").map((f) => ({
            value: f,
            label: t(`admin.customers.trainingFilter.${f}`),
          }))}
          onChange={(v) => onSet("training", v)}
        />
        <PopoverSelect
          label={t("admin.customers.spendFilterLabel")}
          value={filters.spend}
          allLabel={t("admin.customers.filterAllSpend")}
          options={SPEND_BANDS.filter((b) => b !== "all").map((b) => ({
            value: b,
            label: t(`admin.customers.spend.${b}`),
          }))}
          onChange={(v) => onSet("spend", v)}
        />
        <PopoverSelect
          label={t("admin.customers.tagFilterLabel")}
          value={filters.tag}
          allLabel={t("admin.customers.filterAllTags")}
          options={CUSTOMER_TAGS.filter((tag) => availableTags.includes(tag)).map((tag) => ({
            value: tag,
            label: t(`admin.customers.tag.${tag}`),
          }))}
          onChange={(v) => onSet("tag", v)}
        />
      </div>

      {activeCount > 0 && (
        <ActiveChips
          filters={filters}
          resultCount={resultCount}
          onToggleStatus={onToggleStatus}
          onSearch={onSearch}
          onSet={onSet}
          onDatePreset={onDatePreset}
          onReset={onReset}
        />
      )}
    </div>
  );
}

/**
 * The active filters, as removable chips.
 *
 * Each chip names its dimension as well as its value — "Status: suspended", not
 * "suspended" — because six chips of bare values do not say which control to
 * reopen if removing the chip is not what you wanted.
 */
function ActiveChips({
  filters,
  resultCount,
  onToggleStatus,
  onSearch,
  onSet,
  onDatePreset,
  onReset,
}: {
  filters: CustomerFilters;
  resultCount: number;
  onToggleStatus: (status: string) => void;
  onSearch: (value: string) => void;
  onSet: (key: keyof CustomerFilters, value: string) => void;
  onDatePreset: (preset: CustomerDatePreset) => void;
  onReset: () => void;
}) {
  const { t } = useTranslation();

  const chips: { id: string; label: string; onRemove: () => void }[] = [];

  if (filters.search.trim()) {
    chips.push({
      id: "search",
      label: t("admin.customers.chipSearch", { term: filters.search.trim() }),
      onRemove: () => onSearch(""),
    });
  }
  filters.statuses.forEach((status) =>
    chips.push({
      id: `status-${status}`,
      label: `${t("admin.customers.chipStatus")}: ${t(`admin.customers.status.${status}`)}`,
      onRemove: () => onToggleStatus(status),
    }),
  );
  if (filters.segment !== "all") {
    chips.push({
      id: "segment",
      label: `${t("admin.customers.chipSegment")}: ${t(`admin.customers.segment.${filters.segment}`)}`,
      onRemove: () => onSet("segment", "all"),
    });
  }
  if (filters.activity !== "all") {
    chips.push({
      id: "activity",
      label: `${t("admin.customers.chipActivity")}: ${t(`admin.customers.activity.${filters.activity}`)}`,
      onRemove: () => onSet("activity", "all"),
    });
  }
  if (filters.training !== "all") {
    chips.push({
      id: "training",
      label: `${t("admin.customers.chipTraining")}: ${t(`admin.customers.trainingFilter.${filters.training}`)}`,
      onRemove: () => onSet("training", "all"),
    });
  }
  if (filters.spend !== "all") {
    chips.push({
      id: "spend",
      label: `${t("admin.customers.chipSpend")}: ${t(`admin.customers.spend.${filters.spend}`)}`,
      onRemove: () => onSet("spend", "all"),
    });
  }
  if (filters.tag !== "all") {
    chips.push({
      id: "tag",
      label: `${t("admin.customers.chipTag")}: ${t(`admin.customers.tag.${filters.tag}`)}`,
      onRemove: () => onSet("tag", "all"),
    });
  }
  if (filters.datePreset !== "all") {
    const label =
      filters.datePreset === "custom"
        ? `${filters.from || "…"} → ${filters.to || "…"}`
        : t(`admin.customers.datePreset.${filters.datePreset}`);
    chips.push({
      id: "date",
      label: `${t("admin.customers.chipDate")}: ${label}`,
      onRemove: () => onDatePreset("all"),
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border-subtle)] pt-3">
      <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
        {t("admin.customers.resultCount", { count: resultCount })}
      </span>
      <ul className="m-0 flex list-none flex-wrap items-center gap-1.5 p-0">
        {chips.map((chip) => {
          const Icon = chip.id === "tag" ? TAG_ICON[filters.tag as keyof typeof TAG_ICON] : undefined;
          return (
            <li key={chip.id} className="motion-safe:animate-[gt-menu-in_var(--duration-fast)_var(--ease-out-soft)_both]">
              <button
                type="button"
                onClick={chip.onRemove}
                className="inline-flex max-w-[280px] items-center gap-1.5 rounded-[var(--radius-pill)] border border-[var(--gt-blue-200)] bg-[var(--surface-brand-wash)] py-1 pl-3 pr-2 text-[length:var(--text-caption)] text-[var(--gt-blue-700)] transition-colors hover:border-[var(--gt-blue-400)] hover:bg-[var(--gt-blue-100)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
              >
                {Icon && <Icon size={12} aria-hidden="true" className="flex-none" />}
                <span className="truncate">{chip.label}</span>
                <X size={13} aria-hidden="true" className="flex-none" />
                <span className="sr-only">{t("admin.customers.chipRemove")}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={onReset}
        className="ml-auto inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] px-3 py-1 text-[length:var(--text-caption)] font-semibold text-[var(--text-muted)] underline decoration-1 underline-offset-4 transition-colors hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
      >
        {t("admin.customers.clearFilters")}
      </button>
    </div>
  );
}
