import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarRange, ChevronDown, Filter, Search, SlidersHorizontal, X } from "lucide-react";
import clsx from "clsx";
import { Button } from "../ui/Button";
import { Menu } from "../ui/Menu";
import {
  DATE_PRESETS,
  type DatePreset,
  type OrderFilters,
} from "../../lib/adminOrderFilters";
import {
  ADMIN_CUSTOMERS,
  FULFILLMENT_STATUSES,
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  SHIPPING_METHODS,
  customerName,
} from "../../data/adminOrders";
import { PRODUCTS } from "../../data/products";
import { COURSES } from "../../data/courses";
import { pick } from "../../data/types";

/**
 * Search and filtering for the order book.
 *
 * Everything here writes to the URL, so the toolbar holds no state of its own
 * except the search box's draft — that one is local and debounced, because
 * pushing a history entry per keystroke would make the back button useless.
 *
 * The controls are popovers rather than a row of open selects: seven filters
 * laid out as seven `<select>`s is the shape that made the first draft of this
 * toolbar taller than the first three rows of the table it filters. What stays
 * permanently visible is the search field, the date range and the status
 * filter — the three an operator reaches for constantly — plus a chip per
 * active filter so nothing is ever narrowing the table invisibly.
 */

const SEARCH_DEBOUNCE = 220;

interface ToolbarProps {
  filters: OrderFilters;
  /** Result count under the current filters, shown beside the reset action. */
  resultCount: number;
  activeCount: number;
  onSearch: (value: string) => void;
  onToggleStatus: (status: string) => void;
  onSet: (key: keyof OrderFilters, value: string) => void;
  onDatePreset: (preset: DatePreset, from?: string, to?: string) => void;
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
          <span className="max-w-[160px] truncate">{active && current ? current.label : label}</span>
          <ChevronDown size={14} aria-hidden="true" className="flex-none text-[var(--text-muted)]" />
        </button>
      )}
    />
  );
}

