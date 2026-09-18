import {
  BASE_TODAY,
  customerName,
  customerSegment,
  trainingState,
  type AdminCustomerRecord,
  type CustomerSegment,
  type CustomerStatus,
  type TrainingState,
} from "../data/adminCustomers";

/**
 * Filtering, searching, sorting and paging of the customer base — all of it
 * derived from the URL.
 *
 * Same contract as `adminOrderFilters`, and the paging primitives are imported
 * from it rather than copied: `paginate`, `pageWindow`, `Page` and `PAGE_SIZES`
 * are not about orders, and two implementations of "showing 1–25 of 248" is
 * exactly how the two tables end up disagreeing about what a page is.
 *
 * What is *not* shared is the filter shape. An order is filtered by payment and
 * fulfilment; a customer is filtered by status, segment, order activity,
 * training and spend. Forcing one type to carry both would make every read of
 * either page start by working out which half applies.
 */

export {
  PAGE_SIZES,
  DEFAULT_PAGE_SIZE,
  paginate,
  pageWindow,
  type Page,
} from "./adminOrderFilters";

import { DEFAULT_PAGE_SIZE, PAGE_SIZES } from "./adminOrderFilters";

export type CustomerDatePreset = "all" | "today" | "last7" | "last30" | "thisYear" | "custom";

export const CUSTOMER_DATE_PRESETS: CustomerDatePreset[] = [
  "all",
  "today",
  "last7",
  "last30",
  "thisYear",
  "custom",
];

/** How many orders the customer has placed in their lifetime. */
export type OrderActivity = "all" | "none" | "one" | "repeat";

export const ORDER_ACTIVITIES: OrderActivity[] = ["all", "none", "one", "repeat"];

/**
 * Training filter.
 *
 * "has" and "none" ask about access; "inProgress" and "completed" ask about
 * outcome. They are one control because an administrator thinks of it as one
 * question — "where are they with the training" — and splitting it into an
 * access filter and a progress filter produced two popovers that were almost
 * always set together.
 */
export type TrainingFilter = "all" | "has" | "none" | "inProgress" | "completed";

export const TRAINING_FILTERS: TrainingFilter[] = ["all", "has", "none", "inProgress", "completed"];

/**
 * Lifetime-spend brackets.
 *
 * Brackets rather than a slider: an operator looking for high-value customers
 * has a band in mind, not a number, and a two-handle slider on a back-office
 * toolbar is a fiddly control for a question with four useful answers.
 */
export type SpendBand = "all" | "none" | "low" | "mid" | "high";

export const SPEND_BANDS: SpendBand[] = ["all", "none", "low", "mid", "high"];

/** Inclusive floor and exclusive ceiling of each band, in euros. */
export const SPEND_RANGES: Record<Exclude<SpendBand, "all">, { min: number; max: number }> = {
  none: { min: 0, max: 1 },
  low: { min: 1, max: 250 },
  mid: { min: 250, max: 1000 },
  high: { min: 1000, max: Number.POSITIVE_INFINITY },
};

export type CustomerSortKey =
  | "recentDesc"
  | "recentAsc"
  | "nameAsc"
  | "nameDesc"
  | "spentDesc"
  | "spentAsc"
  | "ordersDesc"
  | "ordersAsc";

export const CUSTOMER_SORT_KEYS: CustomerSortKey[] = [
  "recentDesc",
  "recentAsc",
  "nameAsc",
  "nameDesc",
  "spentDesc",
  "spentAsc",
  "ordersDesc",
  "ordersAsc",
];

export interface CustomerFilters {
  search: string;
  /** Empty means every status. Several can be active at once. */
  statuses: CustomerStatus[];
  segment: CustomerSegment | "all";
  activity: OrderActivity;
  training: TrainingFilter;
  spend: SpendBand;
  /** Narrows to the customers carrying a given tag. */
  tag: string;
  datePreset: CustomerDatePreset;
  /** Only meaningful when `datePreset` is "custom". ISO dates. */
  from: string;
  to: string;
  sort: CustomerSortKey;
  page: number;
  pageSize: number;
}

/** URL parameter names, in French like every other route in the app. */
export const PARAM = {
  search: "q",
  statuses: "statut",
  segment: "type",
  activity: "commandes",
  training: "formation",
  spend: "depense",
  tag: "etiquette",
  datePreset: "periode",
  from: "du",
  to: "au",
  sort: "tri",
  page: "page",
  pageSize: "taille",
} as const;

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function oneOf<T extends string>(value: string | null, allowed: T[], fallback: T): T {
  return value && (allowed as string[]).includes(value) ? (value as T) : fallback;
}

