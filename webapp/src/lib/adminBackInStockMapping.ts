/**
 * Back-office reading of the back-in-stock requests (`/admin/alertes-stock`,
 * decision 90): pure mapping of `admin_back_in_stock_requests()` rows, the state
 * of each request and the figures of the page. No I/O; tested.
 */

/**
 * A row of `admin_back_in_stock_requests()`. Written out because the generated
 * types mark every column of a set-returning function as non-null.
 */
export interface BackInStockRow {
  id: string;
  product_id: string;
  product_name: string;
  product_status: string;
  variant_id: string | null;
  variant_name: string | null;
  email: string;
  user_id: string | null;
  locale: string;
  created_at: string;
  notified_at: string | null;
  stock_status: string;
  /** email_log status of the e-mail; null while none was attempted. */
  email_status: string | null;
  email_attempts: number | null;
}

/**
 * Where a request stands, in the order a team member reads it:
 *   waiting   the product (or option) is still out of stock
 *   due       it is back: the e-mail leaves at the next run of the sweep (≤ 5 min)
 *   paused    the product is no longer on sale (draft / archived): nothing will leave
 *   failed    the e-mail failed 5 times and is no longer retried
 *   notified  the e-mail went out; the request is closed
 */
export type BackInStockState = "waiting" | "due" | "paused" | "failed" | "notified";

/** email_log's attempt cap (as `email_log_claim`): past it, nobody retries. */
export const EMAIL_ATTEMPT_CAP = 5;

export interface AdminBackInStockRequest {
  id: string;
  productId: string;
  productName: string;
  variantId: string | null;
  variantName: string | null;
  email: string;
  /** The member's account; null for a visitor. */
  userId: string | null;
  locale: string;
  createdAt: string;
  notifiedAt: string | null;
  state: BackInStockState;
}

export function stateOf(row: Pick<BackInStockRow, "notified_at" | "email_status" | "email_attempts" | "product_status" | "stock_status">): BackInStockState {
  if (row.notified_at) return "notified";
  if (row.email_status === "failed" && (row.email_attempts ?? 0) >= EMAIL_ATTEMPT_CAP) return "failed";
  if (row.product_status !== "active") return "paused";
  return row.stock_status === "out_of_stock" ? "waiting" : "due";
}

export function rowToRequest(row: BackInStockRow): AdminBackInStockRequest {
  return {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    variantId: row.variant_id,
    variantName: row.variant_name,
    email: row.email,
    userId: row.user_id,
    locale: row.locale,
    createdAt: row.created_at,
    notifiedAt: row.notified_at,
    state: stateOf(row),
  };
}

/** The open requests: everything not yet notified. */
export const isOpen = (request: AdminBackInStockRequest) => request.state !== "notified";

export interface BackInStockFigures {
  waiting: number;
  due: number;
  notified: number;
  /** Stuck on a failed e-mail, or on a product taken off sale. */
  attention: number;
}

export function figuresOf(requests: readonly AdminBackInStockRequest[]): BackInStockFigures {
  const count = (...states: BackInStockState[]) => requests.filter((r) => states.includes(r.state)).length;
  return { waiting: count("waiting"), due: count("due"), notified: count("notified"), attention: count("failed", "paused") };
}

export interface DemandedProduct {
  productId: string;
  productName: string;
  variantName: string | null;
  /** Open requests for this product (or option). */
  open: number;
  /** True once the target is back (its open requests are due). */
  back: boolean;
}

/** Products (and options) with open requests, most asked first: what to restock. */
export function demandedProducts(requests: readonly AdminBackInStockRequest[], limit = 5): DemandedProduct[] {
  const byTarget = new Map<string, DemandedProduct>();
  for (const request of requests) {
    if (request.state !== "waiting" && request.state !== "due") continue;
    const key = `${request.productId}:${request.variantId ?? ""}`;
    const entry = byTarget.get(key) ?? {
      productId: request.productId,
      productName: request.productName,
      variantName: request.variantName,
      open: 0,
      back: request.state === "due",
    };
    entry.open += 1;
    byTarget.set(key, entry);
  }
  return [...byTarget.values()]
    .sort((a, b) => b.open - a.open || a.productName.localeCompare(b.productName))
    .slice(0, limit);
}

export type BackInStockView = "open" | "notified" | "all";

/** The list as filtered by the view and the search (product, option or address, accents ignored). */
export function filterRequests(
  requests: readonly AdminBackInStockRequest[],
  view: BackInStockView,
  query: string,
): AdminBackInStockRequest[] {
  // "Cœur" is found by "coeur": the ligatures do not decompose under NFD.
  const fold = (value: string) =>
    value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replaceAll("œ", "oe").replaceAll("æ", "ae");
  const needle = fold(query.trim());
  return requests.filter((request) => {
    if (view === "open" && !isOpen(request)) return false;
    if (view === "notified" && request.state !== "notified") return false;
    if (!needle) return true;
    return [request.productName, request.variantName ?? "", request.email].some((text) => fold(text).includes(needle));
  });
}

/** How the read failed, for the message shown. */
export function readErrorOf(error: { code?: string; message?: string } | null): "forbidden" | "error" {
  if (error?.code === "42501" || error?.message?.includes("permission denied")) return "forbidden";
  return "error";
}