export function OrdersToolbar({
  filters,
  resultCount,
  activeCount,
  onSearch,
  onToggleStatus,
  onSet,
  onDatePreset,
  onReset,
}: ToolbarProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [draft, setDraft] = useState(filters.search);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(filters.from);
  const [customTo, setCustomTo] = useState(filters.to);

  // The URL is the source of truth, so a reset elsewhere — the chips, the empty
  // state, a pasted link — has to clear the box too.
  useEffect(() => setDraft(filters.search), [filters.search]);

  useEffect(() => {
    if (draft === filters.search) return;
    const id = setTimeout(() => onSearch(draft), SEARCH_DEBOUNCE);
    return () => clearTimeout(id);
  }, [draft, filters.search, onSearch]);

  const statusOptions = ORDER_STATUSES.map((s) => ({ value: s, label: t(`admin.orders.orderStatus.${s}`) }));
  const productOptions = [
    ...PRODUCTS.map((p) => ({ value: p.id, label: pick(p.name, lang) })),
    ...COURSES.map((c) => ({ value: c.id, label: pick(c.title, lang) })),
  ];

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* Search. Wide, first, and the only control with a fixed grow: the
            question "where is order #GT-10480" has to be answerable without
            reading the toolbar. */}
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
            aria-label={t("admin.orders.searchLabel")}
            placeholder={t("admin.orders.searchPlaceholder")}
            className="h-10 w-full rounded-[var(--radius-pill)] border border-[var(--border-default)] bg-[var(--surface-card)] pl-11 pr-4 text-[length:var(--text-body-sm)] text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-subtle)] focus:border-[var(--focus-ring)] focus:shadow-[var(--shadow-focus)]"
          />
        </div>

        {/* Date range. Presets first, because "last 7 days" is what an operator
            actually wants; the custom range is at the bottom of the same panel. */}
        <Menu
          label={t("admin.orders.dateLabel")}
          width={268}
          trigger={(props) => (
            <button
              type="button"
              {...props}
              className={clsx(controlClass, filters.datePreset !== "all" && controlActiveClass)}
            >
              <CalendarRange size={15} aria-hidden="true" className="flex-none" />
              <span className="truncate">
                {filters.datePreset === "all" ? t("admin.orders.dateLabel") : t(`admin.orders.datePreset.${filters.datePreset}`)}
              </span>
              <ChevronDown size={14} aria-hidden="true" className="flex-none text-[var(--text-muted)]" />
            </button>
          )}
        >
          <div className="grid gap-1">
            {DATE_PRESETS.filter((p) => p !== "custom").map((preset) => (
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
                {t(`admin.orders.datePreset.${preset}`)}
              </button>
            ))}
          </div>
          <div className="grid gap-2 border-t border-[var(--border-subtle)] pt-3">
            <FieldLabel>{t("admin.orders.datePreset.custom")}</FieldLabel>
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1">
                <span className="text-[10px] uppercase tracking-[var(--tracking-wide)] text-[var(--text-subtle)]">
                  {t("admin.orders.dateFrom")}
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
                  {t("admin.orders.dateTo")}
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
              {t("admin.orders.dateApply")}
            </Button>
          </div>
        </Menu>

        {/* Status. Multi-select, because "pending or processing" is one queue. */}
        <Menu
          label={t("admin.orders.statusFilterLabel")}
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
                  ? t("admin.orders.statusFilterLabel")
                  : t("admin.orders.statusFilterCount", { count: filters.statuses.length })}
              </span>
              <ChevronDown size={14} aria-hidden="true" className="flex-none text-[var(--text-muted)]" />
            </button>
          )}
        >
          <div className="grid gap-0.5">
            {statusOptions.map((option) => {
              const checked = filters.statuses.includes(option.value);
              return (
                <label
                  key={option.value}
                  className="flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-2 py-1.5 text-[length:var(--text-body-sm)] text-[var(--text-body)] transition-colors hover:bg-[var(--gt-ink-100)]"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggleStatus(option.value)}
                    className="h-4 w-4 flex-none accent-[var(--gt-ink-900)]"
                  />
                  {option.label}
                </label>
              );
            })}
          </div>
        </Menu>

        {/* Everything else folds away. It is real filtering, but it is not the
            filtering anyone does every hour. */}
        <button
          type="button"
          onClick={() => setAdvancedOpen((v) => !v)}
          aria-expanded={advancedOpen}
          aria-controls="gt-admin-advanced-filters"
          className={clsx(controlClass, advancedOpen && controlActiveClass)}
        >
          <SlidersHorizontal size={15} aria-hidden="true" className="flex-none" />
          <span className="hidden sm:inline">{t("admin.orders.moreFilters")}</span>
        </button>
      </div>

      <div
        id="gt-admin-advanced-filters"
        className={clsx("flex-wrap items-center gap-2", advancedOpen ? "flex" : "hidden")}
      >
        <PopoverSelect
          label={t("admin.orders.paymentFilterLabel")}
          value={filters.payment}
          allLabel={t("admin.orders.filterAllPayments")}
          options={PAYMENT_STATUSES.map((s) => ({ value: s, label: t(`admin.orders.paymentStatus.${s}`) }))}
          onChange={(v) => onSet("payment", v)}
        />
        <PopoverSelect
          label={t("admin.orders.fulfillmentFilterLabel")}
          value={filters.fulfillment}
          allLabel={t("admin.orders.filterAllFulfillments")}
          options={FULFILLMENT_STATUSES.map((s) => ({ value: s, label: t(`admin.orders.fulfillmentStatus.${s}`) }))}
          onChange={(v) => onSet("fulfillment", v)}
        />
        <PopoverSelect
          label={t("admin.orders.methodFilterLabel")}
          value={filters.method}
          allLabel={t("admin.orders.filterAllMethods")}
          options={SHIPPING_METHODS.map((m) => ({ value: m, label: t(`admin.orders.shippingMethod.${m}`) }))}
          onChange={(v) => onSet("method", v)}
        />
        <PopoverSelect
          label={t("admin.orders.customerFilterLabel")}
          value={filters.customer}
          allLabel={t("admin.orders.filterAllCustomers")}
          options={ADMIN_CUSTOMERS.map((c) => ({ value: c.id, label: customerName(c) }))}
          onChange={(v) => onSet("customer", v)}
        />
        <PopoverSelect
          label={t("admin.orders.productFilterLabel")}
          value={filters.product}
          allLabel={t("admin.orders.filterAllProducts")}
          options={productOptions}
          onChange={(v) => onSet("product", v)}
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
 * This is the part that keeps a toolbar of popovers honest: a filter hidden
 * behind a collapsed panel is invisible, and an operator who cannot see why the
 * table has eleven rows will conclude the data is missing.
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
  filters: OrderFilters;
  resultCount: number;
  onToggleStatus: (status: string) => void;
  onSearch: (value: string) => void;
  onSet: (key: keyof OrderFilters, value: string) => void;
  onDatePreset: (preset: DatePreset) => void;
  onReset: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  const chips: { id: string; label: string; onRemove: () => void }[] = [];

  if (filters.search.trim()) {
    chips.push({
      id: "search",
      label: t("admin.orders.chipSearch", { term: filters.search.trim() }),
      onRemove: () => onSearch(""),
    });
  }
  filters.statuses.forEach((status) =>
    chips.push({
      id: `status-${status}`,
      label: `${t("admin.orders.chipStatus")}: ${t(`admin.orders.orderStatus.${status}`)}`,
      onRemove: () => onToggleStatus(status),
    }),
  );
  if (filters.payment !== "all") {
    chips.push({
      id: "payment",
      label: `${t("admin.orders.chipPayment")}: ${t(`admin.orders.paymentStatus.${filters.payment}`)}`,
      onRemove: () => onSet("payment", "all"),
    });
  }
  if (filters.fulfillment !== "all") {
    chips.push({
      id: "fulfillment",
      label: `${t("admin.orders.chipFulfillment")}: ${t(`admin.orders.fulfillmentStatus.${filters.fulfillment}`)}`,
      onRemove: () => onSet("fulfillment", "all"),
    });
  }
  if (filters.method !== "all") {
    chips.push({
      id: "method",
      label: `${t("admin.orders.chipMethod")}: ${t(`admin.orders.shippingMethod.${filters.method}`)}`,
      onRemove: () => onSet("method", "all"),
    });
  }
  if (filters.customer !== "all") {
    const customer = ADMIN_CUSTOMERS.find((c) => c.id === filters.customer);
    chips.push({
      id: "customer",
      label: `${t("admin.orders.chipCustomer")}: ${customer ? customerName(customer) : filters.customer}`,
      onRemove: () => onSet("customer", "all"),
    });
  }
  if (filters.product !== "all") {
    const product = PRODUCTS.find((p) => p.id === filters.product);
    const course = COURSES.find((c) => c.id === filters.product);
    const label = product ? pick(product.name, lang) : course ? pick(course.title, lang) : filters.product;
    chips.push({
      id: "product",
      label: `${t("admin.orders.chipProduct")}: ${label}`,
      onRemove: () => onSet("product", "all"),
    });
  }
  if (filters.attention) {
    chips.push({
      id: "attention",
      label: t("admin.orders.attentionRequired"),
      onRemove: () => onSet("attention", "0"),
    });
  }
  if (filters.datePreset !== "all") {
    const label =
      filters.datePreset === "custom"
        ? `${filters.from || "…"} → ${filters.to || "…"}`
        : t(`admin.orders.datePreset.${filters.datePreset}`);
    chips.push({
      id: "date",
      label: `${t("admin.orders.chipDate")}: ${label}`,
      onRemove: () => onDatePreset("all"),
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border-subtle)] pt-3">
      <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
        {t("admin.orders.resultCount", { count: resultCount })}
      </span>
      <ul className="m-0 flex list-none flex-wrap items-center gap-1.5 p-0">
        {chips.map((chip) => (
          <li key={chip.id}>
            <button
              type="button"
              onClick={chip.onRemove}
              className="inline-flex max-w-[260px] items-center gap-1.5 rounded-[var(--radius-pill)] border border-[var(--gt-blue-200)] bg-[var(--surface-brand-wash)] py-1 pl-3 pr-2 text-[length:var(--text-caption)] text-[var(--gt-blue-700)] transition-colors hover:border-[var(--gt-blue-400)] hover:bg-[var(--gt-blue-100)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
            >
              <span className="truncate">{chip.label}</span>
              <X size={13} aria-hidden="true" className="flex-none" />
              <span className="sr-only">{t("admin.orders.chipRemove")}</span>
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onReset}
        className="ml-auto inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] px-3 py-1 text-[length:var(--text-caption)] font-semibold text-[var(--text-muted)] underline decoration-1 underline-offset-4 transition-colors hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
      >
        {t("admin.orders.clearFilters")}
      </button>
    </div>
  );
}