const STATUS_VALUES: string[] = ["active", "inactive", "suspended"];
const SEGMENT_VALUES: (CustomerSegment | "all")[] = ["all", "customer", "student", "vip"];

export function readFilters(params: URLSearchParams): CustomerFilters {
  const rawStatuses = params.get(PARAM.statuses);
  const rawSize = Number(params.get(PARAM.pageSize));
  const rawPage = Number(params.get(PARAM.page));

  return {
    search: params.get(PARAM.search) ?? "",
    statuses: rawStatuses
      ? rawStatuses.split(",").filter((s): s is CustomerStatus => STATUS_VALUES.includes(s))
      : [],
    segment: oneOf(params.get(PARAM.segment), SEGMENT_VALUES, "all"),
    activity: oneOf(params.get(PARAM.activity), ORDER_ACTIVITIES, "all"),
    training: oneOf(params.get(PARAM.training), TRAINING_FILTERS, "all"),
    spend: oneOf(params.get(PARAM.spend), SPEND_BANDS, "all"),
    tag: params.get(PARAM.tag) ?? "all",
    datePreset: oneOf(params.get(PARAM.datePreset), CUSTOMER_DATE_PRESETS, "all"),
    from: params.get(PARAM.from) ?? "",
    to: params.get(PARAM.to) ?? "",
    sort: oneOf(params.get(PARAM.sort), CUSTOMER_SORT_KEYS, "recentDesc"),
    page: Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1,
    pageSize: PAGE_SIZES.includes(rawSize as (typeof PAGE_SIZES)[number]) ? rawSize : DEFAULT_PAGE_SIZE,
  };
}

/** Inclusive `[from, to]` registration window implied by the preset. */
export function dateWindow(filters: CustomerFilters): { from: string; to: string } | null {
  switch (filters.datePreset) {
    case "today":
      return { from: BASE_TODAY, to: BASE_TODAY };
    case "last7":
      return { from: addDays(BASE_TODAY, -6), to: BASE_TODAY };
    case "last30":
      return { from: addDays(BASE_TODAY, -29), to: BASE_TODAY };
    case "thisYear":
      return { from: `${BASE_TODAY.slice(0, 4)}-01-01`, to: BASE_TODAY };
    case "custom":
      if (!filters.from && !filters.to) return null;
      return { from: filters.from || "0000-01-01", to: filters.to || "9999-12-31" };
    default:
      return null;
  }
}

/**
 * Free-text match across the four things an administrator actually types: the
 * name, the email, the customer id and the phone number.
 *
 * Phone numbers are stored in international form (`+33 6 45 19 72 36`) and
 * typed in national form (`06 45 19 72 36`), so a plain substring match on the
 * stripped digits finds nothing: the stored `33645197236` does not contain the
 * typed `0645197236`. Dropping the leading trunk zero before matching bridges
 * the two, and it holds for every country the shop ships to — FR `0 6…` against
 * `+33 6…`, IE `0 85…` against `+353 85…`, DE `0 151…` against `+49 151…`, BE
 * `0 470…` against `+32 470…`.
 *
 * Four digits is the floor, so typing a year or an amount does not start
 * matching phone numbers by accident.
 */
function matchesPhone(phone: string, term: string): boolean {
  const typed = term.replace(/[\s.()+-]/g, "");
  if (typed.length < 4 || !/^\d+$/.test(typed)) return false;
  const stored = phone.replace(/[\s.()+-]/g, "");
  return stored.includes(typed) || stored.includes(typed.replace(/^0+/, ""));
}

function matchesSearch(customer: AdminCustomerRecord, term: string): boolean {
  const q = term.trim().toLowerCase();
  if (!q) return true;
  if (matchesPhone(customer.phone, q)) return true;

  return [customer.firstName, customer.lastName, customerName(customer), customer.email, customer.id, customer.city]
    .join(" ")
    .toLowerCase()
    .includes(q);
}

function matchesActivity(customer: AdminCustomerRecord, activity: OrderActivity): boolean {
  switch (activity) {
    case "none":
      return customer.orderCount === 0;
    case "one":
      return customer.orderCount === 1;
    case "repeat":
      return customer.orderCount > 1;
    default:
      return true;
  }
}

function matchesTraining(customer: AdminCustomerRecord, filter: TrainingFilter): boolean {
  const state: TrainingState = trainingState(customer);
  switch (filter) {
    case "has":
      return state !== "none";
    case "none":
      return state === "none";
    case "inProgress":
      return state === "inProgress" || state === "enrolled";
    case "completed":
      return state === "completed";
    default:
      return true;
  }
}

