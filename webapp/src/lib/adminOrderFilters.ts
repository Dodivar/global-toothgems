import { ADMIN_ORDERS, orderItemCount, orderTotal, type AdminOrder } from "../data/adminOrders";
import { pick } from "../data/types";

/**
 * Filtering, searching, sorting and paging of the order book — all of it
 * derived from the URL.
 *
 * The shop already established the convention (`ShopFilterBar`, `lib/shopUrl.ts`):
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
 * "Today" for the date presets.
 *
 * Anchored to the newest order rather than to the wall clock: the order book is
 * fixed mock data, so a real `new Date()` would make every preset empty the day
 * after this prototype was authored, and "Today" returning nothing would read as
 * a bug in the filter rather than as a quiet seed date.
 */
export const BOOK_TODAY: string = ADMIN_ORDERS.reduce(
  (latest, o) => (o.placedAt > latest ? o.placedAt : latest),
  ADMIN_ORDERS[0].placedAt,
).slice(0, 10);

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
export function dateWindow(filters: OrderFilters): { from: string; to: string } | null {
  switch (filters.datePreset) {
    case "today":
      return { from: BOOK_TODAY, to: BOOK_TODAY };
    case "yesterday": {
      const day = addDays(BOOK_TODAY, -1);
      return { from: day, to: day };
    }
    case "last7":
      return { from: addDays(BOOK_TODAY, -6), to: BOOK_TODAY };
    case "last30":
      return { from: addDays(BOOK_TODAY, -29), to: BOOK_TODAY };
    case "thisMonth":
      return { from: `${BOOK_TODAY.slice(0, 7)}-01`, to: BOOK_TODAY };
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
    order.customer.city,
    ...order.lines.flatMap((l) => [l.name.fr, l.name.en]),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

export function applyFilters(orders: AdminOrder[], filters: OrderFilters): AdminOrder[] {
  const window = dateWindow(filters);

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
      const day = order.placedAt.slice(0, 10);
      if (day < window.from || day > window.to) return false;
    }
    return true;
  });

  const sorted = kept.slice();
  switch (filters.sort) {
    case "dateAsc":
      sorted.sort((a, b) => a.placedAt.localeCompare(b.placedAt));
      break;
    case "totalDesc":
      sorted.sort((a, b) => orderTotal(b) - orderTotal(a));
      break;
    case "totalAsc":
      sorted.sort((a, b) => orderTotal(a) - orderTotal(b));
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
  /** Revenue of everything not cancelled or refunded. */
  revenue: number;
  items: number;
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
    revenue: orders.reduce((sum, o) => (o.status === "cancelled" || o.status === "refunded" ? sum : sum + orderTotal(o)), 0),
    items: orders.reduce((sum, o) => sum + orderItemCount(o), 0),
  };
}

/** Label of a line for the product filter, in the active language. */
export function lineLabel(order: AdminOrder, lang: string): string {
  return pick(order.lines[0].name, lang);
}
