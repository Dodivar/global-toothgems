import { customerName, orderItemCount, type AdminOrder } from "../data/adminOrders";
import type { SpentTotal } from "../data/orders";
import { pick } from "../data/types";

/**
 * Filtering, searching, sorting and paging of the order book — all of it
 * derived from the URL.
 *
 * The shop already established the convention (`lib/shopUrl.ts`):
 * the URL is the single source of truth for what a list is showing. Repeating it
 * here buys three things the back office needs for free — a filtered view is a
 * link an administrator can send to a colleague, the browser's back button
 * behaves, and returning from an order's detail page lands on the same filtered
 * page of the same table rather than on row one.
 */

export const PAGE_SIZES = [10, 25, 50] as const;
export const DEFAULT_PAGE_SIZE = 25;

export type DatePreset = "all" | "today" | "yesterday" | "last7" | "last30" | "thisMonth" | "custom";

export const DATE_PRESETS: DatePreset[] = ["all", "today", "yesterday", "last7", "last30", "thisMonth", "custom"];

export type SortKey = "dateDesc" | "dateAsc" | "totalDesc" | "totalAsc";

export const SORT_KEYS: SortKey[] = ["dateDesc", "dateAsc", "totalDesc", "totalAsc"];

/**
 * "Today" for the date presets: the calendar day in the browser's time zone.
 * The back office renders in the browser only (`app/admin`), so reading the
 * clock here cannot cause a hydration mismatch.
 */
export function bookToday(): string {
  return new Date().toLocaleDateString("sv-SE");
}