function matchesSpend(customer: AdminCustomerRecord, band: SpendBand): boolean {
  if (band === "all") return true;
  const { min, max } = SPEND_RANGES[band];
  return customer.lifetimeValue >= min && customer.lifetimeValue < max;
}

export function applyFilters(
  customers: AdminCustomerRecord[],
  filters: CustomerFilters,
): AdminCustomerRecord[] {
  const window = dateWindow(filters);

  const kept = customers.filter((customer) => {
    if (!matchesSearch(customer, filters.search)) return false;
    if (filters.statuses.length > 0 && !filters.statuses.includes(customer.status)) return false;
    if (filters.segment !== "all" && customerSegment(customer) !== filters.segment) return false;
    if (!matchesActivity(customer, filters.activity)) return false;
    if (!matchesTraining(customer, filters.training)) return false;
    if (!matchesSpend(customer, filters.spend)) return false;
    if (filters.tag !== "all" && !(customer.tags as string[]).includes(filters.tag)) return false;
    if (window && (customer.since < window.from || customer.since > window.to)) return false;
    return true;
  });

  const sorted = kept.slice();
  // `localeCompare` on the names, not a byte comparison: "Élodie" sorting after
  // "Yasmine" is the kind of detail that makes an alphabetical list feel broken
  // to the French-speaking operator using it every day.
  switch (filters.sort) {
    case "recentAsc":
      sorted.sort((a, b) => a.since.localeCompare(b.since));
      break;
    case "nameAsc":
      sorted.sort((a, b) => customerName(a).localeCompare(customerName(b), "fr"));
      break;
    case "nameDesc":
      sorted.sort((a, b) => customerName(b).localeCompare(customerName(a), "fr"));
      break;
    case "spentDesc":
      sorted.sort((a, b) => b.lifetimeValue - a.lifetimeValue);
      break;
    case "spentAsc":
      sorted.sort((a, b) => a.lifetimeValue - b.lifetimeValue);
      break;
    case "ordersDesc":
      sorted.sort((a, b) => b.orderCount - a.orderCount);
      break;
    case "ordersAsc":
      sorted.sort((a, b) => a.orderCount - b.orderCount);
      break;
    default:
      sorted.sort((a, b) => b.since.localeCompare(a.since));
  }
  return sorted;
}

/** How many filters are set, for the reset affordance and the mobile toggle. */
export function activeFilterCount(filters: CustomerFilters): number {
  let count = 0;
  if (filters.search.trim()) count += 1;
  count += filters.statuses.length;
  if (filters.segment !== "all") count += 1;
  if (filters.activity !== "all") count += 1;
  if (filters.training !== "all") count += 1;
  if (filters.spend !== "all") count += 1;
  if (filters.tag !== "all") count += 1;
  if (filters.datePreset !== "all") count += 1;
  return count;
}

/* -------------------------------------------------------------------------- */
/* Overview                                                                   */
/* -------------------------------------------------------------------------- */

export interface CustomerMetrics {
  total: number;
  /** Registered within the calendar month of `BASE_TODAY`. */
  newThisMonth: number;
  active: number;
  withTraining: number;
  /** Customers with more than one lifetime order. */
  repeat: number;
  /** `repeat` as a whole percentage of the base. */
  repeatShare: number;
  /** Everything the base has spent to date. */
  lifetimeValue: number;
}

/**
 * The KPI row, counted from the customers passed in rather than hard-coded.
 *
 * `MetricsRow`'s rule, applied to a second table: a figure that disagrees with
 * the rows under it is worse than no figure at all. It matters more here than
 * it looks, because suspending an account has to move "Active" while the
 * operator is watching — that is the whole reason the tile is on the page.
 */
export function metrics(customers: AdminCustomerRecord[]): CustomerMetrics {
  const month = BASE_TODAY.slice(0, 7);
  const count = (predicate: (c: AdminCustomerRecord) => boolean) => customers.filter(predicate).length;
  const repeat = count((c) => c.orderCount > 1);

  return {
    total: customers.length,
    newThisMonth: count((c) => c.since.startsWith(month)),
    active: count((c) => c.status === "active"),
    withTraining: count((c) => c.enrollments.length > 0),
    repeat,
    repeatShare: customers.length === 0 ? 0 : Math.round((repeat / customers.length) * 100),
    lifetimeValue: customers.reduce((sum, c) => sum + c.lifetimeValue, 0),
  };
}

/** Every tag actually in use, for the tag filter. Sorted by the canonical order. */
export function tagsInUse(customers: AdminCustomerRecord[]): string[] {
  const seen = new Set<string>();
  customers.forEach((c) => c.tags.forEach((tag) => seen.add(tag)));
  return [...seen];
}
