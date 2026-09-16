import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { SEED_ORDERS, orderTotal, type Order, type OrderLine } from "../data/orders";
import { getProduct } from "../data/products";
import type { CartLine } from "./cart";

/**
 * Order history for the signed-in visitor.
 *
 * In-memory mockup state, like `cart.tsx` and `progress.tsx`. Paying in the
 * cart prepends a real order here, so the dashboard shows what the visitor just
 * bought rather than a frozen list. In production this comes from the database,
 * written by the Stripe webhook — never from the browser.
 */

interface OrdersContextValue {
  /** Newest first. */
  orders: Order[];
  /** Records a paid cart as a new order and returns its reference. */
  placeOrder: (lines: CartLine[], shipping: number) => string;
  /** Lifetime spend, cancelled orders excluded. */
  totalSpent: number;
  /** ISO date of the oldest order — what "member since" is derived from. */
  memberSince: string | null;
}

const OrdersContext = createContext<OrdersContextValue | null>(null);

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

export function OrdersProvider({ children }: { children: ReactNode }) {
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

  const totalSpent = useMemo(
    () => orders.reduce((sum, o) => (o.status === "cancelled" ? sum : sum + orderTotal(o)), 0),
    [orders],
  );

  const memberSince = useMemo(
    () => orders.reduce<string | null>((oldest, o) => (oldest && oldest < o.placedOn ? oldest : o.placedOn), null),
    [orders],
  );

  const value = useMemo<OrdersContextValue>(
    () => ({ orders, placeOrder, totalSpent, memberSince }),
    [orders, placeOrder, totalSpent, memberSince],
  );

  return <OrdersContext.Provider value={value}>{children}</OrdersContext.Provider>;
}

export function useOrders() {
  const ctx = useContext(OrdersContext);
  if (!ctx) throw new Error("useOrders must be used within OrdersProvider");
  return ctx;
}