/** Calendar day (YYYY-MM-DD, browser time zone) of a recorded timestamp. */
export function localDay(iso: string): string {
  return new Date(iso).toLocaleDateString("sv-SE");
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface OrderFilters {
  search: string;
  /** Empty means every status. Several can be active at once. */
  statuses: string[];
  payment: string;
  fulfillment: string;
  method: string;
  customer: string;
  product: string;
  /** Narrows to the orders carrying an attention flag, whatever their status. */
  attention: boolean;
  datePreset: DatePreset;
  /** Only meaningful when `datePreset` is "custom". ISO dates. */
  from: string;
  to: string;
  sort: SortKey;
  page: number;
  pageSize: number;
}

export const EMPTY_FILTERS: OrderFilters = {
  search: "",
  statuses: [],
  payment: "all",
  fulfillment: "all",
  method: "all",
  customer: "all",
  product: "all",
  attention: false,
  datePreset: "all",
  from: "",
  to: "",
  sort: "dateDesc",
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
};

/** URL parameter names, in French like every other route in the app. */
export const PARAM = {
  search: "q",
  statuses: "statut",
  payment: "paiement",
  fulfillment: "preparation",
  method: "livraison",
  customer: "client",
  product: "produit",
  attention: "alerte",
  datePreset: "periode",
  from: "du",
  to: "au",
  sort: "tri",
  page: "page",
  pageSize: "taille",
} as const;

export function readFilters(params: URLSearchParams): OrderFilters {
  const rawStatuses = params.get(PARAM.statuses);
  const rawSize = Number(params.get(PARAM.pageSize));
  const rawPage = Number(params.get(PARAM.page));
  const preset = params.get(PARAM.datePreset) as DatePreset | null;
  const sort = params.get(PARAM.sort) as SortKey | null;

  return {
    search: params.get(PARAM.search) ?? "",
    statuses: rawStatuses ? rawStatuses.split(",").filter(Boolean) : [],
    payment: params.get(PARAM.payment) ?? "all",
    fulfillment: params.get(PARAM.fulfillment) ?? "all",
    method: params.get(PARAM.method) ?? "all",
    customer: params.get(PARAM.customer) ?? "all",
    product: params.get(PARAM.product) ?? "all",
    attention: params.get(PARAM.attention) === "1",
    datePreset: preset && DATE_PRESETS.includes(preset) ? preset : "all",
    from: params.get(PARAM.from) ?? "",
    to: params.get(PARAM.to) ?? "",
    sort: sort && SORT_KEYS.includes(sort) ? sort : "dateDesc",
    page: Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1,
    pageSize: PAGE_SIZES.includes(rawSize as (typeof PAGE_SIZES)[number]) ? rawSize : DEFAULT_PAGE_SIZE,
  };
}

/** Inclusive `[from, to]` date window implied by the preset, or null for "all". */
export function dateWindow(filters: OrderFilters, today: string = bookToday()): { from: string; to: string } | null {
  switch (filters.datePreset) {
    case "today":
      return { from: today, to: today };
    case "yesterday": {
      const day = addDays(today, -1);
      return { from: day, to: day };
    }
    case "last7":
      return { from: addDays(today, -6), to: today };
    case "last30":
      return { from: addDays(today, -29), to: today };
    case "thisMonth":
      return { from: `${today.slice(0, 7)}-01`, to: today };
    case "custom":
      if (!filters.from && !filters.to) return null;
      return { from: filters.from || "0000-01-01", to: filters.to || "9999-12-31" };
    default:
      return null;
  }
}

/**
 * Free-text match across the four things an administrator actually types:
 * the reference, the customer's name, their email, and a product name. Product
 * names are bilingual, so both languages are searched — an English-speaking
 * administrator looking for "gloves" should find an order placed in French.
 */
function matchesSearch(order: AdminOrder, term: string): boolean {
  const q = term.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    order.reference,
    `#${order.reference}`,
    order.customer.firstName,
    order.customer.lastName,
    `${order.customer.firstName} ${order.customer.lastName}`,
    order.customer.email,
    order.shippingAddress?.city ?? "",
    order.billingAddress?.city ?? "",
    ...order.lines.flatMap((l) => [l.name.fr, l.name.en]),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

export function applyFilters(orders: AdminOrder[], filters: OrderFilters, today: string = bookToday()): AdminOrder[] {
  const window = dateWindow(filters, today);

  const kept = orders.filter((order) => {
    if (!matchesSearch(order, filters.search)) return false;
    if (filters.statuses.length > 0 && !filters.statuses.includes(order.status)) return false;
    if (filters.payment !== "all" && order.payment.status !== filters.payment) return false;
    if (filters.fulfillment !== "all" && order.fulfillment !== filters.fulfillment) return false;
    if (filters.method !== "all" && order.shippingMethod !== filters.method) return false;
    if (filters.customer !== "all" && order.customer.id !== filters.customer) return false;
    if (filters.product !== "all" && !order.lines.some((l) => l.productId === filters.product || l.courseId === filters.product)) {
      return false;
    }
    if (filters.attention && !order.attention) return false;
    if (window) {
      const day = localDay(order.placedAt);
      if (day < window.from || day > window.to) return false;
    }
    return true;
  });

  const sorted = kept.slice();
  switch (filters.sort) {
    case "dateAsc":
      sorted.sort((a, b) => a.placedAt.localeCompare(b.placedAt));
      break;
    // Totals sort by amount within a currency; currencies are grouped, never compared.
    case "totalDesc":
      sorted.sort((a, b) => a.currency.localeCompare(b.currency) || b.amounts.total - a.amounts.total);
      break;
    case "totalAsc":
      sorted.sort((a, b) => a.currency.localeCompare(b.currency) || a.amounts.total - b.amounts.total);
      break;
    default:
      sorted.sort((a, b) => b.placedAt.localeCompare(a.placedAt));
  }
  return sorted;
}

/** How many filters are set, for the "reset" affordance and the mobile toggle. */
export function activeFilterCount(filters: OrderFilters): number {
  let count = 0;
  if (filters.search.trim()) count += 1;
  count += filters.statuses.length;
  if (filters.payment !== "all") count += 1;
  if (filters.fulfillment !== "all") count += 1;
  if (filters.method !== "all") count += 1;
  if (filters.customer !== "all") count += 1;
  if (filters.product !== "all") count += 1;
  if (filters.attention) count += 1;
  if (filters.datePreset !== "all") count += 1;
  return count;
}

export interface Page<T> {
  items: T[];
  page: number;
  pageCount: number;
  /** 1-based index of the first item shown, or 0 when the page is empty. */
  firstIndex: number;
  lastIndex: number;
  total: number;
}

export function paginate<T>(items: T[], page: number, pageSize: number): Page<T> {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(Math.max(1, page), pageCount);
  const start = (current - 1) * pageSize;
  const slice = items.slice(start, start + pageSize);
  return {
    items: slice,
    page: current,
    pageCount,
    firstIndex: slice.length === 0 ? 0 : start + 1,
    lastIndex: start + slice.length,
    total: items.length,
  };
}

/** Page numbers to render, with `null` standing for an ellipsis. */
export function pageWindow(page: number, pageCount: number): (number | null)[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const out: (number | null)[] = [1];
  const from = Math.max(2, page - 1);
  const to = Math.min(pageCount - 1, page + 1);
  if (from > 2) out.push(null);
  for (let i = from; i <= to; i += 1) out.push(i);
  if (to < pageCount - 1) out.push(null);
  out.push(pageCount);
  return out;
}

/* -------------------------------------------------------------------------- */
/* Overview                                                                   */
/* -------------------------------------------------------------------------- */

export interface OrderMetrics {
  total: number;
  pending: number;
  processing: number;
  shipped: number;
  delivered: number;
  attention: number;
  /**
   * Money collected, per currency, never added across currencies: for each
   * order whose payment was received and that is not cancelled, what the card
   * provider collected (`amount_due`: the total less gift cards) less the
   * refunds that succeeded. Gift cards count once, when they are sold, not
   * again when they are spent; unpaid, failed and cancelled orders count for
   * nothing.
   */
  revenue: SpentTotal[];
  items: number;
}

/** The `revenue` rule of `OrderMetrics`, alone. */
export function collectedByCurrency(orders: AdminOrder[]): SpentTotal[] {
  const totals = new Map<string, number>();
  for (const o of orders) {
    if (o.status === "cancelled") continue;
    if (o.payment.status !== "paid" && o.payment.status !== "partiallyRefunded" && o.payment.status !== "refunded") continue;
    totals.set(o.currency, (totals.get(o.currency) ?? 0) + o.amounts.charged - o.amounts.refunded);
  }
  return [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, amount]) => ({ currency, amount }));
}

