import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { SEED_ORDERS, orderTotal, type Order, type OrderLine } from "../data/orders";
import { getProduct } from "../data/products";
import type { CartLine } from "./cart";
import { useAuth } from "./auth";
import { useCatalog } from "./catalog/CatalogProvider";
import { CUSTOMER_VISIBLE_PAYMENT_STATUSES, mapOrder, type OrderRow } from "./orderMapping";
import { isSupabaseConfigured, supabase } from "./supabase/client";

/**
 * Order history for the signed-in visitor.
 *
 * With Supabase configured, the history is read from `orders` (RLS: the
 * account's own orders only), written by the checkout and the Stripe webhook —
 * never by the browser. Without it, the prototype's in-memory history is used:
 * paying in the cart prepends an order there, so the demo journey still ends
 * in the member area.
 */

export type OrdersLoadState = "loading" | "ready" | "error";

interface OrdersContextValue {
  /** Newest first. */
  orders: Order[];
  /** `loading` until the first read for the open session has answered. */
  status: OrdersLoadState;
  reload: () => void;
  /**
   * Records a paid cart as a new order and returns its reference. Mock mode
   * only: with Supabase an order exists once the payment webhook creates it,
   * so the demo cart's "payment" adds nothing to the real history.
   */
  placeOrder: (lines: CartLine[], shipping: number) => string;
  /** Lifetime spend, cancelled orders excluded. */
  totalSpent: number;
  /** ISO date of the oldest order — what "member since" is derived from. */
  memberSince: string | null;
}

const OrdersContext = createContext<OrdersContextValue | null>(null);

export function OrdersProvider({ children }: { children: ReactNode }) {
  return isSupabaseConfigured ? (
    <SupabaseOrdersProvider>{children}</SupabaseOrdersProvider>
  ) : (
    <MockOrdersProvider>{children}</MockOrdersProvider>
  );
}

function summary(orders: Order[]) {
  return {
    totalSpent: orders.reduce((sum, o) => (o.status === "cancelled" ? sum : sum + orderTotal(o)), 0),
    memberSince: orders.reduce<string | null>((oldest, o) => (oldest && oldest < o.placedOn ? oldest : o.placedOn), null),
  };
}

/* ------------------------------------------------------------------ */
/* Supabase                                                           */
/* ------------------------------------------------------------------ */

const ORDER_SELECT = `
  order_number, created_at, status, payment_status, currency, shipping_amount,
  order_items ( product_name, variant_name, unit_price, quantity, product:products ( slug ) ),
  shipments ( status, carrier, tracking_number, estimated_delivery, delivered_at, created_at )
`;

function SupabaseOrdersProvider({ children }: { children: ReactNode }) {
  const { userId } = useAuth();
  const { findProduct } = useCatalog();
  const [state, setState] = useState<{ owner: string | null; status: OrdersLoadState; rows: OrderRow[] }>({
    owner: null,
    status: "loading",
    rows: [],
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!supabase || !userId) return;
    const controller = new AbortController();
    supabase
      .from("orders")
      .select(ORDER_SELECT)
      .eq("user_id", userId)
      .in("payment_status", [...CUSTOMER_VISIBLE_PAYMENT_STATUSES])
      .order("created_at", { ascending: false })
      .abortSignal(controller.signal)
      .then(({ data, error }) => {
        if (controller.signal.aborted) return;
        if (error) {
          console.error("[orders] load failed", error.message);
          setState({ owner: userId, status: "error", rows: [] });
          return;
        }
        setState({ owner: userId, status: "ready", rows: data as unknown as OrderRow[] });
      });
    return () => controller.abort();
  }, [userId, attempt]);

  // Rows from a previous session never show under another account.
  const current = userId && state.owner === userId ? state : null;
  const status: OrdersLoadState = !userId ? "ready" : current?.status ?? "loading";

  // Mapped here rather than at load time: the catalogue lends photos and links,
  // and it may arrive after the orders.
  const orders = useMemo(
    () => (current ? current.rows.map((row) => mapOrder(row, findProduct)) : []),
    [current, findProduct],
  );

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const placeOrder = useCallback(() => "", []);

  const value = useMemo<OrdersContextValue>(
    () => ({ orders, status, reload, placeOrder, ...summary(orders) }),
    [orders, status, reload, placeOrder],
  );

  return <OrdersContext.Provider value={value}>{children}</OrdersContext.Provider>;
}

/* ------------------------------------------------------------------ */
/* Mock (no Supabase configured)                                      */
/* ------------------------------------------------------------------ */

/** Next reference in the seeded series: GT-<year>-0151 -> GT-<year>-0152. */
function nextReference(orders: Order[]): string {
  const year = new Date().getFullYear();
  const highest = orders.reduce((max, o) => {
    const n = Number(o.reference.split("-")[2]);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
  return `GT-${year}-${String(highest + 1).padStart(4, "0")}`;
}

/**
 * A cart line holds display strings already resolved to the current language.
 * An order line has to survive a language switch, so the localized name is
 * recovered from the catalogue where the product is still known, and only falls
 * back to the single string the cart carried when it is not.
 */
function toOrderLine(line: CartLine): OrderLine {
  const product = getProduct(line.productId);
  return {
    productId: product ? line.productId : undefined,
    name: product ? product.name : { fr: line.name, en: line.name },
    variant: product
      ? product.subtitle
      : line.variant
        ? { fr: line.variant, en: line.variant }
        : undefined,
    image: line.image,
    unitPrice: line.price,
    qty: line.qty,
  };
}

function MockOrdersProvider({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useState<Order[]>(SEED_ORDERS);

  const placeOrder = useCallback((lines: CartLine[], shipping: number) => {
    const reference = nextReference(orders);
    const order: Order = {
      reference,
      placedOn: new Date().toISOString().slice(0, 10),
      status: "processing",
      currency: "EUR",
      shipping,
      lines: lines.map(toOrderLine),
    };
    setOrders((prev) => [order, ...prev]);
    return reference;
  }, [orders]);

  const reload = useCallback(() => {}, []);

  const value = useMemo<OrdersContextValue>(
    () => ({ orders, status: "ready", reload, placeOrder, ...summary(orders) }),
    [orders, reload, placeOrder],
  );

  return <OrdersContext.Provider value={value}>{children}</OrdersContext.Provider>;
}

export function useOrders() {
  const ctx = useContext(OrdersContext);
  if (!ctx) throw new Error("useOrders must be used within OrdersProvider");
  return ctx;
}