/**
 * The KPI row. Counted from the orders passed in, never hard-coded: the row has
 * to move when a status is updated, and a figure that disagrees with the table
 * under it is worse than no figure at all.
 */
export function metrics(orders: AdminOrder[]): OrderMetrics {
  const count = (predicate: (o: AdminOrder) => boolean) => orders.filter(predicate).length;
  return {
    total: orders.length,
    pending: count((o) => o.status === "pending"),
    processing: count((o) => o.status === "processing" || o.status === "confirmed"),
    shipped: count((o) => o.status === "shipped"),
    delivered: count((o) => o.status === "delivered"),
    attention: count((o) => Boolean(o.attention)),
    revenue: collectedByCurrency(orders),
    items: orders.reduce((sum, o) => sum + orderItemCount(o), 0),
  };
}

export interface FilterOption {
  value: string;
  label: string;
}

/** The buyers of the book, for the customer filter, by name. */
export function customerOptions(orders: AdminOrder[]): FilterOption[] {
  const seen = new Map<string, string>();
  for (const o of orders) if (!seen.has(o.customer.id)) seen.set(o.customer.id, `${customerName(o.customer)} · ${o.customer.email}`);
  return [...seen.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
}

/** The products sold in the book (still in the shop), for the product filter, by name. */
export function productOptions(orders: AdminOrder[], lang: string): FilterOption[] {
  const seen = new Map<string, string>();
  for (const o of orders) {
    for (const l of o.lines) {
      const value = l.productId ?? l.courseId;
      if (value && !seen.has(value)) seen.set(value, pick(l.name, lang));
    }
  }
  return [...seen.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
}
